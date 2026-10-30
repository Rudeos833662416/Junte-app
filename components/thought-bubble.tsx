import { Modal, Pressable, Text, TextInput, View, StyleSheet } from "react-native";
import { useEffect, useState } from "react";
import { useColors } from "@/hooks/use-colors";

/** Límite al guardar (DB); la UI no recorta el texto en pantalla. */
export const THOUGHT_MAX = 200;

type ThoughtBubbleProps = {
  text: string | null | undefined;
  editable?: boolean;
  onSave?: (next: string) => Promise<void> | void;
  placeholder?: string;
  /** Sobre el borde superior derecho del avatar. */
  floating?: boolean;
};

/**
 * Nube de pensamiento sobre el avatar.
 * Sin numberOfLines ni ellipsis: el texto hace wrap completo.
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
          },
          floating ? styles.floating : styles.inline,
        ]}
      >
        <Text
          style={{
            color: display ? colors.foreground : colors.muted,
            fontSize: 13,
            lineHeight: 18,
            fontWeight: display ? "600" : "500",
          }}
        >
          {display || placeholder}
        </Text>
        <View style={[styles.pointer, { borderTopColor: colors.surface }]} />
        <View style={[styles.pointerBorder, { borderTopColor: colors.border }]} />
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
              Visible en tu perfil. Máximo {THOUGHT_MAX} caracteres al guardar.
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
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  floating: {
    maxWidth: 220,
    minWidth: 96,
    elevation: 6,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  inline: {
    marginTop: 8,
    alignSelf: "center",
    maxWidth: "92%",
  },
  pointer: {
    position: "absolute",
    bottom: -7,
    left: 22,
    width: 0,
    height: 0,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderTopWidth: 8,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
  },
  pointerBorder: {
    position: "absolute",
    bottom: -9,
    left: 21,
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderTopWidth: 9,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    zIndex: -1,
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
