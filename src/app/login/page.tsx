"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/env";

type Mode = "signin" | "signup";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setPending(true);

    try {
      const supabase = createClient();

      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        // If email confirmation is enabled, there is no session yet.
        if (!data.session) {
          setNotice("Account created. Check your email to confirm, then sign in.");
          setMode("signin");
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }

      // Session cookie is set; refresh so the server sees it and middleware
      // routes us into the app.
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[70dvh] max-w-sm flex-col justify-center gap-6">
      <header className="text-center">
        <h1 className="text-2xl font-bold">MangaLib</h1>
        <p className="mt-1 text-sm text-muted">
          {mode === "signin" ? "Sign in to your library." : "Create your account."}
        </p>
      </header>

      {!isSupabaseConfigured && (
        <p className="rounded-xl border border-dashed border-border bg-surface p-4 text-center text-sm text-muted">
          Supabase is not configured yet. Add your keys to <code>.env.local</code> to enable
          sign-in.
        </p>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-base outline-none focus:border-accent"
          aria-label="Email"
        />
        <input
          type="password"
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-base outline-none focus:border-accent"
          aria-label="Password"
        />

        {error && <p className="text-sm text-red-500">{error}</p>}
        {notice && <p className="text-sm" style={{ color: "var(--owned)" }}>{notice}</p>}

        <button
          type="submit"
          disabled={pending || !isSupabaseConfigured}
          className="rounded-xl px-4 py-3 font-semibold text-white disabled:opacity-50"
          style={{ backgroundColor: "var(--accent)" }}
        >
          {pending ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
        </button>
      </form>

      <button
        type="button"
        onClick={() => {
          setMode((m) => (m === "signin" ? "signup" : "signin"));
          setError(null);
          setNotice(null);
        }}
        className="text-center text-sm text-muted active:opacity-70"
      >
        {mode === "signin"
          ? "No account? Create one"
          : "Already have an account? Sign in"}
      </button>
    </div>
  );
}
