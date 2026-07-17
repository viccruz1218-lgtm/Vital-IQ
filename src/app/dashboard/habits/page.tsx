import { createClient } from "@/lib/supabase/server";
import { HabitChecklist } from "@/components/dashboard/habit-checklist";
import { CreateHabitForm } from "@/components/dashboard/create-habit-form";
import { ArchiveHabitButton } from "@/components/dashboard/archive-habit-button";
import { Card, CardLabel } from "@/components/ui/card";
import { requireFullExperience } from "@/lib/experiment";

export default async function HabitsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  await requireFullExperience(supabase, user.id);

  const { data: habits } = await supabase
    .from("habits")
    .select("*")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: true });

  const today = new Date().toISOString().slice(0, 10);
  const habitIds = (habits ?? []).map((h) => h.id);

  const { data: todaysCompletions } =
    habitIds.length > 0
      ? await supabase
          .from("habit_completion")
          .select("habit_id")
          .in("habit_id", habitIds)
          .eq("date", today)
          .eq("completed", true)
      : { data: [] };

  const completedTodayIds = new Set((todaysCompletions ?? []).map((c) => c.habit_id));
  const habitsWithStatus = (habits ?? []).map((h) => ({
    ...h,
    completedToday: completedTodayIds.has(h.id),
  }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-xl font-semibold">Habits</h1>
        <p className="text-sm text-muted">Small, specific, and adjusted when they stop working.</p>
      </div>

      <HabitChecklist habits={habitsWithStatus} />

      <Card>
        <CardLabel>Add a habit</CardLabel>
        <div className="mt-3">
          <CreateHabitForm />
        </div>
      </Card>

      {habitsWithStatus.length > 0 && (
        <div>
          <CardLabel>All habits</CardLabel>
          <div className="mt-2 flex flex-col gap-2">
            {habitsWithStatus.map((h) => (
              <Card key={h.id}>
                <div className="flex items-center justify-between text-sm">
                  <div>
                    <span className="font-medium">{h.name}</span>
                    <span className="ml-2 font-mono text-xs capitalize text-muted">{h.category}</span>
                  </div>
                  <div className="flex items-center gap-4 font-mono text-xs text-muted">
                    <span>streak {h.current_streak}</span>
                    <span>best {h.longest_streak}</span>
                    <span>{Math.round(h.completion_rate * 100)}% / 30d</span>
                    <ArchiveHabitButton habitId={h.id} habitName={h.name} />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
