# Iron District — Gym Website

A one-page marketing site for Iron District, a strength-training gym, featuring a Gemini-powered AI assistant ("Coach Bot") and an automated booking pipeline. Built with plain HTML, CSS, and JavaScript — no frameworks, no build step.

## Overview

The site combines a static front end with two lightweight backend integrations:

| Component | Purpose | Technology |
|---|---|---|
| **Coach Bot** | Answers visitor questions about programs, pricing, hours, coaches, and nutrition | Google Gemini API via a Vercel serverless function |
| **Booking pipeline** | Captures free-trial session requests from the site | Google Apps Script → Google Sheets |

Both integrations degrade gracefully: if the Gemini backend isn't configured, Coach Bot automatically falls back to a local keyword-matching responder; if the booking webhook isn't configured, the form still confirms to the visitor but logs a console warning rather than silently failing.

## Project Structure

```
index.html          → page structure and content
style.css           → all styling (design tokens at the top)
script.js           → mobile nav, barbell scroll animation, Coach Bot widget, booking form
api/chat.js         → serverless function that calls the Gemini API
api/booking.js      → serverless function that authenticates and proxies booking submissions to Apps Script
apps-script/Code.gs → Google Apps Script source for the booking webhook
vercel.json         → security headers and deployment config
package.json        → marks the project as an ES module for Vercel
images/             → coach photography
```

## AI Assistant: Coach Bot

Coach Bot is grounded in a system prompt describing Iron District's actual programs, pricing, schedule, coaches, and nutrition guidance, so it answers naturally without inventing facts about the gym. It runs on Google's `gemini-2.5-flash` model, which is available on Gemini's free tier — no credit card required.

### Connecting the Gemini API key

1. Generate a key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey) using any Google account.
2. In the Vercel project dashboard, go to **Settings → Environment Variables** and add:
   | Key | Value |
   |---|---|
   | `GEMINI_API_KEY` | your key from step 1 |
3. Redeploy the project so the new environment variable takes effect.

Once deployed, `api/chat.js` reads this key server-side to call the Gemini API — it's never exposed in client-side code or committed to the repository.

### Rate limits

Gemini's free tier is genuinely free but rate-limited (a handful of requests per minute, a few hundred per day — current figures are shown live in the AI Studio dashboard). This comfortably covers a single-location gym site. If traffic ever grows past that, Google's paid tier removes the cap.

## Booking Pipeline

Free-session requests submitted through the "Visit" section are logged as rows in a Google Sheet. The browser never talks to Google directly — it calls `/api/booking`, a Vercel serverless function that validates the submission and forwards it server-side to a Google Apps Script web app, authenticated with a shared secret.

This two-part design matters: an earlier version of this integration had the browser call the Apps Script URL directly. That URL was visible to anyone viewing page source, and — because the webhook had no authentication — could be POSTed to directly, bypassing the site's validation entirely. Routing through `/api/booking` fixes both problems: the Apps Script URL and a shared secret now live only in server-side environment variables, and Apps Script rejects any request that doesn't include the correct secret.

### Setup

1. **Create a Google Sheet** to serve as the booking log (e.g., "Iron District Bookings").
2. **Open the script editor**: in the sheet, go to **Extensions → Apps Script**.
3. **Paste the source**: replace the default `Code.gs` contents with `apps-script/Code.gs` from this project.
4. **Generate a shared secret** — a long random string only your server and your Apps Script will know, e.g.:
   ```
   openssl rand -hex 32
   ```
5. **Store the secret in Apps Script**: in the Apps Script editor, find the `setBookingSecret` function, paste your generated secret into it in place of the placeholder, select `setBookingSecret` from the function dropdown, and click **Run**. Authorize when prompted. This saves the secret to that project's Script Properties, which `doPost` checks on every request.
6. **Initialize headers**: still in the Apps Script editor, select `setupHeaderRow` from the function dropdown and click **Run**. This adds `Timestamp / Name / Email / Program` as column headers.
7. **Deploy as a web app**: **Deploy → New deployment → Web app**, with:
   - Execute as: **Me**
   - Who has access: **Anyone**

   Copy the resulting web app URL (`https://script.google.com/macros/s/.../exec`).
8. **Connect the backend**: in the Vercel project dashboard, go to **Settings → Environment Variables** and add both:
   | Key | Value |
   |---|---|
   | `GOOGLE_SHEET_WEBHOOK_URL` | the Apps Script URL from step 7 |
   | `BOOKING_SHARED_SECRET` | the same secret you generated in step 4 |
9. **Redeploy** so the new environment variables take effect.

From that point forward, every booking submitted through the site is validated by `/api/booking`, authenticated against Apps Script with the shared secret, and appears as a new row in the sheet in real time. Both layers independently validate the submission (length limits, email format, an allow-list for the program field, a honeypot field, and a timing check) — defense in depth, since neither layer trusts the other, and neither trusts the browser.

## Security

This is a static site with two backend touchpoints (the Gemini chat function and the Sheets booking webhook) and no login system or session cookies — so traditional CSRF tokens, which protect authenticated sessions, don't apply here. The measures below are the practical equivalent for this architecture.

**Cross-site scripting (XSS)**
- All dynamic text (Coach Bot's messages, suggested replies) is inserted via `textContent`, never `innerHTML`, so HTML-like content is always rendered as plain text.
- A `Content-Security-Policy` is enforced both via a `<meta>` tag in `index.html` and matching headers in `vercel.json`, restricting scripts to same-origin, blocking framing by other sites, and limiting which domains the page can fetch from.

**Booking pipeline (`api/booking.js` → Apps Script)**
- **Shared-secret authentication** — this is the control that actually gates access to the webhook. `api/booking.js` and `apps-script/Code.gs` both hold a random secret (set independently in Vercel and in Apps Script's Script Properties); Apps Script rejects any request missing the correct value. Without this, anyone who obtained the Apps Script URL could write directly into the sheet — the URL alone was never a real barrier.
- **No client-side exposure** — the Apps Script URL and the shared secret exist only as server-side environment variables. The browser calls `/api/booking` on the same origin; it never sees, and can't leak, either value.
- **Honeypot field** — a hidden input real visitors never see; a filled value silently drops the submission. Checked in both `api/booking.js` and `apps-script/Code.gs`.
- **Timing check** — submissions arriving faster than a human could plausibly type are silently dropped, checked at both layers.
- **Server-side validation at two independent layers** — name/email length limits, email format checks, and a fixed allow-list for the `program` field are enforced in `api/booking.js` before forwarding, and again in Apps Script itself, so neither layer has to trust the other.
- **Rate limiting** — the same in-memory per-IP limiter used for Coach Bot applies here too.
- **Spreadsheet-formula-injection protection** — values beginning with `=`, `+`, `-`, or `@` are prefixed with a straight quote, preventing formula execution if the sheet is later exported or reopened elsewhere.

**Coach Bot backend (`api/chat.js`)**
- Strict validation of message count, length, and shape before any request reaches Gemini.
- No CORS headers are set, so the browser's same-origin policy prevents other sites' scripts from reading responses.
- A basic in-memory rate limit (15 requests/minute per IP) blocks single-instance abuse bursts. This resets on cold start, so it's a deterrent rather than a hard guarantee — a persistent store (e.g., Upstash Redis) or Vercel's Web Application Firewall would be the next step if this needs to scale.
- Upstream errors are logged server-side only; implementation details are never forwarded to the browser.

**General**
- `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, a restrictive `Permissions-Policy`, and HSTS are all set via `vercel.json`.
- All secrets live exclusively in Vercel environment variables — never in the repository or client-side code.

## Notable Implementation Detail

The hero section's barbell graphic is scroll-driven: plates visually load onto the bar as the visitor scrolls past the hero, tying the site's core visual metaphor directly to progressive overload.
