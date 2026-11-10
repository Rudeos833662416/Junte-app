export type NotificationRouteData = {
  screen?: string;
  senderId?: string;
  chatId?: string;
  directMessageId?: string;
  postId?: string;
  storyId?: string;
  storyUserId?: string;
  friendshipId?: string;
};

export type NotificationRoute =
  | { pathname: string; params?: Record<string, string> }
  | null;

/** Converts a push payload into one deterministic in-app destination. */
export function routeForNotification(data: NotificationRouteData): NotificationRoute {
  const screen = String(data.screen ?? "").toLowerCase();

  if (screen === "chat" || data.directMessageId) {
    const peerId = data.chatId ?? data.senderId;
    return peerId ? { pathname: `/chat/${peerId}` } : { pathname: "/messages" };
  }

  if (screen === "events" || data.postId) {
    return {
      pathname: "/(tabs)/events",
      ...(data.postId ? { params: { postId: data.postId } } : {}),
    };
  }

  if (screen === "stories" || data.storyId) {
    return {
      pathname: "/(tabs)/stories",
      params: {
        ...(data.storyId ? { storyId: data.storyId } : {}),
        ...(data.storyUserId ? { userId: data.storyUserId } : {}),
      },
    };
  }

  if (screen === "friends" || data.friendshipId) {
    return data.senderId
      ? { pathname: `/profile/${data.senderId}` }
      : { pathname: "/(tabs)/friends" };
  }

  if (screen === "activity") return { pathname: "/(tabs)/activity" };
  return null;
}

export function notificationResponseKey(response: {
  actionIdentifier?: string;
  notification?: { request?: { identifier?: string } };
}): string {
  const requestId = response.notification?.request?.identifier ?? "unknown";
  return `${requestId}:${response.actionIdentifier ?? "default"}`;
}
