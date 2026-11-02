"use server";

import { redirect } from "next/navigation";
import { createUser, endSession, startSession, verifyCredentials } from "@/lib/auth";

export type AuthState = { error?: string; email?: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function signUp(_prev: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!EMAIL_RE.test(email)) return { error: "Enter a valid email address.", email };
  if (password.length < 8) return { error: "Password must be at least 8 characters.", email };
  let id: number;
  try {
    id = await createUser(email, password);
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes("UNIQUE")) return { error: "An account with this email already exists. Log in instead.", email };
    throw e;
  }
  await startSession(id);
  redirect("/");
}

export async function logIn(_prev: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const id = await verifyCredentials(email, password);
  if (!id) return { error: "That email and password don't match.", email };
  await startSession(id);
  redirect("/");
}

export async function logOut() {
  await endSession();
  redirect("/login");
}
