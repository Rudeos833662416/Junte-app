import { describe, expect, it } from "vitest";
import { notificationResponseKey, routeForNotification } from "../lib/notification-routing";

describe("notification routing", () => {
  it("opens the WhatsApp-like chat with the sender", () => {
    expect(routeForNotification({ screen: "chat", senderId: "user-42", directMessageId: "msg-1" })).toEqual({
      pathname: "/chat/user-42",
    });
  });

  it("opens Events and carries the exact official post", () => {
    expect(routeForNotification({ screen: "events", postId: "post-9" })).toEqual({
      pathname: "/(tabs)/events",
      params: { postId: "post-9" },
    });
  });

  it("opens the requester's profile instead of a generic activity screen", () => {
    expect(routeForNotification({ screen: "friends", friendshipId: "17", senderId: "user-7" })).toEqual({
      pathname: "/profile/user-7",
    });
  });

  it("does not process the same response/action twice", () => {
    const response = {
      actionIdentifier: "com.apple.UNNotificationDefaultActionIdentifier",
      notification: { request: { identifier: "push-1" } },
    };
    expect(notificationResponseKey(response)).toBe(notificationResponseKey(response));
    expect(notificationResponseKey({ ...response, actionIdentifier: "CHAT_REPLY" })).not.toBe(
      notificationResponseKey(response),
    );
  });
});
