import React, { useState, useEffect } from 'react';
import { supabase, adminCitiesService } from '../lib/supabase';
import { sessionManager } from '../lib/sessionManager';
import { AdminContext, AdminContextValue } from './admin-context';

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

      const sessionToken = sessionManager.getSessionToken();

      const pendingCitiesResult = sessionToken
        ? await adminCitiesService.listPendingCustomCities(sessionToken)
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
