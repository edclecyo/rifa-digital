import { View, Text, TextInput, Pressable, Alert, ActivityIndicator } from 'react-native';
import { useState, useContext } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../services/firebase';
import { AuthContext } from '../contexts/AuthContext';

export default function Login({ navigation }) {
  const { loading: authLoading } = useContext(AuthContext);
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [logando, setLogando] = useState(false);

  async function handleLogin() {
    if (!email || !senha) {
      Alert.alert('Erro', 'Preencha todos os campos.');
      return;
    }

    try {
      setLogando(true);
      await signInWithEmailAndPassword(auth, email, senha);
      // AuthContext cuida do push token + registrarLogin
    } catch (e) {
      console.error('❌ Erro login:', e);
      Alert.alert('Erro', e.message || 'Falha ao efetuar login.');
    } finally {
      setLogando(false);
    }
  }

  return (
    <View style={{ flex: 1, padding: 24, justifyContent: 'center', backgroundColor: '#f9fafb' }}>
      <Text style={{ fontSize: 28, fontWeight: 'bold', textAlign: 'center', marginBottom: 24 }}>
        Login
      </Text>

      <TextInput
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        style={styles.input}
      />

      <TextInput
        placeholder="Senha"
        secureTextEntry
        value={senha}
        onChangeText={setSenha}
        style={styles.input}
      />

      <Pressable
        onPress={handleLogin}
        disabled={logando || authLoading}
        style={[styles.button, (logando || authLoading) && { opacity: 0.6 }]}
      >
        {logando ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Entrar</Text>}
      </Pressable>

      <Pressable onPress={() => navigation.navigate('Register')} style={{ marginTop: 16 }}>
        <Text style={{ textAlign: 'center', color: '#2563eb' }}>Criar conta</Text>
      </Pressable>
    </View>
  );
}

const styles = {
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 14,
    borderRadius: 8,
    marginBottom: 12,
    backgroundColor: '#fff',
  },
  button: {
    backgroundColor: '#2563eb',
    padding: 16,
    borderRadius: 10,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
};
