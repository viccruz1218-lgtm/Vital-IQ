import { createClient } from "@/lib/supabase/server";
import { CoachChat } from "@/components/chat/coach-chat";
import { requireFullExperience } from "@/lib/experiment";

export default async function CoachPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  await requireFullExperience(supabase, user.id);

  const { data: history } = await supabase
    .from("chat_messages")
    .select("role, content")
    .eq("user_id", user.id)
    .eq("context", "coach")
    .order("created_at", { ascending: true })
    .limit(50);

  return <CoachChat initialMessages={history ?? []} />;
}
