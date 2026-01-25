import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { collection, query, orderBy, limit, getDocs } from "firebase/firestore";
import { db } from "../services/firebase";

export default function AuditoriaLGPD() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function carregarAuditoria() {
      try {
        const q = query(
          collection(db, "AuditoriaLGPD"),
          orderBy("aceitoEm", "desc"),
          limit(100)
        );

        const snap = await getDocs(q);

        const dados = snap.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));

        setLogs(dados);
      } catch (err) {
        console.error("❌ Auditoria LGPD:", err);
      } finally {
        setLoading(false);
      }
    }

    carregarAuditoria();
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text>Carregando auditoria...</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={logs}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.container}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <Text style={styles.uid}>UID: {item.uid}</Text>
          <Text>Email: {item.email || "-"}</Text>
          <Text>Versão: {item.versao}</Text>
          <Text>Origem: {item.origem}</Text>
          <Text>Device: {item.device}</Text>
          <Text>IP: {item.ip}</Text>
          <Text style={styles.date}>
            {item.aceitoEm?.toDate?.().toLocaleString?.() || ""}
          </Text>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
  card: {
    backgroundColor: "#fff",
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
    elevation: 2,
  },
  uid: {
    fontWeight: "bold",
    marginBottom: 4,
  },
  date: {
    marginTop: 6,
    fontSize: 12,
    color: "#666",
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
});
