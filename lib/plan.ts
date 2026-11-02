import "server-only";
import { all, get, run, transaction } from "./db";
import { generateGoalPlan, type GoalPlan } from "./ai";
import { addDays, addMonths, daysBetween, monthEnd, monthOf, monthsBetween } from "./dates";
import { formatGoal } from "./goals";

/** Daily tasks are written for the current month (plus the next one when fewer than 10 days remain).
 *  Later months get their tasks from the monthly review. */
export function planWindow(today: string, targetDate: string) {
  const months = monthsBetween(today, targetDate);
  let end = monthEnd(monthOf(today));
  if (daysBetween(today, end).length < 10 && months.length > 1) end = monthEnd(months[1]);
  if (end > targetDate) end = targetDate;
  return { months, taskDates: daysBetween(today, end) };
}

export function defaultTargetDate(today: string) {
  return addMonths(today, 12);
}

/** Ensures the profile has a target date (12 months from `today` by default) and returns it. */
export async function ensureTargetDate(userId: number, today: string) {
  const row = await get<{ target_date: string | null }>("SELECT target_date FROM profiles WHERE user_id = ?", [userId]);
  if (row?.target_date && row.target_date > today) return row.target_date;
  const target = defaultTargetDate(today);
  await run("UPDATE profiles SET target_date = ? WHERE user_id = ?", [target, userId]);
  return target;
}

type GoalRow = { id: number; text: string; why: string; third_person: number };

/**
 * Generates and stores the plan for one yearly goal. Items the user edited are kept as they are;
 * everything else the AI wrote for this goal is replaced.
 */
export async function buildPlanForGoal(userId: number, goalId: number, today: string) {
  const goal = await get<GoalRow>("SELECT id, text, why, third_person FROM goals WHERE id = ? AND user_id = ?", [goalId, userId]);
  if (!goal) throw new Error("Goal not found");
  const name = (await get<{ name: string | null }>("SELECT name FROM profiles WHERE user_id = ?", [userId]))?.name ?? null;
  const targetDate = await ensureTargetDate(userId, today);
  const { months, taskDates } = planWindow(today, targetDate);

  const plan = await generateGoalPlan({
    goal: formatGoal(goal, name),
    why: goal.why,
    today,
    targetDate,
    months,
    taskDates,
  });
  await savePlan(userId, goal.id, plan, months, taskDates);
  return { kind: plan.kind, months: months.length, tasks: taskDates.length };
}

async function savePlan(userId: number, goalId: number, plan: GoalPlan, months: string[], taskDates: string[]) {
  // Match the AI's answer to the months and dates we asked for, by value first and then by position.
  const monthText = new Map(plan.months.map((m) => [m.month, m.goal.trim()]));
  const taskText = new Map(plan.daily_tasks.map((t) => [t.date, t.task.trim()]));
  const monthFor = (m: string, i: number) => monthText.get(m) || plan.months[i]?.goal.trim();
  const taskFor = (d: string, i: number) => taskText.get(d) || plan.daily_tasks[i]?.task.trim();

  await transaction(async (tx) => {
    await run("UPDATE goals SET kind = ? WHERE id = ? AND user_id = ?", [plan.kind, goalId, userId], tx);

    // Monthly goals: keep edited ones, replace the rest.
    const editedMonths = new Set(
      (await all<{ month: string }>("SELECT month FROM monthly_goals WHERE user_id = ? AND goal_id = ? AND edited = 1", [userId, goalId], tx)).map((r) => r.month)
    );
    await run(
      "UPDATE tasks SET monthly_goal_id = NULL WHERE user_id = ? AND monthly_goal_id IN (SELECT id FROM monthly_goals WHERE user_id = ? AND goal_id = ? AND edited = 0)",
      [userId, userId, goalId],
      tx
    );
    await run("DELETE FROM monthly_goals WHERE user_id = ? AND goal_id = ? AND edited = 0", [userId, goalId], tx);
    const monthInserts = months
      .map((m, i) => [m, monthFor(m, i)] as const)
      .filter(([m, text]) => !editedMonths.has(m) && text)
      .map(([m, text], i) => ({
        sql: "INSERT INTO monthly_goals (user_id, goal_id, month, text, position) VALUES (?, ?, ?, ?, ?)",
        args: [userId, goalId, m, text!, i],
      }));
    if (monthInserts.length) await tx.batch(monthInserts);
    const monthIds = new Map(
      (await all<{ id: number; month: string }>("SELECT id, month FROM monthly_goals WHERE user_id = ? AND goal_id = ?", [userId, goalId], tx)).map(
        (r) => [r.month, r.id]
      )
    );

    // Daily tasks inside the window: keep edited ones, replace the rest.
    const first = taskDates[0];
    const last = taskDates[taskDates.length - 1];
    const editedDates = new Set<string>();
    for (const t of await all<{ start_date: string; end_date: string }>(
      "SELECT start_date, end_date FROM tasks WHERE user_id = ? AND goal_id = ? AND edited = 1 AND deleted_at IS NULL AND end_date >= ? AND start_date <= ?",
      [userId, goalId, first, last],
      tx
    )) {
      for (let d = t.start_date; d <= t.end_date; d = addDays(d, 1)) editedDates.add(d);
    }
    await run(
      "DELETE FROM task_days WHERE user_id = ? AND task_id IN (SELECT id FROM tasks WHERE user_id = ? AND goal_id = ? AND edited = 0 AND start_date >= ? AND end_date <= ?)",
      [userId, userId, goalId, first, last],
      tx
    );
    await run("DELETE FROM tasks WHERE user_id = ? AND goal_id = ? AND edited = 0 AND start_date >= ? AND end_date <= ?", [userId, goalId, first, last], tx);

    // Consecutive days with identical text (habits) are stored as one recurring task per month.
    const runs: { text: string; start: string; end: string }[] = [];
    taskDates.forEach((d, i) => {
      const text = taskFor(d, i);
      const prev = runs[runs.length - 1];
      if (!text || editedDates.has(d)) return;
      if (prev && prev.text === text && addDays(prev.end, 1) === d && monthOf(prev.start) === monthOf(d)) prev.end = d;
      else runs.push({ text, start: d, end: d });
    });
    if (runs.length)
      await tx.batch(
        runs.map((r) => ({
          sql: "INSERT INTO tasks (user_id, goal_id, monthly_goal_id, text, start_date, end_date) VALUES (?, ?, ?, ?, ?, ?)",
          args: [userId, goalId, monthIds.get(monthOf(r.start)) ?? null, r.text, r.start, r.end],
        }))
      );
  });
}

export type PlanView = {
  goalId: number;
  kind: string | null;
  months: { id: number; month: string; text: string; edited: number }[];
  tasks: { id: number; text: string; start_date: string; end_date: string; edited: number; monthly_goal_id: number | null }[];
};

export async function getPlan(userId: number): Promise<PlanView[]> {
  const goals = await all<{ id: number; kind: string | null }>("SELECT id, kind FROM goals WHERE user_id = ? ORDER BY position, id", [userId]);
  const months = await all<PlanView["months"][number] & { goal_id: number }>(
    "SELECT id, goal_id, month, text, edited FROM monthly_goals WHERE user_id = ? ORDER BY month, position, id",
    [userId]
  );
  const tasks = await all<PlanView["tasks"][number] & { goal_id: number }>(
    "SELECT id, goal_id, text, start_date, end_date, edited, monthly_goal_id FROM tasks WHERE user_id = ? AND deleted_at IS NULL ORDER BY start_date, id",
    [userId]
  );
  return goals.map((g) => ({
    goalId: g.id,
    kind: g.kind,
    months: months.filter((m) => m.goal_id === g.id),
    tasks: tasks.filter((t) => t.goal_id === g.id),
  }));
}
