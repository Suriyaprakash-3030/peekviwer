/* PEEK1 Monitor add-ons (v25)
 *  1. Motion FX: button ripple + spring press, particle bursts, sliding tab indicator, neural-network
 *     backdrop in the monitor, HUD scan on each new image, value "bump" on change, typing reveal, card spotlight.
 *     Only transform/opacity animations, one shared canvas loop at 30 fps with an automatic cost governor,
 *     paused when the tab is hidden or the monitor is off screen. Respects "reduce motion".
 *  2. Live broadcast: the PC with BLE pushes every frame/event to server.js over WebSocket;
 *     anyone opening  https://your-server/?view=ROOM  sees the same live screen (no Bluetooth needed).
 * Load AFTER the main page script:  <script src="peek1-addons.js"></script>  just before </body>.
 */
(() => {
"use strict";
const RM = matchMedia("(prefers-reduced-motion: reduce)");
const motionOK = () => !RM.matches;

/* =============================== 1. CSS =============================== */
const CSS = `
@property --mx { syntax: "<length>"; inherits: false; initial-value: 0px; }
@property --my { syntax: "<length>"; inherits: false; initial-value: 0px; }
.fx-clip { overflow: hidden; } .fx-rel { position: relative; }
.fx-rip { position: absolute; left: 0; top: 0; width: 10px; height: 10px; margin: -5px 0 0 -5px; border-radius: 50%;
  background: currentColor; pointer-events: none; opacity: 0; will-change: transform, opacity; }
.fx-burst { position: fixed; inset: 0; width: 100vw; height: 100vh; pointer-events: none; z-index: 70; }
.monitor { position: relative; isolation: isolate; }
.monitor > .fx-net { position: absolute; inset: 0; width: 100%; height: 100%; border-radius: inherit; pointer-events: none; z-index: 0; }
.monitor > :not(.fx-net) { position: relative; z-index: 1; }
.health { background: color-mix(in srgb, var(--bezel2) 80%, transparent); }
.imgbox .tag { z-index: 3; }
.imgbox::before { content: ""; position: absolute; inset: 10px; pointer-events: none; z-index: 2; opacity: .45;
  --c: var(--fl, #5CCBD0);
  background: linear-gradient(var(--c),var(--c)) left top / 18px 2px, linear-gradient(var(--c),var(--c)) left top / 2px 18px,
    linear-gradient(var(--c),var(--c)) right top / 18px 2px, linear-gradient(var(--c),var(--c)) right top / 2px 18px,
    linear-gradient(var(--c),var(--c)) left bottom / 18px 2px, linear-gradient(var(--c),var(--c)) left bottom / 2px 18px,
    linear-gradient(var(--c),var(--c)) right bottom / 18px 2px, linear-gradient(var(--c),var(--c)) right bottom / 2px 18px;
  background-repeat: no-repeat; }
.imgbox::after { content: ""; position: absolute; left: 0; right: 0; top: 0; height: 28%; pointer-events: none; z-index: 2; opacity: 0;
  background: linear-gradient(to bottom, transparent, color-mix(in srgb, var(--fl, #5CCBD0) 28%, transparent) 80%, var(--fl, #5CCBD0) 99%, transparent);
  transform: translateY(-110%); will-change: transform, opacity; }
.kpi .sub b { display: inline-block; }
.card { position: relative; isolation: isolate; }
.card::before { content: ""; position: absolute; inset: 0; border-radius: inherit; pointer-events: none; z-index: -1; opacity: 0;
  transition: opacity .35s ease; background: radial-gradient(380px circle at var(--mx) var(--my), color-mix(in srgb, var(--blue) 10%, transparent), transparent 65%); }
.card:hover::before { opacity: 1; }
.pill { position: relative; overflow: hidden; }
.fx-live { background: var(--badbg); border-color: transparent; font-weight: 600; }
.fx-live i { background: var(--bad) !important; }
.health .lamp { position: relative; }
#relayCard .form input { width: min(270px, 52vw); }
#relayCard .rl-link { word-break: break-all; }
.peek-viewer #btnConn, .peek-viewer #btnOpen, .peek-viewer .srcmode, .peek-viewer .o-sim { display: none !important; }
@media (max-width: 900px) { .o-relay { order: 6; } }
@media (min-width: 1280px) and (min-height: 700px) {
  .crtabs .fx-ind { position: absolute; left: 0; top: 0; width: 0; height: 0; border-radius: 7px; background: var(--ink); z-index: 0; pointer-events: none;
    transition: transform .42s cubic-bezier(.34,1.35,.64,1), width .42s cubic-bezier(.34,1.35,.64,1), height .2s; will-change: transform; }
  .crtabs.fx-has-ind button { z-index: 1; }
  .crtabs.fx-has-ind button[aria-selected="true"] { background: transparent; border-color: transparent; color: var(--bg); }
}
@media (prefers-reduced-motion: no-preference) {
  button { transition: transform .24s cubic-bezier(.34,1.56,.64,1), box-shadow .25s ease, border-color .2s, background-color .2s, color .2s, background-position .8s ease; }
  button:not(.lb-nav):not(:disabled):active { transform: scale(.94); transition-duration: .08s; }
  button.primary { background-image: linear-gradient(110deg, transparent 35%, rgba(255,255,255,.32) 48%, transparent 62%);
    background-size: 260% 100%; background-position: 130% 0; background-repeat: no-repeat; }
  button.primary:not(:disabled):hover { background-position: -30% 0; box-shadow: 0 8px 20px -8px color-mix(in srgb, var(--blue) 75%, transparent); }
  #btnConn.primary:not(:disabled) { animation: fxBreath 2.8s ease-in-out infinite; }
  .brand svg { transition: transform .5s cubic-bezier(.34,1.56,.64,1); } .brand:hover svg { transform: rotate(-10deg) scale(1.1); }
  .pill.connecting::after, .pill.retrying::after { content: ""; position: absolute; inset: 0; pointer-events: none;
    background: linear-gradient(100deg, transparent 20%, color-mix(in srgb, var(--warn) 32%, transparent) 50%, transparent 80%);
    transform: translateX(-100%); animation: fxSweep 1.3s linear infinite; }
  .fx-live i { animation: fxLive 1.4s ease-in-out infinite; }
  .shot.flash .imgbox::before { animation: fxHud 1.1s cubic-bezier(.2,.8,.2,1); }
  .shot.flash .imgbox::after { animation: fxScan 1.05s cubic-bezier(.45,0,.2,1); }
  .imgbox > img, .imgbox > canvas { animation: fxFade .35s ease-out; }
  .health[data-s] .lamp::after { content: ""; position: absolute; inset: -3px; border-radius: 50%; border: 2px solid currentColor; opacity: 0; }
  .health[data-s="good"] .lamp::after { color: #4CC27A; animation: fxPing 2.4s cubic-bezier(0,0,.2,1) infinite; }
  .health[data-s="degraded"] .lamp::after { color: #F0B44C; animation: fxPing 1.6s cubic-bezier(0,0,.2,1) infinite; }
  .health[data-s="poor"] .lamp::after, .health[data-s="stalled"] .lamp::after { color: #F26B5E; animation: fxPing 1s cubic-bezier(0,0,.2,1) infinite; }
  .gallery .thumb { animation: fxThumb .4s cubic-bezier(.2,.8,.2,1) both; }
  .timeline li:first-child:not(.empty) { animation: fxSlide .4s cubic-bezier(.2,.8,.2,1); }
  .toast { animation: fxToast .5s cubic-bezier(.34,1.56,.64,1); }
  dialog#lb[open] .lb-inner { animation: fxPop .34s cubic-bezier(.2,.9,.3,1.15); }
  dialog#lb[open]::backdrop { animation: fxFade .3s ease-out; }
  details.card[open] > .body { animation: fxSlide .35s cubic-bezier(.2,.8,.2,1); }
  .main .card.tab-on { animation: fxCard .38s cubic-bezier(.2,.8,.2,1) both; }
}
@keyframes fxSweep { to { transform: translateX(100%); } }
@keyframes fxLive { 50% { transform: scale(.5); opacity: .35; } }
@keyframes fxBreath { 0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--blue) 0%, transparent); }
  50% { box-shadow: 0 0 0 6px color-mix(in srgb, var(--blue) 22%, transparent); } }
@keyframes fxHud { 0% { transform: scale(1.07); opacity: 1; } 100% { transform: none; opacity: .45; } }
@keyframes fxScan { 0% { transform: translateY(-110%); opacity: 1; } 85% { opacity: .9; } 100% { transform: translateY(370%); opacity: 0; } }
@keyframes fxFade { from { opacity: 0; } }
@keyframes fxPing { 0% { transform: scale(.7); opacity: .9; } 80%, 100% { transform: scale(2.6); opacity: 0; } }
@keyframes fxThumb { from { opacity: 0; transform: scale(.85); } }
@keyframes fxSlide { from { opacity: 0; transform: translateY(-6px); } }
@keyframes fxToast { from { opacity: 0; transform: translateY(14px) scale(.92); } }
@keyframes fxPop { from { opacity: 0; transform: scale(.94) translateY(10px); } }
@keyframes fxCard { from { opacity: 0; transform: translateY(10px); } }
`;
const styleEl = document.createElement("style"); styleEl.id = "peek1-addons-css"; styleEl.textContent = CSS; document.head.appendChild(styleEl);

/* =============================== 2. Motion FX =============================== */
const col = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#4FC1C6";

// --- press ripple (delegated, one listener) ---
document.addEventListener("pointerdown", e => {
  const b = e.target.closest && e.target.closest("button");
  if (!b || b.disabled || !motionOK() || b.closest("#crTabs")) return;
  b.classList.add("fx-clip");
  if (getComputedStyle(b).position === "static") b.classList.add("fx-rel");
  const r = b.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  const s = Math.hypot(Math.max(x, r.width - x), Math.max(y, r.height - y)) / 5;
  const el = document.createElement("span"); el.className = "fx-rip"; el.setAttribute("aria-hidden", "true"); b.appendChild(el);
  el.animate([{ transform: `translate(${x}px,${y}px) scale(0)`, opacity: .32 }, { transform: `translate(${x}px,${y}px) scale(${s})`, opacity: 0 }],
    { duration: 620, easing: "cubic-bezier(.2,.8,.2,1)" }).onfinish = () => el.remove();
}, { passive: true });

// --- particle bursts (one overlay canvas, runs only while particles are alive) ---
const burst = (() => {
  const cv = document.createElement("canvas"); cv.className = "fx-burst"; cv.setAttribute("aria-hidden", "true"); document.body.appendChild(cv);
  const g = cv.getContext("2d"); let ps = [], raf = 0, dpr = 1;
  const size = () => { dpr = Math.min(2, devicePixelRatio || 1); cv.width = Math.round(innerWidth * dpr); cv.height = Math.round(innerHeight * dpr); };
  size(); addEventListener("resize", size);
  function loop() {
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, innerWidth, innerHeight);
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i]; p.x += p.vx; p.y += p.vy; p.vx *= .91; p.vy = p.vy * .91 + .07; p.l -= .032;
      if (p.l <= 0) { ps.splice(i, 1); continue; }
      g.globalAlpha = p.l; g.fillStyle = p.c; g.beginPath(); g.arc(p.x, p.y, p.s * p.l + .4, 0, 6.2832); g.fill();
    }
    g.globalAlpha = 1; raf = ps.length ? requestAnimationFrame(loop) : 0;
  }
  return (x, y, colors, n = 18) => {
    if (!motionOK()) return;
    for (let i = 0; i < n; i++) { const a = Math.random() * 6.2832, v = 2 + Math.random() * 4.5;
      ps.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, l: 1, s: 1.4 + Math.random() * 2.6, c: colors[i % colors.length] }); }
    if (ps.length > 320) ps.splice(0, ps.length - 320);
    if (!raf) raf = requestAnimationFrame(loop);
  };
})();
document.addEventListener("click", e => {
  const b = e.target.closest && e.target.closest("button.primary, #rlGo, #pvRec, #btnExport, #laCsv, #rpDl, #rpPrint, #simBtn");
  if (b && e.clientX) burst(e.clientX, e.clientY, [col("--blue"), col("--violet"), "#ffffff"], 16);
});

// --- connected: burst + ring from the status pill ---
{ const pill = $("pill"); let was = pill.classList.contains("connected");
  new MutationObserver(() => {
    const now = pill.classList.contains("connected");
    if (now && !was && motionOK()) {
      const r = pill.getBoundingClientRect(); burst(r.left + 14, r.top + r.height / 2, [col("--ok"), "#7CE0A3", "#ffffff"], 26);
      pill.animate([{ transform: "scale(.9)" }, { transform: "scale(1.06)" }, { transform: "none" }], { duration: 520, easing: "cubic-bezier(.34,1.56,.64,1)" });
    }
    was = now;
  }).observe(pill, { attributes: true, attributeFilter: ["class"] }); }

// --- neural-network backdrop in the monitor bezel, pulses on every new image ---
const NET = (() => {
  const mon = document.querySelector(".monitor"); if (!mon) return null;
  const cv = document.createElement("canvas"); cv.className = "fx-net"; cv.setAttribute("aria-hidden", "true"); mon.prepend(cv);
  const g = cv.getContext("2d"), COL = ["92,203,208", "238,155,190"];
  let W = 0, H = 0, dpr = 1, nodes = [], waves = [], raf = 0, last = 0, cost = 0, cap = 48, onScreen = true;
  const mk = () => ({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - .5) * .3, vy: (Math.random() - .5) * .3, e: 0, c: Math.random() < .5 ? 0 : 1 });
  function resize() {
    const r = mon.getBoundingClientRect(); dpr = Math.min(1.25, devicePixelRatio || 1); W = r.width; H = r.height;
    cv.width = Math.max(1, Math.round(W * dpr)); cv.height = Math.max(1, Math.round(H * dpr));
    const n = Math.max(12, Math.min(cap, Math.round((W * H) / 11000)));
    while (nodes.length < n) nodes.push(mk()); nodes.length = n;
    for (const p of nodes) { if (p.x > W) p.x = Math.random() * W; if (p.y > H) p.y = Math.random() * H; }
    if (!running()) draw(0, true);
  }
  const running = () => motionOK() && onScreen && !document.hidden;
  function draw(dt, still) {
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    for (let i = waves.length - 1; i >= 0; i--) {
      const w = waves[i]; w.r += w.v * dt; w.life -= .016 * dt;
      if (w.life <= 0) { waves.splice(i, 1); continue; }
      g.strokeStyle = `rgba(${COL[w.c]},${w.life * .4})`; g.lineWidth = 2; g.beginPath(); g.arc(w.x, w.y, w.r, 0, 6.2832); g.stroke();
    }
    for (const p of nodes) {
      if (!still) { p.x += p.vx * dt; p.y += p.vy * dt; if (p.x < 0 || p.x > W) p.vx *= -1; if (p.y < 0 || p.y > H) p.vy *= -1; }
      for (const w of waves) { const d = Math.hypot(p.x - w.x, p.y - w.y); if (Math.abs(d - w.r) < 16) { p.e = Math.max(p.e, w.life); p.c = w.c; } }
      p.e *= Math.pow(.94, dt);
    }
    const L2 = 118 * 118; g.lineWidth = 1;
    for (let i = 0; i < nodes.length; i++) { const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) { const b = nodes[j], dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy;
        if (d2 > L2) continue; const k = 1 - d2 / L2, en = Math.max(a.e, b.e);
        g.strokeStyle = `rgba(${COL[a.c]},${(.06 + en * .55) * k})`; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); } }
    for (const p of nodes) { g.fillStyle = `rgba(${COL[p.c]},${.32 + p.e * .68})`; g.beginPath(); g.arc(p.x, p.y, 1.4 + p.e * 2.4, 0, 6.2832); g.fill(); }
  }
  function frame(t) {
    raf = 0; if (!running()) return;
    if (t - last >= 33) {                                            // ~30 fps is plenty for ambient motion
      const dt = last ? Math.min(3, (t - last) / 16.7) : 1; last = t;
      const t0 = performance.now(); draw(dt, false); cost = cost * .9 + (performance.now() - t0) * .1;
      if (cost > 4 && nodes.length > 14) { cap = Math.max(14, Math.round(nodes.length * .75)); nodes.length = cap; cost = 0; }   // governor: never steal frames
    }
    raf = requestAnimationFrame(frame);
  }
  const kick = () => { if (!raf && running()) { last = 0; raf = requestAnimationFrame(frame); } };
  new ResizeObserver(resize).observe(mon);
  new IntersectionObserver(es => { onScreen = es[0].isIntersecting; kick(); }).observe(mon);
  document.addEventListener("visibilitychange", kick); RM.addEventListener?.("change", kick);
  resize(); kick();
  return {
    pulse(shot) {
      const m = mon.getBoundingClientRect(), r = shot.getBoundingClientRect();
      waves.push({ x: r.left - m.left + r.width / 2, y: r.top - m.top + r.height / 2, r: 6, v: 7, life: 1, c: shot.id === "shotB" ? 1 : 0 });
      if (waves.length > 6) waves.shift(); kick();
    },
  };
})();
for (const id of ["shotF", "shotB"]) {
  const shot = $(id); let lastT = 0;
  new MutationObserver(() => { if (shot.classList.contains("flash") && performance.now() - lastT > 250) { lastT = performance.now(); NET && NET.pulse(shot); } })
    .observe(shot, { attributes: true, attributeFilter: ["class"] });
}

// --- numbers "bump" when their value changes (not for ticking clocks) ---
{ const prev = new WeakMap(), SKIP = "#hAge,#sAge,#sSession,#sUptime,#sGapAvg,#hBeat";
  const mo = new MutationObserver(recs => {
    if (!motionOK()) return; const seen = new Set();
    for (const r of recs) {
      const t = r.target.nodeType === 3 ? r.target.parentElement : r.target; if (!t || t.closest(SKIP)) continue;
      const el = t.closest(".kpi .value, .kpi .sub b, .strip b, .health dd, .la-total b"); if (!el || seen.has(el)) continue; seen.add(el);
      const txt = el.textContent, had = prev.has(el); if (prev.get(el) === txt) continue; prev.set(el, txt); if (!had) continue;
      el.animate([{ transform: "translateY(-35%) scale(1.08)", opacity: .2 }, { transform: "none", opacity: 1 }], { duration: 420, easing: "cubic-bezier(.2,.9,.25,1)" });
    }
  });
  for (const sel of [".kpis", ".strip", "#health", ".la-total"]) { const el = document.querySelector(sel); if (el) mo.observe(el, { subtree: true, childList: true, characterData: true }); } }

// --- health text types itself in when the verdict changes ---
{ const why = $("hWhy"), word = $("hWord"); let w0 = why.textContent, v0 = word.textContent;
  new MutationObserver(() => { const t = why.textContent; if (t === w0) return; w0 = t; if (!motionOK()) return;
    why.animate([{ clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0 0 0)" }], { duration: Math.min(900, 16 * t.length), easing: `steps(${Math.max(1, Math.min(40, t.length))})` });
  }).observe(why, { childList: true, characterData: true, subtree: true });
  new MutationObserver(() => { const t = word.textContent; if (t === v0) return; v0 = t; if (!motionOK()) return;
    word.animate([{ transform: "scale(.7)", opacity: 0, filter: "blur(4px)" }, { transform: "none", opacity: 1, filter: "none" }], { duration: 450, easing: "cubic-bezier(.34,1.56,.64,1)" });
  }).observe(word, { childList: true, characterData: true, subtree: true }); }

// --- card spotlight follows the mouse (non-inherited custom props: no subtree restyle) ---
{ let el = null, x = 0, y = 0, raf = 0;
  document.addEventListener("pointermove", e => {
    if (e.pointerType !== "mouse") return; x = e.clientX; y = e.clientY; el = e.target.closest ? e.target.closest(".card") : null;
    if (!raf) raf = requestAnimationFrame(() => { raf = 0; if (!el) return; const r = el.getBoundingClientRect();
      el.style.setProperty("--mx", `${x - r.left}px`); el.style.setProperty("--my", `${y - r.top}px`); });
  }, { passive: true }); }

// --- sliding indicator under the control-room tabs ---
const tabs = $("crTabs"); let ind = null;
function moveInd(instant) {
  if (!ind) return; const b = tabs.querySelector('button[aria-selected="true"]');
  if (!b || !b.offsetWidth) { ind.style.opacity = "0"; return; }
  if (instant || !motionOK()) ind.style.transition = "none";
  ind.style.opacity = "1"; ind.style.transform = `translate(${b.offsetLeft}px,${b.offsetTop}px)`;
  ind.style.width = b.offsetWidth + "px"; ind.style.height = b.offsetHeight + "px";
  if (instant || !motionOK()) { void ind.offsetWidth; ind.style.transition = ""; }
}
if (tabs) {
  ind = document.createElement("span"); ind.className = "fx-ind"; ind.setAttribute("aria-hidden", "true");
  tabs.prepend(ind); tabs.classList.add("fx-has-ind");
  const origCr = crSelect; window.crSelect = tab => { origCr(tab); moveInd(false); };
  new ResizeObserver(() => moveInd(true)).observe(tabs);
}

// --- page intro (once) ---
if (motionOK()) [".monitor", ".kpis", ".strip", ".main"].forEach((s, i) => {
  const el = document.querySelector(s); if (el && el.offsetParent !== null)
    el.animate([{ opacity: 0, transform: "translateY(14px)" }, { opacity: 1, transform: "none" }], { duration: 560, delay: i * 70, easing: "cubic-bezier(.2,.8,.2,1)", fill: "backwards" });
});

/* =============================== 3. Live broadcast =============================== */
const params = new URLSearchParams(location.search);
const VIEW = params.has("view");
const viewRoom = (params.get("view") || "lab1").replace(/[^\w.-]/g, "").slice(0, 64) || "lab1";
const RS = { server: /^https?:$/.test(location.protocol) ? location.origin : "", room: "lab1", key: "", on: false };
try { Object.assign(RS, JSON.parse(localStorage.getItem("peek1_relay") || "{}")); } catch { /* defaults */ }
const saveRS = () => { try { localStorage.setItem("peek1_relay", JSON.stringify(RS)); } catch { /* optional */ } };
const wsUrlOf = srv => (srv || location.origin).replace(/^http/i, "ws").replace(/\/+$/, "") + "/ws";
const viewLink = () => `${(RS.server || location.origin).replace(/\/+$/, "")}/?view=${encodeURIComponent(RS.room)}`;
const every = (ms, fn) => (typeof clkEvery === "function" ? clkEvery(ms, fn) : setInterval(fn, ms));   // worker clock: keeps running in background tabs
let muteNotes = false;

// Hook the page's data path: every frame and event that reaches this page is also sent to the server.
const origNote = note, origEvent = onLiveEvent, origFrame = onLiveFrame;
window.note = function (level, text, ts = Date.now()) { if (muteNotes) return; origNote(level, text, ts); PUB.send({ t: "ev", ev: { ts, type: "note", level, text } }); };
window.onLiveEvent = function (ev) { origEvent(ev); if (ev.type !== "note") PUB.send({ t: "ev", ev }); };
assembler.onComplete = frame => { const ts = Date.now(); origFrame(frame); PUB.sendFrame(ts, frame); };

const MB = 1024 * 1024, size = m => (typeof m === "string" ? m.length : m.byteLength);
const PUB = {
  ws: null, on: false, open: false, q: [], qBytes: 0, sent: 0, bytes: 0, viewers: 0, retry: 0, timer: 0, err: "", announced: false,
  send(o) { if (this.on) this.raw(JSON.stringify(o)); },
  sendFrame(ts, f) {
    if (!this.on) return;
    const b = new Uint8Array(9 + f.length); b[0] = 1; new DataView(b.buffer).setFloat64(1, ts, true); b.set(f, 9); this.raw(b);
  },
  raw(m) {                                   // keeps order; queues while the server is unreachable (up to 64 MB)
    if (this.open && !this.q.length && this.ws.bufferedAmount < 8 * MB) { this.ws.send(m); this.sent++; this.bytes += size(m); return; }
    this.q.push(m); this.qBytes += size(m);
    while (this.qBytes > 64 * MB && this.q.length) this.qBytes -= size(this.q.shift());
  },
  flush() {
    while (this.q.length && this.open && this.ws.bufferedAmount < 8 * MB) { const m = this.q.shift(); this.qBytes -= size(m); this.ws.send(m); this.sent++; this.bytes += size(m); }
  },
  status() {
    if (!this.open || this.q.length) return;
    this.ws.send(JSON.stringify({ t: "status", connected: !!R.connectedSince, name: (device && device.name) || null, sim: !!SIM.on, simulated: !!S.simulated,
      batt: BATT.ts ? { mv: BATT.mv, ready: BATT.ready, ts: BATT.ts } : null, maxChunk: S.maxChunk || 0, reconnects: R.reconnects, ts: Date.now() }));
  },
  connect() {
    clearTimeout(this.timer); let ws;
    try { ws = new WebSocket(wsUrlOf(RS.server)); } catch (e) { this.err = e.message; this.later(); return; }
    ws.binaryType = "arraybuffer"; this.ws = ws;
    ws.onopen = () => ws.send(JSON.stringify({ t: "auth", role: "pub", room: RS.room, key: RS.key }));
    ws.onmessage = e => {
      if (typeof e.data !== "string") return; let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.t === "ok") { this.open = true; this.retry = 0; this.err = ""; this.flush(); this.status();
        if (!this.announced) { this.announced = true; note("info", `Live broadcast started: room "${RS.room}"`); } ui(); }
      else if (m.t === "viewers") { this.viewers = m.n; ui(); }
      else if (m.t === "replaced") { this.err = "Another PC took over this room"; this.stop(true); }
    };
    ws.onclose = e => {
      if (this.ws !== ws) return; this.open = false; this.ws = null; if (!this.on) return;
      if (e.code === 4001) { this.err = "Wrong publish key"; this.stop(true); return; }
      if (e.code === 4002) { this.err = "Another PC took over this room"; this.stop(true); return; }
      this.err = "Server unreachable, retrying (frames are queued)"; this.later(); ui();
    };
  },
  later() { this.timer = setTimeout(() => this.connect(), Math.min(15000, 1000 * 2 ** this.retry++)); },
  start() {
    if (!RS.room || !RS.key) { toast("Enter the room and the publish key first"); return; }
    if (!/^https?:/i.test(RS.server || location.origin)) { toast("Enter the server address, e.g. https://monitor.example.com"); return; }
    this.on = true; RS.on = true; saveRS(); this.announced = false; this.retry = 0; this.connect(); ui();
  },
  stop(keepErr) {
    if (this.on && this.announced && !keepErr) note("info", "Live broadcast stopped");
    this.on = false; RS.on = false; saveRS(); clearTimeout(this.timer);
    const ws = this.ws; this.ws = null; this.open = false; if (ws) try { ws.close(1000); } catch { /* closed */ }
    this.q = []; this.qBytes = 0; if (!keepErr) this.err = ""; ui();
  },
};

// ---------- viewer ----------
const VW = { ws: null, retry: 0, replaying: false, pubOnline: false, status: null, viewers: 0, key: "", frames: 0 };
try { VW.key = localStorage.getItem("peek1_viewkey") || ""; } catch { /* none */ }
function vPill() {
  const room = viewRoom, n = VW.viewers > 1 ? ` · ${VW.viewers} watching` : "";
  if (!VW.ws) setPill("retrying", `Remote view · ${room} · reconnecting…`);
  else if (VW.replaying) setPill("connecting", `Remote view · ${room} · loading history…`);
  else if (!VW.pubOnline) setPill("offline", `Remote view · ${room} · broadcaster offline${n}`);
  else if (VW.status && VW.status.connected) setPill("connected", `Remote view · ${room} · ${VW.status.sim ? "simulated feed" : "live"} · ${VW.status.name || "PEEK1"}${n}`);
  else setPill("retrying", `Remote view · ${room} · capsule not connected${n}`);
  ui();
}
function vFrame(ts, frame) {
  const rec = { ts, frame }; if (frame.length >= 26) rec.seq = (frame[24] << 8) | frame[25]; VW.frames++;
  if (VW.replaying) { mem.frames.push(rec); return; }
  put("frames", rec); muteNotes = true; try { ingestFrame(rec, true); } finally { muteNotes = false; }   // notes come from the broadcaster
  const hb = $("hBeat"); if (hb) { hb.classList.remove("on"); void hb.offsetWidth; hb.classList.add("on"); }
  $("storedCount").textContent = S.total; renderStats(); scheduleDraw();
}
function vEvent(ev) {
  if (VW.replaying) { mem.events.push(ev); return; }
  put("events", ev);
  if (ev.type === "note") { addNote(ev, true); log(`[${ev.level}] ${ev.text}`, ev.ts); }
  else { muteNotes = true; try { ingestEvent(ev, true); } finally { muteNotes = false; } }
  renderStats(); scheduleDraw();
}
function vStatus(m) {
  VW.status = m;
  if (m.connected) { if (!R.connectedSince) R.connectedSince = Date.now(); } else R.connectedSince = null;
  if (m.maxChunk > (S.maxChunk || 0)) S.maxChunk = m.maxChunk; if (m.simulated) S.simulated = true;
  if (m.batt) { BATT.mv = m.batt.mv; BATT.ready = m.batt.ready; BATT.ts = m.batt.ts; BATT.live = !!m.connected; battShow(); }
  R.reconnects = m.reconnects || 0; vPill();
}
function vConnect() {
  let ws; try { ws = new WebSocket(wsUrlOf()); } catch (e) { setPill("error", `Remote view: ${e.message}`); return; }
  ws.binaryType = "arraybuffer"; VW.ws = ws; vPill();
  ws.onopen = () => ws.send(JSON.stringify({ t: "auth", role: "view", room: viewRoom, key: VW.key }));
  ws.onmessage = e => {
    if (typeof e.data !== "string") { const u = new Uint8Array(e.data); if (u[0] === 1 && u.length > 9) vFrame(new DataView(e.data).getFloat64(1, true), u.slice(9)); return; }
    let m; try { m = JSON.parse(e.data); } catch { return; }
    if (m.t === "ev") vEvent(m.ev);
    else if (m.t === "hello") { VW.retry = 0; VW.replaying = true; VW.frames = 0; mem.frames.length = 0; mem.events.length = 0; vPill(); }
    else if (m.t === "hist-end") { VW.replaying = false; restore().then(vPill); }
    else if (m.t === "reset") { mem.frames.length = 0; mem.events.length = 0; if (!VW.replaying) restore(); toast("The broadcaster started a new session"); }
    else if (m.t === "status") vStatus(m);
    else if (m.t === "pub") { VW.pubOnline = !!m.online; if (!m.online) R.connectedSince = null; vPill(); }
    else if (m.t === "viewers") { VW.viewers = m.n; vPill(); }
  };
  ws.onclose = e => {
    if (VW.ws !== ws) return; VW.ws = null; VW.replaying = false; R.connectedSince = null;
    if (e.code === 4001) {
      const k = prompt("This live view needs a view key:");
      if (k == null) { setPill("error", "Remote view · view key needed"); return; }
      VW.key = k; try { localStorage.setItem("peek1_viewkey", k); } catch { /* optional */ }
      VW.retry = 0; vConnect(); return;
    }
    vPill(); setTimeout(vConnect, Math.min(15000, 1000 * 2 ** VW.retry++));
  };
}

// ---------- card in the Setup tab + LIVE pill in the header ----------
const live = document.createElement("div"); live.className = "pill fx-live"; live.id = "livePill"; live.hidden = true;
live.innerHTML = "<i></i><span></span>"; $("battPill").after(live);
const card = document.createElement("section"); card.className = "card o-relay"; card.id = "relayCard";
card.innerHTML = VIEW ? `
  <h2>Remote view <span class="act muted" id="rlState"></span></h2>
  <p class="rm-note">You are watching room <b>${esc(viewRoom)}</b> live. The capsule is connected to the broadcasting PC; this screen is read-only and works on any browser or phone.</p>
  <div class="rm-note mono" id="rlInfo"></div>
  <div class="la-actions"><button id="rlRe">Reconnect</button><button id="rlCopy">Copy this link</button></div>` : `
  <h2>Live broadcast <span class="act muted" id="rlState"></span></h2>
  <p class="rm-note">Share this capsule's data with anyone, anywhere. This PC reads BLE and pushes every frame to your server; viewers open the link and see this same screen in real time, no Bluetooth needed.</p>
  <div class="form">
    <label for="rlServer">Server<small>Where server.js runs. Keep as is when this page is served by it.</small></label>
    <input id="rlServer" type="url" placeholder="https://monitor.example.com" spellcheck="false">
    <label for="rlRoom">Room<small>Viewers join this name.</small></label>
    <input id="rlRoom" placeholder="lab1" spellcheck="false">
    <label for="rlKey">Publish key<small>Same as PUBLISH_KEY on the server.</small></label>
    <input id="rlKey" type="password" autocomplete="off">
  </div>
  <div class="la-actions"><button id="rlGo" class="primary">Start broadcast</button><button id="rlCopy">Copy viewer link</button><button id="rlReset">New session for viewers</button></div>
  <div class="rm-note mono" id="rlInfo" style="margin-top:8px"></div>`;
document.querySelector(".o-sim").before(card);
CR_TABS.setup.unshift(".o-relay");

function ui() {
  const st = $("rlState"), info = $("rlInfo"); if (!st) return;
  if (VIEW) {
    const on = VW.ws && !VW.replaying;
    live.hidden = !on; live.querySelector("span").textContent = `${VW.pubOnline ? "LIVE" : "WAITING"} · ${viewRoom}`;
    st.textContent = !VW.ws ? "reconnecting" : VW.replaying ? "loading" : VW.pubOnline ? "live" : "broadcaster offline";
    info.textContent = `Server ${location.host} · ${VW.frames.toLocaleString()} frames received · ${Math.max(1, VW.viewers)} watching`;
    return;
  }
  const go = $("rlGo"); go.textContent = PUB.on ? "Stop broadcast" : "Start broadcast"; go.className = PUB.on ? "danger" : "primary";
  for (const id of ["rlServer", "rlRoom", "rlKey"]) $(id).disabled = PUB.on;
  $("rlReset").disabled = !PUB.open;
  live.hidden = !PUB.on; live.querySelector("span").textContent = PUB.open ? `LIVE · ${PUB.viewers} watching` : "LIVE · connecting…";
  st.textContent = !PUB.on ? "" : PUB.open ? `● live · ${PUB.viewers} watching` : "connecting";
  info.innerHTML = (PUB.on ? `${PUB.sent.toLocaleString()} messages · ${(PUB.bytes / MB).toFixed(1)} MB sent${PUB.q.length ? ` · ${PUB.q.length} queued` : ""}<br>` : "") +
    (PUB.err ? `<span style="color:var(--bad)">${esc(PUB.err)}</span><br>` : "") + `Viewer link: <span class="rl-link">${esc(viewLink())}</span>`;
}
async function copyLink() {
  const link = VIEW ? location.href : viewLink();
  try { await navigator.clipboard.writeText(link); toast("Link copied"); } catch { prompt("Copy this link:", link); }
}
$("rlCopy").addEventListener("click", copyLink);
if (VIEW) {
  document.body.classList.add("peek-viewer");
  const origRestore = restore;
  window.restore = function () { db = null; return origRestore(); };   // viewer keeps the remote session in memory only
  window.showSupportBanner = () => {};                                  // viewers do not need Bluetooth
  $("rlRe").addEventListener("click", () => { const w = VW.ws; VW.ws = null; if (w) w.close(); VW.retry = 0; vConnect(); });
  setBanner("viewer", "info", `Remote view of room "${viewRoom}". Data streams live from the broadcasting PC.`);
  vConnect(); every(2000, ui);
} else {
  $("rlServer").value = RS.server; $("rlRoom").value = RS.room; $("rlKey").value = RS.key;
  const sync = () => { RS.server = $("rlServer").value.trim().replace(/\/+$/, ""); RS.room = $("rlRoom").value.trim().replace(/[^\w.-]/g, "").slice(0, 64); RS.key = $("rlKey").value; $("rlRoom").value = RS.room; saveRS(); ui(); };
  for (const id of ["rlServer", "rlRoom", "rlKey"]) $(id).addEventListener("change", sync);
  $("rlGo").addEventListener("click", () => { sync(); PUB.on ? PUB.stop() : PUB.start(); });
  $("rlReset").addEventListener("click", () => {
    if (!confirm("Start a new session for viewers? Their history from this room is cleared; your local data stays.")) return;
    PUB.send({ t: "reset" }); toast("Viewers start fresh from now");
  });
  every(500, () => { if (PUB.on) PUB.flush(); });
  every(2000, () => { if (PUB.on) { PUB.status(); ui(); } });
  if (RS.on && RS.key) PUB.start();
}
crSelect(SET.crTab || "trends"); moveInd(true); ui();
})();
