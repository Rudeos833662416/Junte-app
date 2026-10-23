import { supabase } from "@/lib/supabase";

export async function syncProfileLocation(userId: string, latitude: number, longitude: number) {
  const { error } = await supabase.from("profile_locations").upsert(
    {
      user_id: userId,
      latitude,
      longitude,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) console.warn("No se pudo sincronizar la ubicación compartida:", error.message);
}

export async function clearProfileLocation(userId: string) {
  const { error } = await supabase.from("profile_locations").delete().eq("user_id", userId);
  if (error) console.warn("No se pudo retirar la ubicación compartida:", error.message);
}
