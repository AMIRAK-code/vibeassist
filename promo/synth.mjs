// VibeAssist spot — original soundtrack, synthesized from scratch.
// 120 BPM (beat = 0.5s), A-minor → C-major resolve. Every SFX cue mirrors a visual timing in ad.html.
// Output: soundtrack.wav (48 kHz, 16-bit stereo, 30.000s)
import fs from 'node:fs';
import path from 'node:path';

const SR = 48000, DUR = 30, N = SR * DUR;
const L = new Float32Array(N), R = new Float32Array(N);       // dry mix
const VL = new Float32Array(N), VR = new Float32Array(N);     // reverb send
const DLs = new Float32Array(N), DRs = new Float32Array(N);   // delay send
const SC = new Float32Array(N).fill(1);                       // sidechain gain
const KICKS = [];

let seed = 0x9E3779B9;
const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
const noise = () => rnd() * 2 - 1;
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
const S = t => Math.round(t * SR);
const panLR = p => { const a = (Math.max(-1, Math.min(1, p)) + 1) * Math.PI / 4; return [Math.cos(a), Math.sin(a)]; };
function put(i, v, pl, pr, send = 0, dsend = 0) {
  if (i < 0 || i >= N) return;
  L[i] += v * pl; R[i] += v * pr;
  if (send) { VL[i] += v * pl * send; VR[i] += v * pr * send; }
  if (dsend) { DLs[i] += v * pl * dsend; DRs[i] += v * pr * dsend; }
}
function blep(t, dt) { if (t < dt) { t /= dt; return t + t - t * t - 1; } if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; } return 0; }
class BQ {
  constructor() { this.x1 = this.x2 = this.y1 = this.y2 = 0; }
  set(type, f, q = .707) {
    const w = 2 * Math.PI * Math.min(Math.max(f, 10), SR * .45) / SR, c = Math.cos(w), s = Math.sin(w), a = s / (2 * q);
    let b0, b1, b2;
    if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = (1 - c) / 2; }
    else if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = (1 + c) / 2; }
    else { b0 = a; b1 = 0; b2 = -a; }
    const a0 = 1 + a; this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = -2 * c / a0; this.a2 = (1 - a) / a0;
    return this;
  }
  p(x) { const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2; this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y; return y; }
}

/* ------------------------------ instruments ------------------------------ */
function kick(t0, amp = 1) {
  KICKS.push(t0);
  const i0 = S(t0), n = S(.42); let ph = 0;
  for (let j = 0; j < n; j++) {
    const t = j / SR, f = 43 + 125 * Math.exp(-t * 32) + 28 * Math.exp(-t * 7);
    ph += 2 * Math.PI * f / SR;
    let v = Math.sin(ph) * Math.exp(-t * 6.2) * (1 - Math.exp(-t * 3000)) + noise() * Math.exp(-t * 350) * .22;
    put(i0 + j, Math.tanh(v * 1.7) * amp * .95, .707, .707);
  }
}
function clap(t0, amp = 1) {
  const bp = new BQ().set('bp', 1350, .8), hp = new BQ().set('hp', 650);
  const i0 = S(t0), n = S(.38);
  for (let j = 0; j < n; j++) {
    const t = j / SR; let e = 0;
    for (const o of [0, .011, .023]) if (t >= o) e += Math.exp(-(t - o) * 190) * .85;
    if (t > .023) e += Math.exp(-(t - .023) * 16) * .55;
    put(i0 + j, hp.p(bp.p(noise())) * e * amp * 1.7, .72, .69, .24);
  }
}
function snare(t0, amp = .5) {
  const hp = new BQ().set('hp', 1600); const i0 = S(t0), n = S(.2); let ph = 0;
  for (let j = 0; j < n; j++) {
    const t = j / SR; ph += 2 * Math.PI * (185 + 70 * Math.exp(-t * 40)) / SR;
    put(i0 + j, (Math.sin(ph) * Math.exp(-t * 32) * .5 + hp.p(noise()) * Math.exp(-t * 24) * .8) * amp, .7, .7, .14);
  }
}
function hat(t0, amp = .28, open = false, pan = .2) {
  const hp = new BQ().set('hp', 7800, .7); const i0 = S(t0), n = S(open ? .32 : .06); const [pl, pr] = panLR(pan);
  for (let j = 0; j < n; j++) { const t = j / SR; put(i0 + j, hp.p(noise()) * Math.exp(-t * (open ? 13 : 85)) * amp, pl, pr, open ? .12 : .03); }
}
function crash(t0, amp = .35, dur = 2.4) {
  const a = new BQ().set('hp', 4200, .6), b = new BQ().set('hp', 4200, .6); const i0 = S(t0), n = S(dur);
  for (let j = 0; j < n; j++) { const t = j / SR, e = Math.exp(-t * 2.1) * (1 - Math.exp(-t * 900)) * amp; put(i0 + j, a.p(noise()) * e, 1, 0, .3); put(i0 + j, b.p(noise()) * e, 0, 1, .3); }
}
function impact(t0, amp = 1, len = 1.8) {
  const lp = new BQ(); const i0 = S(t0), n = S(len); let ph = 0;
  for (let j = 0; j < n; j++) {
    const t = j / SR; ph += 2 * Math.PI * (25 + 75 * Math.exp(-t * 4)) / SR;
    if (j % 64 === 0) lp.set('lp', 180 + 7000 * Math.exp(-t * 6));
    const v = Math.sin(ph) * Math.exp(-t * 2.0) * .95 + lp.p(noise()) * Math.exp(-t * 5) * .55;
    put(i0 + j, Math.tanh(v * 1.4) * amp, .707, .707, .28);
  }
}
function supersaw(t0, dur, notes, amp = .2, o = {}) {
  const { att = .008, rel = .35, cut0 = 5200, cut1 = 2600, q = .8, sc = true, send = .25, det = .17, voices = 7, cutT = .45, dsend = 0 } = o;
  const i0 = S(t0), n = S(dur + rel);
  const osc = [];
  for (const m of notes) for (let v = 0; v < voices; v++) {
    const d = (v - (voices - 1) / 2) / ((voices - 1) / 2) * det, f = mtof(m + d);
    const [pl, pr] = panLR((v % 2 ? 1 : -1) * (.25 + .6 * Math.abs(d / det)) * .85);
    osc.push({ dt: f / SR, ph: rnd(), pl, pr });
  }
  const fl = new BQ(), fr = new BQ(), norm = 1 / Math.sqrt(osc.length);
  for (let j = 0; j < n; j++) {
    const i = i0 + j; if (i >= N) break;
    const t = j / SR;
    if (j % 32 === 0) { const c = cut1 + (cut0 - cut1) * Math.exp(-t / cutT); fl.set('lp', c, q); fr.set('lp', c, q); }
    let sl = 0, sr = 0;
    for (const k of osc) { k.ph += k.dt; if (k.ph >= 1) k.ph -= 1; const s = 2 * k.ph - 1 - blep(k.ph, k.dt); sl += s * k.pl; sr += s * k.pr; }
    let env = t < att ? t / att : 1; if (t > dur) env *= Math.exp(-(t - dur) / (rel / 4));
    const g = env * amp * norm * (sc ? SC[i] : 1);
    const yl = fl.p(sl) * g, yr = fr.p(sr) * g;
    L[i] += yl; R[i] += yr; VL[i] += yl * send; VR[i] += yr * send; if (dsend) { DLs[i] += yl * dsend; DRs[i] += yr * dsend; }
  }
}
function pad(t0, dur, notes, amp = .1, cut = 1400) { supersaw(t0, dur, notes, amp, { att: .9, rel: 1.4, cut0: cut, cut1: cut, sc: false, send: .6, det: .1, voices: 5 }); }
function pluck(t0, m, amp = .1, pan = 0, dsend = .3, send = .15, dec = 7) {
  const i0 = S(t0), n = S(.45), f = mtof(m), dt = f / SR; let p1 = rnd(), p2 = rnd(); const lp = new BQ(); const [pl, pr] = panLR(pan);
  for (let j = 0; j < n; j++) {
    const t = j / SR, i = i0 + j; if (i >= N) break;
    if (j % 16 === 0) lp.set('lp', 350 + 7500 * Math.exp(-t * 24), 1.3);
    p1 += dt; if (p1 >= 1) p1 -= 1; p2 += dt * 1.004; if (p2 >= 1) p2 -= 1;
    const s = (2 * p1 - 1 - blep(p1, dt)) * .6 + (p2 < .5 ? 1 : -1) * .25;
    put(i, lp.p(s) * Math.exp(-t * dec) * Math.min(1, t / .002) * amp * SC[i], pl, pr, send, dsend);
  }
}
function bass(t0, m, dur, amp = .34) {
  const i0 = S(t0), n = S(dur + .04), f = mtof(m), dt = f / SR; let p = 0, ps = 0; const lp = new BQ();
  for (let j = 0; j < n; j++) {
    const t = j / SR; if (j % 16 === 0) lp.set('lp', 170 + 1500 * Math.exp(-t * 15), 1.1);
    p += dt; if (p >= 1) p -= 1; ps += f / 2 / SR;
    let env = Math.min(1, t / .004) * Math.exp(-t * 2.6); if (t > dur) env *= Math.exp(-(t - dur) * 90);
    put(i0 + j, Math.tanh((lp.p(2 * p - 1 - blep(p, dt)) * .8 + Math.sin(2 * Math.PI * ps) * .75) * env * amp * 1.3), .707, .707);
  }
}
function reese(t0, m, dur, amp = .3) {
  const i0 = S(t0), n = S(dur), f = mtof(m); let p1 = 0, p2 = 0, ps = 0; const lp = new BQ();
  for (let j = 0; j < n; j++) {
    const t = j / SR;
    if (j % 32 === 0) lp.set('lp', 280 + 520 * (.5 + .5 * Math.sin(t * 2 * Math.PI * 2)), 2.2);
    const d1 = f * 1.005 / SR, d2 = f * .995 / SR; p1 += d1; if (p1 >= 1) p1 -= 1; p2 += d2; if (p2 >= 1) p2 -= 1; ps += f / 2 / SR;
    let s = (2 * p1 - 1 - blep(p1, d1)) + (2 * p2 - 1 - blep(p2, d2));
    s = lp.p(s) * .6 + Math.sin(2 * Math.PI * ps) * .6;
    const env = Math.min(1, t / .02) * Math.min(1, (dur - t) / .06);
    put(i0 + j, Math.tanh(s * 1.9) * env * amp, .707, .707, .05);
  }
}
function blip(t0, f0, dur = .12, amp = .1, pan = 0, type = 'sine', f1 = null, send = .2, dsend = 0) {
  const i0 = S(t0), n = S(dur); const [pl, pr] = panLR(pan); let ph = 0;
  for (let j = 0; j < n; j++) {
    const t = j / SR, f = f1 ? f0 * Math.pow(f1 / f0, t / dur) : f0; ph += f / SR; const x = ph % 1;
    const s = type === 'sine' ? Math.sin(2 * Math.PI * x) : type === 'tri' ? 4 * Math.abs(x - .5) - 1 : (x < .5 ? .5 : -.5);
    put(i0 + j, s * Math.min(1, t / .002) * Math.exp(-t * (6 / dur)) * amp, pl, pr, send, dsend);
  }
}
function tick(t0, amp = .07, f = 3600, pan = 0) {
  const bp = new BQ().set('bp', f, 1.4); const i0 = S(t0), n = S(.03); const [pl, pr] = panLR(pan);
  for (let j = 0; j < n; j++) { const t = j / SR; put(i0 + j, bp.p(noise()) * Math.exp(-t * 420) * amp * 3 + Math.sin(2 * Math.PI * 170 * t) * Math.exp(-t * 220) * amp * .7, pl, pr, .04); }
}
function whoosh(t0, dur = .5, amp = .3, up = true, p0 = -.7, p1 = .7) {
  const a = new BQ(), b = new BQ(); const i0 = S(t0), n = S(dur);
  for (let j = 0; j < n; j++) {
    const t = j / SR, u = t / dur;
    if (j % 32 === 0) { const f = up ? 280 * Math.pow(26, u) : 7400 * Math.pow(1 / 26, u); a.set('bp', f, 1.1); b.set('bp', f * 1.6, 1.5); }
    const [pl, pr] = panLR(p0 + (p1 - p0) * u);
    put(i0 + j, (a.p(noise()) + b.p(noise()) * .6) * Math.pow(Math.sin(Math.PI * u), 1.6) * amp, pl, pr, .22);
  }
}
function riser(t0, dur, amp = .25) {
  const a = new BQ(), b = new BQ(); const i0 = S(t0), n = S(dur); let ph = 0;
  for (let j = 0; j < n; j++) {
    const t = j / SR, u = t / dur; if (j % 32 === 0) { a.set('bp', 200 * Math.pow(45, u), 2); b.set('bp', 230 * Math.pow(45, u), 2); }
    const e = Math.pow(u, 2.2) * amp; ph += 110 * Math.pow(8, u) / SR; const saw = (2 * (ph % 1) - 1) * .12;
    put(i0 + j, (a.p(noise()) * 1.4 + saw) * e, 1, 0, .35); put(i0 + j, (b.p(noise()) * 1.4 + saw) * e, 0, 1, .35);
  }
}
function swell(t0, dur, amp = .3) {
  const a = new BQ(), b = new BQ(); const i0 = S(t0), n = S(dur);
  for (let j = 0; j < n; j++) { const t = j / SR, u = t / dur; if (j % 32 === 0) { a.set('lp', 400 + 9000 * u * u); b.set('lp', 420 + 9000 * u * u); } const e = Math.pow(u, 3) * amp; put(i0 + j, a.p(noise()) * e, 1, 0, .3); put(i0 + j, b.p(noise()) * e, 0, 1, .3); }
}
function glitch(t0, dur, amp = .3) {
  const i0 = S(t0), n = S(dur); let seg = 0, hold = 0, val = 0, f = 200, ph = 0, mode = 0, pan = 0;
  for (let j = 0; j < n; j++) {
    if (seg <= 0) { seg = S(.012 + rnd() * .04); f = 90 + rnd() * 1600; mode = Math.floor(rnd() * 3); pan = rnd() * 1.6 - .8; }
    seg--; if (hold <= 0) { hold = 3 + Math.floor(rnd() * 22); val = noise(); } hold--;
    ph += f / SR; const s = mode === 0 ? val : mode === 1 ? ((ph % 1) < .5 ? .6 : -.6) : 0;
    const [pl, pr] = panLR(pan); put(i0 + j, s * amp, pl, pr, .08);
  }
}
function chime(t0, freqs, amp = .08, pan = 0, dec = 3.2, dsend = .15) {
  const [pl, pr] = panLR(pan);
  for (const f of freqs) { const i0 = S(t0), n = S(1.3); for (let j = 0; j < n; j++) { const t = j / SR; put(i0 + j, (Math.sin(2 * Math.PI * f * t) + .3 * Math.sin(2 * Math.PI * f * 2.01 * t) * Math.exp(-t * 9)) * Math.exp(-t * dec) * Math.min(1, t / .003) * amp, pl, pr, .35, dsend); } }
}
function thud(t0, amp = .7) {
  const i0 = S(t0), n = S(.5); let ph = 0; const lp = new BQ().set('lp', 1900);
  for (let j = 0; j < n; j++) { const t = j / SR; ph += (40 + 95 * Math.exp(-t * 25)) / SR; put(i0 + j, Math.tanh((Math.sin(2 * Math.PI * ph) * Math.exp(-t * 9) + lp.p(noise()) * Math.exp(-t * 30) * .6) * amp * 1.5), .707, .707, .22); }
}
function zap(t0, amp = .25, pan = 0) {
  const i0 = S(t0), n = S(.36); const [pl, pr] = panLR(pan); let ph = 0; const hp = new BQ().set('hp', 2200);
  for (let j = 0; j < n; j++) { const t = j / SR; ph += (1900 * Math.exp(-t * 12) + 220) / SR; put(i0 + j, (Math.sin(2 * Math.PI * ph) * .5 * Math.exp(-t * 10) + hp.p(noise()) * Math.exp(-t * 26) * .6 + Math.sin(2 * Math.PI * 58 * t) * Math.exp(-t * 12) * .7) * amp, pl, pr, .26); }
}
function shimmer(t0, dur = .6, amp = .06) { const hp = new BQ(); const i0 = S(t0), n = S(dur); for (let j = 0; j < n; j++) { const t = j / SR, u = t / dur; if (j % 32 === 0) hp.set('bp', 3000 + 9000 * u, 3); put(i0 + j, hp.p(noise()) * Math.sin(Math.PI * u) * amp * 2, .6 + .3 * u, .9 - .3 * u, .4); } }

/* ------------------------------ harmony ------------------------------ */
const CH = { Am: [57, 60, 64, 69], F: [57, 60, 65, 69], C: [55, 60, 64, 67], G: [55, 59, 62, 67] };
const BS = { Am: 45, F: 41, C: 48, G: 43 };
const PROG = ['Am', 'F', 'C', 'G', 'Am', 'F', 'C', 'G', 'Am']; // bars from 4.0 to 22.0

/* ------------------------------ 1. drums first (sidechain source) ------------------------------ */
kick(1.4, .85);                                                    // "Shipped."
for (let t = 4.0; t < 21.9; t += .5) kick(t, t === 4.0 ? 1 : .9);  // main groove
[22.0, 22.75, 23.0, 23.75, 24.0].forEach(t => kick(t, .9));        // half-time breakdown
for (let t = 25.0; t < 27.2; t += .5) kick(t, .9);                 // pricing
kick(28.0, 1);                                                      // final hit
for (const kt of KICKS) { const i0 = S(kt); for (let j = 0; j < S(.34); j++) { const i = i0 + j; if (i >= N) break; const g = 1 - .68 * Math.exp(-j / SR * 11); if (g < SC[i]) SC[i] = g; } }

for (let t = 4.5; t < 21.9; t += 1) clap(t, t < 6 ? .7 : .85);
[22.5, 23.5].forEach(t => clap(t, .8));
[25.5, 26.5].forEach(t => clap(t, .85));
for (let t = 6.0; t < 21.8; t += .125) {
  const k = Math.round((t - 6) / .125) % 4;
  if (k === 2) hat(t, (Math.round((t - 6) / .5) % 4 === 3) ? .22 : .26, Math.round((t - 6) / .5) % 4 === 3, .25);
  else hat(t, .08, false, k % 2 ? -.3 : .3);
}
for (let t = 25.0; t < 27.2; t += .125) { const k = Math.round((t - 25) / .125) % 4; hat(t, k === 2 ? .26 : .08, false, k % 2 ? -.3 : .3); }
// snare rolls into the drop and the finale
for (let t = 3.0, dt = .25; t < 3.9; t += dt, dt = Math.max(.0625, dt * .82)) snare(t, .18 + (t - 3) * .45);
for (let t = 27.0, dt = .25; t < 27.92; t += dt, dt = Math.max(.0625, dt * .8)) snare(t, .18 + (t - 27) * .45);

/* ------------------------------ 2. music ------------------------------ */
pad(0, 4.0, [45, 57, 60, 64], .09, 700);                           // intro Am, dark and filtered
supersaw(4.0, .35, CH.Am.concat([72, 76]), .34, { cut0: 9000, cut1: 3000, cutT: .15, rel: .6, send: .45 }); // drop stab
PROG.forEach((c, b) => {
  const t0 = 4 + b * 2;
  supersaw(t0, 2.0, CH[c], b === 0 ? .15 : .19, { cut0: 5200, cut1: 2400 + b * 120 });
  if (t0 >= 6) for (let k = 0; k < 4; k++) bass(t0 + k * .5 + .25, BS[c], .22, .36);
  if (t0 >= 6) for (let k = 0; k < 16; k++) {
    const pat = [0, 1, 2, 3, 2, 1, 2, 3], m = CH[c][pat[k % 8]] + 12 + (k >= 8 && k % 4 === 3 ? 12 : 0);
    const t = t0 + k * .125; if (t > 21.8) break;
    pluck(t, m, .075, k % 2 ? .35 : -.35, .28, .12);
  }
});
bass(4.0, 33, .9, .5);                                              // sub at the drop
// breakdown 22–25: dark reese + filtered pad
reese(22.0, 2.0, 29, .34); reese(24.0, .95, 31, .36);
pad(22.0, 3.0, [53, 57, 60], .07, 600);
// pricing lift 25–27.3
supersaw(25.0, 1.0, CH.F, .19, { cut0: 6500, cut1: 3000 });
supersaw(26.0, 1.25, CH.G, .19, { cut0: 6500, cut1: 3200 });
for (let k = 0; k < 4; k++) bass(25.25 + k * .5, k < 2 ? 41 : 43, .22, .36);
for (let k = 0; k < 18; k++) { const c = k < 8 ? CH.F : CH.G; pluck(25 + k * .125, c[[0, 1, 2, 3][k % 4]] + 12, .07, k % 2 ? .35 : -.35, .28, .12); }
// finale: C add9, sparkling arp, long tail
supersaw(28.0, 1.1, [48, 55, 60, 62, 64, 67, 72, 76], .3, { cut0: 9000, cut1: 3200, cutT: .5, rel: 1.8, send: .5, sc: false });
pad(28.0, 1.8, [48, 55, 64, 67], .1, 2400);
bass(28.0, 36, 1.2, .5);
[84, 79, 76, 72, 79, 76, 72, 67, 76, 72].forEach((m, k) => pluck(28.25 + k * .125, m, .05 * (1 - k * .06), k % 2 ? .5 : -.5, .4, .2, 6));

/* ------------------------------ 3. sound design, synced to picture ------------------------------ */
// S1 hook
for (let i = 0; i < 20; i++) tick(.25 + i * .04, .06 + rnd() * .03, 3000 + rnd() * 1800, (rnd() - .5) * .4);
tick(1.06, .14, 1800, 0);
chime(1.1, [1318.5, 1760], .05, .2);
impact(1.4, .45, 1.0); crash(1.4, .12, 1.0);
const WARN = [880, 932, 1046, 1109, 784, 830];
for (let i = 0; i < 18; i++) { const f = WARN[i % WARN.length] * (rnd() < .5 ? 1 : 1.5); blip(2.0 + i * .072, f, .1, .06, i % 2 ? .6 : -.6, 'tri', f * .94, .15); }
riser(2.0, 1.95, .22);
[2.5, 2.75].forEach(t => { glitch(t, .16, .22); impact(t, .35, .5); });
glitch(3.1, .35, .12);
swell(3.35, .62, .28);
// S2 drop
impact(4.0, 1, 2.0); crash(4.0, .32, 2.6);
whoosh(4.05, .45, .12, true, 0, 0); shimmer(4.2, .5, .05);
whoosh(4.45, .45, .1, false, .5, -.3);
chime(4.8, [1046.5, 1568], .045, 0);
shimmer(5.35, .8, .05);
whoosh(6.18, .55, .28, true, -.2, .2);
// S3 HUD
[6.95, 7.07, 7.19, 7.31].forEach((t, i) => blip(t, 660 * Math.pow(1.1225, i * 2), .09, .07, -.4 + i * .27, 'sine', null, .2));
blip(7.3, 300, 1.45, .03, 0, 'sine', 900, .25);
[8.25, 8.55].forEach((t, i) => { blip(t, 1320 + i * 440, .12, .08, i ? .4 : -.4, 'tri'); tick(t, .06, 5000); });
whoosh(9.2, .55, .3, false, -.8, .8);
// S4 integrations
for (let i = 0; i < 4; i++) tick(9.7 + i * .08, .05, 2400);
for (let i = 0; i < 4; i++) for (let k = 0; k < 4; k++) { const ta = 10.3 + i * .11 + k * .42 + .55; if (ta < 11.8) tick(ta, .035, 6000, i < 2 ? -.2 : .2); }
for (let i = 0; i < 4; i++) { const t = 10.62 + i * .14; blip(t, 988, .08, .07, i < 2 ? -.5 : .5, 'sine'); blip(t + .06, 1480, .14, .07, i < 2 ? -.5 : .5, 'sine'); }
chime(11.1, [1318.5, 1975.5], .05, 0);
whoosh(11.62, .6, .3, true, 0, 0); swell(11.75, .45, .12);
// S5 AI
for (let i = 0; i < 37; i++) tick(12.45 + i * .019, .035 + rnd() * .02, 3200 + rnd() * 1500, .1);
tick(13.2, .1, 1500); whoosh(13.2, .3, .09, true, .3, .6);
[13.45, 13.6, 13.75].forEach((t, i) => blip(t, 520 + i * 60, .07, .035, -.3, 'sine'));
chime(13.86, [1046.5, 1318.5, 1568], .045, -.2);
[14.0, 14.25, 14.5].forEach((t, i) => blip(t, [784, 988, 1175][i], .1, .07, -.3, 'tri'));
blip(14.62, 520, .5, .06, .4, 'sine', 1560, .3); shimmer(14.65, .6, .06);
whoosh(15.2, .55, .3, false, .6, -.6);
// S6 ads
[0, 2, 4, 7, 9, 12].forEach((s, i) => blip(15.8 + i * .125, mtof(76 + s), .1, .07, -.7 + i * .28, 'tri', null, .2, .1));
blip(16.0, 400, .95, .03, 0, 'sine', 1400, .2);
chime(16.95, [1568, 2093], .05, .5);
for (let k = 0; k < 18; k += 2) { const t = 17.0 + k * .03; blip(t, 1976, .05, .035, .3, 'tri', null, .1); blip(t + .045, 2637, .14, .035, .3, 'tri', null, .15); }
whoosh(17.6, .7, .34, true, -.9, .9);
// S7 legal
for (let i = 0; i < 3; i++) whoosh(18.1 + i * .12, .3, .08, false, .6, .2);
for (let i = 0; i < 4; i++) { const t = 18.5 + i * .125; blip(t, 700 + i * 90, .08, .05, i % 2 ? .5 : -.1, 'sine'); blip(t + .45, 1568, .1, .04, i % 2 ? .5 : -.1, 'sine'); }
for (let i = 0; i < 5; i++) tick(18.95 + i * .1, .05, 2600, .5);
thud(19.55, .85); crash(19.55, .1, 1.0); glitch(19.55, .05, .12);
whoosh(20.2, .55, .3, false, -.8, .8);
// S8 news
whoosh(20.42, .5, .1, true, .4, .4);
for (let i = 0; i < 17; i++) tick(21.08 + i * .021, .035 + rnd() * .02, 3400 + rnd() * 1200, .4);
tick(21.52, .1, 1500, .4); chime(21.58, [1318.5, 1760, 2637], .045, .4);
glitch(21.84, .22, .26);
// S9 anti-fragile
impact(22.0, .8, 1.6);
for (let i = 0; i < 9; i++) for (let k = 0; k < 3; k++) tick(22.36 + i * .26 + k * .04, .035, 4200 - k * 400, -.5);
[0, 3, 5, 7, 10, 12, 15].forEach((s, i) => blip(22.45 + i * .2, mtof(69 + s), .14, .06, (Math.cos(-Math.PI / 2 + i * 2 * Math.PI / 7)) * .7, 'tri', null, .3, .12));
blip(22.3, 200, .7, .03, .3, 'sine', 800, .3);
for (let k = 0; k < 8; k++) { const h = 24.0 + k * .1; whoosh(h - .32, .32, .05, true, k % 2 ? .9 : -.9, .3); zap(h, .16 + k * .02, (k % 2 ? .5 : -.5)); }
chime(24.72, [1046.5, 1568, 2093], .06, .3);
swell(24.6, .45, .3); crash(25.02, .22, 1.6);
// S10 pricing
whoosh(25.25, .4, .1, true, -.3, .3);
blip(25.6, 330, .65, .035, .2, 'sine', 990, .2);
[0, 1, 2].forEach(i => tick(25.55 + i * .1, .04, 3000, -.4));
[0, 1, 2, 3, 4].forEach(i => blip(25.7 + i * .1, mtof(79 + [0, 2, 4, 7, 9][i]), .07, .04, .2, 'sine'));
impact(26.4, .45, .8); chime(26.45, [2093, 2637], .05, .6);
shimmer(26.8, .7, .05);
riser(27.0, .97, .2); swell(27.3, .67, .3);
// S11 end card
impact(28.0, 1, 2.0); crash(28.0, .3, 2.0);
shimmer(28.1, .7, .05);
tick(29.18, .14, 1600, .2); chime(29.2, [1568, 2093, 3136], .045, .2); shimmer(29.3, .8, .04);

/* ------------------------------ 4. FX buses ------------------------------ */
function freeverb(inL, inR, room = .84, damp = .28, wet = .9) {
  const cT = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617].map(x => Math.round(x * SR / 44100));
  const aT = [556, 441, 341, 225].map(x => Math.round(x * SR / 44100)), sp = Math.round(23 * SR / 44100);
  const run = (inp, s) => {
    const out = new Float32Array(N), cs = cT.map(l => ({ b: new Float32Array(l + s), i: 0, f: 0 })), as = aT.map(l => ({ b: new Float32Array(l + s), i: 0 }));
    for (let n = 0; n < N; n++) {
      const x = inp[n] * .015; let acc = 0;
      for (const c of cs) { const y = c.b[c.i]; c.f = y * (1 - damp) + c.f * damp; c.b[c.i] = x + c.f * room; if (++c.i >= c.b.length) c.i = 0; acc += y; }
      for (const a of as) { const bo = a.b[a.i], y = -acc + bo; a.b[a.i] = acc + bo * .5; if (++a.i >= a.b.length) a.i = 0; acc = y; }
      out[n] = acc;
    }
    return out;
  };
  const oL = run(inL, 0), oR = run(inR, sp);
  for (let n = 0; n < N; n++) { L[n] += oL[n] * wet * 3; R[n] += oR[n] * wet * 3; }
}
function pingpong(inL, inR, time = .375, fb = .36, mix = .55) {
  const d = S(time), yl = new Float32Array(N), yr = new Float32Array(N), a = new BQ().set('lp', 4200), b = new BQ().set('lp', 4200);
  for (let n = 0; n < N; n++) {
    const x = n >= d ? (inL[n - d] + inR[n - d]) * .5 : 0;
    yl[n] = a.p(x + (n >= d ? yr[n - d] * fb : 0));
    yr[n] = b.p(n >= d ? yl[n - d] * fb : 0);
    L[n] += yl[n] * mix; R[n] += yr[n] * mix; VL[n] += yl[n] * .2; VR[n] += yr[n] * .2;
  }
}
pingpong(DLs, DRs);
freeverb(VL, VR);

/* ------------------------------ 5. master ------------------------------ */
const hl = new BQ().set('hp', 28), hr = new BQ().set('hp', 28);
let peak = 0;
for (let n = 0; n < N; n++) { L[n] = hl.p(L[n]); R[n] = hr.p(R[n]); peak = Math.max(peak, Math.abs(L[n]), Math.abs(R[n])); }
const pre = 1.35 / peak, fadeIn = S(.004), f0 = S(29.35);
const buf = Buffer.alloc(44 + N * 4);
let outPeak = 0, sumSq = 0;
for (let n = 0; n < N; n++) {
  let g = n < fadeIn ? n / fadeIn : 1;
  if (n > f0) g *= .5 + .5 * Math.cos(Math.PI * (n - f0) / (N - f0));
  const l = Math.tanh(L[n] * pre) * .95 * g, r = Math.tanh(R[n] * pre) * .95 * g;
  outPeak = Math.max(outPeak, Math.abs(l), Math.abs(r)); sumSq += l * l + r * r;
  buf.writeInt16LE(Math.round(l * 32767), 44 + n * 4); buf.writeInt16LE(Math.round(r * 32767), 46 + n * 4);
}
buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
const out = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), 'soundtrack.wav');
fs.writeFileSync(out, buf);
console.log(`wrote ${out}  peak ${(20 * Math.log10(outPeak)).toFixed(1)} dBFS  rms ${(10 * Math.log10(sumSq / (2 * N))).toFixed(1)} dBFS  kicks ${KICKS.length}`);
