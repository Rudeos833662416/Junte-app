import { useCallback, useEffect, useState } from "react";
import { Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";
import { supabase } from "@/lib/supabase";

type Message = { id: string; sender_id: string; recipient_id: string; body: string; created_at: string; read_at: string | null };

export default function ChatScreen() {
  const colors = useColors();
  const { user } = useAuth({ autoFetch: true });
  const { id: otherId } = useLocalSearchParams<{ id: string }>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [otherName, setOtherName] = useState("Chat");

  const markAsRead = useCallback(async (friendId: string) => {
    if (!user) return;
    await supabase.from("direct_messages").update({ read_at: new Date().toISOString() }).eq("sender_id", friendId).eq("recipient_id", user.id).is("read_at", null);
  }, [user]);

  const loadMessages = useCallback(async () => {
    if (!user || !otherId) return;
    const { data, error } = await supabase.from("direct_messages").select("id, sender_id, recipient_id, body, created_at, read_at").or(`and(sender_id.eq.${user.id},recipient_id.eq.${otherId}),and(sender_id.eq.${otherId},recipient_id.eq.${user.id})`).order("created_at", { ascending: true });
    if (!error) setMessages((data ?? []) as Message[]);
    await markAsRead(otherId);
    const profile = await supabase.from("public_profiles").select("name").eq("id", otherId).maybeSingle();
    setOtherName(profile.data?.name?.trim() || "Chat");
  }, [markAsRead, otherId, user]);

  useFocusEffect(useCallback(() => {
    void loadMessages();
    return undefined;
  }, [loadMessages]));

  useEffect(() => {
    if (!user || !otherId) return;
    const channel = supabase.channel(`direct-messages-${user.id}-${otherId}`);
    channel.on("postgres_changes", { event: "INSERT", schema: "public", table: "direct_messages", filter: `recipient_id=eq.${user.id}` }, (payload) => {
      const row = payload.new as Message;
      if (row.sender_id === otherId) setMessages((current) => current.some((item) => item.id === row.id) ? current : [...current, row]);
    });
    channel.on("postgres_changes", { event: "INSERT", schema: "public", table: "direct_messages", filter: `sender_id=eq.${user.id}` }, (payload) => {
      const row = payload.new as Message;
      if (row.recipient_id === otherId) setMessages((current) => current.some((item) => item.id === row.id) ? current : [...current, row]);
    });
    channel.subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [loadMessages, otherId, user]);

  const sendMessage = async () => {
    const body = draft.trim();
    if (!user || !otherId || !body) return;
    setDraft("");
    const { data, error } = await supabase.from("direct_messages").insert({ sender_id: user.id, recipient_id: otherId, body }).select("id, sender_id, recipient_id, body, created_at, read_at").single();
    if (error) { setDraft(body); Alert.alert("No se pudo enviar", error.message); return; }
    if (data) setMessages((current) => current.some((item) => item.id === data.id) ? current : [...current, data as Message]);
  };

  return <ScreenContainer className="p-5">
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}>
      <View className="mb-4 flex-row items-center gap-3"><Pressable onPress={() => router.back()}><Text className="text-2xl" style={{ color: colors.primary }}>‹</Text></Pressable><Text className="text-2xl font-bold text-foreground">{otherName}</Text></View>
      <FlatList data={messages} keyExtractor={(item) => item.id} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8, paddingBottom: 16, flexGrow: 1 }} renderItem={({ item }) => <View className="max-w-[82%] rounded-2xl px-4 py-3" style={{ alignSelf: item.sender_id === user?.id ? "flex-end" : "flex-start", backgroundColor: item.sender_id === user?.id ? colors.primary : colors.surface }}><Text style={{ color: item.sender_id === user?.id ? colors.background : colors.foreground }}>{item.body}</Text></View>} />
      <View className="flex-row items-end gap-2 border-t pt-3" style={{ borderColor: colors.border }}><TextInput value={draft} onChangeText={setDraft} placeholder="Escribe un mensaje" placeholderTextColor={colors.muted} multiline returnKeyType="send" className="max-h-24 flex-1 rounded-2xl border px-4 py-3 text-foreground" style={{ borderColor: colors.border, color: colors.foreground, backgroundColor: colors.surface }} /><Pressable onPress={() => void sendMessage()} style={({ pressed }) => ({ borderRadius: 18, backgroundColor: colors.primary, paddingHorizontal: 16, paddingVertical: 13, opacity: pressed ? 0.7 : 1 })}><Text className="font-bold text-background">Enviar</Text></Pressable></View>
    </KeyboardAvoidingView>
  </ScreenContainer>;
}
