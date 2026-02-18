import { useState, useRef, useEffect } from "react";
import { View, Text, Pressable, Animated, Easing, Platform, ToastAndroid, Modal, Dimensions } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const { width } = Dimensions.get("window");
const ROLETTE_SIZE = width * 0.8; // tamanho da roleta

const premiosRoleta = [
  { label: "🎟️ Cartela grátis", tipo: "cartela", valor: 1, color: "#34d399" },
  { label: "💸 R$0,25", tipo: "dinheiro", valor: 0.25, color: "#facc15" },
  { label: "❌ Nada", tipo: "nada", valor: 0, color: "#ef4444" },
  { label: "🎟️ Cartela grátis", tipo: "cartela", valor: 1, color: "#34d399" },
  { label: "💸 R$0,25", tipo: "dinheiro", valor: 0.25, color: "#facc15" },
  { label: "❌ Nada", tipo: "nada", valor: 0, color: "#ef4444" },
];

export default function RoletaCassinoModal({ visible, onClose, onPremio }) {
  const [girando, setGirando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const animatedValue = useRef(new Animated.Value(0)).current;

  async function girarRoleta() {
    if (girando) return;

    setGirando(true);
    setResultado(null);

    const indice = Math.floor(Math.random() * premiosRoleta.length);
    const premio = premiosRoleta[indice];

    const totalGiros = 5; // voltas completas
    const anguloPorSegmento = 360 / premiosRoleta.length;
    const anguloFinal = totalGiros * 360 + indice * anguloPorSegmento + anguloPorSegmento / 2;

    Animated.timing(animatedValue, {
      toValue: anguloFinal,
      duration: 4500,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(async () => {
      setGirando(false);
      setResultado(premio);

      // Bloqueia roleta para o dia
      const hoje = new Date().toDateString();
      await AsyncStorage.setItem("@roleta_lastSpin", hoje);

      const msg = premio.tipo === "nada" 
        ? "❌ Que pena! Não ganhou nada."
        : `🎉 Parabéns! Você ganhou ${premio.label}`;

      Platform.OS === "android"
        ? ToastAndroid.show(msg, ToastAndroid.LONG)
        : Alert.alert("Resultado da Roleta", msg);

      // Atualiza saldo/cartelas
      if (onPremio) onPremio(premio);

      // Fecha o modal após 2 segundos
      setTimeout(() => {
        if (onClose) onClose();
      }, 2000);
    });
  }

  // Interpolação de rotação
  const interpolatedRotation = animatedValue.interpolate({
    inputRange: [0, 360],
    outputRange: ["0deg", "360deg"],
  });

  // Renderiza os segmentos da roleta
  function renderSegments() {
    return premiosRoleta.map((p, i) => {
      const angle = (360 / premiosRoleta.length) * i;
      return (
        <View
          key={i}
          style={{
            position: "absolute",
            width: ROLETTE_SIZE / 2,
            height: ROLETTE_SIZE / 2,
            top: ROLETTE_SIZE / 4,
            left: ROLETTE_SIZE / 4,
            transform: [
              { rotate: `${angle}deg` },
              { translateY: -ROLETTE_SIZE / 4 },
            ],
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <View style={{
            width: ROLETTE_SIZE / 2,
            height: ROLETTE_SIZE / 2,
            backgroundColor: p.color,
            borderTopRightRadius: ROLETTE_SIZE / 2,
            borderTopLeftRadius: ROLETTE_SIZE / 2,
            borderBottomRightRadius: ROLETTE_SIZE / 2,
            borderBottomLeftRadius: ROLETTE_SIZE / 2,
            justifyContent: "center",
            alignItems: "center",
          }}>
            <Text style={{ color: "#000", fontWeight: "bold" }}>{p.label}</Text>
          </View>
        </View>
      );
    });
  }

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={{
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.8)",
        justifyContent: "center",
        alignItems: "center",
      }}>
        <View style={{
          width: ROLETTE_SIZE + 40,
          height: ROLETTE_SIZE + 80,
          backgroundColor: "#1f2937",
          borderRadius: 20,
          justifyContent: "center",
          alignItems: "center",
        }}>
          <Text style={{ color: "#f59e0b", fontSize: 24, fontWeight: "bold", marginBottom: 20 }}>🎡 Roleta Diária</Text>

          {/* Seta fixa */}
          <View style={{
            position: "absolute",
            top: 10,
            width: 0,
            height: 0,
            borderLeftWidth: 15,
            borderRightWidth: 15,
            borderBottomWidth: 30,
            borderLeftColor: "transparent",
            borderRightColor: "transparent",
            borderBottomColor: "#f59e0b",
            zIndex: 2,
          }} />

          {/* Roleta giratória */}
          <Animated.View
            style={{
              width: ROLETTE_SIZE,
              height: ROLETTE_SIZE,
              borderRadius: ROLETTE_SIZE / 2,
              backgroundColor: "#1f2937",
              justifyContent: "center",
              alignItems: "center",
              transform: [{ rotate: interpolatedRotation }],
            }}
          >
            {renderSegments()}
          </Animated.View>

          {!resultado && (
            <Pressable
              onPress={girarRoleta}
              disabled={girando}
              style={{
                marginTop: 30,
                backgroundColor: "#f59e0b",
                paddingVertical: 14,
                paddingHorizontal: 30,
                borderRadius: 12,
                opacity: girando ? 0.5 : 1,
              }}
            >
              <Text style={{ color: "#000", fontWeight: "bold", fontSize: 18 }}>
                {girando ? "Girando..." : "🎯 Girar Roleta"}
              </Text>
            </Pressable>
          )}

          {resultado && (
            <Text style={{ color: "#34d399", fontSize: 18, fontWeight: "bold", marginTop: 20, textAlign: "center" }}>
              {resultado.label}
            </Text>
          )}
        </View>
      </View>
    </Modal>
  );
}
