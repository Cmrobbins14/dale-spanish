# ¡Dale! — Speak Spanish with Coach Chispa

A speaking-first Spanish app for one kid (and later his brothers), modeled on the Speak method: **Learn → Practice → Apply**. He hears a phrase, says it back, and the app recognizes it generously. Lessons have daily goals, streaks, XP, trophies and a personal league. There are no ads, purchases, energy systems or trackers.

- **8 units, 50 lessons** of Latin American (Mexican) Spanish, with a light sports flavor (fútbol, lucha libre)
- Coach intro → speaking drill with progressive hiding → vocab builder → listening → Q&A → unit roleplays, reviews and "Check your progress"
- Smart Review (spaced repetition, weakest first), mastery per phrase
- Kid sign-in with a username, a grown-up account and dashboard, sync across devices (Firebase)
- Installs to the iPad Home Screen and works offline
- Optional: **Cloud listening** (speech scoring inside the Home Screen app, plus "hear yourself" playback) and an **AI tutor** (Free Talk + Ask the coach)

---

## Try it right now (no setup)

The app runs in **local-only mode** until Firebase is configured. Progress is saved on that one device.

```bash
npm install
npm run dev
```

Open the address it prints (for example http://localhost:5173) in Safari or Chrome.

---

## 1. Firebase setup (accounts + sync), about 15 minutes, free

1. Go to <https://console.firebase.google.com> → **Add project**. Analytics: **turn it off**.
2. **Build → Authentication → Get started → Sign-in method → Email/Password → Enable** (leave "Email link" off).
3. **Build → Firestore Database → Create database** → production mode → pick a location near you.
4. **Firestore → Rules**: replace everything with the contents of [`firestore.rules`](firestore.rules) and click **Publish**.
5. **Project settings (gear) → General → Your apps → Web (`</>`)** → register an app (no Hosting) → copy the `firebaseConfig` values.
6. Paste them into [`src/config/firebase-config.js`](src/config/firebase-config.js) (the only file to edit).
7. **Authentication → Settings → Authorized domains** → add `YOURNAME.github.io`.

> The `apiKey` in that file is not a secret. It identifies the project; the security rules are what protect the data.

**Create the accounts** (on any device, once the site is deployed):

1. Open the app → **Grown-up** → *Create a grown-up account* (your real email + a password).
2. **Add a learner** → username (e.g. `leo11`), nickname, a simple password (Firebase requires 6+ characters). No email needed. Behind the scenes it becomes `leo11@kids.local`.
3. Sign out. On his iPad: **I'm the learner** → username + password. He stays signed in.

You can sign in with the grown-up account on your phone at any time to see his dashboard and change settings. Adding a brother later is just **Add a learner** again.

**Security rules, tested:** each learner can read and write only their own data. The linked grown-up can read it and change settings or reset progress, but can't change the link. Strangers and signed-out visitors see nothing. Run the tests with `npm run test:rules` (needs Java 21 for the Firestore emulator).

---

## 2. GitHub Pages deployment

1. Create a GitHub repo (e.g. `dale-spanish`) and push this folder to `main`.
2. Repo **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Every push to `main` runs the tests and the content check, builds, and publishes to `https://YOURNAME.github.io/dale-spanish/`. You never need to build on your computer.

All paths are relative, so any repo name works. **Updates:** the service worker picks up new versions automatically the next time the app is opened. It never reloads in the middle of a lesson.

---

## 3. One-time iPad setup

1. **Turn on Dictation:** Settings → General → Keyboard → **Enable Dictation**. Also turn on **Siri** (Settings → Siri). Safari's speech recognition needs both.
2. Open the site in **Safari**. The first time he taps the mic, tap **Allow** for the microphone.
3. **Share → Add to Home Screen** (it opens full screen like an app).
4. Sign in as the learner.

> ⚠️ **Important Safari limitation:** Apple does not allow speech recognition inside Home Screen web apps (WebKit bug 225298). Two options:
> - **Recommended:** set up **Cloud listening** (section 4, free). Speech scoring then works in the Home Screen app, and he can play back his own voice.
> - Or open the app in a regular Safari tab when he practices. Without either, the Home Screen app falls back to "I said it!" self-check mode, which still works but doesn't score.
>
> Also, on iPadOS 27 Safari's recognizer can occasionally stop responding after speech plays (WebKit bug 321436). The app detects this and switches to self-check; closing and reopening Safari fixes it. Cloud listening avoids this too.

---

## 4. Optional: Cloud listening + AI tutor (Cloudflare Worker)

The app is complete without this. The worker in [`worker/`](worker/) adds:

| Feature | What it needs | Cost |
|---|---|---|
| **Cloud listening** (records his attempt, Whisper transcribes it on Cloudflare; works in the Home Screen app, enables "hear yourself" on iPad) | Cloudflare account (free) | **Free.** The daily free allowance covers ~240 minutes of audio a day |
| **Free Talk + Ask the coach** (Claude) | Anthropic API key | Pay-as-you-go, see below |

Setup (about 15 minutes):

```bash
cd worker
npm install
npx wrangler login
npx wrangler kv namespace create USAGE   # paste the id into wrangler.toml
npx wrangler secret put ANTHROPIC_API_KEY   # skip if you only want Cloud listening
npx wrangler deploy
```

In `worker/wrangler.toml` set `FIREBASE_PROJECT_ID`, `ALLOWED_ORIGIN` (`https://YOURNAME.github.io`), and `FAMILY_UIDS`, the comma-separated UIDs of your accounts from Firebase → Authentication → Users. Only those accounts can use the worker. Then paste the worker URL (e.g. `https://dale-helper.YOURNAME.workers.dev`) into [`src/config/worker-config.js`](src/config/worker-config.js) and push. Features hide themselves if the worker is missing. The grown-up dashboard has an **AI tutor** on/off switch.

**The tutor's rules** are in plain English in [`worker/system-prompt.md`](worker/system-prompt.md): kid-safe, Spanish only, never asks for personal information, follows the family-topics rule. The worker also filters replies for the excluded vocabulary before they reach the app.

**Expected cost:** the worker uses `claude-opus-5-5` at low effort, with the system prompt cached. A Free Talk turn costs about 1¢, so 10 minutes of Free Talk a day (about 20 turns) is roughly **$4–8 a month**. A few Free Talks a week costs closer to $1–2. The daily cap (`DAILY_CHAT_LIMIT`, default 120 turns per account) bounds the worst case. To spend far less, set `MODEL = "claude-haiku-5-5"` in `wrangler.toml` (≈ $0.10–0.30 a month at the same use). Set a monthly spend limit in the Anthropic Console as well.

---

## How to add a lesson

Lessons are plain data in [`src/content/units/`](src/content/units/). Copy an existing lesson object in a unit file and edit it:

```json
{
  "id": "u3-l7", "type": "lesson", "title": "¡Penal!", "subtitle": "Penalty kicks", "icon": "🥅",
  "canDo": "I can talk about penalty kicks",
  "scenario": "Taking penalty kicks after practice",
  "intro": [ { "en": "Penalty time!" }, { "en": "Shoot!", "es": "¡Tira!" }, { "en": "Your turn!" } ],
  "phrases": [ { "id": "tira", "es": "¡Tira!", "en": "Shoot!", "pic": "⚽", "help": "A kid-friendly explanation." } ],
  "frame": { "id": "tiro-x", "es": "Tiro {x}.", "en": "I shoot {x}.", "help": "…",
             "fillers": [ { "es": "a la derecha", "en": "to the right", "pic": "➡️" } ] },
  "qa": [
    { "q": "¿Quién tira?", "qEn": "Who's shooting?", "say": "¡Yo tiro!" },
    { "q": "¿Adónde tiras?", "qEn": "Where do you shoot?", "open": true,
      "accept": ["tiro {any}", "a la {any}"], "model": "Tiro a la derecha.", "hint": "Tiro ___." }
  ]
}
```

- `id`s must be unique. Each lesson needs at least 2 phrases, a frame with 3+ fillers, and 2+ questions.
- Open answers use slots: `{name}`, `{number}`, `{any}`, or your own list (`"slots": { "color": ["rojo", "azul"] }`).
- Roleplays (`"type": "roleplay"`) are small branching scripts. Copy one and change the lines. Unit reviews (`"type": "review"`) and checkpoints (`"type": "checkpoint"`) build themselves from the unit's phrases.
- Run **`npm run validate`**. It checks the structure, ¿/¡ punctuation, common missing accents, and scans everything for the excluded parent vocabulary. The deploy also runs it, so a mistake can't ship.

---

## Tuning

- **Speech scoring leniency:** grown-up dashboard (Gentle / Standard), and the exact thresholds in [`src/config/scoring-config.js`](src/config/scoring-config.js).
- **XP values:** [`src/engine/rewards.js`](src/engine/rewards.js). **Streak freezes:** [`src/engine/streaks.js`](src/engine/streaks.js).

## Development

| Command | What it does |
|---|---|
| `npm run dev` | Local dev server |
| `npm test` | Unit tests (scoring, streaks, mastery, XP, league) |
| `npm run validate` | Content validator + content-rule scan |
| `npm run build` | Validate + production build into `dist/` |
| `npm run test:rules` | Firestore security rules in the emulator (Java 21) |
| `npm run test:e2e` | iPad (WebKit) portrait + landscape click-through, with mocked speech, served from a `/dale-spanish/` subpath (run `npm run build` first) |

**Code map:** `src/speech` (TTS, listening engines, scoring) · `src/engine` (streaks, mastery, rewards; pure and tested) · `src/data` (store, sync, actions) · `src/lesson` (lesson player) · `src/screens` · `src/content` (course) · `worker/` (optional helper).

**Privacy:** no analytics or third-party trackers. Fonts are bundled. The only outside services are Firebase and (optionally) your worker.
