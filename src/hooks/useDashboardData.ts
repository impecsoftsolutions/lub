import { useState, useEffect, useCallback } from 'react';
import { supabase, adminCitiesService } from '../lib/supabase';

export interface DashboardMetrics {
  approvedMembers: number;
  pendingRegistrations: number;
  pendingCities: number;
  activeAdminUsers: number;
}

export interface RecentActivity {
  id: string;
  full_name: string;
  email: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

export interface SystemStatus {
  activeStates: number;
  totalDesignations: number;
  formFieldsConfigured: number;
  lastUpdated: Date;
}

export interface DashboardData {
  metrics: DashboardMetrics | null;
  recentActivity: RecentActivity[];
  systemStatus: SystemStatus | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export const useDashboardData = (): DashboardData => {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboardData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const userDataStr = localStorage.getItem('lub_session_token_user');
      const userData = userDataStr ? JSON.parse(userDataStr) : null;
      const requestingUserId = userData?.id || null;

      const [
        approvedMembersResult,
        pendingRegistrationsResult,
        pendingCitiesResult,
        activeAdminUsersResult,
        recentActivityResult,
        activeStatesResult,
        totalDesignationsResult,
        formFieldsResult
      ] = await Promise.all([
        supabase
          .from('member_registrations')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'approved'),
        supabase
          .from('member_registrations')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'pending'),
        requestingUserId
          ? adminCitiesService.listPendingCustomCities(requestingUserId)
          : Promise.resolve({ success: false, items: [] }),
        supabase
          .from('user_roles')
          .select('user_id'),
        supabase
          .from('member_registrations')
          .select('id, full_name, email, status, created_at')
          .order('created_at', { ascending: false })
          .limit(10),
        supabase
          .from('states_master')
          .select('*', { count: 'exact', head: true })
          .eq('is_active', true),
        supabase
          .from('company_designations')
          .select('*', { count: 'exact', head: true }),
        supabase
          .from('form_field_configurations')
          .select('*', { count: 'exact', head: true })
      ]);

      const uniqueAdminUsers = new Set(
        activeAdminUsersResult.data?.map((role: any) => role.user_id) || []
      ).size;

      setMetrics({
        approvedMembers: approvedMembersResult.count || 0,
        pendingRegistrations: pendingRegistrationsResult.count || 0,
        pendingCities: pendingCitiesResult.success ? (pendingCitiesResult.items?.length || 0) : 0,
        activeAdminUsers: uniqueAdminUsers
      });

      setRecentActivity(recentActivityResult.data || []);

      setSystemStatus({
        activeStates: activeStatesResult.count || 0,
        totalDesignations: totalDesignationsResult.count || 0,
        formFieldsConfigured: formFieldsResult.count || 0,
        lastUpdated: new Date()
      });
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
      setError('Failed to load dashboard data. Please try refreshing.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  return {
    metrics,
    recentActivity,
    systemStatus,
    isLoading,
    error,
    refresh: fetchDashboardData
  };
};
