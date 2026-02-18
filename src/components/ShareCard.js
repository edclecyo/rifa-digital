import { View, Text, Pressable, ToastAndroid, Platform, Animated } from "react-native";
import Clipboard from "@react-native-clipboard/clipboard";
import { useEffect, useRef } from "react";

export default function ShareCard({ codigo, uso = 0, onCompartilhar }) {
  if (!codigo) return null;

  const progresso = Math.min(uso * 10, 100);
  const progressoAnim = useRef(new Animated.Value(0)).current;

  // Anima??o da barra de progresso
  useEffect(() => {
    Animated.timing(progressoAnim, {
      toValue: progresso,
      duration: 800,
      useNativeDriver: false,
    }).start();
  }, [progresso]);

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
        padding: 16,
        borderRadius: 12,
        marginTop: 16,
        alignItems: "center",
        shadowColor: "#000",
        shadowOpacity: 0.25,
        shadowOffset: { width: 0, height: 3 },
        shadowRadius: 5,
        elevation: 5,
      }}
    >
      {/* T¨ªtulo e c¨®digo */}
      <Text
        style={{
          color: "#fff",
          fontSize: 16,
          fontWeight: "bold",
          marginBottom: 4,
          textAlign: "center",
        }}
      >
        ?? Convide amigos e suba no ranking
      </Text>

      <Text
        style={{
          color: "#facc15",
          fontSize: 22,
          fontWeight: "bold",
          marginBottom: 4,
          letterSpacing: 1,
        }}
      >
        {codigo}
      </Text>

      {/* Badge de progresso */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: "#334155",
          borderRadius: 20,
          paddingHorizontal: 12,
          paddingVertical: 6,
          marginBottom: 8,
        }}
      >
        <Text style={{ color: "#fff", fontSize: 12, fontWeight: "bold" }}>
          ?? {uso} amigos entraram com seu c¨®digo
        </Text>
        <View
          style={{
            flex: 1,
            height: 8,
            backgroundColor: "#334155",
            borderRadius: 4,
            marginLeft: 8,
            overflow: "hidden",
          }}
        >
          <Animated.View
            style={{
              width: progressoAnim.interpolate({
                inputRange: [0, 100],
                outputRange: ["0%", "100%"],
              }),
              height: "100%",
              backgroundColor: "#facc15",
              borderRadius: 4,
            }}
          />
        </View>
      </View>

      {/* Texto motivacional */}
      <Text
        style={{
          color: "#e5e7eb",
          fontSize: 12,
          textAlign: "center",
          marginBottom: 12,
        }}
      >
        Cada amigo que usar seu c¨®digo aumenta suas chances de ganhar ??
      </Text>

      {/* Bot?es compactos */}
      <View style={{ flexDirection: "row", width: "100%" }}>
        <Pressable
          onPress={copiarCodigo}
          style={{
            backgroundColor: "#f59e0b",
            paddingVertical: 8,
            flex: 1,
            marginRight: 6,
            borderRadius: 10,
            alignItems: "center",
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 12 }}>?? Copiar Link</Text>
        </Pressable>

        <Pressable
          onPress={compartilhar}
          style={{
            backgroundColor: "#ef4444",
            paddingVertical: 8,
            flex: 1,
            marginLeft: 6,
            borderRadius: 10,
            alignItems: "center",
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 12 }}>?? Compartilhar</Text>
        </Pressable>
      </View>
    </View>
  );
}
