// PEEK1 Monitor relay server
// Serves the page from ./public and relays live data:  broadcaster PC (BLE) --wss--> server --wss--> viewers anywhere.
// Keeps recent history per room in memory, so a viewer who joins late sees the whole session so far.
//
//   PUBLISH_KEY=change-me  [VIEW_KEY=optional]  [PORT=8080]  [HISTORY_MB=200]  node server.js
"use strict";
const http = require("http"), fs = require("fs"), path = require("path"), crypto = require("crypto");
const { WebSocketServer } = require("ws");

const PORT = Number(process.env.PORT) || 8080;
const PUBLISH_KEY = process.env.PUBLISH_KEY || "";
const VIEW_KEY = process.env.VIEW_KEY || "";
const HISTORY_BYTES = (Number(process.env.HISTORY_MB) || 200) * 1024 * 1024;
const PUB_DIR = path.join(__dirname, "public");
const MB = 1024 * 1024;
if (!PUBLISH_KEY) { console.error("Set PUBLISH_KEY, e.g.  PUBLISH_KEY=$(openssl rand -hex 16) node server.js"); process.exit(1); }

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8" };

const server = http.createServer((req, res) => {
  let rel;
  try { rel = decodeURIComponent(new URL(req.url, "http://x").pathname); } catch { res.writeHead(400).end(); return; }
  if (rel === "/healthz") { res.writeHead(200, { "Content-Type": "text/plain" }).end("ok"); return; }
  if (rel.endsWith("/")) rel += "index.html";
  const file = path.resolve(PUB_DIR, "." + rel);
  if (!file.startsWith(PUB_DIR + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found"); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream",
      "Cache-Control": file.endsWith(".html") ? "no-cache" : "public, max-age=300", "X-Content-Type-Options": "nosniff" });
    res.end(data);
  });
});

const sha = s => crypto.createHash("sha256").update(String(s ?? "")).digest();
const keyOk = (given, want) => crypto.timingSafeEqual(sha(given), sha(want));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const rooms = new Map();
function room(name) {
  let r = rooms.get(name);
  if (!r) { r = { name, pub: null, viewers: new Set(), hist: [], base: 0, bytes: 0, status: null }; rooms.set(name, r); }
  return r;
}
const sendJ = (ws, o) => { if (ws.readyState === 1) ws.send(JSON.stringify(o)); };
function counts(r) { const m = { t: "viewers", n: r.viewers.size }; if (r.pub) sendJ(r.pub, m); for (const v of r.viewers) sendJ(v, m); }
function bcast(r, data, binary) {
  for (const v of r.viewers) {
    if (v.replaying || v.readyState !== 1) continue;
    if (v.bufferedAmount > 16 * MB) { v.terminate(); continue; }   // hopelessly slow viewer: it reconnects and reloads history
    v.send(data, { binary });
  }
}
function remember(r, data, binary) {
  r.hist.push({ data, binary }); r.bytes += data.length;
  while (r.bytes > HISTORY_BYTES && r.hist.length) { r.bytes -= r.hist.shift().data.length; r.base++; }
}
async function replay(ws, r) {                 // history first, paced by the socket, then live
  ws.replaying = true; let cur = r.base;
  while (ws.readyState === 1) {
    if (cur < r.base) cur = r.base;
    if (cur >= r.base + r.hist.length) break;
    if (ws.bufferedAmount > 4 * MB) { await sleep(25); continue; }
    const h = r.hist[cur - r.base]; ws.send(h.data, { binary: h.binary }); cur++;
  }
  if (ws.readyState !== 1) return;
  ws.replaying = false;
  sendJ(ws, { t: "hist-end" });
  if (r.status) ws.send(r.status, { binary: false });
  sendJ(ws, { t: "pub", online: !!r.pub });
}

const wss = new WebSocketServer({ server, path: "/ws", maxPayload: 4 * MB, perMessageDeflate: false });
wss.on("connection", ws => {
  ws.isAlive = true; ws.on("pong", () => { ws.isAlive = true; });
  let role = null, r = null;
  const authTimer = setTimeout(() => ws.close(4000, "auth timeout"), 5000);
  ws.on("message", (data, isBinary) => {
    if (!role) {
      let m; try { m = isBinary ? null : JSON.parse(data); } catch { m = null; }
      const name = m && String(m.room || "").replace(/[^\w.-]/g, "").slice(0, 64);
      if (!m || m.t !== "auth" || !name) { ws.close(4000, "bad auth"); return; }
      if (m.role === "pub") {
        if (!keyOk(m.key, PUBLISH_KEY)) { ws.close(4001, "bad key"); return; }
        clearTimeout(authTimer); role = "pub"; r = room(name);
        if (r.pub && r.pub !== ws) { sendJ(r.pub, { t: "replaced" }); r.pub.close(4002, "replaced"); }
        r.pub = ws; sendJ(ws, { t: "ok", room: name });
        for (const v of r.viewers) if (!v.replaying) sendJ(v, { t: "pub", online: true });
        counts(r); console.log(`[${name}] broadcaster connected`);
      } else if (m.role === "view") {
        if (VIEW_KEY && !keyOk(m.key, VIEW_KEY)) { ws.close(4001, "bad key"); return; }
        clearTimeout(authTimer); role = "view"; r = room(name); r.viewers.add(ws);
        sendJ(ws, { t: "hello", room: name, history: r.hist.length });
        counts(r); replay(ws, r);
      } else ws.close(4000, "bad role");
      return;
    }
    if (role !== "pub" || r.pub !== ws) return;                     // viewers are read-only
    if (isBinary) { remember(r, data, true); bcast(r, data, true); return; }
    let m; try { m = JSON.parse(data); } catch { return; }
    if (m.t === "status") { r.status = data; bcast(r, data, false); }
    else if (m.t === "ev") { remember(r, data, false); bcast(r, data, false); }
    else if (m.t === "reset") {
      r.base += r.hist.length; r.hist = []; r.bytes = 0;
      for (const v of r.viewers) sendJ(v, { t: "reset" });
      console.log(`[${r.name}] history reset by broadcaster`);
    }
  });
  ws.on("close", () => {
    clearTimeout(authTimer); if (!r) return;
    if (role === "pub" && r.pub === ws) { r.pub = null; for (const v of r.viewers) if (!v.replaying) sendJ(v, { t: "pub", online: false }); console.log(`[${r.name}] broadcaster left`); }
    if (role === "view") { r.viewers.delete(ws); counts(r); }
  });
  ws.on("error", () => {});
});
setInterval(() => { for (const ws of wss.clients) { if (!ws.isAlive) { ws.terminate(); continue; } ws.isAlive = false; ws.ping(); } }, 30000);

server.listen(PORT, () => console.log(`PEEK1 relay on http://localhost:${PORT}  (viewers: /?view=ROOM)`));
