import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// A user who already completed onboarding could otherwise navigate back to
// /onboarding, re-run the whole chat, and re-trigger save_onboarding_profile
// (overwriting their existing identity_statement/goal/etc.) and
// seed_starter_habits (inserting a duplicate set of habits with no dedup).
export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarding_completed")
    .eq("id", user.id)
    .single();

  if (profile?.onboarding_completed) redirect("/dashboard");

  return <>{children}</>;
}
