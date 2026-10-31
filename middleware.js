// Family PIN gate (Vercel Routing Middleware). Logic lives in pin-gate/gate.mjs.
import { handle } from "./pin-gate/gate.mjs";

export const config = { runtime: "edge" };

export default async function middleware(request) {
  const res = await handle(request, {
    FAMILY_PIN: process.env.FAMILY_PIN,
    PIN_COOKIE_SECRET: process.env.PIN_COOKIE_SECRET,
  });
  return res ?? undefined; // undefined = continue to the site
}
