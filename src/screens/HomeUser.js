import { useContext, useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { AuthContext } from "../contexts/AuthContext";
import { db } from "../services/firebase";
import { doc, onSnapshot } from "firebase/firestore";
import { useNavigation } from "@react-navigation/native";

export default function HomeUser() {
  const { profile } = useContext(AuthContext);
  const navigation = useNavigation();

  const [sorteio, setSorteio] = useState({
    cartelasVendidas: 0,
    premioAtual: 0,
    premioMaximo: 1000,
  });

  /* 🎯 Sorteio ativo */
  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, "Sorteios", "ativo"), (snap) => {
      if (snap.exists()) {
        setSorteio({
          cartelasVendidas: snap.data()?.cartelasVendidas || 0,
          premioAtual: snap.data()?.premioAtual || 0,
          premioMaximo: snap.data()?.premioMaximo || 1000,
        });
      }
    });

    return unsubscribe;
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: "#0f172a" }}>
      <ScrollView style={{ padding: 20 }}>
        {/* 👋 SAUDAÇÃO */}
        <Text style={{ color: "#fff", fontSize: 20 }}>
          Olá, {profile?.nome || "Usuário"}
        </Text>

        {/* 💰 PRÊMIO */}
        <View
          style={{
            backgroundColor: "#020617",
            padding: 16,
            borderRadius: 14,
            marginTop: 16,
          }}
        >
          <Text style={{ color: "#22c55e", fontSize: 18 }}>
            💰 Prêmio em jogo
          </Text>

          <Text
            style={{
              color: "#fff",
              fontSize: 28,
              fontWeight: "bold",
              marginTop: 6,
            }}
          >
            R$ {Number(sorteio.premioAtual).toFixed(2)}
          </Text>

          <Text style={{ color: "#94a3b8", marginTop: 8 }}>
            🎟️ {sorteio.cartelasVendidas} cartelas vendidas
          </Text>

          <Text style={{ color: "#64748b", marginTop: 4, fontSize: 12 }}>
            🔒 Prêmio máximo do ciclo: R$ {sorteio.premioMaximo.toFixed(2)}
          </Text>
        </View>

        {/* 🎯 Comprar */}
        <Pressable
          onPress={() => navigation.navigate("EscolherCartelas")}
          style={{
            backgroundColor: "#16a34a",
            padding: 16,
            borderRadius: 12,
            marginTop: 20,
          }}
        >
          <Text
            style={{
              color: "#fff",
              textAlign: "center",
              fontWeight: "bold",
            }}
          >
            🎯 Comprar Cartela (R$ 2,50)
          </Text>
        </Pressable>

        {/* ℹ️ Info */}
        <Text style={{ color: "#94a3b8", fontSize: 11, marginTop: 16 }}>
          ℹ️ A cada 100 cartelas vendidas, R$100 são sorteados.
          A plataforma retém 50% + custos operacionais.
        </Text>
      </ScrollView>
    </View>
  );
}
