import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { createClient, type SupportedStorage } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

const extra = Constants.expoConfig?.extra as
  | { supabaseUrl?: string; supabaseAnonKey?: string }
  | undefined;

const publicSupabaseUrl = "https://cymhbwgxmezrwofkbdqz.supabase.co";
const publicSupabaseAnonKey = "sb_publishable_V-Tjv6qV2JaEdXyumlGZ8w_HbdPp7iD";
const supabaseUrl = extra?.supabaseUrl ?? process.env.SUPABASE_URL ?? publicSupabaseUrl;
const supabaseAnonKey = extra?.supabaseAnonKey ?? process.env.SUPABASE_ANON_KEY ?? publicSupabaseAnonKey;
export const SUPABASE_URL = supabaseUrl;
export const SUPABASE_ANON_KEY = supabaseAnonKey;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Supabase is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY.");
}

const serverStorage: SupportedStorage = {
  getItem: async () => null,
  setItem: async () => undefined,
  removeItem: async () => undefined,
};

const storage: SupportedStorage =
  Platform.OS !== "web"
    ? AsyncStorage
    : typeof window !== "undefined"
      ? window.localStorage
      : serverStorage;

export const SUPABASE_AUTH_REDIRECT = "socialsip://auth/callback";
const exchangedAuthCodes = new Set<string>();

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === "web",
    flowType: "pkce",
  },
  db: { schema: "public" },
});

export async function completeSupabaseAuthUrl(url: string) {
  const parsedUrl = new URL(url);
  const errorDescription = parsedUrl.searchParams.get("error_description");
  if (errorDescription) throw new Error(errorDescription);

  const code = parsedUrl.searchParams.get("code");
  if (code) {
    if (exchangedAuthCodes.has(code)) {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      return data.session;
    }

    exchangedAuthCodes.add(code);
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      exchangedAuthCodes.delete(code);
      throw error;
    }
    return data.session;
  }

  const hashParams = new URLSearchParams(parsedUrl.hash.replace(/^#/, ""));
  const accessToken = hashParams.get("access_token");
  const refreshToken = hashParams.get("refresh_token");
  if (accessToken && refreshToken) {
    const { data, error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error) throw error;
    return data.session;
  }

  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}
