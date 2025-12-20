import { createNativeStackNavigator } from '@react-navigation/native-stack';

import HomeUser from '../screens/HomeUser';
import EscolherCartelas from '../screens/EscolherCartelas';
import MinhasCartelas from '../screens/MinhasCartelas';

const Stack = createNativeStackNavigator();

export default function AppRoutes() {
  return (
    <Stack.Navigator>
      <Stack.Screen 
        name="HomeUser" 
        component={HomeUser} 
        options={{ headerShown: false }}
      />

      <Stack.Screen 
        name="EscolherCartelas" 
        component={EscolherCartelas}
        options={{ title: 'Escolher Cartelas' }}
      />

      <Stack.Screen 
        name="MinhasCartelas" 
        component={MinhasCartelas}
        options={{ title: 'Minhas Cartelas' }}
      />
    </Stack.Navigator>
  );
}
