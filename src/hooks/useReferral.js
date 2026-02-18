import { useEffect, useRef } from "react";
import * as Linking from "expo-linking";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { db } from "../services/firebase";
import { doc, setDoc, serverTimestamp, getDoc } from "firebase/firestore";

export function useReferral(currentUserId) {
  const processedRef = useRef(false);

  useEffect(() => {
    if (!currentUserId || processedRef.current) return;

    let isMounted = true;

    const processReferral = async (code) => {
      if (!code || !isMounted) return;

      const referralCode = String(code).trim();

      if (referralCode === currentUserId) {
        processedRef.current = true;
        return;
      }

      const refDoc = doc(db, "Indicacoes", currentUserId);
      const snap = await getDoc(refDoc);

      if (snap.exists()) {
        processedRef.current = true;
        return;
      }

      await setDoc(
        refDoc,
        {
          indicadorUid: referralCode,
          indicadoUid: currentUserId,
          pago: false,
          criadoEm: serverTimestamp(),
        },
        { merge: true }
      );

      await AsyncStorage.removeItem("referralCode");
      processedRef.current = true;
    };

    Linking.getInitialURL().then((url) => {
      if (!url) return;
      const parsed = Linking.parse(url);
      processReferral(parsed.queryParams?.code);
    });

    const sub = Linking.addEventListener("url", ({ url }) => {
      const parsed = Linking.parse(url);
      const code = parsed.queryParams?.code;
      if (code) {
        AsyncStorage.setItem("referralCode", String(code));
        processReferral(code);
      }
    });

    AsyncStorage.getItem("referralCode").then((stored) => {
      if (stored) processReferral(stored);
    });

    return () => {
      isMounted = false;
      sub.remove();
    };
  }, [currentUserId]);
}
