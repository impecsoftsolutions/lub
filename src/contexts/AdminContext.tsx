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
      const sessionToken = sessionManager.getSessionToken();
      if (!sessionToken) {
        setPendingRegistrationsCount(0);
        setPendingCitiesCount(0);
        return;
      }

      const { data: pendingRegistrationsData, error: pendingRegistrationsError } = await supabase.rpc(
        'get_admin_member_registrations_with_session',
        {
          p_session_token: sessionToken,
          p_status_filter: 'pending',
          p_search_query: null,
          p_state_filter: null,
          p_limit: 5000,
          p_offset: 0
        }
      );

      if (pendingRegistrationsError) {
        throw pendingRegistrationsError;
      }

      const pendingCitiesResult = await adminCitiesService.listPendingCustomCities(sessionToken);

      setPendingRegistrationsCount(Array.isArray(pendingRegistrationsData) ? pendingRegistrationsData.length : 0);
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
