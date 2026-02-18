import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  Image,
  ActivityIndicator,
  Animated,
} from "react-native";
import {
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
} from "firebase/firestore";
import { db } from "../services/firebase";
import { LinearGradient } from "expo-linear-gradient";

export default function TelaGanhadoresCinematica() {
  const [ganhadores, setGanhadores] = useState([]);
  const [loading, setLoading] = useState(true);

  const brilhoAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  /* ===============================
     ✨ ANIMAÇÃO DE ENTRADA
  =============================== */
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 900,
      useNativeDriver: true,
    }).start();
  }, []);

  /* ===============================
     ✨ BRILHO DOURADO LOOP
  =============================== */
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(brilhoAnim, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: true,
        }),
        Animated.timing(brilhoAnim, {
          toValue: 0,
          duration: 1500,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  const brilhoOpacity = brilhoAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.4, 1],
  });

  /* ===============================
     🔄 GANHADORES EM TEMPO REAL
  =============================== */
  useEffect(() => {
    const q = query(
      collection(db, "Ganhadores"),
      orderBy("valor", "desc"),
      limit(50)
    );

    const unsub = onSnapshot(q, (snap) => {
      const lista = snap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      setGanhadores(lista);
      setLoading(false);
    });

    return unsub;
  }, []);

  /* ===============================
     ⏳ LOADING PREMIUM
  =============================== */
  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: "#020617",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <ActivityIndicator size="large" color="#facc15" />
        <Text style={{ color: "#fff", marginTop: 12 }}>
          Carregando ganhadores...
        </Text>
      </View>
    );
  }

  return (
    <Animated.View
      style={{ flex: 1, backgroundColor: "#020617", opacity: fadeAnim }}
    >
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {/* ================= HEADER ================= */}
        <Text
          style={{
            color: "#facc15",
            fontSize: 28,
            fontWeight: "bold",
            textAlign: "center",
            marginBottom: 20,
          }}
        >
          🏆 Ganhadores Oficiais
        </Text>

        {/* ================= LISTA ================= */}
        {ganhadores.map((g, index) => (
          <Animated.View
            key={g.id}
            style={{
              opacity: brilhoOpacity,
              marginBottom: 16,
            }}
          >
            <LinearGradient
              colors={["#1e293b", "#020617"]}
              style={{
                borderRadius: 18,
                padding: 16,
                flexDirection: "row",
                alignItems: "center",
                borderWidth: 1.5,
                borderColor: "#facc15",
              }}
            >
              {/* FOTO */}
              <Image
                source={{
                  uri:
                    g.foto ||
                    "https://i.imgur.com/0y0y0y0.png",
                }}
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 32,
                  marginRight: 14,
                  borderWidth: 2,
                  borderColor: "#facc15",
                }}
              />

              {/* INFO */}
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    color: "#fff",
                    fontSize: 16,
                    fontWeight: "bold",
                  }}
                >
                  {index + 1}. {g.nome}
                </Text>

                <Text style={{ color: "#94a3b8", marginTop: 2 }}>
                  🎟️ Cartela premiada: {g.cartela}
                </Text>

                <Text
                  style={{
                    color: "#22c55e",
                    fontWeight: "bold",
                    marginTop: 2,
                    fontSize: 15,
                  }}
                >
                  💰 R$ {Number(g.valor || 0).toFixed(2)}
                </Text>

                {/* SELO */}
                <Text
                  style={{
                    color: "#facc15",
                    fontSize: 11,
                    marginTop: 4,
                    fontWeight: "bold",
                  }}
                >
                  ✔ GANHADOR VERIFICADO
                </Text>

                <Text
                  style={{
                    color: "#64748b",
                    fontSize: 11,
                    marginTop: 2,
                  }}
                >
                  {g.data?.toDate?.().toLocaleDateString?.() || ""}
                </Text>
              </View>
            </LinearGradient>
          </Animated.View>
        ))}

        {ganhadores.length === 0 && (
          <Text
            style={{
              color: "#94a3b8",
              textAlign: "center",
              marginTop: 40,
            }}
          >
            Nenhum ganhador ainda. Seja o primeiro!
          </Text>
        )}
      </ScrollView>
    </Animated.View>
  );
}
