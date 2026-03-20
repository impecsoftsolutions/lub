import { createContext } from 'react';
import { MemberData } from '../lib/memberAuth';

export interface MemberContextValue {
  member: MemberData | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  refreshMember: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const MemberContext = createContext<MemberContextValue | undefined>(undefined);
