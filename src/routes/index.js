import { useContext } from 'react';
import { NavigationContainer } from '@react-navigation/native';

import { AuthContext } from '../contexts/AuthContext';
import AuthRoutes from './AuthRoutes';
import AppRoutes from './AppRoutes';
import AdminRoutes from './AdminRoutes';

export default function Routes() {
  const { user, loading, isAdmin } = useContext(AuthContext);

  if (loading) return null;

  return (
    <NavigationContainer>
      {!user && <AuthRoutes />}
      {user && !isAdmin && <AppRoutes />}
      {user && isAdmin && <AdminRoutes />}
    </NavigationContainer>
  );
}
