import { Card, CardLabel } from "@/components/ui/card";
import type { DaysSinceEvent, DaysSinceEventType } from "@/types/database";

const LABELS: Record<DaysSinceEventType, string> = {
  workout: "Workout",
  nutrition_habit: "Nutrition habit",
  morning_routine: "Morning routine",
  check_in: "Check-in",
};

export function DaysSinceCard({ events }: { events: DaysSinceEvent[] }) {
  if (events.length === 0) {
    return (
      <Card>
        <CardLabel>Days since</CardLabel>
        <p className="mt-1 text-sm text-muted">Nothing tracked yet — log a workout or complete a habit to start.</p>
      </Card>
    );
  }

  return (
    <Card>
      <CardLabel>Days since</CardLabel>
      <div className="mt-2 flex flex-wrap gap-2">
        {events.map((e) => (
          <span
            key={e.event_type}
            className={`rounded-full border px-2.5 py-1 font-mono text-xs ${
              e.current_days >= 7
                ? "border-pulse/40 text-pulse"
                : "border-border text-muted"
            }`}
          >
            {LABELS[e.event_type]}: {e.current_days}d
          </span>
        ))}
      </div>
    </Card>
  );
}
