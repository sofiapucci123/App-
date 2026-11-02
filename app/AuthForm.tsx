"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { AuthState } from "./actions/auth";

type Props = {
  mode: "login" | "signup";
  action: (prev: AuthState, form: FormData) => Promise<AuthState>;
};

export default function AuthForm({ mode, action }: Props) {
  const [state, formAction, pending] = useActionState(action, {});
  const isLogin = mode === "login";
  return (
    <main className="auth">
      <div className="brand">
        <span className="brand-ring" aria-hidden />
        Progress
      </div>
      <h1>{isLogin ? "Welcome back" : "Create your account"}</h1>
      <p className="muted">{isLogin ? "Log in to see today's plan." : "Turn this year's goals into a daily plan."}</p>
      <form action={formAction} className="stack">
        <label className="field">
          <span>Email</span>
          <input name="email" type="email" autoComplete="email" required defaultValue={state.email} />
        </label>
        <label className="field">
          <span>Password</span>
          <input
            name="password"
            type="password"
            autoComplete={isLogin ? "current-password" : "new-password"}
            minLength={isLogin ? undefined : 8}
            required
          />
          {!isLogin && <small className="muted">At least 8 characters.</small>}
        </label>
        {state.error && (
          <p className="error" role="alert">
            {state.error}
          </p>
        )}
        <button className="btn primary" disabled={pending}>
          {pending ? "One moment…" : isLogin ? "Log in" : "Sign up"}
        </button>
      </form>
      <p className="muted center">
        {isLogin ? (
          <>
            New here? <Link href="/signup">Create an account</Link>
          </>
        ) : (
          <>
            Already have an account? <Link href="/login">Log in</Link>
          </>
        )}
      </p>
    </main>
  );
}
