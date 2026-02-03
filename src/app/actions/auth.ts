"use server";

import { auth, signIn } from "../../app/api/auth/auth";

export default async function SignIn() {
  const session = await auth();
  if (session?.user) {
    return;
  }
  await signIn("google")
}
