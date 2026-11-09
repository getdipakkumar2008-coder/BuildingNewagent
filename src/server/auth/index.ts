import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/server/db/client";
import { SESSION_COOKIE_NAME, sessionCookieOptions } from "./cookies";

const providers = [];
if (process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET) {
  providers.push(GitHub);
}

export const githubEnabled = providers.length > 0;

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "database", maxAge: 60 * 60 * 24 * 14, updateAge: 60 * 60 * 24 },
  providers,
  pages: { signIn: "/signin" },
  callbacks: {
    session({ session, user }) {
      session.user.id = user.id;
      return session;
    },
  },
  cookies: { sessionToken: { name: SESSION_COOKIE_NAME, options: sessionCookieOptions } },
  // In production, only trust the host when the public URL is pinned via AUTH_URL.
  trustHost: process.env.NODE_ENV !== "production" || Boolean(process.env.AUTH_URL),
});
