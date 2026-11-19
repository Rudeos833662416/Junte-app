import { useEffect, useState } from "react";
import { Alert, Modal, Pressable, Text, TextInput, View } from "react-native";
import * as Haptics from "expo-haptics";

export const CHAT_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"] as const;

type Props = {
  visible: boolean;
  messageId: string;
  body: string;
  mine: boolean;
  deleted?: boolean;
  hasMedia?: boolean;
  onClose: () => void;
  onReply: () => void;
  onCopy: () => void;
  onReact: (emoji: string) => void | Promise<void>;
  onEdit: (body: string) => void | Promise<void>;
  onDelete: () => void | Promise<void>;
};

export function ChatMessageActions({
  visible,
  body,
  mine,
  deleted = false,
  hasMedia = false,
  onClose,
  onReply,
  onCopy,
  onReact,
  onEdit,
  onDelete,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(body);

  useEffect(() => {
    if (visible) {
      setDraft(body);
      setEditing(false);
    }
  }, [body, visible]);

  const haptic = () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
  const closeAfter = (action: () => void | Promise<void>) => {
    haptic();
    onClose();
    void action();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.48)" }} onPress={onClose}>
        <Pressable onPress={() => undefined} style={{ padding: 18, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: "#181818", gap: 14 }}>
          <View style={{ flexDirection: "row", justifyContent: "center", gap: 8 }}>
            {CHAT_REACTIONS.map((emoji) => (
              <Pressable key={emoji} onPress={() => closeAfter(() => onReact(emoji))} accessibilityRole="button" accessibilityLabel={`Reaccionar ${emoji}`} style={{ width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: 21, backgroundColor: "#2A2A2A" }}>
                <Text style={{ fontSize: 21 }}>{emoji}</Text>
              </Pressable>
            ))}
          </View>
          {editing ? (
            <View style={{ gap: 10 }}>
              <TextInput value={draft} onChangeText={setDraft} autoFocus multiline maxLength={1000} style={{ minHeight: 80, borderRadius: 14, padding: 12, color: "#FFF", backgroundColor: "#2A2A2A" }} />
              <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 10 }}>
                <Pressable onPress={() => setEditing(false)} style={{ padding: 10 }}><Text style={{ color: "#BDBDBD", fontWeight: "700" }}>Cancelar</Text></Pressable>
                <Pressable onPress={() => { const next = draft.trim(); if (!next) { Alert.alert("Mensaje vacío", "Escribe algo antes de guardar."); return; } closeAfter(() => onEdit(next)); }} style={{ padding: 10 }}><Text style={{ color: "#FF6A00", fontWeight: "800" }}>Guardar</Text></Pressable>
              </View>
            </View>
          ) : (
            <>
              <Pressable onPress={() => closeAfter(onReply)} style={{ paddingVertical: 10 }}><Text style={{ color: "#FFF", fontSize: 16 }}>Responder</Text></Pressable>
              {!deleted && body ? <Pressable onPress={() => closeAfter(onCopy)} style={{ paddingVertical: 10 }}><Text style={{ color: "#FFF", fontSize: 16 }}>Copiar texto</Text></Pressable> : null}
              {mine && !deleted && !hasMedia && body ? <Pressable onPress={() => { haptic(); setEditing(true); }} style={{ paddingVertical: 10 }}><Text style={{ color: "#FFF", fontSize: 16 }}>Editar</Text></Pressable> : null}
              {mine && !deleted ? <Pressable onPress={() => closeAfter(onDelete)} style={{ paddingVertical: 10 }}><Text style={{ color: "#FF6B6B", fontSize: 16, fontWeight: "700" }}>Eliminar para todos</Text></Pressable> : null}
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
