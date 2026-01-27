import { createNativeStackNavigator } from '@react-navigation/native-stack';
import UserDrawer from './UserDrawer';
import Depositar from "../screens/Depositar";
const Stack = createNativeStackNavigator();

export default function AppRoutes() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="UserDrawer" component={UserDrawer} />
  <Stack.Screen name="Depositar" component={Depositar} />
   </Stack.Navigator>
  );
}
