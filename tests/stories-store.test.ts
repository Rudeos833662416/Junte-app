import { afterEach, describe, expect, it } from "vitest";
import { getCachedStoryGroups, setCachedStoryGroups, subscribeStoryGroups, type GroupedStoryUser } from "../lib/stories-store";

const groups: GroupedStoryUser[] = [{
  userId: "friend-1",
  userName: "Amigo",
  avatarUrl: null,
  isSelf: false,
  stories: [],
  latestCreatedAt: "2026-01-01T00:00:00.000Z",
}];

afterEach(() => setCachedStoryGroups([]));

describe("stories-store", () => {
  it("comparte el snapshot y notifica a los suscriptores", () => {
    const received: GroupedStoryUser[][] = [];
    const unsubscribe = subscribeStoryGroups((next) => received.push(next));

    setCachedStoryGroups(groups);
    unsubscribe();
    setCachedStoryGroups([]);

    expect(getCachedStoryGroups()).toEqual([]);
    expect(received).toHaveLength(1);
    expect(received[0]).toEqual(groups);
  });
});
