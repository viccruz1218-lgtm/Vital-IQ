import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { recordActivity } from "@/lib/streak";
import { touchDaysSinceEvent } from "@/lib/days-since";
import { calculateMomentumScore } from "@/lib/momentum";
import { track } from "@/lib/analytics";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    energy_level: number;
    soreness: number;
    notes?: string;
  };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const today = new Date().toISOString().slice(0, 10);

  const { data: checkIn, error } = await supabase
    .from("check_ins")
    .upsert(
      {
        user_id: user.id,
        check_in_date: today,
        energy_level: body.energy_level,
        soreness: body.soreness,
        notes: body.notes ?? null,
      },
      { onConflict: "user_id,check_in_date" },
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await recordActivity(supabase, user.id);
  await touchDaysSinceEvent(supabase, user.id, "check_in");
  await calculateMomentumScore(supabase, user.id);
  await track(supabase, user.id, "check_in_submitted", {});

  return NextResponse.json({ checkIn });
}
