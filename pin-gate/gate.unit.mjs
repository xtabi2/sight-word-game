import { test } from "node:test";
import assert from "node:assert/strict";
import * as g from "./gate.mjs";

const raw = { FAMILY_PIN: "0000test", PIN_COOKIE_SECRET: "s".repeat(32) };
const e = g.pinEnv(raw);
const req = (path, init = {}) => new Request("https://example.test" + path, init);
const api = (pin, next = "/", cookie = "", ip = "10.0.0." + Math.random()) =>
  req(g.PIN_API_PATH, { method: "POST", body: JSON.stringify({ pin, next }),
    headers: { "content-type": "application/json", cookie, "x-forwarded-for": ip } });

test("cookie sign/verify round trip", async () => {
  const c = await g.signPinCookie(e);
  assert.match(c, /^v1\.\d+\.[\w-]+$/);
  assert.equal(await g.verifyPinCookie(c, e), true);
});

test("cookie rejects tampering, other secret, changed PIN, expiry, junk", async () => {
  const now = 2_000_000_000;
  const c = await g.signPinCookie(e, now);
  const [v, ts, sig] = c.split(".");
  assert.equal(await g.verifyPinCookie(`${v}.${Number(ts) + 1}.${sig}`, e, now), false);
  assert.equal(await g.verifyPinCookie(c.slice(0, -2) + "xx", e, now), false);
  assert.equal(await g.verifyPinCookie(c, { ...e, secret: "other" }, now), false);
  assert.equal(await g.verifyPinCookie(c, { ...e, pin: "1111" }, now), false);
  assert.equal(await g.verifyPinCookie(c, e, now + g.FAMILY_PIN_MAX_AGE + 1), false);
  assert.equal(await g.verifyPinCookie(c, e, now - 3600), false);
  for (const bad of [undefined, "", "a.b", "v1.x.y", "v2.1.abc"]) assert.equal(await g.verifyPinCookie(bad, e, now), false);
});

test("FAMILY_PIN_SECRET works as fallback secret", () => {
  assert.equal(g.pinEnv({ FAMILY_PIN: "1", FAMILY_PIN_SECRET: "x" }).secret, "x");
});

test("constant-time compare and checkPin", async () => {
  assert.equal(g.constantTimeEqual("abc", "abc"), true);
  assert.equal(g.constantTimeEqual("abc", "abd"), false);
  assert.equal(g.constantTimeEqual("abc", "abcd"), false);
  assert.equal(await g.checkPin("0000test", e), true);
  assert.equal(await g.checkPin("0000", e), false);
});

test("safeNextPath blocks open redirects", () => {
  assert.equal(g.safeNextPath("/math?x=1"), "/math?x=1");
  for (const b of ["//evil.com", "https://evil.com", "/\\evil.com", "evil", "/pin", "/pin?next=/"]) assert.equal(g.safeNextPath(b), "/");
});

test("exempt paths", () => {
  for (const p of ["/pin", "/api/pin", "/_next/static/a.js", "/adventure/_next/static/c.js", "/favicon.ico", "/assets/a.js", "/math/assets/x.css"])
    assert.equal(g.isPinExempt(p), true, p);
  for (const p of ["/", "/math", "/reading/", "/adventure", "/adventure/login", "/adventure/pin", "/adventure/api/pin", "/pin/x"])
    assert.equal(g.isPinExempt(p), false, p);
});

test("backoff schedule: 3 free, 1s..30s, 15 min lockout after 10", () => {
  const at = (f) => g.retryAfterMs({ failures: f, lastFailAt: 0 }, 0);
  assert.deepEqual([1, 2, 3, 4, 5, 8, 9, 10].map(at), [0, 0, 1000, 2000, 4000, 30000, 30000, 15 * 60 * 1000]);
});

test("gate off when FAMILY_PIN unset", async () => {
  assert.equal(await g.handle(req("/math"), {}), null);
  assert.equal(await g.handle(req("/pin"), {}), null);
});

test("no cookie redirects to /pin with path + query", async () => {
  const r = await g.handle(req("/adventure/reset-password?token=abc"), raw);
  assert.equal(r.status, 307);
  assert.equal(r.headers.get("location"), "https://example.test/pin?next=" + encodeURIComponent("/adventure/reset-password?token=abc"));
  assert.equal(await g.handle(req("/assets/x.js"), raw), null);
});

test("PIN page renders without leaking the PIN", async () => {
  const r = await g.handle(req("/pin?next=/math"), raw);
  assert.equal(r.status, 200);
  const html = await r.text();
  assert.match(html, /\/api\/pin/);
  assert.ok(!html.includes(raw.FAMILY_PIN));
});

test("correct PIN: {ok,next} and signed cookie grants access", async () => {
  const r = await g.handle(api("0000test", "/reading"), raw);
  assert.deepEqual(await r.json(), { ok: true, next: "/reading" });
  const c = r.headers.getSetCookie().find((s) => s.startsWith("family_pin="));
  for (const a of [/HttpOnly/, /Secure/, /SameSite=Lax/, /Max-Age=31536000/, /Path=\//]) assert.match(c, a);
  const value = c.split(";")[0].slice("family_pin=".length);
  assert.equal(await g.handle(req("/adventure", { headers: { cookie: "family_pin=" + value } }), raw), null);
});

test("wrong PINs back off and lock out (IP and cookie)", async () => {
  const ip = "9.9.9.9";
  let r, cookie = "";
  for (let i = 0; i < 3; i++) {
    r = await g.handle(api("nope", "/", cookie, ip), raw);
    cookie = r.headers.getSetCookie().find((s) => s.startsWith("family_pin_tries="))?.split(";")[0] ?? cookie;
  }
  assert.equal(r.status, 401);
  assert.equal((await r.json()).retryAfterMs, 1000);
  r = await g.handle(api("0000test", "/", cookie, ip), raw); // even right PIN waits
  assert.equal(r.status, 429);
  assert.ok((await r.json()).retryAfterMs > 0);
  r = await g.handle(api("0000test", "/", cookie, "8.8.8.8"), raw); // cookie alone also throttles
  assert.equal(r.status, 429);
  const forged = "family_pin_tries=0:0.AAAA";
  r = await g.handle(api("0000test", "/", forged, "7.7.7.7"), raw); // forged cookie ignored, new IP ok
  assert.equal(r.status, 200);
});
