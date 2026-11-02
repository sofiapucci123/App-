import "server-only";
import { db } from "./db";
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
export function ensureTargetDate(userId: number, today: string) {
  const row = db.prepare("SELECT target_date FROM profiles WHERE user_id = ?").get(userId) as { target_date: string | null };
  if (row.target_date && row.target_date > today) return row.target_date;
  const target = defaultTargetDate(today);
  db.prepare("UPDATE profiles SET target_date = ? WHERE user_id = ?").run(target, userId);
  return target;
}

type GoalRow = { id: number; text: string; why: string; third_person: number };

/**
 * Generates and stores the plan for one yearly goal. Items the user edited are kept as they are;
 * everything else the AI wrote for this goal is replaced.
 */
export async function buildPlanForGoal(userId: number, goalId: number, today: string) {
  const goal = db.prepare("SELECT id, text, why, third_person FROM goals WHERE id = ? AND user_id = ?").get(goalId, userId) as
    | GoalRow
    | undefined;
  if (!goal) throw new Error("Goal not found");
  const name = (db.prepare("SELECT name FROM profiles WHERE user_id = ?").get(userId) as { name: string | null }).name;
  const targetDate = ensureTargetDate(userId, today);
  const { months, taskDates } = planWindow(today, targetDate);

  const plan = await generateGoalPlan({
    goal: formatGoal(goal, name),
    why: goal.why,
    today,
    targetDate,
    months,
    taskDates,
  });
  savePlan(userId, goal.id, plan, months, taskDates);
  return { kind: plan.kind, months: months.length, tasks: taskDates.length };
}

function savePlan(userId: number, goalId: number, plan: GoalPlan, months: string[], taskDates: string[]) {
  // Match the AI's answer to the months and dates we asked for, by value first and then by position.
  const monthText = new Map(plan.months.map((m) => [m.month, m.goal.trim()]));
  const taskText = new Map(plan.daily_tasks.map((t) => [t.date, t.task.trim()]));
  const monthFor = (m: string, i: number) => monthText.get(m) || plan.months[i]?.goal.trim();
  const taskFor = (d: string, i: number) => taskText.get(d) || plan.daily_tasks[i]?.task.trim();

  db.transaction(() => {
    db.prepare("UPDATE goals SET kind = ? WHERE id = ? AND user_id = ?").run(plan.kind, goalId, userId);

    // Monthly goals: keep edited ones, replace the rest.
    const editedMonths = new Set(
      (db.prepare("SELECT month FROM monthly_goals WHERE user_id = ? AND goal_id = ? AND edited = 1").all(userId, goalId) as { month: string }[]).map(
        (r) => r.month
      )
    );
    db.prepare("DELETE FROM monthly_goals WHERE user_id = ? AND goal_id = ? AND edited = 0").run(userId, goalId);
    const insertMonth = db.prepare("INSERT INTO monthly_goals (user_id, goal_id, month, text) VALUES (?, ?, ?, ?)");
    months.forEach((m, i) => {
      const text = monthFor(m, i);
      if (!editedMonths.has(m) && text) insertMonth.run(userId, goalId, m, text);
    });
    const monthIds = new Map(
      (db.prepare("SELECT id, month FROM monthly_goals WHERE user_id = ? AND goal_id = ?").all(userId, goalId) as { id: number; month: string }[]).map(
        (r) => [r.month, r.id]
      )
    );

    // Daily tasks inside the window: keep edited ones, replace the rest.
    const first = taskDates[0];
    const last = taskDates[taskDates.length - 1];
    const editedDates = new Set<string>();
    for (const t of db
      .prepare("SELECT start_date, end_date FROM tasks WHERE user_id = ? AND goal_id = ? AND edited = 1 AND deleted_at IS NULL AND end_date >= ? AND start_date <= ?")
      .all(userId, goalId, first, last) as { start_date: string; end_date: string }[]) {
      for (let d = t.start_date; d <= t.end_date; d = addDays(d, 1)) editedDates.add(d);
    }
    db.prepare("DELETE FROM tasks WHERE user_id = ? AND goal_id = ? AND edited = 0 AND start_date >= ? AND end_date <= ?").run(userId, goalId, first, last);

    const insertTask = db.prepare(
      "INSERT INTO tasks (user_id, goal_id, monthly_goal_id, text, start_date, end_date) VALUES (?, ?, ?, ?, ?, ?)"
    );
    // Consecutive days with identical text (habits) are stored as one recurring task per month.
    let run: { text: string; start: string; end: string } | null = null;
    const flush = () => {
      if (run) insertTask.run(userId, goalId, monthIds.get(monthOf(run.start)) ?? null, run.text, run.start, run.end);
      run = null;
    };
    taskDates.forEach((d, i) => {
      const text = taskFor(d, i);
      if (!text || editedDates.has(d)) return flush();
      if (run && run.text === text && addDays(run.end, 1) === d && monthOf(run.start) === monthOf(d)) run.end = d;
      else {
        flush();
        run = { text, start: d, end: d };
      }
    });
    flush();
  })();
}

export type PlanView = {
  goalId: number;
  kind: string | null;
  months: { id: number; month: string; text: string; edited: number }[];
  tasks: { id: number; text: string; start_date: string; end_date: string; edited: number; monthly_goal_id: number | null }[];
};

export function getPlan(userId: number): PlanView[] {
  const goals = db.prepare("SELECT id, kind FROM goals WHERE user_id = ? ORDER BY position, id").all(userId) as { id: number; kind: string | null }[];
  return goals.map((g) => ({
    goalId: g.id,
    kind: g.kind,
    months: db
      .prepare("SELECT id, month, text, edited FROM monthly_goals WHERE user_id = ? AND goal_id = ? ORDER BY month, position, id")
      .all(userId, g.id) as PlanView["months"],
    tasks: db
      .prepare(
        "SELECT id, text, start_date, end_date, edited, monthly_goal_id FROM tasks WHERE user_id = ? AND goal_id = ? AND deleted_at IS NULL ORDER BY start_date, id"
      )
      .all(userId, g.id) as PlanView["tasks"],
  }));
}
