import { ScreenContainer } from "@/components/screen-container";
import { Text } from "react-native";
export default function StoriesScreen() {
  return (
    <ScreenContainer className="p-6">
      <Text className="text-foreground">Historias (restaurando… reabre el chat para completar el archivo)</Text>
    </ScreenContainer>
  );
}
