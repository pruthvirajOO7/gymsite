// Vercel serverless function: /api/booking

const ALLOWED_PROGRAMS = [
  'Barbell Foundations',
  'Competitive Powerlifting',
  'Engine & Iron',
  'Open Platform'
];

const MAX_NAME_LENGTH = 80;
const MAX_EMAIL_LENGTH = 120;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_FILL_TIME_MS = 1500;

// Simple in-memory rate limiting
const rateLimitBuckets = new Map();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 10;

function isRateLimited(ip) {
  const now = Date.now();
  const bucket = rateLimitBuckets.get(ip) || [];
  const recent = bucket.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
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
    return res.status(405).json({
      error: 'Method not allowed'
    });
  }

  const origin = req.headers.origin;
  const host = req.headers.host;

  if (origin && host && !origin.endsWith(host)) {
    return res.status(403).json({
      error: 'Forbidden'
    });
  }

  const ip = (
    req.headers['x-forwarded-for'] ||
    req.socket?.remoteAddress ||
    'unknown'
  )
    .toString()
    .split(',')[0]
    .trim();

  if (isRateLimited(ip)) {
    return res.status(429).json({
      error: 'Too many requests. Please try again shortly.'
    });
  }

  const webhookUrl = process.env.GOOGLE_SHEET_WEBHOOK_URL;
  const sharedSecret = process.env.BOOKING_SHARED_SECRET;

  if (!webhookUrl || !sharedSecret) {
    return res.status(500).json({
      error: 'Booking service is not configured.'
    });
  }

  const body = req.body || {};

  const name = sanitizeField(body.name, MAX_NAME_LENGTH);
  const email = sanitizeField(body.email, MAX_EMAIL_LENGTH);
  const program = body.program;
  const honeypot = body.website || '';
  const submittedAt = Number(body.ts);

  // Honeypot
  if (honeypot) {
    return res.status(200).json({ status: 'ok' });
  }

  // Timing check
  if (!submittedAt || Date.now() - submittedAt < MIN_FILL_TIME_MS) {
    return res.status(200).json({ status: 'ok' });
  }

  // Validation
  if (
    !name ||
    !email ||
    !EMAIL_PATTERN.test(email) ||
    !ALLOWED_PROGRAMS.includes(program)
  ) {
    return res.status(400).json({
      error: 'Please enter a valid name, email and program.'
    });
  }

  try {
    const params = new URLSearchParams();

    params.append('name', name);
    params.append('email', email);
    params.append('program', program);
    params.append('secret', sharedSecret);

    // IMPORTANT
    params.append('ts', String(submittedAt));
    params.append('website', honeypot);

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });

    let data;

    try {
      data = await response.json();
    } catch (err) {
      console.error(
        'Apps Script returned invalid JSON:',
        await response.text()
      );

      return res.status(502).json({
        error: 'Booking service returned an invalid response.'
      });
    }

    if (!response.ok || data.status !== 'ok') {
      console.error('Apps Script rejected booking:', data);

      return res.status(502).json({
        error: data.message || 'Booking could not be saved.'
      });
    }

    return res.status(200).json({
      status: 'ok'
    });

  } catch (err) {
    console.error('Failed to contact Apps Script:', err);

    return res.status(502).json({
      error: 'Booking service is temporarily unavailable.'
    });
  }
}