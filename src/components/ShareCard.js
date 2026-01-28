import { View, Text, Pressable, ToastAndroid, Platform } from "react-native";
import Clipboard from "@react-native-clipboard/clipboard";

export default function ShareCard({ codigo, uso = 0, onCompartilhar }) {
  if (!codigo) return null;

  const progresso = Math.min(uso * 10, 100);

  // Copiar LINK COMPLETO
  function copiarCodigo() {
    const link = `https://rifa-digital-f6425.web.app/ref?code=${codigo}`;
    Clipboard.setString(link);
    if (Platform.OS === "android") {
      ToastAndroid.show("Link copiado! ??", ToastAndroid.SHORT);
    } else {
      alert("Link copiado! ??");
    }
  }

  // Compartilhar link
  function compartilhar() {
    if (onCompartilhar) onCompartilhar();
  }

  return (
    <View
      style={{
        backgroundColor: "#1e40af",
        padding: 24,
        borderRadius: 16,
        marginTop: 24,
        alignItems: "center",
        shadowColor: "#000",
        shadowOpacity: 0.3,
        shadowOffset: { width: 0, height: 4 },
        shadowRadius: 8,
        elevation: 6,
      }}
    >
      <Text style={{ color: "#fff", fontSize: 20, fontWeight: "bold", marginBottom: 10, textAlign: "center" }}>
        ?? Convide amigos e suba no ranking
      </Text>

      <Text style={{ color: "#facc15", fontSize: 28, fontWeight: "bold", marginBottom: 12, letterSpacing: 1 }}>
        {codigo}
      </Text>

      <Text style={{ color: "#e5e7eb", fontSize: 14, textAlign: "center", marginBottom: 16, lineHeight: 20 }}>
        Cada novo usu¨¢rio com seu c¨®digo fortalece sua posi??o{"\n"}
        Compartilhe, avance e domine o ranking
      </Text>

      <View style={{ width: "100%", marginBottom: 16 }}>
        <View style={{ height: 10, backgroundColor: "#334155", borderRadius: 6, overflow: "hidden" }}>
          <View style={{ width: `${progresso}%`, height: "100%", backgroundColor: "#facc15" }} />
        </View>
        <Text style={{ color: "#cbd5f5", fontSize: 12, marginTop: 6, textAlign: "center" }}>
          {uso} pessoas j¨¢ entraram com seu c¨®digo
        </Text>
      </View>

      <View style={{ flexDirection: "row", width: "100%" }}>
        <Pressable
          onPress={copiarCodigo}
          style={{
            backgroundColor: "#f59e0b",
            paddingVertical: 12,
            flex: 1,
            marginRight: 6,
            borderRadius: 12,
            alignItems: "center",
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "bold" }}>?? Copiar Link</Text>
        </Pressable>

        <Pressable
          onPress={compartilhar}
          style={{
            backgroundColor: "#ef4444",
            paddingVertical: 12,
            flex: 1,
            marginLeft: 6,
            borderRadius: 12,
            alignItems: "center",
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "bold" }}>?? Compartilhar</Text>
        </Pressable>
      </View>
    </View>
  );
}
