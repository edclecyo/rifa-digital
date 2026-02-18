import { createContext, useEffect, useState, useRef } from "react";
import { Platform } from "react-native";
import { onAuthStateChanged, signOut, getIdTokenResult } from "firebase/auth";
import { auth, db, functions } from "../services/firebase";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import * as Notifications from "expo-notifications";
import * as Application from "expo-application";
import Constants from "expo-constants";

// 🔗 REFERRAL (IMPORTANTE)
import { useReferral } from "../hooks/useReferral";

export const AuthContext = createContext({});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  // 🔐 LGPD
  const [lgpdAceita, setLgpdAceita] = useState(false);

  // 📱 Device ID
  const [deviceId, setDeviceId] = useState(null);

  // 🔒 Side-effects UMA vez
  const loginSentRef = useRef(false);
  const pushSentRef = useRef(false);

  /* ===============================
     🔗 REFERRAL (SEMPRE NO TOPO)
  ================================ */
  useReferral(user?.uid);

  /* ===============================
     📱 DEVICE ID
  ================================ */
  useEffect(() => {
    let active = true;

    (async () => {
      try {
        let id = "unknown-device";

        if (Platform.OS === "android") {
          id = (await Application.getAndroidIdAsync()) ?? id;
        } else {
          id = (await Application.getIosIdForVendorAsync()) ?? id;
        }

        if (active) setDeviceId(id);
      } catch {
        if (active) setDeviceId("unknown-device");
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  /* ===============================
     🔄 LGPD
  ================================ */
  async function carregarLgpd(uid) {
    try {
      const snap = await getDoc(doc(db, "UsuariosPrivado", uid));
      const consentimento = snap.data()?.consentimentoLGPD;

      const aceita =
        consentimento?.aceito === true &&
        consentimento?.versao === "1.0";

      setLgpdAceita(!!aceita);
      return aceita;
    } catch (err) {
      console.error("❌ LGPD:", err);
      setLgpdAceita(false);
      return false;
    }
  }

  async function refreshLgpd(uid) {
    if (!uid) return;
    await carregarLgpd(uid);
  }

  /* ===============================
     🔔 PUSH
  ================================ */
  async function registerForPushNotifications(uid) {
    if (!uid || pushSentRef.current) return;
    pushSentRef.current = true;

    try {
      const { status } = await Notifications.getPermissionsAsync();
      let finalStatus = status;

      if (status !== "granted") {
        const req = await Notifications.requestPermissionsAsync();
        finalStatus = req.status;
      }

      if (finalStatus !== "granted") return;

      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync("default", {
          name: "default",
          importance: Notifications.AndroidImportance.MAX,
        });
      }

      const projectId =
        Constants.expoConfig?.extra?.eas?.projectId ??
        Constants.easConfig?.projectId;

      const token = (
        await Notifications.getExpoPushTokenAsync({ projectId })
      ).data;

      await setDoc(
        doc(db, "UsuariosPrivado", uid),
        {
          expoPushToken: token,
          platform: Platform.OS,
          deviceId,
          atualizadoEm: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (err) {
      console.warn("⚠️ Push:", err);
    }
  }

  /* ===============================
     🔗 LOGIN BACKEND
  ================================ */
  async function registrarLogin({ deviceId, platform }) {
    if (!deviceId) return;

    try {
      await auth.currentUser?.getIdToken(true);

      const call = httpsCallable(functions, "registrarLogin");
      await call({
        deviceId,
        platform: platform ?? "unknown",
      });
    } catch (err) {
      if (err?.code === "functions/permission-denied") {
        try {
          await signOut(auth);
        } catch {}
      }

      console.warn("⚠️ registrarLogin:", err?.code ?? err?.message);
    }
  }

  /* ===============================
     🔐 AUTH STATE
  ================================ */
  useEffect(() => {
    let active = true;

    const unsub = onAuthStateChanged(auth, async (authUser) => {
      if (!active) return;

      if (!authUser) {
        setUser(null);
        setProfile(null);
        setIsAdmin(false);
        setLgpdAceita(false);
        setLoading(false);
        loginSentRef.current = false;
        pushSentRef.current = false;
        return;
      }

      try {
        setLoading(true);

        const token = await getIdTokenResult(authUser);
        const admin = token.claims?.admin === true;

        const snap = await getDoc(doc(db, "Usuarios", authUser.uid));
        const profileData = snap.exists() ? snap.data() : {};

        await carregarLgpd(authUser.uid);

        if (!active) return;

        setIsAdmin(admin);
        setProfile(profileData);
        setUser(authUser);
      } catch (err) {
        console.error("❌ AuthContext:", err);
      } finally {
        if (active) setLoading(false);
      }
    });

    return () => {
      active = false;
      unsub();
    };
  }, []);

  /* ===============================
     🚀 SIDE EFFECTS PÓS LOGIN
  ================================ */
  useEffect(() => {
    if (!user || !deviceId || loginSentRef.current) return;

    loginSentRef.current = true;

    registrarLogin({
      deviceId,
      platform: Platform.OS,
    });

    registerForPushNotifications(user.uid);
  }, [user, deviceId]);

  /* ===============================
     🚪 LOGOUT
  ================================ */
  async function logout() {
    await signOut(auth);
    setUser(null);
    setProfile(null);
    setIsAdmin(false);
    setLgpdAceita(false);
    loginSentRef.current = false;
    pushSentRef.current = false;
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        isAdmin,
        lgpdAceita,
        lgpdPendente: !!user && !lgpdAceita,
        refreshLgpd,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
