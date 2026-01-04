import { createContext, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth, db } from '../services/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { getIdTokenResult } from 'firebase/auth';

export const AuthContext = createContext({});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [nivelAtual, setNivelAtual] = useState('vermelho');
  const [isAdmin, setIsAdmin] = useState(false); // 🔐 ADMIN VIA TOKEN

  // 🔔 CONFIG PUSH ANDROID
  async function configureAndroidChannel() {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      });
    }
  }

  // 🔑 GERAR TOKEN EXPO
  async function registerForPushNotifications(uid) {
    try {
      const { status } = await Notifications.getPermissionsAsync();
      let finalStatus = status;

      if (status !== 'granted') {
        const request = await Notifications.requestPermissionsAsync();
        finalStatus = request.status;
      }

      if (finalStatus !== 'granted') {
        console.log('❌ Permissão de notificação negada');
        return;
      }

      await configureAndroidChannel();

      const projectId =
        Constants.expoConfig?.extra?.eas?.projectId ??
        Constants.easConfig?.projectId;

      const token = (
        await Notifications.getExpoPushTokenAsync({ projectId })
      ).data;

      const ref = doc(db, 'Usuarios', uid);

      await setDoc(
        ref,
        {
          expoPushToken: token,
          updatedAt: new Date(),
        },
        { merge: true }
      );

      console.log('✅ Expo Push Token salvo:', token);
    } catch (err) {
      console.error('❌ Erro Push Token:', err);
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
        // 🔐 FORÇA REFRESH DO TOKEN (CUSTOM CLAIMS)
        const tokenResult = await getIdTokenResult(authUser, true);
        const adminClaim = tokenResult.claims?.admin === true;

        setIsAdmin(adminClaim);

        // 🔥 PERFIL FIRESTORE (continua igual)
        const ref = doc(db, 'Usuarios', authUser.uid);
        const snap = await getDoc(ref);

        const data = snap.exists()
          ? snap.data()
          : { tipo: 'admin' };

        setProfile(data);
        setUser(authUser);

        // 🔔 PUSH
        await registerForPushNotifications(authUser.uid);

        console.log('🔐 Admin (token):', adminClaim);
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
        isAdmin, // ✅ AGORA VEM DO TOKEN (CORRETO)
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
