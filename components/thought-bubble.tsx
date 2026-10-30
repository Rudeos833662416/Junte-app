import { Modal, Pressable, Text, TextInput, View } from "react-native";
import { useEffect, useState } from "react";
import { useColors } from "@/hooks/use-colors";

export const THOUGHT_MAX = 200;

type ThoughtBubbleProps = {
  text: string | null | undefined;
  /** Si true, al tocar abre el editor. */
  editable?: boolean;
  onSave?: (next: string) => Promise<void> | void;
  placeholder?: string;
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

  const bubbleBg = `${colors.surface}`;
  const border = colors.border;

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
        accessibilityLabel={editable ? "Editar pensamiento" : display || "Sin pensamiento"}
        style={{ alignItems: "center", maxWidth: 280, marginTop: 10 }}
      >
        <View
          style={{
            backgroundColor: bubbleBg,
            borderColor: border,
            borderWidth: 1.5,
            borderRadius: 22,
            paddingHorizontal: 16,
            paddingVertical: 12,
            minWidth: 120,
            maxWidth: 280,
            shadowColor: "#000",
            shadowOpacity: 0.18,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 3 },
            elevation: 4,
          }}
        >
          <Text
            style={{
              color: display ? colors.foreground : colors.muted,
              fontSize: 13,
              lineHeight: 18,
              textAlign: "center",
              fontWeight: display ? "500" : "400",
            }}
          >
            {display || (editable ? placeholder : "…")}
          </Text>
          {editable && !display ? (
            <Text
              style={{
                marginTop: 4,
                color: colors.muted,
                fontSize: 10,
                textAlign: "center",
              }}
            >
              Toca para escribir
            </Text>
          ) : null}
        </View>

        {/* Cola de pensamiento: tres esferas hacia abajo (hacia avatar/nombre) */}
        <View style={{ alignItems: "center", marginTop: 2 }}>
          <View
            style={{
              width: 12,
              height: 12,
              borderRadius: 6,
              backgroundColor: bubbleBg,
              borderWidth: 1.5,
              borderColor: border,
              marginLeft: -18,
            }}
          />
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: bubbleBg,
              borderWidth: 1.5,
              borderColor: border,
              marginTop: 2,
              marginLeft: -28,
            }}
          />
          <View
            style={{
              width: 5,
              height: 5,
              borderRadius: 3,
              backgroundColor: bubbleBg,
              borderWidth: 1,
              borderColor: border,
              marginTop: 2,
              marginLeft: -36,
            }}
          />
        </View>
      </Pressable>

      <Modal visible={open} animationType="fade" transparent onRequestClose={() => setOpen(false)}>
        <Pressable
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.55)",
            justifyContent: "center",
            padding: 24,
          }}
          onPress={() => setOpen(false)}
        >
          <Pressable
            onPress={(e) => e.stopPropagation?.()}
            style={{
              borderRadius: 20,
              borderWidth: 1,
              borderColor: border,
              backgroundColor: colors.surface,
              padding: 18,
            }}
          >
            <Text style={{ color: colors.foreground, fontWeight: "800", fontSize: 17, marginBottom: 10 }}>
              Tu pensamiento
            </Text>
            <TextInput
              value={draft}
              onChangeText={(v) => setDraft(v.slice(0, THOUGHT_MAX + 10))}
              placeholder={placeholder}
              placeholderTextColor={colors.muted}
              multiline
              autoFocus
              maxLength={THOUGHT_MAX}
              style={{
                minHeight: 100,
                borderWidth: 1,
                borderColor: border,
                borderRadius: 14,
                padding: 12,
                color: colors.foreground,
                backgroundColor: colors.background,
                textAlignVertical: "top",
                fontSize: 15,
                lineHeight: 21,
              }}
            />
            <Text
              style={{
                marginTop: 8,
                textAlign: "right",
                fontSize: 12,
                fontWeight: "600",
                color: over ? "#ef4444" : colors.muted,
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
                  borderColor: border,
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
