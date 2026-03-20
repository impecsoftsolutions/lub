import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { memberAuthService, MemberData } from '../lib/memberAuth';
import { MemberContext, MemberContextValue } from './member-context';

interface MemberContextProviderProps {
  children: React.ReactNode;
}

export const MemberContextProvider: React.FC<MemberContextProviderProps> = ({ children }) => {
  const [member, setMember] = useState<MemberData | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const loadMember = useCallback(async () => {
    try {
      console.log('[MemberContext] Loading member data...');
      setIsLoading(true);
      
      // No timeout needed - cached data returns instantly!
      const memberData = await memberAuthService.getCurrentMember();
      
      console.log('[MemberContext] Member data loaded:', memberData ? 'Success' : 'No member found');
      
      setMember(memberData);
      setIsAuthenticated(!!memberData);
    } catch (error) {
      console.error('[MemberContext] Error loading member:', error);
      setMember(null);
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refreshMember = useCallback(async () => {
    try {
      console.log('[MemberContext] Force refreshing member data (bypassing cache)...');
      setIsLoading(true);

      // Force refresh from database (bypass cache)
      const freshMemberData = await memberAuthService.forceRefreshMember();

      console.log('[MemberContext] Fresh member data loaded:', freshMemberData ? 'Success' : 'No member found');

      setMember(freshMemberData);
      setIsAuthenticated(!!freshMemberData);
    } catch (error) {
      console.error('[MemberContext] Error force refreshing member:', error);
      setMember(null);
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      await memberAuthService.signOutMember();
    } catch (error) {
      console.error('Error signing out:', error);
    } finally {
      setMember(null);
      setIsAuthenticated(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    const initAuth = async () => {
      if (!mounted) return;

      console.log('[MemberContext] Initializing authentication...');

      try {
        await loadMember();
      } catch (error) {
        console.error('[MemberContext] Failed to initialize authentication:', error);
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    initAuth();

    return () => {
      mounted = false;
    };
  }, [loadMember]);

  // Memoize the context value to prevent unnecessary re-renders
  const value: MemberContextValue = useMemo(() => ({
    member,
    isAuthenticated,
    isLoading,
    refreshMember,
    signOut
  }), [member, isAuthenticated, isLoading, refreshMember, signOut]);

  return <MemberContext.Provider value={value}>{children}</MemberContext.Provider>;
};
