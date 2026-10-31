import { test } from "node:test";
import assert from "node:assert/strict";
import * as g from "./gate.mjs";

const env = { FAMILY_PIN: "9876", PIN_COOKIE_SECRET: "test-secret" };
const req = (path, init = {}) => new Request("https://example.test" + path, init);
const post = (pin, next = "/", cookie = "", ip = "1.1.1." + Math.random()) =>
  req(g.VERIFY_PATH, { method: "POST", body: new URLSearchParams({ pin, next }),
    headers: { "content-type": "application/x-www-form-urlencoded", cookie, "x-forwarded-for": ip } });
const setCookies = (r) => r.headers.getSetCookie();

test("signAuth / verifyAuth round trip", async () => {
  const c = await g.signAuth("s", "1234");
  assert.equal(await g.verifyAuth(c, "s", "1234"), true);
});

test("verifyAuth rejects tampering, wrong secret, changed PIN, expiry, junk", async () => {
  const now = Date.now();
  const c = await g.signAuth("s", "1234", now);
  const [v, ts, sig] = c.split(".");
  assert.equal(await g.verifyAuth(`${v}.${Number(ts) + 1}.${sig}`, "s", "1234", now), false);
  assert.equal(await g.verifyAuth(c.slice(0, -2) + "xx", "s", "1234", now), false);
  assert.equal(await g.verifyAuth(c, "other", "1234", now), false);
  assert.equal(await g.verifyAuth(c, "s", "0000", now), false);
  assert.equal(await g.verifyAuth(c, "s", "1234", now + (g.AUTH_MAX_AGE + 2 * 86400) * 1000), false);
  for (const bad of ["", null, "a.b", "v1.x.y", "v2.1.abc"]) assert.equal(await g.verifyAuth(bad, "s", "1234"), false);
  assert.equal(await g.verifyAuth(c, "", "1234", now), false);
});

test("rate cookie is signed", async () => {
  const c = await g.signRate("s", 3, 0);
  assert.deepEqual(await g.readRate(c, "s"), { fails: 3, lockUntil: 0 });
  assert.deepEqual(await g.readRate(c.replace(/^3/, "0"), "s"), { fails: 0, lockUntil: 0 });
});

test("safeEqual", async () => {
  assert.equal(await g.safeEqual("abc", "abc"), true);
  assert.equal(await g.safeEqual("abc", "abd"), false);
  assert.equal(await g.safeEqual("abc", "abcd"), false);
});

test("safeNext blocks open redirects", () => {
  assert.equal(g.safeNext("/math?x=1"), "/math?x=1");
  for (const b of ["//evil.com", "https://evil.com", "/\\evil.com", "evil", "/__pin"]) assert.equal(g.safeNext(b), "/");
});

test("exempt paths", () => {
  for (const p of ["/__pin", "/__pin/verify", "/assets/a.js", "/math/assets/x.css", "/adventure/_next/static/c.js", "/favicon.ico"])
    assert.equal(g.isExempt(p), true, p);
  for (const p of ["/", "/math", "/reading/", "/adventure", "/adventure/login", "/adventure/reset-password"])
    assert.equal(g.isExempt(p), false, p);
});

test("unauthenticated GET redirects to PIN page keeping path and query", async () => {
  const r = await g.handle(req("/adventure/reset-password?token=abc"), env);
  assert.equal(r.status, 302);
  assert.equal(r.headers.get("location"), "/__pin?next=" + encodeURIComponent("/adventure/reset-password?token=abc"));
  assert.equal((await g.handle(req("/assets/x.js"), env)), null);
  assert.equal((await g.handle(req("/adventure/login", { method: "POST" }), env)).status, 401);
});

test("PIN page renders", async () => {
  const r = await g.handle(req("/__pin?next=/math"), env);
  assert.equal(r.status, 200);
  const html = await r.text();
  assert.match(html, /action="\/__pin\/verify"/);
  assert.ok(!html.includes(env.FAMILY_PIN));
});

test("correct PIN sets signed cookie and redirects to next", async () => {
  const r = await g.handle(post("9876", "/reading"), env, { delayMs: 0 });
  assert.equal(r.status, 303);
  assert.equal(r.headers.get("location"), "/reading");
  const c = setCookies(r).find((s) => s.startsWith("fam_pin="));
  assert.match(c, /HttpOnly/); assert.match(c, /Secure/); assert.match(c, /SameSite=Lax/); assert.match(c, /Max-Age=31536000/);
  const value = c.split(";")[0].slice("fam_pin=".length);
  assert.equal(await g.handle(req("/adventure", { headers: { cookie: "fam_pin=" + value } }), env), null);
});

test("wrong PIN is delayed and locks after 5 failures", async () => {
  const t0 = Date.now();
  let r = await g.handle(post("0000"), env, { delayMs: 200 });
  assert.ok(Date.now() - t0 >= 190);
  assert.match(r.headers.get("location"), /e=bad/);
  let cookie = "";
  for (let i = 0; i < 5; i++) {
    r = await g.handle(post("0000", "/", cookie, "9.9.9.9"), env, { delayMs: 0 });
    cookie = setCookies(r).find((s) => s.startsWith("fam_pin_rl="))?.split(";")[0] ?? cookie;
  }
  assert.match(r.headers.get("location"), /e=lock/);
  // Even the right PIN is refused while locked (cookie or IP).
  r = await g.handle(post("9876", "/", cookie, "8.8.8.8"), env, { delayMs: 0 });
  assert.match(r.headers.get("location"), /e=lock/);
  r = await g.handle(post("9876", "/", "", "9.9.9.9"), env, { delayMs: 0 });
  assert.match(r.headers.get("location"), /e=lock/);
});

test("missing config fails closed", async () => {
  const r = await g.handle(req("/"), {});
  assert.equal(r.status, 302);
});
