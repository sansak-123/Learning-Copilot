"use server";

import { auth, signOut } from "../auth";

export default async function SignOut() {
  console.log("Signing out");
  const session = await auth();
  if (session && session.user) {
    await signOut();
  }
}