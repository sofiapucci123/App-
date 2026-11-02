import "server-only";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { get, run, transaction } from "./db";

const COOKIE = "progress_session";
const SESSION_DAYS = 30;
let DUMMY_HASH: string | undefined;

export type User = { id: number; email: string; name: string | null; onboarding_step: number; plan_confirmed_at: string | null };

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 12);
}

export async function createUser(email: string, password: string) {
  const hash = await hashPassword(password);
  return transaction(async (tx) => {
    const { id } = await run("INSERT INTO users (email, password_hash) VALUES (?, ?)", [email, hash], tx);
    await run("INSERT INTO profiles (user_id) VALUES (?)", [id], tx);
    return id;
  });
}

export async function verifyCredentials(email: string, password: string) {
  const row = await get<{ id: number; password_hash: string }>("SELECT id, password_hash FROM users WHERE email = ?", [email]);
  // Compare against a dummy hash when the user doesn't exist, so timing doesn't reveal which emails are registered.
  const ok = await bcrypt.compare(password, row?.password_hash ?? (DUMMY_HASH ??= bcrypt.hashSync("not-a-real-password", 12)));
  return row && ok ? row.id : null;
}

export async function startSession(userId: number) {
  const token = crypto.randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await run("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)", [token, userId, expires.toISOString()]);
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  });
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await run("DELETE FROM sessions WHERE token = ?", [token]);
  jar.delete(COOKIE);
}

export async function getUser(): Promise<User | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const row = await get<User>(
    `SELECT u.id, u.email, p.name, p.onboarding_step, p.plan_confirmed_at
       FROM sessions s JOIN users u ON u.id = s.user_id JOIN profiles p ON p.user_id = u.id
      WHERE s.token = ? AND s.expires_at > ?`,
    [token, new Date().toISOString()]
  );
  return row ?? null;
}

/** Use in any page or action that needs a signed-in user. */
export async function requireUser(): Promise<User> {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}
