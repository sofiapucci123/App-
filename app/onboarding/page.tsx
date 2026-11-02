import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { formatGoal, getProfile, listGoals } from "@/lib/goals";
import { getPlan } from "@/lib/plan";
import Onboarding from "./Onboarding";

export const metadata = { title: "Get started · Progress" };

export default async function OnboardingPage() {
  const user = await requireUser();
  const profile = getProfile(user.id);
  if (profile.plan_confirmed_at) redirect("/");
  const goals = listGoals(user.id);
  const plan = getPlan(user.id);
  return (
    <Onboarding
      initialStep={profile.onboarding_step}
      initialName={profile.name ?? ""}
      initialThirdPerson={profile.third_person === 1}
      initialGoals={goals.map((g) => ({ id: g.id, text: g.text, why: g.why }))}
      plan={goals.map((g) => {
        const p = plan.find((x) => x.goalId === g.id)!;
        return { goalId: g.id, title: formatGoal(g, profile.name), why: g.why, kind: p.kind, months: p.months, tasks: p.tasks };
      })}
    />
  );
}
