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

## Other notes for your capstone writeup

- The trial-booking form (separate from Coach Bot) is front-end only — it shows a confirmation message but doesn't actually send email. Mention this as a known limitation, or wire it up later with a service like Formspree if you want it functional.
- The "SCROLL TO LOAD THE BAR" barbell in the hero is scroll-driven — it fills the plates in as you scroll past the hero section (build it as your talking point in the demo).
