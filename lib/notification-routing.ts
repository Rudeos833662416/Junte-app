export type NotificationRouteData = {
  screen?: string;
  activityType?: string;
  senderId?: string;
  peerId?: string;
  actorName?: string;
  actorAvatarUrl?: string;
  chatId?: string;
  directMessageId?: string;
  postId?: string;
  storyId?: string;
  storyUserId?: string;
  friendshipId?: string;
  venueId?: string;
  focusLat?: string;
  focusLng?: string;
};

export type NotificationRoute =
  | { pathname: string; params?: Record<string, string> }
  | null;

/** Converts a push payload into one deterministic in-app destination. */
export function routeForNotification(data: NotificationRouteData): NotificationRoute {
  const screen = String(data.screen ?? "").toLowerCase();

  if (screen === "chat" || data.directMessageId) {
    const peerId = data.peerId ?? data.chatId ?? data.senderId;
    const params = {
      ...(data.actorName ? { name: data.actorName } : {}),
      ...(data.actorAvatarUrl ? { avatarUrl: data.actorAvatarUrl } : {}),
    };
    return peerId
      ? {
          pathname: `/chat/${peerId}`,
          ...(Object.keys(params).length ? { params } : {}),
        }
      : { pathname: "/messages" };
  }

  if (screen === "events" || data.postId) {
    return {
      pathname: "/(tabs)/events",
      ...(data.postId ? { params: { postId: data.postId } } : {}),
    };
  }

  if (screen === "stories" || data.storyId) {
    return {
      pathname: "/(tabs)/friends",
      params: {
        subTab: "stories",
        ...(data.storyId ? { storyId: data.storyId } : {}),
        ...(data.storyUserId ? { userId: data.storyUserId } : {}),
      },
    };
  }

  if (data.activityType === "check_in" || data.activityType === "check_out") {
    if (data.venueId) {
      return { pathname: "/(tabs)/map", params: { focusVenueId: data.venueId } };
    }
    return data.senderId ? { pathname: `/profile/${data.senderId}` } : { pathname: "/(tabs)/activity" };
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
