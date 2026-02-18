import React, { useEffect, useRef, useState, useContext } from "react";
import { View, Text, Pressable, Animated, ScrollView } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation } from "@react-navigation/native";
import { AuthContext } from "../contexts/AuthContext";
import { db } from "../services/firebase";
import { doc, onSnapshot, collection, query, orderBy, limit } from "firebase/firestore";

export default function TelaMilionariaSorteioReal() {
  const navigation = useNavigation();
  const { profile } = useContext(AuthContext);

  const [numeros, setNumeros] = useState([0, 0, 0, 0, 0, 0]);
  const [restantes, setRestantes] = useState(0);
  const [comprasRecentes, setComprasRecentes] = useState(0);
  const [progresso, setProgresso] = useState(0);

  const scaleAnim = useRef(new Animated.Value(1)).current;
  const brilhoAnim = useRef(new Animated.Value(0)).current;
  const intervalRef = useRef(null);

  /* ===============================
     🎰 ANIMAÇÃO CASSINO CONTROLADA
  ================================ */
  const animarAteNumeroFinal = (final) => {
    if (intervalRef.current) clearInterval(intervalRef.current);

    intervalRef.current = setInterval(() => {
      setNumeros((prev) => prev.map(() => Math.floor(Math.random() * 10)));
    }, 80);

    setTimeout(() => {
      clearInterval(intervalRef.current);
      setNumeros(final);
    }, 2000);
  };

  /* ===============================
     🔥 FIRESTORE — ÚLTIMO SORTEIO
  ================================ */
  useEffect(() => {
    const q = query(collection(db, "Sorteios"), orderBy("criadoEm", "desc"), limit(1));

    const unsub = onSnapshot(q, (snap) => {
      if (!snap.empty) {
        const data = snap.docs[0].data();
        const numerosSorteio = data?.numeros || [0, 0, 0, 0, 0, 0];
        animarAteNumeroFinal(numerosSorteio);
      }
    });

    return () => unsub();
  }, []);

  /* ===============================
     📊 FIRESTORE — PROGRESSO
  ================================ */
  useEffect(() => {
    const rodadaRef = doc(db, "Config", "rodadaAtual");

    const unsub = onSnapshot(rodadaRef, (snap) => {
      if (!snap.exists()) return;

      const d = snap.data();
      const vendidas = d.cartelasVendidas || 0;
      const total = d.totalCartelas || 1;

      setRestantes(total - vendidas);
      setProgresso(vendidas / total);
    });

    return () => unsub();
  }, []);

  /* ===============================
     👥 FIRESTORE — COMPRAS RECENTES
  ================================ */
  useEffect(() => {
    const q = query(collection(db, "Pedidos"), orderBy("criadoEm", "desc"), limit(20));

    const unsub = onSnapshot(q, (snap) => {
      setComprasRecentes(snap.size);
    });

    return () => unsub();
  }, []);

  /* ===============================
     ✨ PULSO BOTÃO
  ================================ */
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(scaleAnim, { toValue: 1.05, duration: 800, useNativeDriver: true }),
        Animated.timing(scaleAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  /* ===============================
     ✨ BRILHO DOURADO
  ================================ */
  useEffect(() => {
    Animated.loop(
      Animated.timing(brilhoAnim, { toValue: 1, duration: 1500, useNativeDriver: true })
    ).start();
  }, []);

  const brilhoOpacity = brilhoAnim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] });

  return (
    <ScrollView style={{ flex: 1, backgroundColor: "#020617" }} contentContainerStyle={{ padding: 20 }}>
      <Text style={{ color: "#fff", fontSize: 26, fontWeight: "bold", textAlign: "center" }}>
        🎉 Hoje alguém vai ganhar R$ 5.000
      </Text>

      <Text style={{ color: "#94a3b8", textAlign: "center", marginTop: 6 }}>
        Pode ser você, {profile?.nome || "jogador"}
      </Text>

      {/* NÚMEROS */}
      <Animated.View style={{ flexDirection: "row", justifyContent: "center", marginTop: 30, opacity: brilhoOpacity }}>
        {numeros.map((n, i) => (
          <View key={i} style={{ backgroundColor: "#facc15", marginHorizontal: 4, padding: 14, borderRadius: 10, minWidth: 48, alignItems: "center" }}>
            <Text style={{ fontSize: 22, fontWeight: "bold", color: "#000" }}>{n}</Text>
          </View>
        ))}
      </Animated.View>

      <Text style={{ color: "#facc15", textAlign: "center", marginTop: 10 }}>
        🏆 Cartela premiada do último sorteio
      </Text>

      {/* ESCASSEZ REAL */}
      <View style={{ marginTop: 30 }}>
        <Text style={{ color: "#ef4444", textAlign: "center", fontWeight: "bold" }}>
          ⚠️ Restam apenas {restantes} cartelas
        </Text>

        <View style={{ height: 14, backgroundColor: "#1e293b", borderRadius: 20, marginTop: 8 }}>
          <LinearGradient colors={["#ef4444", "#facc15"]} style={{ width: `${Math.min(progresso * 100, 100)}%`, height: "100%", borderRadius: 20 }} />
        </View>
      </View>

      {/* BOTÃO */}
      <Animated.View style={{ transform: [{ scale: scaleAnim }], marginTop: 30 }}>
        <Pressable
          onPress={() => navigation.navigate("EscolherCartelas")}
          style={{ backgroundColor: "#22c55e", padding: 18, borderRadius: 16, alignItems: "center" }}
        >
          <Text style={{ color: "#fff", fontSize: 18, fontWeight: "bold" }}>🎟️ QUERO MINHAS CARTELAS AGORA</Text>

          <Text style={{ color: "#dcfce7", fontSize: 12, marginTop: 4 }}>
            {comprasRecentes} pessoas compraram agora
          </Text>
        </Pressable>
      </Animated.View>

      {/* BÔNUS */}
      <View style={{ backgroundColor: "#7c3aed", padding: 16, borderRadius: 14, marginTop: 30 }}>
        <Text style={{ color: "#fff", fontWeight: "bold", textAlign: "center" }}>🔥 Compre 5 cartelas e ganhe +2 GRÁTIS</Text>
      </View>

      {/* GARANTIA */}
      <Text style={{ color: "#94a3b8", textAlign: "center", marginTop: 20 }}>
        🎁 Mesmo se não ganhar, você ainda recebe bônus em saldo.
      </Text>

      {/* RODAPÉ */}
      <Pressable onPress={() => navigation.navigate("Ranking")} style={{ marginTop: 30, alignItems: "center" }}>
        <Text style={{ color: "#38bdf8" }}>Ver ranking dos ganhadores</Text>
      </Pressable>
    </ScrollView>
  );
}
