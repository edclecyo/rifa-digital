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
import HistoricoSorteios from '../screens/HistoricoSorteios';
import StatusSorteio from '../screens/StatusSorteio';
import AdminDashboardRodada from '../screens/AdminDashboardRodada';
import DashboardFinanceiroMensal from '../screens/DashboardFinanceiroMensal';
import AntifraudeAdmin from '../screens/AntifraudeAdmin';
import AdminCompliance from '../screens/AdminCompliance';
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
<Stack.Screen name="StatusSorteio" component={StatusSorteio} options={{ title: 'StatusSorteio' }} />
<Stack.Screen name="AdminDashboardRodada" component={AdminDashboardRodada} options={{ title: 'AdminDashboardRodada' }} />
 <Stack.Screen name="DashboardFinanceiroMensal" component={DashboardFinanceiroMensal} options={{ title: 'DashboardFinanceiroMensal' }} />
 <Stack.Screen name="HistoricoSorteios" component={HistoricoSorteios}/>
<Stack.Screen name="AntifraudeAdmin" component={AntifraudeAdmin}  options={{ title: 'AntifraudeAdmin' }} />  
<Stack.Screen name="AdminCompliance" component={AdminCompliance}  options={{ title: 'AdminCompliance' }} /> 
 <Stack.Screen name="AdminPromocaoHome" component={AdminPromocaoHome} />
  </Stack.Navigator>
  );
}
