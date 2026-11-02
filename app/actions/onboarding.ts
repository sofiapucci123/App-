"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { all, run, transaction } from "@/lib/db";
import { AiFailedError, AiNotConfiguredError } from "@/lib/ai";
import { DATE_RE } from "@/lib/dates";
import { buildPlanForGoal } from "@/lib/plan";

const MAX_STEP = 5;

export async function setOnboardingStep(step: number) {
  const user = await requireUser();
  const s = Math.max(1, Math.min(MAX_STEP, Math.floor(step)));
  await run("UPDATE profiles SET onboarding_step = ? WHERE user_id = ?", [s, user.id]);
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

  const ids = await transaction(async (tx) => {
    await run("UPDATE profiles SET name = ?, third_person = ? WHERE user_id = ?", [name, thirdPerson, user.id], tx);
    const existing = new Set((await all<{ id: number }>("SELECT id FROM goals WHERE user_id = ?", [user.id], tx)).map((r) => r.id));
    const kept: number[] = [];
    for (const [position, g] of goals.entries()) {
      if (g.id && existing.has(g.id)) {
        await run(
          "UPDATE goals SET text = ?, why = ?, third_person = ?, position = ? WHERE id = ? AND user_id = ?",
          [g.text, g.why, thirdPerson, position, g.id, user.id],
          tx
        );
        kept.push(g.id);
      } else {
        const { id } = await run(
          "INSERT INTO goals (user_id, text, why, third_person, position) VALUES (?, ?, ?, ?, ?)",
          [user.id, g.text, g.why, thirdPerson, position],
          tx
        );
        kept.push(id);
      }
    }
    for (const id of existing) {
      if (kept.includes(id)) continue;
      // Delete children explicitly so this doesn't depend on the connection's foreign-key setting.
      await run("DELETE FROM task_days WHERE user_id = ? AND task_id IN (SELECT id FROM tasks WHERE goal_id = ?)", [user.id, id], tx);
      await run("DELETE FROM tasks WHERE user_id = ? AND goal_id = ?", [user.id, id], tx);
      await run("DELETE FROM monthly_goals WHERE user_id = ? AND goal_id = ?", [user.id, id], tx);
      await run("DELETE FROM goals WHERE id = ? AND user_id = ?", [id, user.id], tx);
    }
    await run("UPDATE profiles SET onboarding_step = MAX(onboarding_step, 3) WHERE user_id = ?", [user.id], tx);
    return kept;
  });

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
