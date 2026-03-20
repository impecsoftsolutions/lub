import { useContext } from 'react';
import { PermissionContext } from './permission-context';

export const usePermission = () => {
  const context = useContext(PermissionContext);
  if (!context) {
    throw new Error('usePermission must be used within PermissionProvider');
  }
  return context;
};
