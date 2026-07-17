import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getTodaysWorkout } from "@/lib/todays-workout";
import { WorkoutLogger } from "@/components/dashboard/workout-logger";
import { Button } from "@/components/ui/button";

export default async function WorkoutPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const todaysWorkout = await getTodaysWorkout(supabase, user.id);

  if (!todaysWorkout) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-sm text-muted">No active plan yet. Ask Vi to build your first one.</p>
        <Link href="/dashboard/coach">
          <Button size="sm">Talk to Vi</Button>
        </Link>
      </div>
    );
  }

  return (
    <WorkoutLogger
      planDayId={todaysWorkout.day.id}
      dayLabel={`${todaysWorkout.day.day_label} (${todaysWorkout.dayNumber}/${todaysWorkout.totalDays})`}
      exercises={todaysWorkout.day.plan_exercises}
    />
  );
}
