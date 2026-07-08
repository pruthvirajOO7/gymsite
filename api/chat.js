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
  (name, email, program). A coach follows up within one business day.`;

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'Server is missing GEMINI_API_KEY. See README.md setup steps.' });
    return;
  }

  const { messages } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: 'Request must include a non-empty messages array.' });
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
      const errText = await response.text();
      res.status(response.status).json({ error: 'Gemini API error', detail: errText });
      return;
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
    res.status(200).json({ reply: text || "Sorry, I didn't catch that — try asking again." });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reach Gemini API', detail: String(err) });
  }
}
