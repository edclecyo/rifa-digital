import { useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { db, auth } from "../services/firebase";
import { doc, onSnapshot, collection, query, orderBy } from "firebase/firestore";
import { useNavigation } from "@react-navigation/native";

export default function CarteiraProfissional() {
  const navigation = useNavigation();

  const [saldo, setSaldo] = useState(0);
  const [extrato, setExtrato] = useState([]);
  const [loading, setLoading] = useState(true);

  // nomes bonitos do extrato
  const nomes = {
    deposito_pix: "Depósito PIX",
    saque_pix: "Saque PIX",
  };

  useEffect(() => {
    const unsubAuth = auth.onAuthStateChanged((user) => {
      if (!user) return;

      const saldoRef = doc(db, "UsuariosPrivado", user.uid);

      const unsubSaldo = onSnapshot(saldoRef, (snap) => {
        setSaldo(snap.data()?.saldo || 0);
        setLoading(false);
      });

      const extratoRef = query(
        collection(saldoRef, "LedgerFinanceiro"),
        orderBy("criadoEm", "desc")
      );

      const unsubExtrato = onSnapshot(extratoRef, (snap) => {
        const lista = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setExtrato(lista);
      });

      // limpa listeners quando auth mudar
      return () => {
        unsubSaldo();
        unsubExtrato();
      };
    });

    return unsubAuth;
  }, []);

  // loading inicial
  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#020617" }}>
        <ActivityIndicator size="large" color="#22c55e" />
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: "#020617" }}>
      {/* HEADER SALDO */}
      <View
        style={{
          backgroundColor: "#22c55e",
          paddingTop: 60,
          paddingBottom: 40,
          paddingHorizontal: 24,
          borderBottomLeftRadius: 30,
          borderBottomRightRadius: 30,
        }}
      >
        <Text style={{ color: "#052e16", fontSize: 16 }}>Saldo disponível</Text>

        <Text
          style={{
            color: "#052e16",
            fontSize: 40,
            fontWeight: "bold",
            marginTop: 8,
          }}
        >
          {saldo.toLocaleString("pt-BR", {
            style: "currency",
            currency: "BRL",
          })}
        </Text>

        {/* BOTÕES */}
        <View style={{ flexDirection: "row", marginTop: 20, gap: 12 }}>
          <Pressable
            onPress={() => navigation.navigate("Depositar")}
            style={{
              flex: 1,
              backgroundColor: "#052e16",
              padding: 14,
              borderRadius: 14,
              alignItems: "center",
            }}
          >
            <Text style={{ color: "#22c55e", fontWeight: "bold" }}>Depositar</Text>
          </Pressable>

          <Pressable
            onPress={() => navigation.navigate("Sacar")}
            style={{
              flex: 1,
              backgroundColor: "#052e16",
              padding: 14,
              borderRadius: 14,
              alignItems: "center",
            }}
          >
            <Text style={{ color: "#22c55e", fontWeight: "bold" }}>Sacar</Text>
          </Pressable>
        </View>
      </View>

      {/* EXTRATO */}
      <View style={{ padding: 20 }}>
        <Text style={{ color: "#fff", fontSize: 18, fontWeight: "bold", marginBottom: 12 }}>
          Extrato recente
        </Text>

        {extrato.length === 0 && (
          <Text style={{ color: "#64748b" }}>Nenhuma movimentação ainda.</Text>
        )}

        {extrato.map((item) => (
          <View
            key={item.id}
            style={{
              backgroundColor: "#0f172a",
              padding: 16,
              borderRadius: 16,
              marginBottom: 12,
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <View>
              <Text style={{ color: "#fff", fontWeight: "600" }}>
                {nomes[item.tipo] || item.tipo}
              </Text>

              <Text style={{ color: "#64748b", fontSize: 12 }}>
                {item.criadoEm?.toDate?.().toLocaleString?.() || "Agora"}
              </Text>
            </View>

            <Text
              style={{
                color: item.valor > 0 ? "#22c55e" : "#ef4444",
                fontWeight: "bold",
                fontSize: 16,
              }}
            >
              {item.valor > 0 ? "+" : ""}
              {Number(item.valor).toLocaleString("pt-BR", {
                style: "currency",
                currency: "BRL",
              })}
            </Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
