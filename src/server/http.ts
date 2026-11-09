import { auth } from "@/server/auth";
import { HttpError } from "@/server/errors";

export * from "@/server/errors";

export async function requireUserId(): Promise<string> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) throw new HttpError(401, "unauthenticated", "Sign in required");
  return id;
}
