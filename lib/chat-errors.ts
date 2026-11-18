type SupabaseLikeError = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
};

export function friendlyChatError(error: SupabaseLikeError) {
  const code = error.code ?? "";
  const message = error.message ?? "";
  const normalized = message.toLowerCase();

  if (code === "42501" || normalized.includes("row-level security") || normalized.includes("permission denied")) {
    return "No tienes permiso para enviarle mensajes a esta persona. Verifica que sean amigos y que no exista un bloqueo.";
  }
  if (code === "23514") {
    return "El tipo de mensaje no es compatible con la base de datos actual. Actualiza la aplicación o aplica la migración de Chat.";
  }
  if (code === "23503") {
    return "La conversación ya no está disponible porque el usuario o la referencia relacionada no existe.";
  }
  if (code === "42P01" || code === "42703" || code === "PGRST204") {
    return "La base de datos de Chat está desactualizada. Aplica las migraciones pendientes en Supabase.";
  }
  if (normalized.includes("network request failed") || normalized.includes("failed to fetch") || normalized.includes("fetch failed")) {
    return "No se pudo conectar con Supabase. Comprueba tu conexión a Internet e inténtalo de nuevo.";
  }
  return message || "No se pudo completar la operación de Chat.";
}
