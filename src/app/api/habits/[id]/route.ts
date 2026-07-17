import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Archives (or reactivates) a habit — uses the existing "habits: update
// own" RLS policy, no new policy needed. There's no hard delete: archived
// habits stay in habit_completion/momentum history, they just stop
// counting toward planned commitments and drop off the active list.
export async function PATCH(request: Request, context: RouteContext<"/api/habits/[id]">) {
  const { id } = await context.params;
  const body = (await request.json()) as { status?: "active" | "archived" };

  if (body.status !== "archived" && body.status !== "active") {
    return NextResponse.json({ error: "status must be 'active' or 'archived'" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: habit } = await supabase.from("habits").select("id, user_id").eq("id", id).single();
  if (!habit || habit.user_id !== user.id) {
    return NextResponse.json({ error: "Habit not found" }, { status: 404 });
  }

  const { error } = await supabase.from("habits").update({ status: body.status }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
