"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { generatePlanForGoal } from "../actions/onboarding";

export type GoalPlanView = {
  goalId: number;
  title: string;
  why: string;
  kind: string | null;
  months: { id: number; month: string; text: string; edited: number }[];
  tasks: { id: number; text: string; start_date: string; end_date: string; edited: number }[];
};

type Status = { state: "idle" | "running" | "done" | "error"; error?: string };

export function localToday() {
  return new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD in the user's time zone
}

function fmtDay(d: string, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }) {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });
}
function fmtMonth(m: string) {
  const [y, mo] = m.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** Screen 4: runs the AI breakdown for every goal that doesn't have a plan yet. */
export function BreakdownScreen({ plan, onBack, onDone }: { plan: GoalPlanView[]; onBack: () => void; onDone: () => void }) {
  const router = useRouter();
  const [status, setStatus] = useState<Record<number, Status>>(() =>
    Object.fromEntries(plan.map((g) => [g.goalId, { state: g.months.length ? "done" : "idle" } as Status]))
  );
  const started = useRef(false);

  const run = async (goalId: number) => {
    setStatus((s) => ({ ...s, [goalId]: { state: "running" } }));
    const res = await generatePlanForGoal(goalId, localToday());
    setStatus((s) => ({ ...s, [goalId]: res.ok ? { state: "done" } : { state: "error", error: res.error } }));
    router.refresh();
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    plan.filter((g) => !g.months.length).forEach((g) => run(g.goalId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const states = plan.map((g) => status[g.goalId]?.state);
  const allDone = states.every((s) => s === "done");
  const busy = states.some((s) => s === "running");

  return (
    <section className="ob-screen">
      <div className="ob-body">
        <h1>{allDone ? "Your plan is ready" : "Breaking it down…"}</h1>
        <p className="muted">
          {allDone
            ? "Every goal now has a monthly goal for each month and one small daily task."
            : "Turning each goal into monthly goals and one small daily task. This takes a moment."}
        </p>
        <ul className="bd-list">
          {plan.map((g) => {
            const s = status[g.goalId] ?? { state: "idle" };
            return (
              <li key={g.goalId} className={`bd-item ${s.state}`}>
                <span className="bd-icon" aria-hidden>
                  {s.state === "done" ? "✓" : s.state === "error" ? "!" : <span className="spinner" />}
                </span>
                <div className="bd-text">
                  <strong>{g.title}</strong>
                  <span className="muted small">
                    {s.state === "done" && g.months.length
                      ? `${g.months.length} monthly goals · ${g.kind === "habit" ? "same task every day" : "a new small step each day"}`
                      : s.state === "done"
                        ? "Planned"
                        : s.state === "error"
                          ? s.error
                          : "Planning…"}
                  </span>
                  {s.state === "error" && (
                    <button className="link-btn" onClick={() => run(g.goalId)}>
                      Try again
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="ob-actions">
        <button className="btn" onClick={onBack} disabled={busy}>
          Back
        </button>
        <button className="btn primary" onClick={onDone} disabled={!allDone}>
          Review my plan
        </button>
      </div>
    </section>
  );
}

/** Screen 5 preview (read-only). Editing and confirming come in build step 4. */
export function PlanPreview({ plan, onBack }: { plan: GoalPlanView[]; onBack: () => void }) {
  return (
    <section className="ob-screen">
      <div className="ob-body stack">
        <div>
          <h1>Your plan</h1>
          <p className="muted">Here is what the AI wrote for each goal. Editing comes in the next build step.</p>
        </div>
        {plan.map((g) => (
          <article key={g.goalId} className="card plan-goal">
            <div className="plan-goal-head">
              <h2>{g.title}</h2>
              {g.kind && <span className="badge">{g.kind === "habit" ? "Daily habit" : "Project"}</span>}
            </div>
            {g.why && <p className="why-text">{g.why}</p>}
            <details open>
              <summary>Monthly goals</summary>
              <ol className="plan-months">
                {g.months.map((m) => (
                  <li key={m.id}>
                    <span className="plan-month">{fmtMonth(m.month)}</span>
                    {m.text}
                  </li>
                ))}
              </ol>
            </details>
            <details open>
              <summary>Daily tasks</summary>
              <ul className="plan-tasks">
                {g.tasks.map((t) => (
                  <li key={t.id}>
                    <span className="plan-date">
                      {t.start_date === t.end_date ? fmtDay(t.start_date, { weekday: "short", month: "short", day: "numeric" }) : `Every day, ${fmtDay(t.start_date)} – ${fmtDay(t.end_date)}`}
                    </span>
                    {t.text}
                  </li>
                ))}
              </ul>
            </details>
          </article>
        ))}
      </div>
      <div className="ob-actions">
        <button className="btn" onClick={onBack}>
          Back
        </button>
      </div>
    </section>
  );
}
