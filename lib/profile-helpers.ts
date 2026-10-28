/** Helpers de perfil. */

export function displayName(profile: {
  name?: string | null;
  username?: string | null;
  email?: string | null;
}) {
  return (
    profile.name?.trim() ||
    profile.username?.trim() ||
    profile.email?.split("@")[0]?.trim() ||
    "Usuario"
  );
}

export function initials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}
