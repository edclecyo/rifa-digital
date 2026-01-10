import { createContext, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { onAuthStateChanged, signOut, getIdTokenResult } from 'firebase/auth';
import { auth, db, functions } from '../services/firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';

import * as Application from 'expo-application';

export const AuthContext = createContext({});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [nivelAtual, setNivelAtual] = useState('vermelho');
  const [isAdmin, setIsAdmin] = useState(false);

  // 🧷 DEVICE ID ESTÁVEL (FINTECH)
  const deviceId =
  Platform.OS === 'android'
    ? Application.getAndroidId()
    : Application.getIosIdForVendor?.() ?? 'ios-unknown';

  // 🔔 ANDROID CHANNEL
  async function configureAndroidChannel() {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
      });
    }
  }

  // 🔔 REGISTRAR PUSH TOKEN (SEGURO)
  async function registerForPushNotifications(uid) {
    try {
      const { status } = await Notifications.getPermissionsAsync();
      let finalStatus = status;

      if (status !== 'granted') {
        const request = await Notifications.requestPermissionsAsync();
        finalStatus = request.status;
      }

      if (finalStatus !== 'granted') return;

      await configureAndroidChannel();

      const projectId =
        Constants.expoConfig?.extra?.eas?.projectId ??
        Constants.easConfig?.projectId;

      const token = (
        await Notifications.getExpoPushTokenAsync({ projectId })
      ).data;

      // 🔐 COLEÇÃO PRIVADA
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
      console.error('❌ Erro Push Token:', err);
    }
  }

  // 🔐 REGISTRAR LOGIN (SUBSTITUI onLogin ❌)
  async function registrarLogin() {
  try {
    const call = httpsCallable(functions, 'registrarLogin');

    await call({
      deviceId,
      platform: Platform.OS,
    });
  } catch (err) {
    console.error('❌ Erro registrarLogin:', err);

    // 🚫 DEVICE BLOQUEADO → LOGOUT FORÇADO
    if (err?.code === 'functions/permission-denied') {
      await signOut(auth);
    }
  }
}
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (authUser) => {
      if (!authUser) {
        setUser(null);
        setProfile(null);
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      try {
        // 🔐 TOKEN + CLAIMS
        const tokenResult = await getIdTokenResult(authUser, true);
        setIsAdmin(tokenResult.claims?.admin === true);

        // 🔥 PERFIL KYC
        const snap = await getDoc(doc(db, 'Usuarios', authUser.uid));
        setProfile(snap.exists() ? snap.data() : null);

        setUser(authUser);

        // 🔔 PUSH TOKEN
        await registerForPushNotifications(authUser.uid);

        // 🧾 LOGIN AUDITÁVEL
        await registrarLogin();
      } catch (err) {
        console.error('❌ Erro AuthContext:', err);
      } finally {
        setLoading(false);
      }
    });

    return unsubscribe;
  }, []);

  async function logout() {
    await signOut(auth);
    setUser(null);
    setProfile(null);
    setIsAdmin(false);
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        nivelAtual,
        setNivelAtual,
        isAdmin,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
