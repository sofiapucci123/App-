import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { logIn } from "../actions/auth";
import AuthForm from "../AuthForm";

export const metadata = { title: "Log in · Progress" };

export default async function LoginPage() {
  if (await getUser()) redirect("/");
  return <AuthForm mode="login" action={logIn} />;
}
