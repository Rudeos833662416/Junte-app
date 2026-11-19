import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as MediaLibrary from "expo-media-library";
import { MaterialIcons } from "@expo/vector-icons";

export type QuickCameraAsset = {
  uri: string;
  kind: "image" | "video";
  mimeType: string;
  fileSize?: number;
  durationMs?: number;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  onPick: (asset: QuickCameraAsset) => void;
};

function assetFromLibrary(asset: MediaLibrary.Asset): QuickCameraAsset {
  const video = asset.mediaType === MediaLibrary.MediaType.video;
  return { uri: asset.uri, kind: video ? "video" : "image", mimeType: video ? "video/mp4" : "image/jpeg", durationMs: video ? asset.duration * 1000 : undefined };
}

export function ChatQuickCamera({ visible, onClose, onPick }: Props) {
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [libraryPermission, requestLibraryPermission] = MediaLibrary.usePermissions();
  const [assets, setAssets] = useState<MediaLibrary.Asset[]>([]);
  const [facing, setFacing] = useState<"front" | "back">("back");
  const [flash, setFlash] = useState<"on" | "off">("off");
  const [mode, setMode] = useState<"picture" | "video">("picture");
  const [recording, setRecording] = useState(false);

  const loadRecent = useCallback(async () => {
    if (!libraryPermission?.granted) return;
    const result = await MediaLibrary.getAssetsAsync({ first: 12, mediaType: [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video], sortBy: [MediaLibrary.SortBy.creationTime] });
    setAssets(result.assets);
  }, [libraryPermission?.granted]);

  useEffect(() => {
    if (!visible) return;
    if (!permission?.granted) void requestPermission();
    if (!libraryPermission?.granted) void requestLibraryPermission();
    void loadRecent();
  }, [libraryPermission?.granted, loadRecent, permission?.granted, requestLibraryPermission, requestPermission, visible]);

  const capture = async () => {
    if (!cameraRef.current || recording) return;
    if (mode === "picture") {
      const result = await cameraRef.current.takePictureAsync({ quality: 0.85 });
      if (result?.uri) onPick({ uri: result.uri, kind: "image", mimeType: "image/jpeg" });
      return;
    }
    setRecording(true);
    try {
      const result = await cameraRef.current.recordAsync({ maxDuration: 90 });
      if (result?.uri) onPick({ uri: result.uri, kind: "video", mimeType: "video/mp4" });
    } finally {
      setRecording(false);
    }
  };

  if (!visible) return null;
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "#000" }}>
        {permission?.granted ? <CameraView ref={cameraRef} style={{ flex: 1 }} facing={facing} mode={mode} flash={flash} /> : <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}><ActivityIndicator color="#FFF" /><Text style={{ color: "#FFF", marginTop: 12, textAlign: "center" }}>Necesitamos permiso para usar la cámara.</Text></View>}
        <View style={{ position: "absolute", top: 48, left: 16, right: 16, flexDirection: "row", justifyContent: "space-between" }}>
          <Pressable onPress={onClose} accessibilityLabel="Cerrar cámara" style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 22, backgroundColor: "#0008" }}><MaterialIcons name="close" size={25} color="#FFF" /></Pressable>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable onPress={() => setFlash((current) => current === "on" ? "off" : "on")} accessibilityLabel="Cambiar flash" style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 22, backgroundColor: "#0008" }}><MaterialIcons name={flash === "on" ? "flash-on" : "flash-off"} size={22} color="#FFF" /></Pressable>
            <Pressable onPress={() => setFacing((current) => current === "back" ? "front" : "back")} accessibilityLabel="Cambiar cámara" style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 22, backgroundColor: "#0008" }}><MaterialIcons name="flip-camera-ios" size={22} color="#FFF" /></Pressable>
          </View>
        </View>
        <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, paddingBottom: 22, paddingTop: 12, backgroundColor: "#000B" }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 14, gap: 8 }}>
            {assets.map((asset) => <Pressable key={asset.id} onPress={() => onPick(assetFromLibrary(asset))} style={{ width: 56, height: 56, borderRadius: 8, overflow: "hidden", borderWidth: 1, borderColor: "#FFF6" }}><Image source={{ uri: asset.uri }} style={{ width: "100%", height: "100%" }} />{asset.mediaType === MediaLibrary.MediaType.video ? <MaterialIcons name="play-arrow" size={18} color="#FFF" style={{ position: "absolute", left: 19, top: 19 }} /> : null}</Pressable>)}
          </ScrollView>
          <View style={{ marginTop: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 28 }}>
            <Pressable onPress={() => setMode("picture")} style={{ padding: 8 }}><Text style={{ color: mode === "picture" ? "#FFF" : "#AAA", fontWeight: "800" }}>Foto</Text></Pressable>
            <Pressable onPress={capture} accessibilityLabel={mode === "video" ? "Grabar vídeo" : "Tomar foto"} style={{ width: 70, height: 70, borderRadius: 35, borderWidth: 5, borderColor: recording ? "#F33" : "#FFF", backgroundColor: recording ? "#F33" : "transparent" }} />
            <Pressable onPress={() => setMode("video")} style={{ padding: 8 }}><Text style={{ color: mode === "video" ? "#FFF" : "#AAA", fontWeight: "800" }}>Vídeo</Text></Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
