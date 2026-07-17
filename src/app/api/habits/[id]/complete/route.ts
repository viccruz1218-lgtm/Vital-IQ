import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { completeHabit } from "@/lib/habits";
import { touchDaysSinceEvent } from "@/lib/days-since";
import { calculateMomentumScore } from "@/lib/momentum";
import { track } from "@/lib/analytics";

export async function POST(request: Request, context: RouteContext<"/api/habits/[id]/complete">) {
  const { id } = await context.params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: habit } = await supabase
    .from("habits")
    .select("id, user_id, name, category")
    .eq("id", id)
    .single();

  if (!habit || habit.user_id !== user.id) {
    return NextResponse.json({ error: "Habit not found" }, { status: 404 });
  }

  const result = await completeHabit(supabase, id);

  // Days Since mapping: workout and check-in come from their own unambiguous
  // tables (see workouts/log and checkin routes). Nutrition-category habits
  // map directly to the "nutrition_habit" counter; a habit named like
  // "morning routine" maps to that counter specifically — a pragmatic v1
  // heuristic since habits don't yet carry a dedicated days-since tag.
  if (habit.category === "nutrition") {
    await touchDaysSinceEvent(supabase, user.id, "nutrition_habit");
  }
  if (/morning/i.test(habit.name)) {
    await touchDaysSinceEvent(supabase, user.id, "morning_routine");
  }

  await calculateMomentumScore(supabase, user.id);
  await track(supabase, user.id, "habit_completed", { habit_id: id, category: habit.category });

  return NextResponse.json(result);
}
