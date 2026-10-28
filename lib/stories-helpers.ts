/** Helpers compartidos de Stories (extraídos para reducir acoplamiento). */

export function storyExpiresAt(hours = 24) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

export function isStoryActive(expiresAt: string, now = Date.now()) {
  return new Date(expiresAt).getTime() > now;
}

export function groupStoriesByUser<T extends { user_id: string; created_at: string }>(rows: T[]) {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const list = map.get(row.user_id) ?? [];
    list.push(row);
    map.set(row.user_id, list);
  }
  for (const [key, list] of map) {
    list.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    map.set(key, list);
  }
  return map;
}
