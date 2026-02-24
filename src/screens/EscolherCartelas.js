import React, {
  useState,
  useEffect,
  useContext,
  useRef,
  useCallback,
  useMemo
} from "react";

import {
  View,
  Text,
  FlatList,
  Pressable,
  Alert,
  StyleSheet,
  ActivityIndicator,
  TextInput
} from "react-native";

import { AuthContext } from "../contexts/AuthContext";
import { db, functions } from "../services/firebase";
import {
  collection,
  query,
  where,
  doc,
  onSnapshot
} from "firebase/firestore";

import { httpsCallable } from "firebase/functions";
import { useFocusEffect } from "@react-navigation/native";

/* ===============================
   CONFIG
=============================== */

const VALOR_CARTELA = 2.5;

const PACOTES = [
  { quantidade: 1, label: "🎟️ 1 Cartela", preco: 2.5 },
  { quantidade: 5, label: "🔥 5 Cartelas", preco: 12.5 },
  { quantidade: 10, label: "💎 10 Cartelas", preco: 25 },
  { quantidade: 20, label: "🚀 20 Cartelas", preco: 50 }
];

/* ===============================
   Cartela Render
=============================== */

const CartelaItem = React.memo(({ item, userId }) => {

  const minhaReserva =
    item.status === "reservada" &&
    item.reservadaPor === userId;

  return (
    <View
      style={[
        styles.card,
        item.status === "disponivel" && styles.disponivel,
        item.status === "reservada" && styles.reservada,
        item.status === "vendida" && styles.vendida,
        minhaReserva && styles.minhaReserva
      ]}
    >
      <Text style={styles.cartelaId}>
        🎟️ Cartela #{item.codigo}
      </Text>

      <Text style={styles.numerosTexto}>
        🎯 {item.numeros?.join(", ")}
      </Text>

      <Text style={styles.valor}>
        💰 R$ {VALOR_CARTELA.toFixed(2)}
      </Text>

      {item.status === "vendida" && (
        <Text style={styles.vendidaTexto}>
          ❌ Vendida
        </Text>
      )}
    </View>
  );
});

/* ===============================
   Tela Principal
=============================== */

export default function EscolherCartelas() {

  const { user, loading: authLoading } = useContext(AuthContext);

  const [pacoteSelecionado, setPacoteSelecionado] = useState(null);
  const [quantidadeManual, setQuantidadeManual] = useState("");

  const [loadingCompra, setLoadingCompra] = useState(false);

  const [cartelasMap, setCartelasMap] = useState(new Map());
  const [rodadaAtual, setRodadaAtual] = useState(1);

  const reservaTimers = useRef(new Map());

  /* ===============================
     Rodada realtime
  =============================== */

  useEffect(() => {

    const ref = doc(db, "StatusSorteio", "geral");

    return onSnapshot(ref, snap => {
      if (snap.exists()) {
        setRodadaAtual(snap.data().rodada || 1);
      }
    });

  }, []);

  /* ===============================
     Cartelas realtime
  =============================== */

  useEffect(() => {

    if (!user?.uid || !rodadaAtual) return;

    const q = query(
      collection(db, "Cartelas"),
      where("rodada", "==", rodadaAtual),
      where("status", "in", [
        "disponivel",
        "reservada",
        "vendida"
      ])
    );

    const unsub = onSnapshot(q, snap => {

      setCartelasMap(prev => {

        const map = new Map(prev);

        snap.docChanges().forEach(change => {

          const data = {
            id: change.doc.id,
            ...change.doc.data()
          };

          if (change.type === "removed") {

            map.delete(change.doc.id);

            if (reservaTimers.current.has(change.doc.id)) {
              clearTimeout(reservaTimers.current.get(change.doc.id));
              reservaTimers.current.delete(change.doc.id);
            }

          } else {
            map.set(change.doc.id, data);
          }

        });

        return map;
      });

    });

    return () => unsub();

  }, [user?.uid, rodadaAtual]);

  /* ===============================
     Compra pacote automático
  =============================== */

  const comprarPacote = useCallback(async (quantidade) => {

  try {

    if (!rodadaAtual) {
      Alert.alert("Sistema ainda inicializando");
      return;
    }

    if (!quantidade || quantidade <= 0) {
      Alert.alert("Quantidade inválida");
      return;
    }

    setLoadingCompra(true);

    const fn = httpsCallable(functions, "comprarCartela");

    const payload = {
      rodadaId: String(rodadaAtual),
      quantidade: Number(quantidade)
    };

    console.log("BUY PAYLOAD", payload);

    const res = await fn(payload);

    if (res?.data?.success) {

      Alert.alert(
        "🎉 Pedido criado!",
        "Aguarde processamento do pagamento."
      );

    } else {

      Alert.alert(
        "Erro",
        "Resposta inválida do servidor"
      );

    }

  } catch (err) {

    console.log("BUY FRONT ERROR", err);

    const msg =
      err?.message ||
      err?.details ||
      "Falha ao processar compra";

    Alert.alert("Erro interno", msg);

  } finally {
    setLoadingCompra(false);
  }

}, [rodadaAtual]);

  /* ===============================
     Render
  =============================== */

  if (authLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large"/>
      </View>
    );
  }

  const quantidadeFinal =
    pacoteSelecionado
      ? pacoteSelecionado.quantidade
      : Number(quantidadeManual || 0);

  const totalValor = quantidadeFinal * VALOR_CARTELA;

  return (
    <View style={{ flex:1, padding:16 }}>

      <Text style={{fontSize:18,fontWeight:"bold",marginBottom:12}}>
        🎟️ Pacotes de Compra
      </Text>

      {/* GRID PACOTES */}

      <View style={{
        flexDirection:"row",
        flexWrap:"wrap",
        justifyContent:"space-between"
      }}>

        {PACOTES.map(p => (
          <Pressable
            key={p.quantidade}
            onPress={()=>{
              setPacoteSelecionado(p);
              setQuantidadeManual("");
            }}
            style={{
              width:"48%",
              backgroundColor:
                pacoteSelecionado?.quantidade === p.quantidade
                  ? "#22c55e"
                  : "#1f2937",

              padding:18,
              borderRadius:14,
              marginBottom:12,
              alignItems:"center"
            }}
          >

            <Text style={{color:"#fff",fontWeight:"bold"}}>
              {p.label}
            </Text>

            <Text style={{color:"#d1fae5",marginTop:6}}>
              R$ {p.preco.toFixed(2)}
            </Text>

          </Pressable>
        ))}

      </View>

      {/* INPUT MANUAL */}

      <Text style={{marginTop:20,fontWeight:"bold"}}>
        Ou digite quantidade:
      </Text>

      <TextInput
        placeholder="Ex: 3"
        keyboardType="numeric"
        value={quantidadeManual}
        onChangeText={setQuantidadeManual}
        style={{
          borderWidth:1,
          borderColor:"#ccc",
          padding:12,
          borderRadius:10,
          marginTop:8
        }}
      />

      {/* RESUMO */}

      {quantidadeFinal > 0 && (
        <View style={{
          marginTop:20,
          padding:16,
          backgroundColor:"#f8fafc",
          borderRadius:14
        }}>

          <Text style={{fontWeight:"bold"}}>
            📦 Pedido
          </Text>

          <Text>🎟️ Cartelas: {quantidadeFinal}</Text>

          <Text style={{color:"#16a34a",fontWeight:"bold"}}>
            💰 Total: R$ {totalValor.toFixed(2)}
          </Text>

          <Pressable
            onPress={()=>comprarPacote(quantidadeFinal)}
            disabled={loadingCompra}
            style={{
              marginTop:16,
              backgroundColor:"#16a34a",
              padding:16,
              borderRadius:12,
              alignItems:"center"
            }}
          >

            {loadingCompra ? (
              <ActivityIndicator color="#fff"/>
            ) : (
              <Text style={{color:"#fff",fontWeight:"bold"}}>
                ✅ Confirmar Compra
              </Text>
            )}

          </Pressable>

        </View>
      )}

    </View>
  );
}

/* ===============================
   Styles
=============================== */

const styles = StyleSheet.create({

  card:{
    padding:16,
    margin:10,
    borderRadius:14
  },

  disponivel:{ backgroundColor:"#dcfce7" },
  reservada:{ backgroundColor:"#fde68a" },
  vendida:{ backgroundColor:"#fecaca" },

  minhaReserva:{
    borderWidth:2,
    borderColor:"#2563eb"
  },

  cartelaId:{
    fontWeight:"bold",
    fontSize:16
  },

  numerosTexto:{
    marginTop:6
  },

  valor:{
    marginTop:6,
    fontWeight:"bold"
  },

  vendidaTexto:{
    marginTop:6,
    color:"#7f1d1d"
  },

  loadingContainer:{
    flex:1,
    justifyContent:"center",
    alignItems:"center"
  }

});