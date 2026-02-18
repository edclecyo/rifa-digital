import { createNativeStackNavigator } from '@react-navigation/native-stack';
import UserDrawer from './UserDrawer';
import Depositar from "../screens/Depositar";
import EscolherCartelas from '../screens/EscolherCartelas';
import Carteira from "../screens/Carteira";
import TelaSorteioCassino from "../screens/TelaSorteioCassino";
const Stack = createNativeStackNavigator();

export default function AppRoutes() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="UserDrawer" component={UserDrawer} />
      <Stack.Screen name="Depositar" component={Depositar} />
      <Stack.Screen name="EscolherCartelas" component={EscolherCartelas} />
	  <Stack.Screen name="Carteira" component={Carteira} />
	 <Stack.Screen
  name="Sorteio"
  component={TelaSorteioCassino}
  options={{ headerShown: false }}
/>
    </Stack.Navigator>
  );
}
