import { View, Text, Image } from 'react-native';
import { useContext } from 'react';
import { AuthContext } from '../contexts/AuthContext';

export default function Perfil() {
  const { user, profile } = useContext(AuthContext);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: '#0f172a',
        alignItems: 'center',
        paddingTop: 60,
      }}
    >
      <Image
        source={{
          uri:
            profile?.foto ||
            'https://ui-avatars.com/api/?name=' +
              (profile?.nome || 'User'),
        }}
        style={{
          width: 110,
          height: 110,
          borderRadius: 55,
          marginBottom: 15,
        }}
      />

      <Text style={{ color: '#fff', fontSize: 22, fontWeight: 'bold' }}>
        {profile?.nome || 'Usuário'}
      </Text>

      <Text style={{ color: '#94a3b8', marginTop: 4 }}>
        {user?.email}
      </Text>

      <View style={{ marginTop: 30, width: '90%' }}>
        <Text style={{ color: '#cbd5f5', marginBottom: 8 }}>
          Tipo de conta:
        </Text>
        <Text style={{ color: '#fff', fontSize: 16 }}>
          {profile?.tipo || 'usuário'}
        </Text>
      </View>
    </View>
  );
}
