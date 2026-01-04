import { createNativeStackNavigator } from '@react-navigation/native-stack';
import UserDrawer from './UserDrawer';

const Stack = createNativeStackNavigator();

export default function AppRoutes() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="UserDrawer" component={UserDrawer} />
  
   </Stack.Navigator>
  );
}
