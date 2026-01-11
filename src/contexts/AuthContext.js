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

  // ✅ Identificador do dispositivo
  const deviceId = Platform.OS === 'android'
    ? Application.getAndroidId?.() ?? 'android-emulator'
    : Application.getIosIdForVendor?.() ?? 'ios-simulator';

  // Configura canal Android para notificações
  async function configureAndroidChannel() {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
      });
    }
  }

  // Registrar push token
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
      console.error('❌ Erro Push Token:', err);
    }
  }

  // Registrar login via Cloud Function
  async function registrarLogin() {
    try {
      // ⚠️ Região da função, ajuste se necessário
      const call = httpsCallable(functions, 'registrarLogin', { region: 'southamerica-east1' });

      // Força valores mesmo no emulador
      const payload = {
        deviceId: deviceId ?? 'emulator-device',
        platform: Platform.OS ?? 'unknown',
      };

      const res = await call(payload);
      console.log('✅ registrarLogin ok:', res.data);
    } catch (err) {
      if (err?.code === 'functions/not-found') {
        console.warn('⚠️ registrarLogin ainda não disponível');
        return;
      }

      if (err?.code === 'functions/permission-denied') {
        console.warn('⚠️ Sessão inválida ou sem permissão, deslogando...');
        await signOut(auth);
        return;
      }

      console.error('❌ Erro registrarLogin:', err);
    }
  }

  // Monitorar auth state
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
        // 🔐 Verifica se é admin
        const tokenResult = await getIdTokenResult(authUser, true);
        setIsAdmin(tokenResult.claims?.admin === true);

        // 🔎 Pega dados do perfil
        const snap = await getDoc(doc(db, 'Usuarios', authUser.uid));
        setProfile(snap.exists() ? snap.data() : null);

        setUser(authUser);

        // 🚀 Primeiro registra push token
        await registerForPushNotifications(authUser.uid);

        // 🚀 Depois registra login no backend
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
    <AuthContext.Provider value={{ user, profile, loading, isAdmin, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
