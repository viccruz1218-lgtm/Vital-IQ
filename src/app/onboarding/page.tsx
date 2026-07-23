import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OnboardingChat } from "./onboarding-chat";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: history }] = await Promise.all([
    supabase.from("profiles").select("onboarding_completed").eq("id", user.id).single(),
    supabase
      .from("chat_messages")
      .select("role, content")
      .eq("user_id", user.id)
      .eq("context", "onboarding")
      .order("created_at", { ascending: true }),
  ]);

  // Also guarded by onboarding/layout.tsx, but checked again here since this
  // page is what actually knows how to fetch+restore the chat history below.
  if (profile?.onboarding_completed) redirect("/dashboard");

  return <OnboardingChat initialHistory={history ?? []} />;
}
