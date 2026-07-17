import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { recordActivity } from "@/lib/streak";
import { getPreviousBest } from "@/lib/overload";
import { touchDaysSinceEvent } from "@/lib/days-since";
import { calculateMomentumScore } from "@/lib/momentum";
import { track } from "@/lib/analytics";

interface SetInput {
  exercise_name: string;
  set_number: number;
  reps: number;
  weight_kg: number;
}

// workout_logs has no unique constraint (unlike habit_completion/check_ins,
// which are legitimately once-per-day and use an upsert onConflict) — a user
// can log multiple real sessions in a day, so a hard DB constraint would be
// wrong here. This only guards the actual failure mode: an accidental
// double-click or client retry landing within a few seconds of the first.
const DUPLICATE_SUBMIT_WINDOW_MS = 10_000;

export async function POST(request: Request) {
  const body = (await request.json()) as {
    planDayId?: string;
    notes?: string;
    sets: SetInput[];
  };

  if (!body.sets?.length) {
    return NextResponse.json({ error: "At least one set is required" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const recentCutoff = new Date(Date.now() - DUPLICATE_SUBMIT_WINDOW_MS).toISOString();
  let recentQuery = supabase
    .from("workout_logs")
    .select("id")
    .eq("user_id", user.id)
    .gte("created_at", recentCutoff);
  recentQuery = body.planDayId ? recentQuery.eq("plan_day_id", body.planDayId) : recentQuery.is("plan_day_id", null);
  const { data: recentLog } = await recentQuery.limit(1).maybeSingle();

  if (recentLog) {
    return NextResponse.json(
      { error: "This workout was already logged a moment ago — refresh before logging another." },
      { status: 409 },
    );
  }

  const { data: workoutLog, error: logError } = await supabase
    .from("workout_logs")
    .insert({ user_id: user.id, plan_day_id: body.planDayId ?? null, notes: body.notes ?? null })
    .select()
    .single();

  if (logError || !workoutLog) {
    return NextResponse.json({ error: logError?.message ?? "Failed to save workout" }, { status: 500 });
  }

  const { error: setsError } = await supabase.from("set_logs").insert(
    body.sets.map((s) => ({
      workout_log_id: workoutLog.id,
      exercise_name: s.exercise_name,
      set_number: s.set_number,
      reps: s.reps,
      weight_kg: s.weight_kg,
    })),
  );

  if (setsError) {
    return NextResponse.json({ error: setsError.message }, { status: 500 });
  }

  await recordActivity(supabase, user.id);
  await touchDaysSinceEvent(supabase, user.id, "workout");
  await calculateMomentumScore(supabase, user.id);
  await track(supabase, user.id, "workout_logged", { set_count: body.sets.length });

  const uniqueExercises = Array.from(new Set(body.sets.map((s) => s.exercise_name)));
  const overload = await Promise.all(
    uniqueExercises.map(async (name) => ({
      exercise_name: name,
      previousBest: await getPreviousBest(supabase, user.id, name, workoutLog.id),
      thisSessionBest: body.sets
        .filter((s) => s.exercise_name === name)
        .reduce((best, s) => (!best || s.weight_kg > best.weight_kg ? s : best), null as SetInput | null),
    })),
  );

  return NextResponse.json({ workoutLog, overload });
}
