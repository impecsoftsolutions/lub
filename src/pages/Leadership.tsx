import React, { useCallback, useEffect, useState } from 'react';
import { Users, MapPin, Phone, AlertCircle, Loader2, User } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { statesService, locationsService, leadershipService } from '../lib/supabase';
import { formatMonthYearValue } from '../lib/dateTimeManager';

interface StateMaster {
  id: string;
  state_name: string;
  is_active: boolean;
}

interface DistrictOption {
  district_id: string;
  district_name: string;
}

interface LeadershipAssignment {
  assignment_id: string;
  member_id: string;
  member_full_name: string;
  member_email: string;
  member_mobile_number: string;
  member_company_name: string;
  member_city: string;
  member_district: string;
  member_gender: string;
  member_profile_photo_url: string | null;
  lub_role_id: string;
  lub_role_name: string;
  level: string;
  state: string | null;
  district: string | null;
  committee_year: string | null;
  role_start_date: string | null;
  role_end_date: string | null;
}

interface GroupedRole {
  roleName: string;
  members: Array<{
    member_full_name: string;
    member_mobile_number: string;
    member_gender: string;
    member_profile_photo_url: string | null;
    member_district: string;
    assignment_district: string | null;
  }>;
}

const Leadership: React.FC = () => {
  const [committeeYear, setCommitteeYear] = useState<string>('');
  const [level, setLevel] = useState<'national' | 'state' | 'district'>('state');
  const [stateName, setStateName] = useState<string>('Andhra Pradesh');
  const [districtName, setDistrictName] = useState<string>('');
  const [states, setStates] = useState<StateMaster[]>([]);
  const [districts, setDistricts] = useState<DistrictOption[]>([]);
  const [isLoadingStates, setIsLoadingStates] = useState(true);
  const [isLoadingDistricts, setIsLoadingDistricts] = useState(false);
  const [isLoadingAssignments, setIsLoadingAssignments] = useState(false);
  const [assignments, setAssignments] = useState<LeadershipAssignment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [availableCommitteeYears, setAvailableCommitteeYears] = useState<string[]>([]);
  const [isLoadingCommitteeYears, setIsLoadingCommitteeYears] = useState<boolean>(false);
  const [committeeYearsError, setCommitteeYearsError] = useState<string | null>(null);

  const loadStates = useCallback(async () => {
    try {
      setIsLoadingStates(true);
      const data = await statesService.getActiveStates();
      setStates(data);
    } catch (err) {
      console.error('Error loading states:', err);
    } finally {
      setIsLoadingStates(false);
    }
  }, []);

  const loadCommitteeYears = useCallback(async () => {
    try {
      setIsLoadingCommitteeYears(true);
      setCommitteeYearsError(null);

      const years = await leadershipService.getCommitteeYears();

      setAvailableCommitteeYears(years);
    } catch (err) {
      console.error('[Leadership] Failed to load committee years', err);
      setCommitteeYearsError('Failed to load committee years. Please try again.');
    } finally {
      setIsLoadingCommitteeYears(false);
    }
  }, []);

  const loadDistricts = useCallback(async (state: string) => {
    try {
      setIsLoadingDistricts(true);
      const data = await locationsService.getActiveDistrictsByStateName(state);
      setDistricts(data);
      if (level === 'district' && !data.find(d => d.district_name === districtName)) {
        setDistrictName('');
      }
    } catch (err) {
      console.error('Error loading districts:', err);
      setDistricts([]);
    } finally {
      setIsLoadingDistricts(false);
    }
  }, [districtName, level]);

  const loadLeadershipAssignments = useCallback(async () => {
    setError(null);
    setIsLoadingAssignments(true);

    try {
      const p_state = level === 'state' || level === 'district' ? stateName : null;
      const p_district = level === 'district' ? districtName : null;

      const { data, error: rpcError } = await supabase.rpc('get_public_leadership_assignments', {
        p_level: level,
        p_state,
        p_district,
        p_as_of_date: null,
        p_committee_year: committeeYear || null
      });

      if (rpcError) {
        console.error('RPC error:', rpcError);
        setError(rpcError.message || 'Failed to load leadership data. Please try again.');
        setAssignments([]);
        return;
      }

      setAssignments(data || []);
    } catch (err) {
      console.error('Error loading leadership assignments:', err);
      setError((err as { message?: string }).message || 'An unexpected error occurred. Please try again.');
      setAssignments([]);
    } finally {
      setIsLoadingAssignments(false);
    }
  }, [committeeYear, districtName, level, stateName]);

  useEffect(() => {
    void loadStates();
    void loadCommitteeYears();
  }, [loadCommitteeYears, loadStates]);

  useEffect(() => {
    if ((level === 'district' || level === 'state') && stateName) {
      void loadDistricts(stateName);
    }
  }, [level, loadDistricts, stateName]);

  useEffect(() => {
    if (hasLoaded) {
      void loadLeadershipAssignments();
    }
  }, [hasLoaded, loadLeadershipAssignments]);

  const handleLoadCommittee = () => {
    setHasLoaded(true);
    void loadLeadershipAssignments();
  };

  const isLoadButtonDisabled = () => {
    if (!committeeYear || !/^\d{4}$/.test(committeeYear)) return true;
    if (level === 'state' && !stateName) return true;
    if (level === 'district' && (!stateName || !districtName)) return true;
    return false;
  };

  const getCommitteeName = () => {
    if (level === 'national') return 'National Committee';
    if (level === 'state') return `${stateName} State Committee`;
    if (level === 'district') return `${districtName} District Committee`;
    return 'Committee';
  };

  const getCommitteePeriod = () => {
    if (assignments.length === 0) return null;

    const startDates = assignments
      .map(a => a.role_start_date)
      .filter((d): d is string => d !== null);

    const endDates = assignments
      .map(a => a.role_end_date)
      .filter((d): d is string => d !== null);

    if (startDates.length === 0 && endDates.length === 0) {
      return null;
    }

    const minStart = startDates.length > 0
      ? new Date(Math.min(...startDates.map(d => new Date(d).getTime())))
      : null;

    const maxEnd = endDates.length > 0
      ? new Date(Math.max(...endDates.map(d => new Date(d).getTime())))
      : null;

    const formatDate = (date: Date) => {
      return formatMonthYearValue(date, { monthStyle: 'long' });
    };

    if (minStart && maxEnd) {
      return `${formatDate(minStart)} – ${formatDate(maxEnd)}`;
    } else if (minStart) {
      return `From ${formatDate(minStart)}`;
    } else if (maxEnd) {
      return `Until ${formatDate(maxEnd)}`;
    }

    return null;
  };

  const getMemberDisplayName = (fullName: string, gender: string) => {
    const genderLower = (gender || '').toLowerCase();
    if (genderLower === 'male' || genderLower === 'm') {
      return `Shri. ${fullName}`;
    } else if (genderLower === 'female' || genderLower === 'f') {
      return `Smt. ${fullName}`;
    }
    return fullName;
  };

  const groupAssignmentsByRole = (): GroupedRole[] => {
    const grouped = assignments.reduce((acc, assignment) => {
      const roleName = assignment.lub_role_name;

      if (!acc[roleName]) {
        acc[roleName] = {
          roleName,
          members: []
        };
      }

      acc[roleName].members.push({
        member_full_name: assignment.member_full_name,
        member_mobile_number: assignment.member_mobile_number,
        member_gender: assignment.member_gender,
        member_profile_photo_url: assignment.member_profile_photo_url,
        member_district: assignment.member_district,
        assignment_district: assignment.district
      });

      return acc;
    }, {} as Record<string, GroupedRole>);

    return Object.values(grouped);
  };

  const groupedRoles = groupAssignmentsByRole();
  const committeeName = getCommitteeName();
  const committeePeriod = getCommitteePeriod();

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <div className="mb-12">
        <div className="text-center mb-8">
          <h1 className="text-xl font-semibold text-foreground mb-4">Leadership</h1>
          <p className="text-muted-foreground">LUB Leadership committees and their members</p>
        </div>

        <div className="bg-card rounded-lg shadow-sm border border-border p-6 space-y-6">
          <h2 className="text-section font-semibold text-foreground mb-4">Select Committee</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-label font-medium text-muted-foreground uppercase tracking-wider mb-2">
                Committee Year <span className="text-red-500">*</span>
              </label>
              <select
                value={committeeYear}
                onChange={(e) => setCommitteeYear(e.target.value)}
                disabled={isLoadingCommitteeYears || !!committeeYearsError || availableCommitteeYears.length === 0}
                className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:ring-1 focus:ring-ring focus:border-ring disabled:bg-muted/50 disabled:cursor-not-allowed"
              >
                <option value="">Select Committee Year</option>
                {availableCommitteeYears.map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
              {committeeYearsError && (
                <p className="mt-1 text-xs text-destructive">{committeeYearsError}</p>
              )}
              {!committeeYearsError && !isLoadingCommitteeYears && availableCommitteeYears.length === 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  No committee years available yet. Please add member role assignments first.
                </p>
              )}
            </div>

            <div>
              <label className="block text-label font-medium text-muted-foreground uppercase tracking-wider mb-2">
                Level <span className="text-red-500">*</span>
              </label>
              <select
                value={level}
                onChange={(e) => setLevel(e.target.value as 'national' | 'state' | 'district')}
                className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:ring-1 focus:ring-ring focus:border-ring"
              >
                <option value="">Select Level</option>
                <option value="national">National</option>
                <option value="state">State</option>
                <option value="district">District</option>
              </select>
            </div>

            {(level === 'state' || level === 'district') && (
              <div>
                <label className="block text-label font-medium text-muted-foreground uppercase tracking-wider mb-2">
                  State <span className="text-red-500">*</span>
                </label>
                {isLoadingStates ? (
                  <div className="w-full px-3 py-2 border border-border rounded-lg bg-muted/50 text-muted-foreground">
                    Loading states...
                  </div>
                ) : (
                  <select
                    value={stateName}
                    onChange={(e) => setStateName(e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:ring-1 focus:ring-ring focus:border-ring"
                  >
                    <option value="">Select State</option>
                    {states.map((state) => (
                      <option key={state.id} value={state.state_name}>
                        {state.state_name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {level === 'district' && stateName && (
              <div>
                <label className="block text-label font-medium text-muted-foreground uppercase tracking-wider mb-2">
                  District <span className="text-red-500">*</span>
                </label>
                {isLoadingDistricts ? (
                  <div className="w-full px-3 py-2 border border-border rounded-lg bg-muted/50 text-muted-foreground">
                    Loading districts...
                  </div>
                ) : (
                  <select
                    value={districtName}
                    onChange={(e) => setDistrictName(e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:ring-1 focus:ring-ring focus:border-ring"
                  >
                    <option value="">Select District</option>
                    {districts.map((district) => (
                      <option key={district.district_id} value={district.district_name}>
                        {district.district_name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            <div>
              <button
                onClick={handleLoadCommittee}
                disabled={isLoadButtonDisabled() || isLoadingAssignments}
                className="w-full sm:w-auto px-6 py-2.5 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {isLoadingAssignments ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading...
                  </>
                ) : (
                  <>
                    <Users className="w-4 h-4" />
                    View Committee
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-8 bg-destructive/10 border border-destructive/20 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-medium text-destructive">Error</h3>
            <p className="text-sm text-destructive mt-1">{error}</p>
          </div>
        </div>
      )}

      {hasLoaded && !isLoadingAssignments && (
        <div>
          {assignments.length === 0 ? (
            <div className="bg-muted/50 rounded-lg p-8 text-center">
              <Users className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
              <h3 className="text-section font-semibold text-foreground mb-1">No Active Assignments</h3>
              <p className="text-muted-foreground">No active leadership assignments found for the selected committee.</p>
            </div>
          ) : (
            <div>
              <div className="mb-8">
                <h2 className="text-xl font-semibold text-foreground mb-2 flex items-center gap-3">
                  <MapPin className="w-8 h-8 text-primary" />
                  {committeeName} – {committeeYear}
                </h2>
                {committeePeriod && (
                  <p className="text-muted-foreground ml-11">
                    ({committeePeriod})
                  </p>
                )}
              </div>

              <div className="space-y-8">
                {groupedRoles.map((roleGroup) => (
                  <div key={roleGroup.roleName} className="bg-card rounded-lg shadow-sm border border-border p-6">
                    <h3 className="text-section font-semibold text-foreground mb-4 pb-3 border-b border-border">
                      {roleGroup.roleName}
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {roleGroup.members.map((member, idx) => {
                        const displayName = getMemberDisplayName(member.member_full_name, member.member_gender);
                        const district = member.member_district || member.assignment_district;

                        return (
                          <div
                            key={idx}
                            className="flex items-start gap-4 p-4 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
                          >
                            <div className="flex-shrink-0">
                              {member.member_profile_photo_url ? (
                                <img
                                  src={member.member_profile_photo_url}
                                  alt={member.member_full_name}
                                  className="w-16 h-16 rounded-lg object-cover"
                                />
                              ) : (
                                <div className="w-16 h-16 rounded-lg bg-primary/10 flex items-center justify-center">
                                  <User className="w-8 h-8 text-primary" />
                                </div>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="font-semibold text-foreground text-base mb-1 truncate">
                                {displayName}
                              </h4>
                              <p className="text-sm text-muted-foreground mb-1">
                                {roleGroup.roleName}
                              </p>
                              {district && (
                                <p className="text-sm text-muted-foreground mb-2 flex items-center gap-1">
                                  <MapPin className="w-3 h-3" />
                                  {district}
                                </p>
                              )}
                              <a
                                href={`tel:${member.member_mobile_number}`}
                                className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors"
                              >
                                <Phone className="w-4 h-4" />
                                <span>{member.member_mobile_number}</span>
                              </a>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Leadership;
