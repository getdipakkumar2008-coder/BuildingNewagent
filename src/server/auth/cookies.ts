// Single source of truth for the session cookie, shared by Auth.js config and dev login.
export const isProd = process.env.NODE_ENV === "production";

// The __Host- prefix requires Secure + Path=/ + no Domain, so it only works over HTTPS.
export const SESSION_COOKIE_NAME = isProd ? "__Host-authjs.session-token" : "authjs.session-token";

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  secure: isProd,
};
