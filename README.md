# Interval Timer

A training interval timer for your phone. It's an installable web app (PWA): open it in
your phone's browser, add it to your home screen, and it runs full-screen and offline like
a native app.

## Features

- **Work interval**: how long each round lasts
- **Rest interval**: the break between rounds (set it to *Off* for no rest)
- **Rounds**: how many times to repeat
- **Get ready**: an optional countdown before the first round
- **Sound cues**: a 3‑2‑1 countdown beep, a distinct tone when work starts, a lower double
  tone when rest starts, and a finishing jingle
- **Mute button** on both screens. Your choice is remembered. Vibration cues still work
  while muted, on devices that support vibration.
- Pause / resume, restart, and skip to the next phase
- Colour-coded phases (yellow = get ready, red = work, green = rest) with a progress ring,
  the current round, and the total time remaining
- Keeps the screen awake during a workout (where the browser supports it)
- Remembers your last settings

Tap **−** / **+** to change a value, or press and hold to change it quickly. Time steps get
bigger for longer durations (5 s, then 15 s above 1 min, then 30 s above 5 min).

## Run locally

No build step or dependencies.

```bash
npm start          # or: python3 -m http.server 8080
```

Then open http://localhost:8080. To try it on your phone, connect it to the same Wi‑Fi and
open `http://<your-computer-ip>:8080`.

## Install on a phone

The app needs to be served over HTTPS to install (localhost is the only exception). The
simplest way is GitHub Pages: in the repository, go to **Settings → Pages**, pick the branch
and the `/ (root)` folder, and open the URL it gives you.

- **Android (Chrome):** menu ⋮ → *Add to Home screen* / *Install app*
- **iPhone (Safari):** Share button → *Add to Home Screen*

## Tests

```bash
npm test
```

These test the timer logic in `js/timer.js`: phase order, countdown cues, pause, skip/reset,
and catching up after delayed ticks. They need Node 18 or later.

## Project layout

```
index.html            Setup and workout screens
css/styles.css        Styles (mobile-first, dark theme)
js/timer.js           Timer engine (no DOM, unit-tested)
js/sound.js           Beeps synthesised into WAV clips and played as media, plus mute
js/app.js             UI wiring, saved settings, wake lock, vibration
sw.js                 Service worker for offline use
manifest.webmanifest  Install metadata
icons/                App icons
```

## Notes

- Mobile browsers only allow sound after you tap something, so audio is enabled when you
  press **Start**. Unmuting plays a test beep so you can check the volume.
- On iPhone, beeps play even with the ring/silent switch on. They follow the **media
  volume** (the volume buttons while the app is open), not the ringer volume.
- After an update, close and reopen the app (or reload the page) to get the new version.
- If you lock the phone or switch to another app, the browser may pause the page, so beeps
  can be late or missing while it's in the background. The timer still keeps the correct
  time and catches up when you come back. Keep the app open on screen during a workout.
