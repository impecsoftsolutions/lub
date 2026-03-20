import { useContext } from 'react';
import { AdminContext } from './admin-context';

export const useAdmin = () => {
  const context = useContext(AdminContext);
  if (!context) {
    throw new Error('useAdmin must be used within AdminContextProvider');
  }
  return context;
};
