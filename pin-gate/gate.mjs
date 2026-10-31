// Family PIN gate for Vercel Routing Middleware. Same pattern as the
// Reading Progress Game gate (xtabi2/reading-progress-game#34) so every site
// works the same way. Web Crypto only: runs in the Edge runtime and Node 22.
//
// Cookie `family_pin` = "v1.<issuedAtSec>.<hmac>". The HMAC key is derived
// from PIN_COOKIE_SECRET (or FAMILY_PIN_SECRET) plus FAMILY_PIN, so changing
// the PIN signs every device out.

export const FAMILY_PIN_COOKIE = "family_pin";
export const FAIL_COOKIE = "family_pin_tries";
export const FAMILY_PIN_MAX_AGE = 60 * 60 * 24 * 365;
export const PIN_PATH = "/pin";
export const PIN_API_PATH = "/api/pin";
export const FREE_TRIES = 3;
export const LOCKOUT_AFTER = 10;
export const LOCKOUT_MS = 15 * 60 * 1000;
export const MAX_DELAY_MS = 30 * 1000;

const enc = new TextEncoder();

function b64url(bytes) {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(key, data) {
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", k, enc.encode(data));
}

/** Constant-time equality (length difference folded into the result). */
export function constantTimeEqual(a, b) {
  const x = typeof a === "string" ? enc.encode(a) : a;
  const y = typeof b === "string" ? enc.encode(b) : b;
  let diff = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export function pinEnv(env = {}) {
  return { pin: env.FAMILY_PIN || undefined, secret: env.PIN_COOKIE_SECRET || env.FAMILY_PIN_SECRET || undefined };
}
/** Gate is off when FAMILY_PIN (or its signing secret) is unset. */
export function pinGateEnabled(e) {
  return Boolean(e.pin && e.secret);
}

async function cookieKey(e) {
  return b64url(await hmac(e.secret, `family-pin-key:${e.pin}`));
}

/** Compare a submitted PIN with the real one via HMAC digests (constant-time, length-hiding). */
export async function checkPin(submitted, e) {
  if (!pinGateEnabled(e) || typeof submitted !== "string") return false;
  const [a, b] = await Promise.all([hmac(e.secret, `pin:${submitted}`), hmac(e.secret, `pin:${e.pin}`)]);
  return constantTimeEqual(new Uint8Array(a), new Uint8Array(b));
}

export async function signPinCookie(e, nowSec = Math.floor(Date.now() / 1000)) {
  const body = `v1.${nowSec}`;
  return `${body}.${b64url(await hmac(await cookieKey(e), body))}`;
}

export async function verifyPinCookie(value, e, nowSec = Math.floor(Date.now() / 1000)) {
  if (!value || !pinGateEnabled(e)) return false;
  const parts = String(value).split(".");
  if (parts.length !== 3 || parts[0] !== "v1" || !/^\d+$/.test(parts[1])) return false;
  const issued = Number(parts[1]);
  if (issued > nowSec + 300 || nowSec - issued > FAMILY_PIN_MAX_AGE) return false;
  const expected = b64url(await hmac(await cookieKey(e), `v1.${parts[1]}`));
  return constantTimeEqual(expected, parts[2]);
}

/** Only same-site relative paths; never back to the PIN page itself. */
export function safeNextPath(next) {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  if (next === PIN_PATH || next.startsWith(`${PIN_PATH}?`) || next.startsWith(`${PIN_PATH}/`)) return "/";
  return next;
}

/** Paths reachable without the PIN cookie: /pin, /api/pin, _next, favicon, static files. */
export function isPinExempt(pathname) {
  if (pathname === PIN_PATH || pathname === PIN_API_PATH) return true;
  if (pathname.startsWith("/_next/") || pathname.includes("/_next/static/") || pathname.includes("/_next/image")) return true;
  if (pathname === "/favicon.ico" || pathname === "/robots.txt" || pathname === "/manifest.webmanifest") return true;
  return /\.(?:png|jpe?g|gif|svg|webp|avif|ico|txt|woff2?|ttf|otf|css|js|mjs|map|json|webmanifest|mp3|wav|ogg|m4a|mp4|webm)$/i.test(pathname);
}

/* ---------- Wrong-PIN throttle: 3 free, then 1s, 2s, 4s... up to 30s; 15 min lockout after 10 ---------- */
export function retryAfterMs(s, now) {
  if (!s || s.failures < FREE_TRIES) return 0;
  const wait = s.failures >= LOCKOUT_AFTER ? LOCKOUT_MS : Math.min(1000 * 2 ** (s.failures - FREE_TRIES), MAX_DELAY_MS);
  return Math.max(0, s.lastFailAt + wait - now);
}

export function recordFailure(s, now) {
  if (s && now - s.lastFailAt > LOCKOUT_MS) s = undefined; // reset after a quiet lockout window
  return { failures: (s?.failures ?? 0) + 1, lastFailAt: now };
}

/** Best-effort in-memory store per IP (instances may not share it; the signed cookie backs it up). */
export class PinThrottle {
  constructor(max = 5000) { this.map = new Map(); this.max = max; }
  get(key) { return this.map.get(key); }
  fail(key, now) {
    const next = recordFailure(this.map.get(key), now);
    if (this.map.size >= this.max && !this.map.has(key)) this.map.delete(this.map.keys().next().value);
    this.map.set(key, next);
    return next;
  }
  clear(key) { this.map.delete(key); }
}

async function signFail(e, s) {
  const body = `${s.failures}:${s.lastFailAt}`;
  return `${body}.${b64url(await hmac(e.secret, `tries:${body}`))}`;
}
async function readFail(value, e) {
  const m = /^(\d+):(\d+)\.([\w-]+)$/.exec(value ?? "");
  if (!m) return undefined;
  const expected = b64url(await hmac(e.secret, `tries:${m[1]}:${m[2]}`));
  return constantTimeEqual(expected, m[3]) ? { failures: Number(m[1]), lastFailAt: Number(m[2]) } : undefined;
}

export function getCookie(header, name) {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > -1 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return undefined;
}

/** Middleware decision, kept pure for tests. */
export async function pinGateDecision(pathname, search, cookie, e) {
  if (!pinGateEnabled(e) || isPinExempt(pathname)) return { action: "next" };
  if (await verifyPinCookie(cookie, e)) return { action: "next" };
  return { action: "redirect", to: `${PIN_PATH}?next=${encodeURIComponent(pathname + search)}` };
}

const throttle = new PinThrottle();
const attrs = (maxAge) => `Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;

function json(body, status, cookies = [], extra = {}) {
  const h = new Headers({ "Content-Type": "application/json", "Cache-Control": "no-store", ...extra });
  for (const c of cookies) h.append("Set-Cookie", c);
  return new Response(JSON.stringify(body), { status, headers: h });
}

/** POST /api/pin {pin, next} -> {ok, next} | {error, retryAfterMs} */
export async function handlePinApi(request, e, now = Date.now()) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405, [], { Allow: "POST" });
  if (!pinGateEnabled(e)) return json({ ok: true, next: "/" }, 200);
  let body = {};
  try { body = await request.json(); } catch {}
  const next = safeNextPath(typeof body?.next === "string" ? body.next : "/");
  const cookies = request.headers.get("cookie");
  const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || request.headers.get("x-real-ip") || "unknown";
  const key = `ip:${ip}`;
  const cookieState = await readFail(getCookie(cookies, FAIL_COOKIE), e);
  const wait = Math.max(retryAfterMs(throttle.get(key), now), retryAfterMs(cookieState, now));
  if (wait > 0) {
    return json({ ok: false, error: "Too many tries. Please wait.", retryAfterMs: wait }, 429, [], { "Retry-After": String(Math.ceil(wait / 1000)) });
  }
  const pin = typeof body?.pin === "string" ? body.pin.slice(0, 12) : "";
  if (await checkPin(pin, e)) {
    throttle.clear(key);
    return json({ ok: true, next }, 200, [
      `${FAMILY_PIN_COOKIE}=${await signPinCookie(e, Math.floor(now / 1000))}; ${attrs(FAMILY_PIN_MAX_AGE)}`,
      `${FAIL_COOKIE}=; ${attrs(0)}`,
    ]);
  }
  const ipState = throttle.fail(key, now);
  const fromCookie = recordFailure(cookieState, now);
  const state = { failures: Math.max(ipState.failures, fromCookie.failures), lastFailAt: now };
  return json({ ok: false, error: "That PIN didn't work.", retryAfterMs: retryAfterMs(state, now) }, 401, [
    `${FAIL_COOKIE}=${await signFail(e, state)}; ${attrs(60 * 60)}`,
  ]);
}

/** Entry for middleware: a Response to short-circuit, or null to continue. */
export async function handle(request, rawEnv) {
  const e = pinEnv(rawEnv);
  const url = new URL(request.url);
  if (url.pathname === PIN_API_PATH) return handlePinApi(request, e);
  if (url.pathname === PIN_PATH) {
    if (!pinGateEnabled(e)) return null;
    return new Response(pinPage(safeNextPath(url.searchParams.get("next") ?? "/")), {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
    });
  }
  const d = await pinGateDecision(url.pathname, url.search, getCookie(request.headers.get("cookie"), FAMILY_PIN_COOKIE), e);
  if (d.action === "next") return null;
  return new Response(null, { status: 307, headers: { Location: new URL(d.to, url).toString(), "Cache-Control": "no-store" } });
}

export function pinPage(next) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((n) => `<button type="button" class="k" data-d="${n}">${n}</button>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex"><title>Family PIN</title>
<style>
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html,body{margin:0;height:100%}
body{font-family:system-ui,-apple-system,sans-serif;color:#FFF4E0;background:radial-gradient(circle at 20% 10%,#3a4a9a 0,#1F2A5C 60%);display:flex;align-items:center;justify-content:center;min-height:100dvh;padding:16px}
main{width:min(100%,380px);text-align:center}
.face{font-size:64px;line-height:1;margin:0 0 8px}
.dots{display:flex;justify-content:center;gap:14px;margin:12px 0}
.dot{width:22px;height:22px;border-radius:50%;border:3px solid #FFF4E0}
.dot.on{background:#FFC857;border-color:#FFC857}
.shake{animation:shake .4s}
@keyframes shake{0%,100%{transform:none}25%{transform:translateX(-10px)}75%{transform:translateX(10px)}}
.msg{min-height:40px;font-size:30px;margin:0}
.pad{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
button{font:inherit;border:0;border-radius:22px;min-height:84px;font-size:38px;font-weight:900;color:#1F2A5C;background:#FFF4E0;box-shadow:0 5px 0 #c9b9a0;touch-action:manipulation;cursor:pointer}
button:active:not(:disabled){transform:translateY(3px);box-shadow:0 2px 0 #c9b9a0}
button:disabled{opacity:.45}
.del{background:#4FB3BF;color:#fff;box-shadow:0 5px 0 #2f8791}
.go{background:#F28C6B;color:#fff;box-shadow:0 5px 0 #c4664a}
@media (prefers-reduced-motion:reduce){.shake{animation:none}}
</style></head><body><main>
<p class="face" id="face" aria-hidden="true">🔒</p>
<div class="dots" id="dots" role="status"></div>
<p class="msg" id="msg" aria-live="polite"></p>
<div class="pad">${keys}
<button type="button" class="del" id="del" aria-label="Backspace">⌫</button>
<button type="button" class="k" data-d="0">0</button>
<button type="button" class="go" id="go" aria-label="Enter">✓</button>
</div></main>
<script>
(function(){
var NEXT=${JSON.stringify(next).replace(/</g, "\\u003c")},DOTS=4,MAX=8,v="",busy=false,until=0,t=null;
var dots=document.getElementById("dots"),msg=document.getElementById("msg"),face=document.getElementById("face");
var btns=[].slice.call(document.querySelectorAll("button"));
function draw(){dots.innerHTML="";dots.setAttribute("aria-label",v.length+" digits");for(var i=0;i<Math.max(DOTS,v.length);i++){var s=document.createElement("span");s.className="dot"+(i<v.length?" on":"");dots.appendChild(s)}}
function lock(){var left=Math.ceil((until-Date.now())/1000);var w=left>0;btns.forEach(function(b){if(b.id!=="del")b.disabled=w||busy});
 if(w){face.textContent="⏳";msg.textContent=left+"s";}else if(t){clearInterval(t);t=null;face.textContent="🔒";msg.textContent=""}}
function submit(){if(!v||busy||until>Date.now())return;busy=true;lock();
 fetch("/api/pin",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({pin:v,next:NEXT})})
 .then(function(r){return r.json().catch(function(){return{}})}).then(function(d){
  if(d.ok){face.textContent="🎉";location.assign(d.next||NEXT||"/");return}
  v="";draw();face.textContent="🙈";dots.classList.remove("shake");void dots.offsetWidth;dots.classList.add("shake");
  if(d.retryAfterMs){until=Date.now()+d.retryAfterMs;if(!t)t=setInterval(lock,250)}
 }).catch(function(){face.textContent="📶"}).then(function(){busy=false;lock()})}
function press(d){if(busy||until>Date.now())return;if(v.length<MAX){v+=d;draw();if(face.textContent!=="⏳")face.textContent="🔒"}if(v.length===DOTS)submit()}
[].forEach.call(document.querySelectorAll(".k"),function(b){b.onclick=function(){press(b.dataset.d)}});
document.getElementById("del").onclick=function(){v=v.slice(0,-1);draw()};
document.getElementById("go").onclick=submit;
addEventListener("keydown",function(e){if(/^[0-9]$/.test(e.key))press(e.key);else if(e.key==="Backspace"){v=v.slice(0,-1);draw()}else if(e.key==="Enter")submit()});
draw();})();
</script></body></html>`;
}
