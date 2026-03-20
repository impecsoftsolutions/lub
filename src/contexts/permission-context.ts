import { createContext } from 'react';
import type { ExtendedUser, UserPermission } from '../types/permissions';

export interface PermissionContextValue {
  user: ExtendedUser | null;
  permissions: UserPermission[];
  isLoading: boolean;
  error: Error | null;
  hasPermission: (code: string) => boolean;
  hasAnyPermission: (codes: string[]) => boolean;
  hasAllPermissions: (codes: string[]) => boolean;
  isSuperAdmin: () => boolean;
  refreshPermissions: () => Promise<void>;
}

export const PermissionContext = createContext<PermissionContextValue | undefined>(undefined);
