# VibeAssist — 30s video ad

`vibeassist-ad.mp4` is the rendered spot (1920×1080, 60fps, H.264 + AAC). `poster.png` is the end-card frame, usable as a thumbnail.

- **Preview live:** open `ad.html` in Chrome. Space plays or pauses, the arrow keys step, and the bar at the bottom scrubs.
- **Re-render:** `npm install`, then `npm run render`. The render uses your installed Chrome at `C:/Program Files/Google/Chrome/Application/chrome.exe`; change `CHROME` in `render.mjs`/`stills.mjs` if it lives somewhere else.

Every frame is a pure function of time `t` (`window.renderAt(t)`), so what you see in the browser preview is exactly what gets rendered. Copy, numbers, and timings live at the top of each scene block in `ad.html`. The soundtrack in `synth.mjs` is synthesized from scratch at 120 BPM, and its SFX cues match the scene timings.
