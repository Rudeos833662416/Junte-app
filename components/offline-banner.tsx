import NetInfo, { type NetInfoState } from "@react-native-community/netinfo";
import { useEffect, useState } from "react";
import { Platform, Text, View } from "react-native";

function onlineFromState(state: NetInfoState) {
  return state.isConnected !== false && state.isInternetReachable !== false;
}

export function useNetworkOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    let mounted = true;
    void NetInfo.fetch().then((state) => { if (mounted) setOnline(onlineFromState(state)); });
    const unsubscribe = NetInfo.addEventListener((state) => setOnline(onlineFromState(state)));
    return () => { mounted = false; unsubscribe(); };
  }, []);
  return online;
}

export function OfflineBanner() {
  const online = useNetworkOnline();
  if (online || Platform.OS === "web") return null;
  return (
    <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 100, alignItems: "center", paddingTop: 8, paddingBottom: 7, backgroundColor: "#242424" }}>
      <Text style={{ color: "#FFFFFF", fontSize: 12, fontWeight: "700" }}>Sin conexión · mostrando contenido guardado</Text>
    </View>
  );
}
