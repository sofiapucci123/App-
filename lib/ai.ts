import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

export const MODEL = "claude-opus-5-5";

export class AiNotConfiguredError extends Error {
  constructor() {
    super("The AI isn't set up yet. Add an ANTHROPIC_API_KEY to the server's environment.");
  }
}
export class AiFailedError extends Error {}

const GoalPlanSchema = z.object({
  kind: z.enum(["habit", "project"]),
  months: z.array(
    z.object({
      month: z.string().describe("YYYY-MM, exactly as listed in the request"),
      goal: z.string().describe("The monthly goal for this yearly goal in this month"),
    })
  ),
  daily_tasks: z.array(
    z.object({
      date: z.string().describe("YYYY-MM-DD, exactly as listed in the request"),
      task: z.string().describe("One specific, measurable task that takes 15 minutes or less"),
    })
  ),
});
export type GoalPlan = z.infer<typeof GoalPlanSchema>;

export type GoalPlanRequest = {
  goal: string;
  why: string;
  today: string;
  targetDate: string;
  months: string[];
  taskDates: string[];
};

const SYSTEM = `You turn one yearly goal into a realistic plan: a monthly goal for every month, and one small daily task per day.

Classify the goal first:
- "habit": the goal is a behavior repeated every day (drinking water, eating healthy, going to the gym, reading). Every daily task is the SAME measurable action, written identically each day (for example "Drink 3 liters of water, tracked in 8 glasses"). Monthly goals describe consistency targets that build gradually.
- "project": the goal is an outcome reached through progress (running a marathon, building a business, reaching an income level). Each daily task is a DIFFERENT small action step that moves that month's monthly goal forward, in a sensible order. Monthly goals are milestones that build toward the yearly goal by the target date.

Rules for every daily task:
- Takes 15 minutes or less. Small inputs, done every day, add up.
- Specific and measurable: the person can tell without doubt whether it is done.
- Written as a short imperative sentence, under 100 characters, without the date.
- Matches the monthly goal of its month and is achievable for a beginner.

Rules for monthly goals:
- One per listed month, in order, progressing toward the yearly goal by the target date.
- One sentence, under 140 characters, concrete enough to know whether it was reached.

Return exactly the months and dates you are given, in the same order.`;

let client: Anthropic | null = null;
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) throw new AiNotConfiguredError();
  return (client ??= new Anthropic());
}

/** Asks Claude for one goal's monthly goals and the daily tasks for the given dates. */
export async function generateGoalPlan(req: GoalPlanRequest): Promise<GoalPlan> {
  if (process.env.PROGRESS_AI_MOCK === "1") return mockPlan(req);

  const prompt = `Yearly goal: ${req.goal}
Why it matters to them: ${req.why || "(not given)"}
Today: ${req.today}
Target date: ${req.targetDate}

Months to plan (one monthly goal each):
${req.months.join("\n")}

Dates that need a daily task (one task each):
${req.taskDates.join("\n")}`;

  let response;
  try {
    response = await getClient().beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: betaZodOutputFormat(GoalPlanSchema) },
      system: SYSTEM,
      messages: [{ role: "user", content: prompt }],
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new AiFailedError("The AI key was rejected. Check ANTHROPIC_API_KEY.");
    if (e instanceof Anthropic.RateLimitError) throw new AiFailedError("The AI is busy right now. Try again in a minute.");
    if (e instanceof Anthropic.APIError) throw new AiFailedError(`The AI request failed (${e.status ?? "network"}). Try again.`);
    throw e;
  }
  if (response.stop_reason === "refusal") throw new AiFailedError("The AI couldn't plan this goal. Try rewording it.");
  if (response.stop_reason === "max_tokens" || !response.parsed_output) throw new AiFailedError("The AI's answer was incomplete. Try again.");
  return response.parsed_output;
}

/**
 * Development stand-in, used only when PROGRESS_AI_MOCK=1. Produces obviously sample text so the
 * rest of the app can be exercised without an API key.
 */
function mockPlan(req: GoalPlanRequest): GoalPlan {
  const habit = /water|eat|gym|read|sleep|meditat/i.test(req.goal);
  return {
    kind: habit ? "habit" : "project",
    months: req.months.map((month, i) => ({ month, goal: `[Sample] Month ${i + 1} milestone for: ${req.goal}` })),
    daily_tasks: req.taskDates.map((date, i) => ({
      date,
      task: habit ? `[Sample] Same daily habit for: ${req.goal}` : `[Sample] Step ${i + 1} toward: ${req.goal}`,
    })),
  };
}
