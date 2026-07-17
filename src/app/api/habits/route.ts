import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { track } from "@/lib/analytics";
import type { HabitCategory } from "@/types/database";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: habits } = await supabase
    .from("habits")
    .select("*")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: true });

  return NextResponse.json({ habits: habits ?? [] });
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    name: string;
    category: HabitCategory;
    frequency: number;
  };

  if (!body.name?.trim() || !body.category || !body.frequency) {
    return NextResponse.json({ error: "name, category, and frequency are required" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Free-tier habit caps are a post-alpha concern — every alpha user runs
  // uncapped so the consistency-rate experiment isn't confounded by pricing.
  const { data: habit, error } = await supabase
    .from("habits")
    .insert({
      user_id: user.id,
      name: body.name.trim(),
      category: body.category,
      frequency: body.frequency,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await track(supabase, user.id, "habit_created", { source: "manual", category: body.category });

  return NextResponse.json({ habit });
}
