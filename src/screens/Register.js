import { View, Text, TextInput, Pressable, Alert } from 'react-native';
import { useState } from 'react';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { auth, db } from '../services/firebase';
import { doc, setDoc, Timestamp } from 'firebase/firestore';

export default function Register({ navigation }) {
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [tipo, setTipo] = useState('user'); // user | admin

  async function handleRegister() {
    if (!nome || !email || !senha) {
      Alert.alert('Erro', 'Preencha todos os campos');
      return;
    }

    try {
      const cred = await createUserWithEmailAndPassword(
        auth,
        email,
        senha
      );

      await setDoc(doc(db, 'Usuarios', cred.user.uid), {
        nome,
        email,
        tipo, // 👈 define se é user ou admin
        criadoEm: Timestamp.now(),
      });

      Alert.alert('Sucesso', 'Conta criada com sucesso');
      navigation.replace('Login');
    } catch (e) {
      console.log(e);
      Alert.alert('Erro', e.message);
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
        style={{ borderWidth: 1, padding: 10, marginBottom: 10 }}
      />

      <TextInput
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        style={{ borderWidth: 1, padding: 10, marginBottom: 10 }}
      />

      <TextInput
        placeholder="Senha"
        secureTextEntry
        value={senha}
        onChangeText={setSenha}
        style={{ borderWidth: 1, padding: 10, marginBottom: 15 }}
      />

      {/* BOTÕES DE TIPO */}
      <View style={{ flexDirection: 'row', marginBottom: 15 }}>
        <Pressable
          onPress={() => setTipo('user')}
          style={{
            flex: 1,
            padding: 10,
            backgroundColor: tipo === 'user' ? '#16a34a' : '#e5e7eb',
            marginRight: 5,
          }}
        >
          <Text style={{ textAlign: 'center' }}>Usuário</Text>
        </Pressable>

        <Pressable
          onPress={() => setTipo('admin')}
          style={{
            flex: 1,
            padding: 10,
            backgroundColor: tipo === 'admin' ? '#dc2626' : '#e5e7eb',
          }}
        >
          <Text style={{ textAlign: 'center' }}>Admin</Text>
        </Pressable>
      </View>

      <Pressable
        onPress={handleRegister}
        style={{ backgroundColor: '#2563eb', padding: 15 }}
      >
        <Text style={{ color: '#fff', textAlign: 'center' }}>
          Cadastrar
        </Text>
      </Pressable>
    </View>
  );
}
