import "server-only";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";

const COOKIE = "progress_session";
const SESSION_DAYS = 30;
let DUMMY_HASH: string | undefined;

export type User = { id: number; email: string; name: string | null; onboarding_step: number; plan_confirmed_at: string | null };

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 12);
}

export async function createUser(email: string, password: string) {
  const hash = await hashPassword(password);
  const tx = db.transaction(() => {
    const info = db.prepare("INSERT INTO users (email, password_hash) VALUES (?, ?)").run(email, hash);
    const id = Number(info.lastInsertRowid);
    db.prepare("INSERT INTO profiles (user_id) VALUES (?)").run(id);
    return id;
  });
  return tx();
}

export async function verifyCredentials(email: string, password: string) {
  const row = db.prepare("SELECT id, password_hash FROM users WHERE email = ?").get(email) as
    | { id: number; password_hash: string }
    | undefined;
  // Compare against a dummy hash when the user doesn't exist, so timing doesn't reveal which emails are registered.
  const ok = await bcrypt.compare(password, row?.password_hash ?? (DUMMY_HASH ??= bcrypt.hashSync("not-a-real-password", 12)));
  return row && ok ? row.id : null;
}

export async function startSession(userId: number) {
  const token = crypto.randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000);
  db.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)").run(token, userId, expires.toISOString());
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
  if (token) db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
  jar.delete(COOKIE);
}

export async function getUser(): Promise<User | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT u.id, u.email, p.name, p.onboarding_step, p.plan_confirmed_at
         FROM sessions s JOIN users u ON u.id = s.user_id JOIN profiles p ON p.user_id = u.id
        WHERE s.token = ? AND s.expires_at > ?`
    )
    .get(token, new Date().toISOString()) as User | undefined;
  return row ?? null;
}

/** Use in any page or action that needs a signed-in user. */
export async function requireUser(): Promise<User> {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}
