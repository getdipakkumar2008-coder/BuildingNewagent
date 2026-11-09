import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/server/db/client";
import { isDevLoginEnabled } from "@/server/auth/dev-login";
import { SESSION_COOKIE_NAME, sessionCookieOptions } from "@/server/auth/cookies";

// POST only (no CSRF-able GET). Disabled unless DEV_LOGIN=1 outside production.
export async function POST(request: Request) {
  if (!isDevLoginEnabled()) return new NextResponse(null, { status: 404 });

  // Same-origin check: this endpoint changes session state.
  const origin = request.headers.get("origin");
  if (origin) {
    // "null" (opaque origin) or any unparsable value is cross-origin by definition.
    let sameOrigin = false;
    try {
      sameOrigin = new URL(origin).host === new URL(request.url).host;
    } catch {
      sameOrigin = false;
    }
    if (!sameOrigin) return new NextResponse(null, { status: 403 });
  }

  // Optional per-test identity (form field), restricted to the reserved .test domain.
  let email = "dev@example.test";
  const form = await request.formData().catch(() => null);
  const requested = form?.get("email");
  if (typeof requested === "string" && /^[a-z0-9._-]{1,64}@example\.test$/i.test(requested)) {
    email = requested.toLowerCase();
  }

  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name: "Dev User" },
  });
  const sessionToken = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 1000 * 60 * 60 * 24);
  await prisma.session.create({ data: { sessionToken, userId: user.id, expires } });

  const res = NextResponse.redirect(new URL("/new", request.url), 303);
  res.cookies.set(SESSION_COOKIE_NAME, sessionToken, { ...sessionCookieOptions, expires });
  return res;
}
