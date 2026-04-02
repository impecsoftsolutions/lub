import { useState, useEffect } from 'react';
import { organizationProfileService, OrganizationProfile } from '../lib/supabase';

// Module-level cache — avoids repeat network calls when multiple components use this hook.
// Reset on page reload, which is intentional.
let cached: OrganizationProfile | null = null;

export function useOrganisationProfile() {
  const [profile, setProfile] = useState<OrganizationProfile | null>(cached);
  const [loading, setLoading] = useState(!cached);

  useEffect(() => {
    if (cached) {
      setProfile(cached);
      setLoading(false);
      return;
    }

    let cancelled = false;

    organizationProfileService.getProfile().then(data => {
      if (!cancelled) {
        cached = data;
        setProfile(data);
        setLoading(false);
      }
    }).catch(() => {
      if (!cancelled) {
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return { profile, loading };
}
