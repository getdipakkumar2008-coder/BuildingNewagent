import { redirect } from "next/navigation";
import Image from "next/image";
import { auth, signIn, githubEnabled } from "@/server/auth";
import { isDevLoginEnabled } from "@/server/auth/dev-login";

export const dynamic = "force-dynamic";

export default async function SignInPage() {
  if (await auth()) redirect("/new");
  const devLogin = isDevLoginEnabled();

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-6 p-6">
      <Image src="/logo.svg" alt="" width={56} height={56} priority />
      <h1 className="text-2xl font-semibold">Sign in to DeepResearchAI</h1>

      {githubEnabled && (
        <form
          className="w-full"
          action={async () => {
            "use server";
            await signIn("github", { redirectTo: "/new" });
          }}
        >
          <button className="w-full rounded-ui bg-brand px-4 py-2 font-medium text-brand-contrast">
            Continue with GitHub
          </button>
        </form>
      )}

      {devLogin && (
        <form className="w-full" method="post" action="/api/dev-login">
          <button className="w-full rounded-ui border border-border bg-surface px-4 py-2 font-medium">
            Dev login (local only)
          </button>
        </form>
      )}

      {!githubEnabled && !devLogin && (
        <p role="alert" className="text-center text-muted">
          No sign-in method is configured. Set the GitHub OAuth variables in the environment.
        </p>
      )}
      <p className="text-center text-xs text-muted">
        DeepResearchAI is an independent project and is not affiliated with Anthropic.
      </p>
    </main>
  );
}
