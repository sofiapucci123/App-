import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { signUp } from "../actions/auth";
import AuthForm from "../AuthForm";

export const metadata = { title: "Sign up · Progress" };

export default async function SignupPage() {
  if (await getUser()) redirect("/");
  return <AuthForm mode="signup" action={signUp} />;
}
