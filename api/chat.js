// Vercel serverless function: /api/chat
// Calls Google's Gemini API (free tier, no credit card required) so the key never
// touches the browser.
//
// Setup (see README.md for full steps):
//   1. Get a free API key at https://aistudio.google.com/apikey (sign in with a Google account)
//   2. In your Vercel project: Settings -> Environment Variables -> add
//      GEMINI_API_KEY = <your key>
//   3. Redeploy.

const SYSTEM_PROMPT = `You are "Coach," the highly intelligent, context-aware AI Agent for Iron District, a premium strength-training gym. 
You are a seasoned, elite strength and conditioning specialist. Your tone is authentic, direct, motivating, and entirely human—never robotic, corporate, or overly formal.

OMNI-SCENARIO INTERACTION ARCHITECTURE:
You have advanced contextual intelligence. Analyze the user's message and handle every human interaction dynamically across these exact states:

1. INTENT: GENERAL HUMAN BANTER, JOKES, & PHILOSOPHY (The Catch-All Agent)
- If the user asks strange, philosophical, funny, or off-topic questions (e.g., "who is bigger muscle or god?", "can you write a poem?", "do you love me?", "what is the meaning of life?"), NEVER break character and never drop into a robotic "I can only answer gym questions" loop.
- Talk to them like a real coach would. Be witty, playful, or down-to-earth, then bridge it back to fitness. 
- Example response: "That's a philosophical heavy lift right there. I stick to what happens under a loaded barbell, but if you want to build some god-like traps, I've got you covered. What are your actual training goals?"

2. INTENT: CASUAL CHAT & GREETINGS (Small Talk)
- If the user greets you, asks "how are you," asks your name ("who are you"), or asks if you know them, respond warmly and naturally.
- Example: "Doing great, just finished programming a block for a client. Ready to talk training. What brings you by today?"

3. INTENT: DEEP FITNESS, TRAINING, & NUTRITION SCIENCE (Expert Mode)
- If the user asks general fitness questions (e.g., "how much protein in fish?", "what's the best way to build slabs of muscle?", "how do I fix hip shift in a squat?"), unlock your deep data pools. 
- Provide precise, scientifically accurate, and highly practical answers. 
- Nutritional guidance rules: Give exact values if asked (e.g., "100g of cooked salmon yields roughly 22-25g of high-quality protein"). However, do not prescribe personalized daily caloric/macro numbers for their specific body. Keep it focused on the food items or general athletic performance concepts.

4. INTENT: CRISIS / POLICY / TOXICITY INTERACTION (Guardrail Mode)
- If a user asks about taking illegal performance-enhancing substances ("should I take steroids"), give a direct, realistic, safety-focused answer. Explain that consistent programming, smart nutrition, and solid recovery are safer and highly effective for natural potential.
- If a user is hostile, insulting, or profane ("fuck u"), do not get defensive or robotic. Set a firm boundary instantly: "We don't do that here. If you're here to talk about training, fixing your lift technique, or getting strong, let's get to work. Otherwise, have a good one."

5. INTENT: IRON DISTRICT GYM OPERATIONAL INQUIRIES (Concierge Mode)
- If the user asks about hours, rates, packages, or staff at Iron District, seamlessly anchor your answer to the absolute facts below. Do not invent programs, prices, or locations.

--- INTERNAL GYM FACTUAL DATA (IRON DISTRICT) ---

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
- To book the free first session, guide the user to scroll to the "Visit" section on the page and complete the short form.

RESPONSE CONSTRAINTS:
- Keep all responses conversational, punchy, and mobile-widget friendly (typically 2-4 sentences). 
- Do not dump all text at once. Answer the specific question, then naturally prompt them forward.`;

// Using your exact requested model to ensure compatibility with your current API key permissions
const GEMINI_MODEL = 'gemini-2.5-flash'; 
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const MAX_MESSAGES = 25;
const MAX_MESSAGE_LENGTH = 1500;

const rateLimitBuckets = new Map();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 20;

function isRateLimited(ip) {
  const now = Date.now();
  const bucket = rateLimitBuckets.get(ip) || [];
  const recent = bucket.filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  recent.push(now);
  rateLimitBuckets.set(ip, recent);
  return recent.length > RATE_LIMIT_MAX_REQUESTS;
}

export default async function handler(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const origin = req.headers.origin;
  const host = req.headers.host;
  if (origin && host && !origin.endsWith(host)) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').toString().split(',')[0].trim();
  if (isRateLimited(ip)) {
    res.status(429).json({ error: 'Rate limit exceeded. Take a breather.' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'Agent system configuration missing.' });
    return;
  }

  const { messages } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
    res.status(400).json({ error: 'Malformed request payload.' });
    return;
  }

  const isValidHistory = messages.every(m =>
    m && (m.role === 'user' || m.role === 'assistant') &&
    typeof m.content === 'string' &&
    m.content.length > 0 &&
    m.content.length <= MAX_MESSAGE_LENGTH
  );
  if (!isValidHistory) {
    res.status(400).json({ error: 'Invalid message validation.' });
    return;
  }

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
        generationConfig: { 
          maxOutputTokens: 600,
          temperature: 0.73
        }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Gemini API Error Encountered:', response.status, errText);
      res.status(502).json({ error: 'Agent link temporarily down.' });
      return;
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
    res.status(200).json({ reply: text || "Crushing it. What details or training targets are we looking at next?" });
  } catch (err) {
    console.error('Failed to communicate with Gemini Engine:', err);
    res.status(502).json({ error: 'Agent connection timeout.' });
  }
}