import { NextResponse, type NextRequest } from "next/server";
import { buildCsp } from "@/lib/csp";

// Next 16 "proxy" (formerly middleware). Adds a nonce-based CSP to every page response.
export function proxy(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce, process.env.NODE_ENV !== "production");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      source:
        "/((?!_next/static|_next/image|favicon.ico|logo.svg|api/artifacts|api/attachments).*)",
    },
  ],
};
