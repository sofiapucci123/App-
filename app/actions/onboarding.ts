"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { AiFailedError, AiNotConfiguredError } from "@/lib/ai";
import { DATE_RE } from "@/lib/dates";
import { buildPlanForGoal } from "@/lib/plan";

const MAX_STEP = 5;

export async function setOnboardingStep(step: number) {
  const user = await requireUser();
  const s = Math.max(1, Math.min(MAX_STEP, Math.floor(step)));
  db.prepare("UPDATE profiles SET onboarding_step = ? WHERE user_id = ?").run(s, user.id);
  revalidatePath("/onboarding");
}

export type GoalInput = { id?: number; text: string; why: string };
export type SaveGoalsResult = { ok: true; ids: number[] } | { ok: false; error: string };

/**
 * Saves screen 2: the name, the third-person preference, and the goals with their whys.
 * Goals are updated in place by id so later monthly goals and tasks stay attached.
 */
export async function saveNameAndGoals(input: { name: string; thirdPerson: boolean; goals: GoalInput[] }): Promise<SaveGoalsResult> {
  const user = await requireUser();
  const name = String(input.name ?? "").trim().slice(0, 60);
  const thirdPerson = input.thirdPerson ? 1 : 0;
  const goals = (Array.isArray(input.goals) ? input.goals : [])
    .map((g) => ({
      id: Number.isInteger(g?.id) ? (g.id as number) : undefined,
      text: String(g?.text ?? "").trim().slice(0, 300),
      why: String(g?.why ?? "").trim().slice(0, 500),
    }))
    .filter((g) => g.text.length > 0)
    .slice(0, 30);

  if (!name) return { ok: false, error: "Please enter your name." };
  if (goals.length === 0) return { ok: false, error: "Please write at least one goal." };

  const ids = db.transaction(() => {
    db.prepare("UPDATE profiles SET name = ?, third_person = ? WHERE user_id = ?").run(name, thirdPerson, user.id);
    const existing = new Set(
      (db.prepare("SELECT id FROM goals WHERE user_id = ?").all(user.id) as { id: number }[]).map((r) => r.id)
    );
    const kept: number[] = [];
    goals.forEach((g, position) => {
      if (g.id && existing.has(g.id)) {
        db.prepare(
          "UPDATE goals SET text = ?, why = ?, third_person = ?, position = ? WHERE id = ? AND user_id = ?"
        ).run(g.text, g.why, thirdPerson, position, g.id, user.id);
        kept.push(g.id);
      } else {
        const info = db
          .prepare("INSERT INTO goals (user_id, text, why, third_person, position) VALUES (?, ?, ?, ?, ?)")
          .run(user.id, g.text, g.why, thirdPerson, position);
        kept.push(Number(info.lastInsertRowid));
      }
    });
    for (const id of existing) {
      if (!kept.includes(id)) db.prepare("DELETE FROM goals WHERE id = ? AND user_id = ?").run(id, user.id);
    }
    db.prepare("UPDATE profiles SET onboarding_step = MAX(onboarding_step, 3) WHERE user_id = ?").run(user.id);
    return kept;
  })();

  revalidatePath("/onboarding");
  return { ok: true, ids };
}

export type GeneratePlanResult = { ok: true; kind: string; months: number; tasks: number } | { ok: false; error: string };

/** Screen 4: asks the AI for one yearly goal's monthly goals and daily tasks, and saves them. */
export async function generatePlanForGoal(goalId: number, today: string): Promise<GeneratePlanResult> {
  const user = await requireUser();
  if (!Number.isInteger(goalId)) return { ok: false, error: "Unknown goal." };
  if (!DATE_RE.test(today)) return { ok: false, error: "Invalid date." };
  try {
    const res = await buildPlanForGoal(user.id, goalId, today);
    return { ok: true, ...res };
  } catch (e) {
    if (e instanceof AiNotConfiguredError || e instanceof AiFailedError) return { ok: false, error: e.message };
    console.error("generatePlanForGoal failed", e);
    return { ok: false, error: "Something went wrong while building the plan. Try again." };
  }
}
