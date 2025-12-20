import { View, Text, TextInput, Pressable, Alert, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../services/firebase';
import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';

export default function Login({ navigation }) {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');

  async function handleLogin() {
    if (!email || !senha) {
      Alert.alert('Erro', 'Preencha todos os campos');
      return;
    }

    try {
      await signInWithEmailAndPassword(auth, email, senha);
      // AuthContext decide a rota (User/Admin)
    } catch (e) {
      Alert.alert('Erro', 'Email ou senha inválidos');
    }
  }

  return (
    <LinearGradient
      colors={['#0f766e', '#0a3d3f']}
      style={styles.container}
    >
      <View style={styles.card}>
        <Text style={styles.title}>USER LOGIN</Text>

        {/* EMAIL */}
        <View style={styles.inputWrapper}>
          <Ionicons name="person-outline" size={20} color="#555" />
          <TextInput
            placeholder="Email"
            placeholderTextColor="#666"
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
          />
        </View>

        {/* SENHA */}
        <View style={styles.inputWrapper}>
          <Ionicons name="lock-closed-outline" size={20} color="#555" />
          <TextInput
            placeholder="Password"
            placeholderTextColor="#666"
            style={styles.input}
            secureTextEntry
            value={senha}
            onChangeText={setSenha}
          />
        </View>

        {/* BOTÃO LOGIN */}
        <Pressable style={styles.loginButton} onPress={handleLogin}>
          <Text style={styles.loginText}>LOGIN</Text>
        </Pressable>
      </View>

      {/* REGISTER */}
      <Pressable
        style={styles.registerButton}
        onPress={() => navigation.navigate('Register')}
      >
        <Text style={styles.registerText}>REGISTER</Text>
      </Pressable>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    width: '85%',
    backgroundColor: '#0b1f23',
    padding: 25,
    borderRadius: 12,
  },
  title: {
    color: '#fff',
    fontSize: 20,
    textAlign: 'center',
    marginBottom: 25,
    letterSpacing: 2,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e5e7eb',
    paddingHorizontal: 12,
    borderRadius: 6,
    marginBottom: 15,
  },
  input: {
    flex: 1,
    padding: 12,
    color: '#000',
  },
  loginButton: {
    backgroundColor: '#4f8f95',
    padding: 15,
    borderRadius: 6,
    marginTop: 10,
  },
  loginText: {
    color: '#fff',
    textAlign: 'center',
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  registerButton: {
    marginTop: 20,
    paddingVertical: 15,
    width: '85%',
    borderRadius: 6,
    backgroundColor: '#0b1f23',
  },
  registerText: {
    color: '#fff',
    textAlign: 'center',
    letterSpacing: 2,
  },
});
