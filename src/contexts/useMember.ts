import { useContext } from 'react';
import { MemberContext, MemberContextValue } from './member-context';

// Return a stable fallback when the member context is unavailable on public routes.
const FALLBACK_CONTEXT: MemberContextValue = {
  member: null,
  isAuthenticated: false,
  isLoading: false,
  refreshMember: async () => {},
  signOut: async () => {}
};

export const useMember = () => {
  const context = useContext(MemberContext);
  if (!context) {
    return FALLBACK_CONTEXT;
  }
  return context;
};
