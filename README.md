# Iron District — Gym Website

A one-page website for a strength-training gym, built with plain HTML, CSS, and JavaScript (no build tools, no dependencies).

## Files

```
index.html    → page structure and content
style.css     → all styling (design tokens at the top)
script.js     → mobile nav, scroll-driven barbell animation, trial form
```

## Preview it locally

Just open `index.html` in a browser — no server required. (Some browsers block file:// scroll/animation edge cases, so if anything looks off, run a tiny local server instead: `python3 -m http.server` from this folder, then visit `http://localhost:8000`.)

## Upload to GitHub

1. Create a new empty repository on GitHub (no README/license, so it stays empty) — e.g. `iron-district`.
2. From this project folder, run:

```bash
git init
git add .
git commit -m "Initial commit: Iron District gym website"
git branch -M main
git remote add origin https://github.com/<your-username>/iron-district.git
git push -u origin main
```

Replace `<your-username>` and the repo name with your own.

## Publish it for free with GitHub Pages

1. On GitHub, open the repo → **Settings** → **Pages**.
2. Under "Build and deployment", set **Source** to `Deploy from a branch`.
3. Set **Branch** to `main` and folder to `/ (root)`, then **Save**.
4. GitHub gives you a live URL, usually `https://<your-username>.github.io/iron-district/`, live within a minute or two.

## Booking submissions — where they go

When someone fills in the "Visit" form and books a free session, that submission gets logged as a new row in a Google Sheet you control — free, no backend hosting required (this works even on plain GitHub Pages, since Google's Apps Script acts as the server).

### One-time setup

1. **Create a Google Sheet.** Go to sheets.google.com, create a blank sheet, name it something like "Iron District Bookings."
2. **Open the script editor.** In the sheet, go to **Extensions → Apps Script**. This opens a code editor tied to that sheet.
3. **Paste the code.** Delete whatever's in the default `Code.gs` file and paste in the contents of `apps-script/Code.gs` from this project.
4. **Add header row (one-time).** In the Apps Script editor's toolbar, use the function dropdown (next to the Run button) to select `setupHeaderRow`, then click **Run**. The first time you run it, Google will ask you to authorize the script — click through (it's your own script, running on your own sheet). This adds "Timestamp / Name / Email / Program" as column headers.
5. **Deploy as a web app.** Click **Deploy → New deployment**. Click the gear icon next to "Select type" and choose **Web app**. Set:
   - Execute as: **Me**
   - Who has access: **Anyone**
   Click **Deploy**, authorize again if prompted, then copy the **Web app URL** it gives you (looks like `https://script.google.com/macros/s/.../exec`).
6. **Paste the URL into the site.** Open `script.js`, find the line:
   ```js
   const GOOGLE_SHEET_WEBHOOK_URL = 'PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE';
   ```
   Replace the placeholder with the URL you copied.
7. **Push the change to GitHub** (and redeploy on Vercel if you're using it for Coach Bot — the booking form itself doesn't need Vercel).

That's it. From then on, every booking submitted through the site shows up as a new row in your Google Sheet, in real time.

### If you forget to set the URL

The form still works and still shows a "thanks" message to the visitor — it just won't actually log anything anywhere, and the browser console will show a warning reminding you the webhook isn't configured. Nothing breaks; you just won't see the booking until you finish setup.

## Coach Bot — now powered by Google Gemini (free)

Coach Bot calls the real Gemini API for genuinely smart, open-ended answers — not just keyword matching. It's grounded in a system prompt (`api/chat.js`) describing Iron District's actual programs, pricing, hours, coaches, and location, so it answers naturally but never invents facts about the gym.

**It costs nothing.** Google's Gemini API has a real free tier — no credit card, no trial period that expires — using the `gemini-2.5-flash` model. It's rate-limited (a handful of requests per minute, a few hundred per day, exact numbers shown live in your AI Studio dashboard), which is more than enough for a gym website's chat widget.

**It still degrades gracefully.** If the backend isn't set up yet (e.g. you're just viewing the static files, or hosting on plain GitHub Pages without the API function), Coach Bot automatically falls back to the original local keyword-matching bot for the rest of the session — so the site never looks broken.

### Files involved
```
api/chat.js   → serverless function that calls the Gemini API (holds the key, server-side only)
script.js     → widget UI + tries api/chat.js first, falls back to local keyword bot on failure
```

### Deploy with real AI answers (Vercel — free)

Vercel can host this entire site (static files + the `api/chat.js` function) in one place, and deploys straight from your GitHub repo, also for free.

1. Push this project to GitHub as usual (see steps above).
2. Get a free API key at **https://aistudio.google.com/apikey** — sign in with any Google account, click "Create API key." No credit card, no billing setup.
3. Go to **https://vercel.com**, sign in with GitHub, click **Add New → Project**, and import your `iron-district` repo. Leave the framework preset as "Other" — no build step is needed.
4. Before or after the first deploy, go to your Vercel project's **Settings → Environment Variables** and add:
   - Key: `GEMINI_API_KEY`
   - Value: your key from step 2
5. Deploy (or redeploy, if you added the key after the first deploy). Vercel gives you a live URL like `https://iron-district.vercel.app`.

That's it — Coach Bot now answers with real Gemini intelligence, for $0. The API key lives only in Vercel's environment variables; it's never in your GitHub code or visible to visitors.

### If you just want plain GitHub Pages (no real AI, no setup)

You can still deploy the old way — GitHub Pages serves static files only, so `api/chat.js` won't run, and Coach Bot will automatically use its local keyword-matching fallback instead. Nothing breaks; it's just less smart. See the GitHub Pages steps above.

### A note on rate limits

Google's free tier is genuinely free, but limited — if the gym site gets a burst of traffic and Coach Bot hits the daily cap, Gemini will return an error, and Coach Bot will quietly fall back to the local keyword bot for the rest of that visitor's session rather than showing an error message. Fine for a capstone demo or a low-traffic real site; if this ever needs to scale up, Google's paid tier removes the cap.

## Security

This is a static site with two small backend touchpoints (the Gemini chat function and the Google Sheets booking webhook) — there's no login system and no cookie-based sessions, so classic "CSRF tokens" don't actually apply here (they protect authenticated sessions, and this site has none). Instead, here's what's actually implemented, and why:

**Cross-site scripting (XSS)**
- Every place the site inserts text into the page (Coach Bot's messages, chat suggestions) uses `textContent`, never `innerHTML`, so even if a visitor or the AI's response contained HTML-looking text, it renders as plain text instead of executing.
- A `Content-Security-Policy` is set two ways — a `<meta>` tag in `index.html` (works on any host) and matching headers in `vercel.json` (works if deployed on Vercel, and is the stronger of the two since meta tags can't cover everything a CSP header can). It restricts scripts to same-origin only, blocks the page from being framed by other sites (`frame-ancestors 'none'`), and limits which domains the page can fetch from or embed content from.

**The booking form (public webhook)**
Since the Apps Script URL is technically public, anyone could try to POST to it directly, bypassing your site entirely. Mitigations:
- **Honeypot field** — a hidden input real visitors never see or fill in; if it has a value, the submission is silently dropped (Apps Script and `script.js` both check this).
- **Timing check** — a hidden timestamp is set when the form loads; submissions that arrive faster than a human could plausibly type are silently dropped.
- **Server-side validation** — name/email length limits, an email format check, and the `program` value is checked against a fixed allow-list — all re-validated in Apps Script itself, not just in the browser (client-side checks are only ever a UX nicety; they can't be trusted as security on their own since anyone can bypass your JS).
- **Spreadsheet-formula-injection protection** — if a submitted value starts with `=`, `+`, `-`, or `@`, it's prefixed with a straight quote so Excel/Sheets can't later interpret it as a formula if the sheet is exported or reopened elsewhere.

**Coach Bot's backend (`api/chat.js`)**
- Strict input validation: message count and length are capped before anything is sent to Gemini, and each message's shape (`role`/`content`) is checked — malformed requests are rejected outright.
- No CORS headers are set on this endpoint, which means (by the browser's default same-origin policy) no other website's JavaScript can read its responses — this is the standard way to keep a same-site API from being abused by other sites' scripts.
- A basic in-memory rate limit (15 requests/minute per IP) blocks bursts of abuse from a single Vercel instance. Being honest about its limit: it resets whenever the serverless function cold-starts, so it's a speed bump, not a hard guarantee — if this site ever needs real protection against sustained abuse, look at Vercel's Web Application Firewall or a persistent store like Upstash Redis.
- Upstream errors from Gemini are logged server-side only and never forwarded to the browser, so implementation details never leak to visitors.

**General**
- `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (blocks camera/mic/geolocation access the site never needs), and HSTS are all set via `vercel.json`.
- The Gemini API key and any future secrets live only in Vercel environment variables — never in the repo, never in client-side code.

## Other notes for your capstone writeup

- The "SCROLL TO LOAD THE BAR" barbell in the hero is scroll-driven — it fills the plates in as you scroll past the hero section (build it as your talking point in the demo).
