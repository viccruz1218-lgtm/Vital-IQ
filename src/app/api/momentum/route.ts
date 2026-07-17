import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: scores } = await supabase
    .from("momentum_scores")
    .select("*")
    .eq("user_id", user.id)
    .order("score_date", { ascending: true })
    .limit(30);

  return NextResponse.json({ scores: scores ?? [] });
}
