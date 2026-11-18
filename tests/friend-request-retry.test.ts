import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const friendsSource = readFileSync(resolve(process.cwd(), "app/(tabs)/friends.tsx"), "utf8");
const pushSource = readFileSync(resolve(process.cwd(), "lib/push-notifications.ts"), "utf8");
const layoutSource = readFileSync(resolve(process.cwd(), "app/_layout.tsx"), "utf8");
const edgeSource = readFileSync(resolve(process.cwd(), "supabase/functions/notification-action/index.ts"), "utf8");

describe("friend request rejection", () => {
  it("deletes a rejected request instead of storing blocked", () => {
    expect(friendsSource).toContain('status === "rejected"');
    expect(friendsSource).toContain('.delete().eq("id", requestId)');
    expect(friendsSource).toContain('respondToRequest(request.id, "rejected")');
  });

  it("uses the same retryable behavior from push actions and Edge Function", () => {
    expect(pushSource).toContain('status: "accepted" | "rejected"');
    expect(layoutSource).toContain('respondToFriendRequest(data.friendshipId, "rejected", user.id)');
    expect(edgeSource).toContain('.from("friendships")\n            .delete()');
  });
});
