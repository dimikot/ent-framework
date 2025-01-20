"use client";

import { signIn, signOut, useSession } from "next-auth/react";

export function SignInButton() {
  const { data, status } = useSession();

  if (status === "loading") {
    return null;
  }

  if (data) {
    return (
      <a
        className="text-blue-600 hover:underline cursor-pointer"
        onClick={() => signOut()}
      >
        Sign out
      </a>
    );
  }

  return (
    <a
      className="text-blue-600 hover:underline cursor-pointer"
      onClick={() => signIn("google")}
    >
      Sign in
    </a>
  );
}
