import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { track } from "@/lib/analytics";

export async function POST(request: Request) {
  const body = (await request.json()) as { weight_kg?: number };
  if (typeof body.weight_kg !== "number" || body.weight_kg < 30 || body.weight_kg > 300) {
    return NextResponse.json({ error: "weight_kg must be a number between 30 and 300" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const today = new Date().toISOString().slice(0, 10);

  const { data: weightLog, error } = await supabase
    .from("weight_logs")
    .upsert(
      { user_id: user.id, logged_date: today, weight_kg: body.weight_kg },
      { onConflict: "user_id,logged_date" },
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await track(supabase, user.id, "weight_logged", { weight_kg: body.weight_kg });

  return NextResponse.json({ weightLog });
}
