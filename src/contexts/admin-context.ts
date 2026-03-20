import { createContext } from 'react';

export interface AdminContextValue {
  isSuperAdmin: boolean;
  userEmail: string;
  pendingRegistrationsCount: number;
  pendingCitiesCount: number;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  refreshCounts: () => void;
}

export const AdminContext = createContext<AdminContextValue | undefined>(undefined);
