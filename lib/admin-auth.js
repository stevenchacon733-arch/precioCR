import crypto from "crypto";

const COOKIE_NAME = "preciocr_admin";

function secret() {
  return process.env.ADMIN_PASSWORD || "";
}

function expectedToken() {
  const value = secret();
  if (!value) return null;

  return crypto
    .createHmac("sha256", value)
    .update("preciocr-admin-session-v1")
    .digest("hex");
}

function safeEqual(a = "", b = "") {
  const aa = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (aa.length !== bb.length) return false;
  return crypto.timingSafeEqual(aa, bb);
}

export function adminCookieName() {
  return COOKIE_NAME;
}

export function validateAdminPassword(password) {
  const configured = secret();
  if (!configured) return false;
  return safeEqual(password, configured);
}

export function createAdminToken() {
  return expectedToken();
}

export function isAdminRequest(request) {
  const expected = expectedToken();
  if (!expected) return false;

  const cookie = request.cookies.get(COOKIE_NAME)?.value || "";
  return safeEqual(cookie, expected);
}
