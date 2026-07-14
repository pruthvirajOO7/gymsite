// Vercel serverless function: /api/chat
// Calls Google's Gemini API (free tier, no credit card required) so the key never
// touches the browser.
//
// Setup (see README.md for full steps):
//   1. Get a free API key at https://aistudio.google.com/apikey (sign in with a Google account)
//   2. In your Vercel project: Settings -> Environment Variables -> add
//      GEMINI_API_KEY = <your key>
//   3. Redeploy.

const SYSTEM_PROMPT = `You are Coach Bot, the on-site assistant for Iron District, a strength-training gym.
Speak like a knowledgeable, no-nonsense strength coach: direct, encouraging, never fluffy. Keep answers
short and chat-widget-sized (2-4 sentences max) unless the visitor clearly wants more detail.

Only answer using the facts below. If someone asks something this gym doesn't cover, say so plainly and
redirect them to what Iron District does offer, or suggest they ask at the front desk / call the gym.
Never invent programs, prices, hours, or staff that aren't listed here.

PROGRAMS
- Barbell Foundations: technique-first squat/bench/deadlift/press, coached, 3x/week, for lifters in their first 12 months.
- Competitive Powerlifting: periodized blocks toward a meet, peak/taper/attempt selection handled by a coach, 4x/week.
- Engine & Iron: strength work paired with real conditioning (sleds, rowers, carries), 3x/week.
- Open Platform: unlimited access to run your own program, coaches on the floor for form checks only.

MEMBERSHIP / PRICING
- Open Platform: $59/mo - unlimited open platform hours, form checks on the floor, no coached programming.
- Coached Program: $129/mo - one coached program of choice, full open platform access, monthly programming review. (Most popular.)
- Competition Team: $179/mo - Competitive Powerlifting block, meet-day coaching and attempts, full open platform access.
- First coached session is always free, no card required.

HOURS / SCHEDULE
- Mon-Fri: coached sessions at 6:00, 9:00, 17:00, 18:30. Open platform 5:30-21:00.
- Saturday: coached sessions at 8:00, 10:00. Open platform 7:00-15:00.
- Sunday: open platform only, 8:00-14:00.

COACHES
- Marcus Idowu, Head Coach, Powerlifting - USAPL certified, coaches lifters from first squat to national-qualifying totals.
- Renata Costa, Strength & Conditioning - former collegiate thrower, runs Engine & Iron and the Foundations on-ramp.
- Devon Blake, Technique & Mobility - handles form corrections, rehab cases, athletes returning from injury.

LOCATION / CONTACT
- 2214 Foundry Row, Unit B.
- Phone: (555) 019-4420.

BOOKING
- To book the free first session, scroll to the "Visit" section on the site and fill in the short form
  (name, email, program). A coach follows up within one business day.

NUTRITION (general guidance only — NOT a personalized diet plan)
- Protein-forward staples: eggs, Greek yogurt, chicken, fish, tofu, lentils, cottage cheese. A protein source at most meals supports recovery.
- Training fuel (complex carbs): oats, brown rice, potatoes, quinoa, whole-grain bread — refill energy spent training, especially around heavy sessions.
- Micronutrients: leafy greens, berries, peppers, broccoli, citrus, nuts and seeds.
- Hydration & recovery: water first, electrolytes on hard training days, consistent sleep.
- Keep nutrition answers general and food-based — never give specific calorie counts, macro targets, or numeric diet plans. If someone wants a personalized plan, tell them to ask a coach on the floor or see a registered dietitian.`;

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// Limits applied before anything is sent to Gemini — protects your free-tier
// quota from being burned by a single abusive request, and blocks oversized
// payloads outright.
const MAX_MESSAGES = 20;
const MAX_MESSAGE_LENGTH = 1000;

// Best-effort in-memory rate limit: resets whenever the serverless instance
// cold-starts, so this is NOT a substitute for a real rate limiter (e.g. Vercel's
// Web Application Firewall, or Upstash Redis) if this ever needs to handle real
// abuse at scale — but it stops a basic burst from a single warm instance.
const rateLimitBuckets = new Map();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 15;

function isRateLimited(ip) {
  const now = Date.now();
  const bucket = rateLimitBuckets.get(ip) || [];
  const recent = bucket.filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  recent.push(now);
  rateLimitBuckets.set(ip, recent);
  return recent.length > RATE_LIMIT_MAX_REQUESTS;
}

export default async function handler(req, res) {
  // Baseline security headers on every response from this endpoint.
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // This endpoint is same-origin only by design: we never set
  // Access-Control-Allow-Origin, so browsers block any other website's JS from
  // reading the response even if it could trigger a request. This check adds a
  // second layer against direct scripted abuse (curl, bots) by requiring a
  // same-site Origin header when the browser sends one.
  const origin = req.headers.origin;
  const host = req.headers.host;
  if (origin && host && !origin.endsWith(host)) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').toString().split(',')[0].trim();
  if (isRateLimited(ip)) {
    res.status(429).json({ error: 'Too many requests — please slow down.' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    // Don't leak internal config details to the client in a real deployment;
    // this message is only helpful during your own setup.
    res.status(500).json({ error: 'Assistant is not configured yet.' });
    return;
  }

  const { messages } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
    res.status(400).json({ error: 'Invalid request.' });
    return;
  }

  // Strict shape + length validation — never trust client input.
  const isValidHistory = messages.every(m =>
    m && (m.role === 'user' || m.role === 'assistant') &&
    typeof m.content === 'string' &&
    m.content.length > 0 &&
    m.content.length <= MAX_MESSAGE_LENGTH
  );
  if (!isValidHistory) {
    res.status(400).json({ error: 'Invalid request.' });
    return;
  }

  // Convert Anthropic-style {role, content} history into Gemini's {role, parts} format.
  // Gemini uses "model" instead of "assistant" for the bot's turns.
  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }]
  }));

  try {
    const response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents,
        generationConfig: { maxOutputTokens: 400 }
      })
    });

    if (!response.ok) {
      // Log full detail server-side only; never forward upstream error bodies
      // to the client (they can contain implementation details).
      const errText = await response.text();
      console.error('Gemini API error', response.status, errText);
      res.status(502).json({ error: 'Assistant is temporarily unavailable.' });
      return;
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
    res.status(200).json({ reply: text || "Sorry, I didn't catch that — try asking again." });
  } catch (err) {
    console.error('Failed to reach Gemini API', err);
    res.status(502).json({ error: 'Assistant is temporarily unavailable.' });
  }
}
