import { Modal, Pressable, Text, TextInput, View, StyleSheet } from "react-native";
import { useEffect, useState } from "react";
import { useColors } from "@/hooks/use-colors";

export const THOUGHT_MAX = 200;

type ThoughtBubbleProps = {
  text: string | null | undefined;
  editable?: boolean;
  onSave?: (next: string) => Promise<void> | void;
  placeholder?: string;
  /** Burbuja flotante sobre el avatar (esquina superior derecha). */
  floating?: boolean;
};

/**
 * Nubecita estilo pensamiento/cómic.
 * Propietario: editable (modal 200 chars).
 * Visitante: solo lectura.
 */
export function ThoughtBubble({
  text,
  editable = false,
  onSave,
  placeholder = "¿En qué estás pensando?",
  floating = false,
}: ThoughtBubbleProps) {
  const colors = useColors();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(text?.trim() ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) setDraft(text?.trim() ?? "");
  }, [text, open]);

  const display = text?.trim() || "";
  const count = draft.length;
  const over = count > THOUGHT_MAX;

  if (!display && !editable) return null;

  const openEditor = () => {
    if (!editable) return;
    setDraft(text?.trim() ?? "");
    setOpen(true);
  };

  const handleSave = async () => {
    if (!onSave || over) return;
    const next = draft.trim().slice(0, THOUGHT_MAX);
    setSaving(true);
    try {
      await onSave(next);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Pressable
        onPress={openEditor}
        disabled={!editable}
        accessibilityRole={editable ? "button" : "text"}
        accessibilityLabel={editable ? "Editar biografía" : display || "Sin biografía"}
        style={[
          styles.bubble,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            maxWidth: floating ? 168 : 280,
          },
          floating ? styles.floating : null,
        ]}
      >
        <Text
          numberOfLines={floating ? 4 : 6}
          style={{
            color: display ? colors.foreground : colors.muted,
            fontSize: floating ? 12 : 14,
            lineHeight: floating ? 16 : 20,
            fontWeight: display ? "600" : "500",
          }}
        >
          {display || placeholder}
        </Text>
        <View style={[styles.tailOuter, { backgroundColor: colors.border }]} />
        <View style={[styles.tailInner, { backgroundColor: colors.surface }]} />
        <View style={[styles.dotLarge, { backgroundColor: colors.surface, borderColor: colors.border }]} />
        <View style={[styles.dotSmall, { backgroundColor: colors.surface, borderColor: colors.border }]} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setOpen(false)}>
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={[styles.modalCard, { backgroundColor: colors.background, borderColor: colors.border }]}
          >
            <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: "800", marginBottom: 8 }}>
              Tu pensamiento
            </Text>
            <Text style={{ color: colors.muted, fontSize: 12, marginBottom: 10 }}>
              Visible en tu perfil para quienes puedan verlo.
            </Text>
            <TextInput
              value={draft}
              onChangeText={(v) => setDraft(v.slice(0, THOUGHT_MAX + 5))}
              placeholder={placeholder}
              placeholderTextColor={colors.muted}
              multiline
              maxLength={THOUGHT_MAX}
              style={{
                minHeight: 100,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 14,
                padding: 12,
                color: colors.foreground,
                textAlignVertical: "top",
              }}
            />
            <Text
              style={{
                color: over ? "#ef4444" : colors.muted,
                fontSize: 12,
                marginTop: 6,
                textAlign: "right",
              }}
            >
              {Math.min(count, THOUGHT_MAX)}/{THOUGHT_MAX}
            </Text>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
              <Pressable
                onPress={() => setOpen(false)}
                style={{
                  flex: 1,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: colors.border,
                  paddingVertical: 12,
                  alignItems: "center",
                }}
              >
                <Text style={{ color: colors.foreground, fontWeight: "600" }}>Cancelar</Text>
              </Pressable>
              <Pressable
                onPress={() => void handleSave()}
                disabled={saving || over}
                style={{
                  flex: 1,
                  borderRadius: 12,
                  backgroundColor: colors.primary,
                  paddingVertical: 12,
                  alignItems: "center",
                  opacity: saving || over ? 0.55 : 1,
                }}
              >
                <Text style={{ color: colors.background, fontWeight: "700" }}>
                  {saving ? "…" : "Guardar"}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  bubble: {
    borderWidth: 1,
    borderRadius: 18,
    borderTopRightRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 8,
  },
  floating: {
    position: "absolute",
    top: -8,
    right: -12,
    zIndex: 5,
    elevation: 6,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  tailOuter: {
    position: "absolute",
    left: 18,
    bottom: -7,
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  tailInner: {
    position: "absolute",
    left: 20,
    bottom: -5,
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  dotLarge: {
    position: "absolute",
    left: 10,
    bottom: -16,
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1,
  },
  dotSmall: {
    position: "absolute",
    left: 4,
    bottom: -24,
    width: 5,
    height: 5,
    borderRadius: 3,
    borderWidth: 1,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 18,
  },
});
