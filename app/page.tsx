import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { logOut } from "./actions/auth";

// Placeholder home for step 1. Onboarding and the Today view replace this in later steps.
export default async function Home() {
  const user = await requireUser();
  if (!user.plan_confirmed_at) redirect("/onboarding");
  const goalCount = (db.prepare("SELECT COUNT(*) AS n FROM goals WHERE user_id = ?").get(user.id) as { n: number }).n;
  return (
    <main className="auth">
      <div className="brand">
        <span className="brand-ring" aria-hidden />
        Progress
      </div>
      <h1>You're signed in</h1>
      <p className="muted">
        Signed in as <strong>{user.email}</strong>.
      </p>
      <div className="card">
        <div className="row">
          <span>Your goals</span>
          <strong>{goalCount}</strong>
        </div>
        <p className="muted small">Onboarding comes next (step 2). This page only shows your own data.</p>
      </div>
      <form action={logOut}>
        <button className="btn">Log out</button>
      </form>
    </main>
  );
}
