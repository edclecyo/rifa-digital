import { createContext, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { onAuthStateChanged, signOut, getIdTokenResult } from 'firebase/auth';
import { auth, db, functions } from '../services/firebase';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import * as Notifications from 'expo-notifications';
import * as Application from 'expo-application';
import Constants from 'expo-constants';

export const AuthContext = createContext({});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  // 🔐 LGPD
  const [lgpdAceita, setLgpdAceita] = useState(false);
  const [lgpdVersao, setLgpdVersao] = useState(null);

  // 📱 Device ID (async)
  const [deviceId, setDeviceId] = useState(null);

  /* ===============================
     DEVICE ID
  ================================ */
  useEffect(() => {
    async function loadDeviceId() {
      try {
        if (Platform.OS === 'android') {
          const id = await Application.getAndroidIdAsync();
          setDeviceId(id ?? 'android-emulator');
        } else {
          const id = await Application.getIosIdForVendorAsync();
          setDeviceId(id ?? 'ios-simulator');
        }
      } catch {
        setDeviceId('unknown-device');
      }
    }
    loadDeviceId();
  }, []);

  /* ===============================
     NOTIFICAÇÕES
  ================================ */
  async function configureAndroidChannel() {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
      });
    }
  }

  async function registerForPushNotifications(uid) {
    try {
      const { status } = await Notifications.getPermissionsAsync();
      let finalStatus = status;

      if (status !== 'granted') {
        const req = await Notifications.requestPermissionsAsync();
        finalStatus = req.status;
      }

      if (finalStatus !== 'granted') return;

      await configureAndroidChannel();

      const projectId =
        Constants.expoConfig?.extra?.eas?.projectId ??
        Constants.easConfig?.projectId;

      const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;

      await setDoc(
        doc(db, 'UsuariosPrivado', uid),
        {
          expoPushToken: token,
          platform: Platform.OS,
          deviceId,
          atualizadoEm: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (err) {
      console.error('❌ Push Token:', err);
    }
  }


  /* ===============================
     🔄 CARREGAR LGPD
  ================================ */
  async function carregarLgpd(uid) {
  try {
    const snap = await getDoc(doc(db, "UsuariosPrivado", uid));

    if (!snap.exists()) {
      setLgpdAceita(false);
      return false;
    }

    const consentimento = snap.data()?.consentimentoLGPD;
    const aceita = consentimento?.aceito === true;

    setLgpdAceita(aceita);
    return aceita;
  } catch (err) {
    console.error("❌ Erro carregar LGPD:", err);
    setLgpdAceita(false);
    return false;
  }
}

  /* ===============================
     🔄 REFRESH LGPD (usado no Modal)
  ================================ */
  async function refreshLgpd(uid) {
  const snap = await getDoc(doc(db, "UsuariosPrivado", uid));

  const aceita =
    snap.exists() &&
    snap.data()?.consentimentoLGPD?.aceito === true;

  setLgpdAceita(aceita);
}
 
  /* ===============================
     LOGIN BACKEND
  ================================ */
  async function registrarLogin() {
    try {
      const call = httpsCallable(functions, 'registrarLogin');

      await call({
        deviceId: deviceId ?? 'emulator',
        platform: Platform.OS ?? 'unknown',
      });
    } catch (err) {
      if (err?.code === 'functions/permission-denied') {
        await signOut(auth);
      }
      console.warn('⚠️ registrarLogin:', err?.code);
    }
  }

  /* ===============================
     AUTH STATE
  ================================ */
  useEffect(() => {
  const unsub = onAuthStateChanged(auth, async (authUser) => {
    if (!authUser) {
      setUser(null);
      setProfile(null);
      setIsAdmin(false);
      setLgpdAceita(false);
      setLoading(false);
      return;
    }

    try {
      setLoading(true); // 🔒 trava tudo aqui

      const token = await getIdTokenResult(authUser, true);
      setIsAdmin(token.claims?.admin === true);

      const snap = await getDoc(doc(db, "Usuarios", authUser.uid));
      setProfile(snap.exists() ? snap.data() : {});

      setUser(authUser);

      // ✅ AGUARDA LGPD
      await carregarLgpd(authUser.uid);

      // 🔕 não precisa travar UI
      registerForPushNotifications(authUser.uid);
      registrarLogin();
    } catch (err) {
      console.error("❌ AuthContext:", err);
    } finally {
      setLoading(false); // 🔓 só libera depois da LGPD
    }
  });

  return unsub;
}, [deviceId]);

  /* ===============================
     🚪 LOGOUT
  ================================ */
  async function logout() {
    await signOut(auth);
    setUser(null);
    setProfile(null);
    setIsAdmin(false);
    setLgpdAceita(false);
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
