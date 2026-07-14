// Vercel serverless function: /api/booking
//
// This exists so the Google Apps Script webhook URL never reaches the browser.
// Previously, script.js called that URL directly from client-side code, which
// meant anyone viewing page source could see it and POST to it directly,
// bypassing the site's honeypot/timing checks entirely — the URL itself wasn't
// the real problem, the lack of any authentication on it was. This function
// fixes that: the browser now only ever talks to our own /api/booking, and only
// this server-side code holds the Apps Script URL and a shared secret that
// Apps Script requires before it will write anything.
//
// Setup (see README.md "Booking Pipeline" for full steps):
//   1. Deploy the Apps Script web app (apps-script/Code.gs) and copy its URL.
//   2. Generate a random secret, e.g.: openssl rand -hex 32
//   3. In Vercel: Settings -> Environment Variables, add:
//      GOOGLE_SHEET_WEBHOOK_URL = <your Apps Script web app URL>
//      BOOKING_SHARED_SECRET    = <the random secret you generated>
//   4. In the Apps Script editor: Project Settings -> Script Properties, add:
//      BOOKING_SHARED_SECRET = <the same random secret>
//   5. Redeploy both.

const ALLOWED_PROGRAMS = ['Barbell Foundations', 'Competitive Powerlifting', 'Engine & Iron', 'Open Platform'];
const MAX_NAME_LENGTH = 80;
const MAX_EMAIL_LENGTH = 120;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_FILL_TIME_MS = 1500;

// Same lightweight per-instance rate limit pattern as api/chat.js.
const rateLimitBuckets = new Map();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 10;

function isRateLimited(ip) {
  const now = Date.now();
  const bucket = rateLimitBuckets.get(ip) || [];
  const recent = bucket.filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  recent.push(now);
  rateLimitBuckets.set(ip, recent);
  return recent.length > RATE_LIMIT_MAX_REQUESTS;
}

function sanitizeField(value, maxLength) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
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
    res.status(429).json({ error: 'Too many requests — please slow down.' });
    return;
  }

  const webhookUrl = process.env.GOOGLE_SHEET_WEBHOOK_URL;
  const sharedSecret = process.env.BOOKING_SHARED_SECRET;
  if (!webhookUrl || !sharedSecret) {
    res.status(500).json({ error: 'Booking is not configured yet.' });
    return;
  }

  const body = req.body || {};
  const name = sanitizeField(body.name, MAX_NAME_LENGTH);
  const email = sanitizeField(body.email, MAX_EMAIL_LENGTH);
  const program = body.program;
  const honeypot = body.website;
  const submittedAt = Number(body.ts);

  // Honeypot tripped — pretend success, don't reveal the check to the bot.
  if (honeypot) {
    res.status(200).json({ status: 'ok' });
    return;
  }

  // Timing check — same reasoning, silently accept without writing anything.
  if (!submittedAt || Date.now() - submittedAt < MIN_FILL_TIME_MS) {
    res.status(200).json({ status: 'ok' });
    return;
  }

  if (!name || !email || !EMAIL_PATTERN.test(email) || !ALLOWED_PROGRAMS.includes(program)) {
    res.status(400).json({ error: 'Please enter a valid name, email, and program.' });
    return;
  }

  try {
    const params = new URLSearchParams();
    params.append('name', name);
    params.append('email', email);
    params.append('program', program);
    params.append('secret', sharedSecret);
    params.append('ts', String(submittedAt));
    params.append('website', honeypot || '');

    const response = await fetch(webhookUrl, {
      method: 'POST',
      body: params
    });

    // Apps Script web apps always answer doPost with HTTP 200, even for its
    // own "Unauthorized" / "Invalid submission" cases — the real result is in
    // the JSON body, not the HTTP status. So response.ok alone can't tell us
    // whether anything was actually written to the sheet; we have to parse
    // the body and check body.status ourselves.
    if (!response.ok) {
      const errText = await response.text();
      console.error('Apps Script webhook error', response.status, errText);
      res.status(502).json({ error: 'Booking service is temporarily unavailable.' });
      return;
    }

    let result;
    try {
      result = await response.json();
    } catch (parseErr) {
      console.error('Apps Script returned non-JSON response', parseErr);
      res.status(502).json({ error: 'Booking service is temporarily unavailable.' });
      return;
    }

    if (result.status !== 'ok') {
      // Surfaces secret mismatches, validation failures, etc. instead of
      // silently telling the visitor it worked.
      console.error('Apps Script rejected the booking', result);
      res.status(502).json({ error: 'Booking service is temporarily unavailable.' });
      return;
    }

    res.status(200).json({ status: 'ok' });
  } catch (err) {
    console.error('Failed to reach Apps Script webhook', err);
    res.status(502).json({ error: 'Booking service is temporarily unavailable.' });
  }
}
