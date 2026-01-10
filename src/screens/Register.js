import { View, Text, TextInput, Pressable, Alert } from 'react-native';
import { useState } from 'react';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { auth, db } from '../services/firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

export default function Register({ navigation }) {
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleRegister() {
    if (!nome || !email || !senha) {
      Alert.alert('Erro', 'Preencha todos os campos');
      return;
    }

    if (senha.length < 6) {
      Alert.alert('Erro', 'Senha mínima de 6 caracteres');
      return;
    }

    try {
      setLoading(true);

      const cred = await createUserWithEmailAndPassword(auth, email, senha);

      // 🔥 Cria usuário no Firestore
      await setDoc(
  doc(db, 'Usuarios', cred.user.uid),
  {
    nome: nome.trim(),
    email,
  },
  { merge: true }
);

      Alert.alert('✅ Sucesso', 'Conta criada com sucesso');

      // 🔹 Vai para Login
      navigation.navigate('Login');

    } catch (e) {
      console.log('Erro cadastro:', e);
      Alert.alert('Erro', e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={{ flex: 1, padding: 20, justifyContent: 'center' }}>
      <Text style={{ fontSize: 24, textAlign: 'center', marginBottom: 20 }}>
        Cadastro
      </Text>

      <TextInput
        placeholder="Nome"
        value={nome}
        onChangeText={setNome}
        style={{ borderWidth: 1, padding: 12, marginBottom: 10 }}
      />

      <TextInput
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        style={{ borderWidth: 1, padding: 12, marginBottom: 10 }}
      />

      <TextInput
        placeholder="Senha"
        secureTextEntry
        value={senha}
        onChangeText={setSenha}
        style={{ borderWidth: 1, padding: 12, marginBottom: 20 }}
      />

      <Pressable
        onPress={handleRegister}
        disabled={loading}
        style={{
          backgroundColor: '#2563eb',
          padding: 16,
          opacity: loading ? 0.6 : 1,
        }}
      >
        <Text style={{ color: '#fff', textAlign: 'center', fontSize: 16 }}>
          {loading ? 'Criando...' : 'Cadastrar'}
        </Text>
      </Pressable>
    </View>
  );
}
