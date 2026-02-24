import { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  Animated,
  Easing,
  Modal,
  Dimensions,
  Alert,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { httpsCallable } from "firebase/functions";
import { functions } from "../services/firebase";

const { width } = Dimensions.get("window");
const ROLETTE_SIZE = width * 0.82;

const premiosRoleta = [
  { label: "❌ Nada", tipo: "nada", valor: 0, color: "#ef4444" },
  { label: "🎟️ 1 Cartela", tipo: "cartela", valor: 1, color: "#34d399" },
  { label: "❌ Nada", tipo: "nada", valor: 0, color: "#ef4444" },
  { label: "🎟️ 3 Cartelas", tipo: "cartela", valor: 3, color: "#10b981" },
  { label: "💸 R$0,25", tipo: "dinheiro", valor: 0.25, color: "#facc15" },
  { label: "🎟️ 5 Cartelas", tipo: "cartela", valor: 5, color: "#059669" },
];

export default function RoletaCassinoModal({ visible, onClose, onPremio }) {
  const [girando, setGirando] = useState(false);
  const [resultado, setResultado] = useState(null);

  const rotation = useRef(new Animated.Value(0)).current;
  const currentDeg = useRef(0);

  const girarRoletaClound = httpsCallable(functions, "girarRoletaClound");
const [explodir, setExplodir] = useState(false);
const scaleAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!visible) {
      // reset quando fechar
      setResultado(null);
      setGirando(false);
    }
  }, [visible]);

  async function girarRoleta() {
  if (girando) return;

  const hoje = new Date().toDateString();
  const ultimoGiro = await AsyncStorage.getItem("@roleta_lastSpin");

  if (ultimoGiro === hoje) {
    Alert.alert("⛔ Limite diário", "Você já girou hoje.", [
      { text: "OK", onPress: () => onClose && onClose() },
    ]);
    return;
  }

  setGirando(true);
  setResultado(null);

  try {
    const response = await girarRoletaClound();
    const premioIndex = response?.data?.premioIndex ?? 0;
    const premio = premiosRoleta[premioIndex];

    const anguloPorSegmento = 360 / premiosRoleta.length;

    let alvo =
      360 - (premioIndex * anguloPorSegmento + anguloPorSegmento / 2);

    // 🎯 EFEITO QUASE GANHOU
    if (premio.tipo === "nada") {
      const quaseIndex =
        premioIndex === 0 ? 1 : premioIndex - 1;

      const quaseAlvo =
        360 - (quaseIndex * anguloPorSegmento + anguloPorSegmento / 2);

      alvo = quaseAlvo + 10; // passa perto do prêmio
    }

    const giroTotal = 6 * 360 + alvo;
    const novoAngulo = currentDeg.current + giroTotal;

    Animated.timing(rotation, {
      toValue: novoAngulo,
      duration: 5200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      currentDeg.current = novoAngulo % 360;

      // ⏳ Suspense final
      setTimeout(() => {
        finalizarRoleta(premio, hoje);
      }, 1500);
    });

  } catch (error) {
    setGirando(false);
    Alert.alert("Erro", "Falha ao girar roleta.");
  }
}

  async function finalizarRoleta(premio, hoje) {
  await AsyncStorage.setItem("@roleta_lastSpin", hoje);

  setResultado(premio);
  setGirando(false);

  if (premio.tipo === "dinheiro") {
    setExplodir(true);

    Animated.sequence([
      Animated.spring(scaleAnim, {
        toValue: 1.5,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        useNativeDriver: true,
      }),
    ]).start();
  }

  if (onPremio) {
    onPremio(premio);
  }

  setTimeout(() => {
    setExplodir(false);
    if (onClose) onClose();
  }, 3000);
}

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
          <View
            style={{
              width: ROLETTE_SIZE / 2,
              height: ROLETTE_SIZE / 2,
              backgroundColor: p.color,
              borderRadius: ROLETTE_SIZE,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <Text style={{ color: "#000", fontWeight: "bold" }}>
              {p.label}
            </Text>
          </View>
        </View>
      );
    });
  }

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.92)",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <View
          style={{
            width: ROLETTE_SIZE + 40,
            height: ROLETTE_SIZE + 140,
            backgroundColor: "#111827",
            borderRadius: 25,
            justifyContent: "center",
            alignItems: "center",
            padding: 20,
          }}
        >
          <Text
            style={{
              color: "#f59e0b",
              fontSize: 26,
              fontWeight: "900",
              textAlign: "center",
              marginBottom: 5,
            }}
          >
            🎡 SUA CHANCE É AGORA
          </Text>

          <Text
            style={{
              color: "#9ca3af",
              textAlign: "center",
              marginBottom: 15,
              fontSize: 14,
            }}
          >
            Cada giro pode liberar dinheiro ou cartelas extras.
            {"\n"}🔥 Será que hoje é o seu dia?
          </Text>

          {/* Ponteiro */}
          <View
            style={{
              position: "absolute",
              top: 120,
              zIndex: 10,
              borderLeftWidth: 12,
              borderRightWidth: 12,
              borderBottomWidth: 20,
              borderLeftColor: "transparent",
              borderRightColor: "transparent",
              borderBottomColor: "#f59e0b",
            }}
          />

          <Animated.View
            style={{
              width: ROLETTE_SIZE,
              height: ROLETTE_SIZE,
              borderRadius: ROLETTE_SIZE / 2,
              transform: [
                {
                  rotate: rotation.interpolate({
                    inputRange: [0, 360],
                    outputRange: ["0deg", "360deg"],
                  }),
                },
              ],
            }}
          >
            {renderSegments()}
          </Animated.View>
{explodir && (
  <Animated.View
    style={{
      position: "absolute",
      justifyContent: "center",
      alignItems: "center",
      transform: [{ scale: scaleAnim }],
    }}
  >
    <Text
      style={{
        fontSize: 40,
        fontWeight: "900",
        color: "#facc15",
        textShadowColor: "#fff",
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 15,
      }}
    >
      💥 JACKPOT 💥
    </Text>
  </Animated.View>
)}
          {!resultado && (
            <Pressable
              onPress={girarRoleta}
              disabled={girando}
              style={{
                marginTop: 35,
                backgroundColor: girando ? "#6b7280" : "#f59e0b",
                paddingVertical: 16,
                paddingHorizontal: 40,
                borderRadius: 15,
              }}
            >
              <Text style={{ color: "#000", fontWeight: "900", fontSize: 18 }}>
                {girando ? "🎯 Girando..." : "🔥 GIRAR AGORA"}
              </Text>
            </Pressable>
          )}

         {resultado && (
  <Text
    style={{
      color:
        resultado.tipo === "dinheiro"
          ? "#facc15"
          : resultado.tipo === "nada"
          ? "#f87171"
          : "#22c55e",
      fontSize: 22,
      fontWeight: "bold",
      marginTop: 20,
      textAlign: "center",
    }}
  >
    {resultado.tipo === "dinheiro"
      ? "💰 DINHEIRO LIBERADO!"
      : resultado.tipo === "nada"
      ? "😮 Quase! Você passou muito perto..."
      : `🎉 PARABÉNS! ${resultado.label}`}
  </Text>
)}
        </View>
      </View>
    </Modal>
  );
}