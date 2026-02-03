"use server";

import { auth, signIn } from "../auth";

export default async function SignIn() {
  const session = await auth();
  if (session?.user) {
    return;
  }
  await signIn("google")
}