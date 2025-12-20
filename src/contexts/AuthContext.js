import { createContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth, db } from '../services/firebase';
import { doc, getDoc } from 'firebase/firestore';

export const AuthContext = createContext({});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);          // auth
  const [profile, setProfile] = useState(null);    // firestore
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (authUser) => {
      if (!authUser) {
        setUser(null);
        setProfile(null);
        setLoading(false);
        return;
      }

      try {
        const ref = doc(db, 'Usuarios', authUser.uid);
        const snap = await getDoc(ref);

        if (snap.exists()) {
          setProfile(snap.data());
        } else {
          // fallback de segurança
          setProfile({ tipo: 'user' });
        }

        setUser(authUser);
      } catch (err) {
        console.error('Erro ao buscar perfil:', err);
        setProfile(null);
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
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        isAdmin: profile?.tipo === 'admin',
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
