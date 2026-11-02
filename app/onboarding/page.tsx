import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getProfile, listGoals } from "@/lib/goals";
import Onboarding from "./Onboarding";

export const metadata = { title: "Get started · Progress" };

export default async function OnboardingPage() {
  const user = await requireUser();
  const profile = getProfile(user.id);
  if (profile.plan_confirmed_at) redirect("/");
  const goals = listGoals(user.id);
  return (
    <Onboarding
      initialStep={profile.onboarding_step}
      initialName={profile.name ?? ""}
      initialThirdPerson={profile.third_person === 1}
      initialGoals={goals.map((g) => ({ id: g.id, text: g.text, why: g.why }))}
    />
  );
}
