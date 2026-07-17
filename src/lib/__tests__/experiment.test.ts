import { describe, it, expect } from "vitest";
import { createFakeSupabase } from "./fake-supabase";
import { requireFullExperience } from "@/lib/experiment";

describe("requireFullExperience", () => {
  it("redirects control-group users away from full-experience pages", async () => {
    const supabase = createFakeSupabase({
      profiles: [{ id: "user-1", experiment_group: "control" }],
    });

    await expect(requireFullExperience(supabase, "user-1")).rejects.toMatchObject({
      digest: expect.stringContaining("NEXT_REDIRECT;replace;/dashboard"),
    });
  });

  it("does not redirect full-experience users", async () => {
    const supabase = createFakeSupabase({
      profiles: [{ id: "user-1", experiment_group: "full" }],
    });

    await expect(requireFullExperience(supabase, "user-1")).resolves.toBeUndefined();
  });
});
