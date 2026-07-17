import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateWeeklyReview } from "@/lib/weekly-review";
import { track } from "@/lib/analytics";

// Returns the most recently completed week's review, generating it (via
// Claude, or deterministically for an empty week) if it doesn't exist yet.
// Manual on-demand fallback for the nightly cron's automatic Sunday
// generation — see src/app/api/cron/nightly/route.ts.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const review = await generateWeeklyReview(supabase, user.id);
  await track(supabase, user.id, "weekly_review_opened", { week_start: review.week_start });

  return NextResponse.json({ review });
}
