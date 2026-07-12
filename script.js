// Mobile nav toggle
const menuToggle = document.querySelector('.menu-toggle');
const mobileNav = document.querySelector('.mobile-nav');
if (menuToggle && mobileNav) {
  menuToggle.addEventListener('click', () => {
    const isOpen = mobileNav.classList.toggle('open');
    menuToggle.setAttribute('aria-expanded', String(isOpen));
  });
  mobileNav.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      mobileNav.classList.remove('open');
      menuToggle.setAttribute('aria-expanded', 'false');
    });
  });
}

// Barbell "loads" plates as the hero scrolls out of view — progressive overload as a scroll metaphor
const rig = document.querySelector('.barbell-rig');
const readoutNum = document.querySelector('.readout-num');
const weights = [45, 135, 225, 315, 405]; // lb on the bar per load stage

function updateBarbellLoad() {
  if (!rig) return;
  const hero = document.querySelector('.hero');
  const rect = hero.getBoundingClientRect();
  const viewportH = window.innerHeight || document.documentElement.clientHeight;
  // progress: 0 when hero top is at viewport top, 1 when hero has scrolled fully past
  const total = rect.height - viewportH * 0.4;
  const scrolled = Math.min(Math.max(-rect.top, 0), Math.max(total, 1));
  const progress = total > 0 ? scrolled / total : 0;
  const stage = Math.min(4, Math.floor(progress * 4.999));
  rig.setAttribute('data-load', String(stage));
  if (readoutNum) readoutNum.textContent = weights[stage];
}

window.addEventListener('scroll', updateBarbellLoad, { passive: true });
window.addEventListener('resize', updateBarbellLoad);
document.addEventListener('DOMContentLoaded', updateBarbellLoad);

// Trial booking form — submits to a Google Apps Script webhook, which logs
// each booking as a row in a Google Sheet. See README.md "Booking submissions"
// section for how to set up the webhook URL below.
const GOOGLE_SHEET_WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbw0CMH4p8hzw3TTSeOvY3TlXIKrxilgd_AMdpVhAJPw3Jom_AifdP2-5z4mWJyZ2Udv/exec';

const trialForm = document.getElementById('trial-form');
const formNote = document.getElementById('form-note');
const trialTsInput = document.getElementById('trial-ts');

// Record when the form became available — used server-side as a simple bot
// signal (real people take at least a couple of seconds to fill this in).
if (trialTsInput) trialTsInput.value = String(Date.now());

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function escapeForDisplay(str) {
  // Defense in depth: even though we only ever insert this via textContent
  // elsewhere, keep a shared escaper available for any future innerHTML use.
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

if (trialForm) {
  trialForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const submitBtn = trialForm.querySelector('button[type="submit"]');
    const name = trialForm.querySelector('[name="name"]').value.trim().slice(0, 80);
    const email = trialForm.querySelector('[name="email"]').value.trim().slice(0, 120);
    const program = trialForm.querySelector('[name="program"]').value;
    const honeypot = trialForm.querySelector('[name="website"]').value;
    const allowedPrograms = ['Barbell Foundations', 'Competitive Powerlifting', 'Engine & Iron', 'Open Platform'];

    // Client-side validation (server/Apps Script re-validates everything too —
    // never trust the client alone).
    if (!name || !email || !EMAIL_PATTERN.test(email) || !allowedPrograms.includes(program)) {
      formNote.textContent = 'Please enter a valid name and email address.';
      return;
    }

    // Honeypot tripped — a bot filled in a field real visitors never see.
    // Pretend success so we don't tip off the bot, but don't actually send anything.
    if (honeypot) {
      formNote.textContent = `Thanks, ${name}. A coach will email you within one business day to schedule your free session.`;
      trialForm.reset();
      return;
    }

    const isConfigured = GOOGLE_SHEET_WEBHOOK_URL.startsWith('https://script.google.com/');

    if (!isConfigured) {
      // Webhook not set up yet — don't pretend it worked. See README.md setup steps.
      console.warn('Iron District: GOOGLE_SHEET_WEBHOOK_URL is not configured yet — booking was not logged. See README.md "Booking submissions".');
      formNote.textContent = "Thanks — we've got your request. (Note: booking storage isn't connected yet — see README.md.)";
      trialForm.reset();
      return;
    }

    if (submitBtn) submitBtn.disabled = true; // prevent double-submits while in flight

    const body = new FormData();
    body.append('name', name);
    body.append('email', email);
    body.append('program', program);
    body.append('ts', trialTsInput ? trialTsInput.value : '');

    // Apps Script web apps don't return CORS headers the browser can read, so we
    // fire the request in no-cors mode and treat "no network error" as success —
    // this is the standard pattern for posting to Apps Script from a static site.
    fetch(GOOGLE_SHEET_WEBHOOK_URL, {
      method: 'POST',
      mode: 'no-cors',
      body
    })
      .then(() => {
        formNote.textContent = `Thanks, ${name}. A coach will email you within one business day to schedule your free session.`;
        trialForm.reset();
        if (trialTsInput) trialTsInput.value = String(Date.now());
      })
      .catch(() => {
        formNote.textContent = "Something went wrong sending that — please try again, or call us at (555) 019-4420.";
      })
      .finally(() => {
        if (submitBtn) submitBtn.disabled = false;
      });
  });
}

// ===== AI ASSISTANT (self-contained, no API/backend required) =====
(function () {
  const assistant = document.getElementById('assistant');
  const toggle = document.getElementById('assistant-toggle');
  const panel = document.getElementById('assistant-panel');
  const messagesEl = document.getElementById('assistant-messages');
  const chipsEl = document.getElementById('assistant-chips');
  const form = document.getElementById('assistant-form');
  const input = document.getElementById('assistant-input');
  const sendBtn = document.querySelector('.assistant-send');

  if (!assistant) return;

  // Knowledge base: each entry has keywords to match against user text,
  // a response, and optional follow-up chip suggestions.
  const knowledgeBase = [
    {
      id: 'programs',
      keywords: ['program', 'programs', 'class', 'classes', 'foundations', 'powerlifting', 'engine', 'conditioning', 'open platform', 'training'],
      response: "We run four programs: Barbell Foundations (technique-first, for your first year under the bar), Competitive Powerlifting (periodized toward a meet), Engine & Iron (strength plus real conditioning), and Open Platform (run your own program, coaches on the floor for form checks). Which one sounds like you?",
      chips: ['What does Foundations cost?', 'Tell me about coaches', 'How do I book a free session?']
    },
    {
      id: 'pricing',
      keywords: ['price', 'pricing', 'cost', 'membership', 'plan', 'plans', 'how much', 'fee', 'fees', 'dollar'],
      response: "Three tiers: Open Platform is $59/mo (unlimited platform access, no coached programming). Coached Program is $129/mo (one coached program of your choice, most lifters pick this). Competition Team is $179/mo (Competitive Powerlifting block plus meet-day coaching). Every tier includes open platform access.",
      chips: ['What programs do you offer?', 'What are your hours?', 'How do I book a free session?']
    },
    {
      id: 'schedule',
      keywords: ['schedule', 'hours', 'open', 'time', 'times', 'when', 'weekend', 'saturday', 'sunday', 'monday'],
      response: "Weekdays we're open 5:30am–9:00pm, with coached sessions at 6:00, 9:00, 17:00, and 18:30. Saturday coached sessions run at 8:00 and 10:00, open platform 7:00–15:00. Sunday is open platform only, 8:00–14:00.",
      chips: ['How much does membership cost?', 'Where are you located?']
    },
    {
      id: 'coaches',
      keywords: ['coach', 'coaches', 'trainer', 'trainers', 'instructor', 'staff', 'marcus', 'renata', 'devon'],
      response: "Marcus Idowu (Head Coach, USAPL certified powerlifting) takes lifters from first squat to national-qualifying totals. Renata Costa runs Engine & Iron and the Foundations on-ramp. Devon Blake handles technique corrections and return-from-injury cases. Every bar is watched — no unsupervised max attempts.",
      chips: ['What programs do you offer?', 'How do I book a free session?']
    },
    {
      id: 'booking',
      keywords: ['book', 'booking', 'trial', 'free session', 'sign up', 'signup', 'join', 'start', 'try'],
      response: "Your first coached session is free, no card required. Scroll down to the \"Visit\" section and fill in the short form (name, email, program) — a coach will follow up within one business day. Bring shoes you can squat in.",
      chips: ['What are your hours?', 'Where are you located?']
    },
    {
      id: 'location',
      keywords: ['location', 'address', 'where', 'directions', 'located', 'find you'],
      response: "We're at 2214 Foundry Row, Unit B. Phone is (555) 019-4420 if you'd rather call ahead.",
      chips: ['What are your hours?', 'How do I book a free session?']
    },
    {
      id: 'nutrition',
      keywords: ['diet', 'nutrition', 'food', 'foods', 'eat', 'eating', 'meal', 'meals', 'protein', 'carbs', 'healthy', 'hydration'],
      response: "General staples we point people toward: protein at most meals (eggs, chicken, fish, tofu, lentils, Greek yogurt), complex carbs around training (oats, rice, potatoes, quinoa), plenty of color (leafy greens, berries, veggies), and water first, electrolytes on hard days. Check the Nutrition section on the site for more — and for a personalized plan, ask a coach on the floor.",
      chips: ['What programs do you offer?', 'How do I book a free session?']
    },
    {
      id: 'greeting',
      keywords: ['hi', 'hello', 'hey', 'yo', 'sup'],
      response: "Hey — I'm Coach Bot. Ask me about programs, pricing, hours, coaches, or how to book a free session.",
      chips: ['What programs do you offer?', 'How much does membership cost?', 'What are your hours?', 'What should I eat?']
    }
  ];

  const fallback = {
    response: "I've got answers on programs, pricing, hours, coaches, location, and booking a free session — try asking about one of those, or tap a suggestion below.",
    chips: ['What programs do you offer?', 'How much does membership cost?', 'What are your hours?', 'What should I eat?']
  };

  // Conversation history sent to the backend so Coach Bot has context across turns.
  let conversationHistory = [];
  // Once the live API fails once (e.g. no backend deployed yet, like plain GitHub Pages
  // without the /api function), stop retrying it for the rest of the session and just
  // use the local keyword bot so the widget still feels responsive.
  let useLiveApi = true;

  async function askLiveAssistant(userText) {
    conversationHistory.push({ role: 'user', content: userText });
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: conversationHistory })
    });
    if (!res.ok) throw new Error('Backend unavailable');
    const data = await res.json();
    if (!data.reply) throw new Error('No reply from backend');
    conversationHistory.push({ role: 'assistant', content: data.reply });
    // Keep history from growing unbounded in a long session.
    if (conversationHistory.length > 20) conversationHistory = conversationHistory.slice(-20);
    return data.reply;
  }

  function matchIntent(text) {
    const lower = text.toLowerCase();
    let best = null;
    let bestScore = 0;
    knowledgeBase.forEach(entry => {
      let score = 0;
      entry.keywords.forEach(kw => {
        if (lower.includes(kw)) score += kw.split(' ').length; // reward longer/more specific matches
      });
      if (score > bestScore) {
        bestScore = score;
        best = entry;
      }
    });
    return bestScore > 0 ? best : fallback;
  }

  function scrollToBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function addMessage(text, sender) {
    const msg = document.createElement('div');
    msg.className = 'assistant-msg assistant-msg-' + sender;
    msg.textContent = text;
    messagesEl.appendChild(msg);
    scrollToBottom();
  }

  function setChips(labels) {
    chipsEl.innerHTML = '';
    labels.forEach(label => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'assistant-chip';
      chip.textContent = label;
      chip.addEventListener('click', () => handleUserMessage(label));
      chipsEl.appendChild(chip);
    });
  }

  function showTyping() {
    const typing = document.createElement('div');
    typing.className = 'assistant-msg assistant-msg-bot assistant-msg-typing';
    typing.id = 'assistant-typing';
    typing.innerHTML = '<span></span><span></span><span></span>';
    messagesEl.appendChild(typing);
    scrollToBottom();
  }

  function hideTyping() {
    const typing = document.getElementById('assistant-typing');
    if (typing) typing.remove();
  }

  function handleUserMessage(text) {
    const trimmed = text.trim().slice(0, 500); // hard cap mirrors input maxlength + backend limit
    if (!trimmed) return;
    addMessage(trimmed, 'user');
    setChips([]);
    showTyping();
    if (sendBtn) sendBtn.disabled = true;

    if (useLiveApi) {
      askLiveAssistant(trimmed)
        .then(reply => {
          hideTyping();
          addMessage(reply, 'bot');
          setChips(['What programs do you offer?', 'How much does membership cost?', 'What should I eat?']);
        })
        .catch(() => {
          // Backend not set up yet (e.g. static hosting with no /api function) —
          // drop to the local keyword bot for the rest of the session.
          useLiveApi = false;
          hideTyping();
          const intent = matchIntent(trimmed);
          addMessage(intent.response, 'bot');
          setChips(intent.chips || fallback.chips);
        })
        .finally(() => {
          if (sendBtn) sendBtn.disabled = false;
        });
      return;
    }

    const intent = matchIntent(trimmed);
    setTimeout(() => {
      hideTyping();
      addMessage(intent.response, 'bot');
      setChips(intent.chips || fallback.chips);
      if (sendBtn) sendBtn.disabled = false;
    }, 500 + Math.random() * 400);
  }

  // Init
  let started = false;
  function openPanel() {
    assistant.classList.add('open');
    toggle.setAttribute('aria-expanded', 'true');
    panel.setAttribute('aria-hidden', 'false');
    if (!started) {
      started = true;
      addMessage("Hey — I'm Coach Bot. Ask me about programs, pricing, hours, coaches, or how to book a free session.", 'bot');
      setChips(['What programs do you offer?', 'How much does membership cost?', 'What are your hours?', 'What should I eat?']);
    }
    input.focus();
  }
  function closePanel() {
    assistant.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
    panel.setAttribute('aria-hidden', 'true');
  }

  toggle.addEventListener('click', () => {
    assistant.classList.contains('open') ? closePanel() : openPanel();
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input.value;
    input.value = '';
    handleUserMessage(text);
  });
})();
