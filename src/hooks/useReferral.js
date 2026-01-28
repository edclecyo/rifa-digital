import { useEffect } from "react";
import * as Linking from "expo-linking";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { db } from "../service/firebase";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";

export function useDeferredReferral(currentUserId) {
  useEffect(() => {
    const handleReferral = async () => {
      let referralCode = null;

      // 1️⃣ Tenta pegar do link inicial
      const url = await Linking.getInitialURL();
      if (url) {
        const parsed = Linking.parse(url);
        referralCode = parsed.queryParams?.code;
      }

      // 2️⃣ Tenta pegar do AsyncStorage (após instalar app)
      if (!referralCode) {
        referralCode = await AsyncStorage.getItem("referralCode");
      }

      if (!referralCode) return;

      console.log("Usuário veio com código:", referralCode);

      // Salvar no Firestore
      await setDoc(
        doc(db, "Indicacoes", currentUserId),
        {
          indicadorUid: referralCode,
          indicadoUid: currentUserId,
          pago: false,
          criadoEm: serverTimestamp(),
        },
        { merge: true }
      );

      // Limpar AsyncStorage
      await AsyncStorage.removeItem("referralCode");
    };

    handleReferral();
  }, [currentUserId]);
}
