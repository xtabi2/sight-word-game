// Family PIN gate: shared logic for Vercel Routing Middleware.
// Web Crypto only, so it runs in the Edge runtime and in Node 22 tests.

export const PIN_PATH = "/__pin";
export const VERIFY_PATH = "/__pin/verify";
export const AUTH_COOKIE = "fam_pin";
export const RL_COOKIE = "fam_pin_rl";
export const AUTH_MAX_AGE = 60 * 60 * 24 * 365; // ~1 year
export const MAX_FAILS = 5;
export const LOCK_SECONDS = 5 * 60;
export const WRONG_DELAY_MS = 1000;

const enc = new TextEncoder();

function b64url(buf) {
  let s = "";
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(key, data) {
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", k, enc.encode(data)));
}

/** Constant-time string compare: hash both sides to equal length, then XOR every byte. */
export async function safeEqual(a, b) {
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(String(a))),
    crypto.subtle.digest("SHA-256", enc.encode(String(b))),
  ]);
  const x = new Uint8Array(ha), y = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

// The signing key mixes in the PIN, so changing either FAMILY_PIN or
// PIN_COOKIE_SECRET logs every device out.
const authKey = (secret, pin) => `auth:${secret}:${pin}`;
const rlKey = (secret) => `rl:${secret}`;

export async function signAuth(secret, pin, now = Date.now()) {
  const payload = `v1.${Math.floor(now / 1000)}`;
  return `${payload}.${await hmac(authKey(secret, pin), payload)}`;
}

export async function verifyAuth(value, secret, pin, now = Date.now()) {
  if (!value || !secret || !pin) return false;
  const parts = String(value).split(".");
  if (parts.length !== 3 || parts[0] !== "v1" || !/^\d+$/.test(parts[1])) return false;
  const issued = Number(parts[1]);
  const age = Math.floor(now / 1000) - issued;
  if (age < -300 || age > AUTH_MAX_AGE + 86400) return false;
  const expect = await hmac(authKey(secret, pin), `v1.${parts[1]}`);
  return safeEqual(expect, parts[2]);
}

/** Rate-limit state cookie: fails.lockUntil(sec).sig */
export async function signRate(secret, fails, lockUntil) {
  const payload = `${fails}.${lockUntil}`;
  return `${payload}.${await hmac(rlKey(secret), payload)}`;
}

export async function readRate(value, secret) {
  const none = { fails: 0, lockUntil: 0 };
  if (!value || !secret) return none;
  const parts = String(value).split(".");
  if (parts.length !== 3 || !/^\d+$/.test(parts[0]) || !/^\d+$/.test(parts[1])) return none;
  const ok = await safeEqual(await hmac(rlKey(secret), `${parts[0]}.${parts[1]}`), parts[2]);
  return ok ? { fails: Number(parts[0]), lockUntil: Number(parts[1]) } : none;
}

export function getCookie(header, name) {
  if (!header) return null;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > -1 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

/** Only same-site absolute paths; anything else falls back to "/". */
export function safeNext(next) {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  if (next.startsWith(PIN_PATH)) return "/";
  return next;
}

const STATIC_RE = /\.(?:js|mjs|css|map|png|jpe?g|gif|svg|webp|avif|ico|woff2?|ttf|otf|mp3|wav|ogg|m4a|mp4|webm|json|txt|xml|webmanifest)$/i;

/** Paths that never need the PIN: the PIN page, its verify endpoint, static assets. */
export function isExempt(pathname) {
  if (pathname === PIN_PATH || pathname === VERIFY_PATH) return true;
  if (pathname.includes("/_next/static/") || pathname.includes("/_next/image")) return true;
  return STATIC_RE.test(pathname);
}

const cookieAttrs = (maxAge) => `Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;

// Best-effort per-instance IP counter (free tier: no KV). The signed cookie is the main counter.
const ipFails = new Map();
function ipState(ip, now) {
  const s = ipFails.get(ip);
  if (!s || s.resetAt < now) return { fails: 0, lockUntil: 0, resetAt: now + LOCK_SECONDS * 1000 };
  return s;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function redirect(location, extraHeaders = []) {
  const h = new Headers({ Location: location, "Cache-Control": "no-store" });
  for (const c of extraHeaders) h.append("Set-Cookie", c);
  return new Response(null, { status: 303, headers: h });
}

/**
 * Main entry. Returns a Response to short-circuit, or null to let the request through.
 * env: { FAMILY_PIN, PIN_COOKIE_SECRET }. opts.delayMs lets tests skip the wait.
 */
export async function handle(request, env, opts = {}) {
  const url = new URL(request.url);
  const path = url.pathname;
  const pin = env.FAMILY_PIN, secret = env.PIN_COOKIE_SECRET;
  const cookies = request.headers.get("cookie");
  const now = opts.now ?? Date.now();
  const delayMs = opts.delayMs ?? WRONG_DELAY_MS;

  if (path === VERIFY_PATH) {
    if (request.method !== "POST") return redirect(PIN_PATH);
    if (!pin || !secret) return new Response("PIN gate not configured", { status: 503 });
    let form;
    try { form = await request.formData(); } catch { form = new FormData(); }
    const next = safeNext(String(form.get("next") ?? "/"));
    const tryPin = String(form.get("pin") ?? "").slice(0, 32);
    const nowSec = Math.floor(now / 1000);
    const ip = (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
    const rate = await readRate(getCookie(cookies, RL_COOKIE), secret);
    const ipS = ipState(ip, now);
    const lockUntil = Math.max(rate.lockUntil, ipS.lockUntil);
    const back = (e) => `${PIN_PATH}?e=${e}&next=${encodeURIComponent(next)}`;
    if (lockUntil > nowSec) {
      await sleep(delayMs);
      return redirect(back("lock"));
    }
    if (await safeEqual(tryPin, pin)) {
      ipFails.delete(ip);
      return redirect(next, [
        `${AUTH_COOKIE}=${await signAuth(secret, pin, now)}; ${cookieAttrs(AUTH_MAX_AGE)}`,
        `${RL_COOKIE}=; ${cookieAttrs(0)}`,
      ]);
    }
    const fails = Math.max(rate.lockUntil && rate.lockUntil <= nowSec ? 0 : rate.fails, ipS.fails) + 1;
    const newLock = fails >= MAX_FAILS ? nowSec + LOCK_SECONDS : 0;
    ipFails.set(ip, { fails: newLock ? 0 : fails, lockUntil: newLock, resetAt: ipS.resetAt });
    if (ipFails.size > 5000) ipFails.clear();
    await sleep(delayMs);
    return redirect(back(newLock ? "lock" : "bad"), [
      `${RL_COOKIE}=${await signRate(secret, newLock ? 0 : fails, newLock)}; ${cookieAttrs(LOCK_SECONDS * 2)}`,
    ]);
  }

  if (path === PIN_PATH) {
    const e = url.searchParams.get("e");
    return new Response(pinPage(safeNext(url.searchParams.get("next") ?? "/"), e), {
      status: e === "lock" ? 429 : 200,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
    });
  }

  if (isExempt(path)) return null;
  if (await verifyAuth(getCookie(cookies, AUTH_COOKIE), secret, pin, now)) return null;

  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("PIN required", { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  return new Response(null, {
    status: 302,
    headers: { Location: `${PIN_PATH}?next=${encodeURIComponent(path + url.search)}`, "Cache-Control": "no-store" },
  });
}

const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export function pinPage(next, e) {
  const face = e === "lock" ? "⏳" : e === "bad" ? "🙈" : "🔒";
  const keys = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button type="button" class="k" data-d="${n}">${n}</button>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<meta name="robots" content="noindex"><title>🔒</title>
<style>
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html,body{margin:0;height:100%}
body{font-family:system-ui,-apple-system,sans-serif;background:linear-gradient(160deg,#7dd3fc,#c4b5fd);display:flex;align-items:center;justify-content:center;min-height:100dvh}
main{width:min(92vw,380px);text-align:center}
.face{font-size:72px;line-height:1;margin:0 0 12px}
.dots{display:flex;justify-content:center;gap:14px;min-height:28px;margin-bottom:20px}
.dots span{width:24px;height:24px;border-radius:50%;background:#fff;box-shadow:0 2px 6px #0002}
.bad .dots{animation:shake .4s}
@keyframes shake{0%,100%{transform:none}25%{transform:translateX(-12px)}75%{transform:translateX(12px)}}
.pad{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
button{font:inherit;border:0;border-radius:24px;aspect-ratio:1;font-size:40px;font-weight:800;color:#1e293b;background:#fff;box-shadow:0 5px 0 #0002;touch-action:manipulation}
button:active{transform:translateY(4px);box-shadow:0 1px 0 #0002}
.del{background:#fde68a}.go{background:#86efac}
button:disabled{opacity:.4}
</style></head>
<body class="${e === "bad" ? "bad" : ""}"><main>
<p class="face" aria-hidden="true">${face}</p>
<div class="dots" id="dots" aria-live="polite"></div>
<form method="post" action="${VERIFY_PATH}" id="f">
<input type="hidden" name="pin" id="pin"><input type="hidden" name="next" value="${esc(next)}">
<div class="pad">${keys}
<button type="button" class="del" id="del" aria-label="Delete">⌫</button>
<button type="button" class="k" data-d="0">0</button>
<button type="submit" class="go" id="go" aria-label="Go"${e === "lock" ? " disabled" : ""}>✅</button>
</div></form></main>
<script>
(function(){var v="",p=document.getElementById("pin"),d=document.getElementById("dots"),locked=${e === "lock"};
function draw(){d.innerHTML="";for(var i=0;i<v.length;i++)d.appendChild(document.createElement("span"));p.value=v}
document.querySelectorAll(".k").forEach(function(b){b.disabled=locked;b.onclick=function(){if(v.length<12){v+=b.dataset.d;draw()}}});
document.getElementById("del").onclick=function(){v=v.slice(0,-1);draw()};
document.getElementById("f").onsubmit=function(){if(!v)return false;document.getElementById("go").disabled=true};
if(locked)setTimeout(function(){location.replace(location.pathname+"?next="+encodeURIComponent(${JSON.stringify(next)}))},${LOCK_SECONDS}*1000);
})();
</script></body></html>`;
}
