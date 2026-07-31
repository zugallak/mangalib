"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

/** Minimal sign-out control. Placed in the home header, not a settings page. */
export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleSignOut() {
    setPending(true);
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={pending}
      className="text-sm text-muted active:opacity-70 disabled:opacity-50"
    >
      {pending ? "…" : "Sign out"}
    </button>
  );
}
