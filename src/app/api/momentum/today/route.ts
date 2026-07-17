import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { calculateMomentumScore } from "@/lib/momentum";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const today = new Date().toISOString().slice(0, 10);

  const { data: existing } = await supabase
    .from("momentum_scores")
    .select("*")
    .eq("user_id", user.id)
    .eq("score_date", today)
    .maybeSingle();

  if (existing) return NextResponse.json({ score: existing });

  const score = await calculateMomentumScore(supabase, user.id);
  return NextResponse.json({ score: { ...score, user_id: user.id, score_date: today } });
}
