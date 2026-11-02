import { all, get } from "./db";

export type Goal = { id: number; text: string; why: string; third_person: number; position: number };

export const THIRD_PERSON_JOIN = "is a person who";

/** How a yearly goal reads everywhere in the app. */
export function formatGoal(goal: Pick<Goal, "text" | "third_person">, name: string | null) {
  return goal.third_person ? `${name?.trim() || "You"} ${THIRD_PERSON_JOIN} ${goal.text}` : goal.text;
}

export function listGoals(userId: number) {
  return all<Goal>("SELECT id, text, why, third_person, position FROM goals WHERE user_id = ? ORDER BY position, id", [userId]);
}

export type Profile = { name: string | null; third_person: number; onboarding_step: number; plan_confirmed_at: string | null };

export async function getProfile(userId: number): Promise<Profile> {
  return (await get<Profile>("SELECT name, third_person, onboarding_step, plan_confirmed_at FROM profiles WHERE user_id = ?", [userId]))!;
}
