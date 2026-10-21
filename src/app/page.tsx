import { redirect } from "next/navigation";

import { getAuth } from "@/server/auth/context";

/** Signed in: choose a workspace. Otherwise: sign in. */
export default async function HomePage() {
  const { user } = await getAuth();
  redirect(user ? "/workspaces" : "/sign-in");
}
