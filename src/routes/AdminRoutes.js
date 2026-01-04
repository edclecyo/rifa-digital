import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomeAdmin from '../screens/HomeAdmin';
import AdminRifas from '../screens/AdminRifas';
import AdminUsuarios from '../screens/AdminUsuarios';
import CriarCartela from '../screens/CriarCartela';
import AdminDashboard from '../screens/AdminDashboard';
const Stack = createNativeStackNavigator();
import AdminPagamentos from '../screens/AdminPagamentos';
import RankingCompradores from '../screens/RankingCompradores';
import AdminPromocaoHome from '../screens/AdminPromocaoHome';
export default function AdminRoutes() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="HomeAdmin" component={HomeAdmin} />
      <Stack.Screen name="AdminRifas" component={AdminRifas} />
      <Stack.Screen name="AdminUsuarios" component={AdminUsuarios} />
      <Stack.Screen name="CriarCartela" component={CriarCartela} />
<Stack.Screen name="AdminDashboard" component={AdminDashboard}  options={{ title: 'Dashboard' }} />  
<Stack.Screen name="AdminPagamentos" component={AdminPagamentos}  options={{ title: 'Pagamentos' }} /> 
<Stack.Screen name="RankingCompradores" component={RankingCompradores} options={{ title: 'Ranking de Compradores' }} />  
  <Stack.Screen name="AdminPromocaoHome" component={AdminPromocaoHome} />
  </Stack.Navigator>
  );
}
