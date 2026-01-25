import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase, adminCitiesService } from '../lib/supabase';

interface AdminContextValue {
  isSuperAdmin: boolean;
  userEmail: string;
  pendingRegistrationsCount: number;
  pendingCitiesCount: number;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  refreshCounts: () => void;
}

const AdminContext = createContext<AdminContextValue | undefined>(undefined);

export const useAdmin = () => {
  const context = useContext(AdminContext);
  if (!context) {
    throw new Error('useAdmin must be used within AdminContextProvider');
  }
  return context;
};

interface AdminContextProviderProps {
  children: React.ReactNode;
  isSuperAdmin: boolean;
  userEmail: string;
}

export const AdminContextProvider: React.FC<AdminContextProviderProps> = ({
  children,
  isSuperAdmin,
  userEmail,
}) => {
  const [pendingRegistrationsCount, setPendingRegistrationsCount] = useState(0);
  const [pendingCitiesCount, setPendingCitiesCount] = useState(0);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    loadCounts();
  }, []);

  const loadCounts = async () => {
    try {
      const { count: registrationsCount } = await supabase
        .from('member_registrations')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');

      const userDataStr = localStorage.getItem('lub_session_token_user');
      const userData = userDataStr ? JSON.parse(userDataStr) : null;
      const requestingUserId = userData?.id || null;

      const pendingCitiesResult = requestingUserId
        ? await adminCitiesService.listPendingCustomCities(requestingUserId)
        : { success: false, items: [] };

      setPendingRegistrationsCount(registrationsCount || 0);
      setPendingCitiesCount(pendingCitiesResult.success ? (pendingCitiesResult.items?.length || 0) : 0);
    } catch (error) {
      console.error('Error loading counts:', error);
    }
  };

  const toggleSidebar = () => {
    setSidebarCollapsed(!sidebarCollapsed);
  };

  const refreshCounts = () => {
    loadCounts();
  };

  const value: AdminContextValue = {
    isSuperAdmin,
    userEmail,
    pendingRegistrationsCount,
    pendingCitiesCount,
    sidebarCollapsed,
    toggleSidebar,
    refreshCounts,
  };

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
};
