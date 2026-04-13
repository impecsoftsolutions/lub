import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Search,
  Filter,
  MapPin,
  Building2,
  Phone,
  Mail,
  FileText,
  ExternalLink,
  Users,
  ChevronDown,
  EyeOff,
  ChevronLeft,
  ChevronRight,
  Calendar,
  X,
  LayoutGrid,
  List
} from 'lucide-react';
import { supabase, locationsService } from '../lib/supabase';
import { useMember } from '../contexts/useMember';
import ExpandedMemberDetails from '../components/ExpandedMemberDetails';

interface MemberData {
  id: string;
  full_name: string;
  email: string;
  mobile_number: string;
  company_name: string;
  company_designation_id: string | null;
  company_designations: { designation_name: string } | null;
  company_address: string;
  city: string;
  other_city_name?: string;
  is_custom_city?: boolean;
  district: string;
  state: string;
  products_services: string;
  website?: string;
  member_id?: string;
  gst_certificate_url?: string;
  udyam_certificate_url?: string;
  payment_proof_url?: string;
  created_at: string;
}

interface UserRole {
  isLoggedIn: boolean;
  isAdmin: boolean;
  isMember: boolean;
}

interface StateGroup {
  state: string;
  members: MemberData[];
  memberCount: number;
}

const RECORDS_PER_PAGE_OPTIONS = [25, 50, 100];
const MOBILE_RECORDS_PER_PAGE = 20;

type ViewMode = 'card' | 'list';

const Directory: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { member, isAuthenticated } = useMember();

  const [members, setMembers] = useState<MemberData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [userRole, setUserRole] = useState<UserRole>({
    isLoggedIn: false,
    isAdmin: false,
    isMember: false
  });

  const [searchTerm, setSearchTerm] = useState(searchParams.get('search') || '');
  const [selectedState, setSelectedState] = useState(searchParams.get('state') || '');
  const [selectedDistrict, setSelectedDistrict] = useState(searchParams.get('district') || '');
  const [selectedCity, setSelectedCity] = useState(searchParams.get('city') || '');
  const [showFilters, setShowFilters] = useState(false);

  const [currentPage, setCurrentPage] = useState(
    parseInt(searchParams.get('page') || '1', 10)
  );
  const [recordsPerPage, setRecordsPerPage] = useState(
    parseInt(searchParams.get('perPage') || '25', 10)
  );

  const [isMobile, setIsMobile] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [expandedMemberId, setExpandedMemberId] = useState<string | null>(null);
  const [allDistricts, setAllDistricts] = useState<string[]>([]);
  const [allCities, setAllCities] = useState<Array<{ id: string; city_name: string }>>([]);

  const formatCityDisplay = (city: string, otherCityName?: string, isCustomCity?: boolean): string => {
    if (isCustomCity && otherCityName) {
      return otherCityName;
    }
    return city || '';
  };

  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) {
        setRecordsPerPage(prev =>
          prev > MOBILE_RECORDS_PER_PAGE ? MOBILE_RECORDS_PER_PAGE : prev
        );
      }
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    const savedView = localStorage.getItem('directory-view-mode');
    if (savedView && (savedView === 'card' || savedView === 'list')) {
      if (!isMobile) {
        setViewMode(savedView);
      } else {
        setViewMode('card');
      }
    } else {
      setViewMode(isMobile ? 'card' : 'list');
    }
  }, [isMobile]);

  const handleViewModeChange = (mode: ViewMode) => {
    console.log('[Directory] View mode changed to:', mode);
    setViewMode(mode);
    localStorage.setItem('directory-view-mode', mode);
  };

  // Update user role when member authentication changes
  useEffect(() => {
    if (isAuthenticated && member) {
      const isAdminUser = member.account_type === 'admin' || member.account_type === 'both';
      setUserRole({
        isLoggedIn: true,
        isAdmin: isAdminUser,
        isMember: true
      });
    } else {
      setUserRole({
        isLoggedIn: false,
        isAdmin: false,
        isMember: false
      });
    }
  }, [isAuthenticated, member]);

  const loadMembers = useCallback(async () => {
    console.log('[Directory] Loading members...');
    try {
      setIsLoading(true);
      setError(null);

      const query = supabase
        .from('member_registrations')
        .select(`
          id,
          full_name,
          email,
          mobile_number,
          company_name,
          company_designation_id,
          company_designations!left(designation_name),
          company_address,
          city,
          other_city_name,
          is_custom_city,
          district,
          state,
          products_services,
          website,
          member_id,
          profile_photo_url,
          gst_certificate_url,
          udyam_certificate_url,
          payment_proof_url,
          created_at
        `)
        .eq('status', 'approved')
        .eq('is_active', true)
        .order('state', { ascending: true })
        .order('full_name', { ascending: true });

      console.log('[Directory] Executing member query...');
      const { data, error: fetchError } = await query;

      if (fetchError) {
        console.error('[Directory] Fetch error details:', {
          message: fetchError.message,
          details: fetchError.details,
          hint: fetchError.hint,
          code: fetchError.code
        });
        throw fetchError;
      }

      if (!data) {
        console.warn('[Directory] No data returned from query');
        setMembers([]);
        return;
      }

      console.log('[Directory] Members loaded successfully:', data.length, 'members');
      setMembers(data || []);
    } catch (err: unknown) {
      console.error('[Directory] Error loading members:', err);
      console.error('[Directory] Error type:', typeof err);
      console.error('[Directory] Error keys:', err && typeof err === 'object' ? Object.keys(err) : []);

      let errorMessage = 'Failed to load members. ';
      const supabaseError = err as {
        message?: string;
        details?: string;
        hint?: string;
        code?: string;
      };

      if (supabaseError.message) {
        errorMessage += `Error: ${supabaseError.message}`;
      }
      if (supabaseError.details) {
        errorMessage += ` Details: ${supabaseError.details}`;
      }
      if (supabaseError.hint) {
        errorMessage += ` Hint: ${supabaseError.hint}`;
      }
      if (supabaseError.code) {
        errorMessage += ` (Code: ${supabaseError.code})`;
      }

      if (supabaseError.code === 'PGRST116') {
        errorMessage = 'Foreign key constraint error. The company_designations table relationship may have issues.';
      } else if (supabaseError.code === 'PGRST301') {
        errorMessage = 'Permission denied. RLS policies may not be configured correctly.';
      } else if (supabaseError.message?.includes('foreign key')) {
        errorMessage = 'Database relationship error. Some members may have invalid company designation references.';
      }

      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const filteredMembers = useMemo(() => {
    console.log('[Directory] Applying filters - search:', searchTerm, 'state:', selectedState, 'district:', selectedDistrict, 'city:', selectedCity);
    let filtered = members;

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(member =>
        member.full_name.toLowerCase().includes(term) ||
        member.company_name.toLowerCase().includes(term) ||
        member.district.toLowerCase().includes(term) ||
        (member.city && member.city.toLowerCase().includes(term)) ||
        (member.other_city_name && member.other_city_name.toLowerCase().includes(term)) ||
        member.products_services.toLowerCase().includes(term)
      );
    }

    if (selectedState) {
      filtered = filtered.filter(member => member.state === selectedState);
    }

    if (selectedDistrict) {
      filtered = filtered.filter(member => member.district === selectedDistrict);
    }

    if (selectedCity) {
      filtered = filtered.filter(member => {
        if (member.is_custom_city && member.other_city_name) {
          return member.other_city_name === selectedCity;
        }
        return member.city === selectedCity;
      });
    }

    console.log('[Directory] Filter applied, result count:', filtered.length);
    return filtered;
  }, [members, searchTerm, selectedState, selectedDistrict, selectedCity]);

  const stateGroups = useMemo(() => {
    const groups: Record<string, MemberData[]> = {};

    filteredMembers.forEach(member => {
      if (!groups[member.state]) {
        groups[member.state] = [];
      }
      groups[member.state].push(member);
    });

    return Object.entries(groups)
      .map(([state, stateMembers]) => ({
        state,
        members: stateMembers,
        memberCount: stateMembers.length
      }))
      .sort((a, b) => a.state.localeCompare(b.state));
  }, [filteredMembers]);

  const paginatedStateGroups = useMemo(() => {
    const startIndex = (currentPage - 1) * recordsPerPage;
    const endIndex = startIndex + recordsPerPage;

    const flatMembers: Array<{ type: 'member' | 'header'; data: MemberData | { state: string; count: number }; state?: string }> = [];

    stateGroups.forEach(group => {
      flatMembers.push({
        type: 'header',
        data: { state: group.state, count: group.memberCount },
        state: group.state
      });
      group.members.forEach(member => {
        flatMembers.push({
          type: 'member',
          data: member,
          state: group.state
        });
      });
    });

    const memberItems = flatMembers.filter(item => item.type === 'member');
    const paginatedMembers = memberItems.slice(startIndex, endIndex);

    const paginatedGroups: StateGroup[] = [];
    const statesInPage = new Set(paginatedMembers.map(item => item.state));

    statesInPage.forEach(state => {
      const membersInState = paginatedMembers
        .filter(item => item.state === state)
        .map(item => item.data);

      if (membersInState.length > 0) {
        paginatedGroups.push({
          state: state!,
          members: membersInState,
          memberCount: membersInState.length
        });
      }
    });

    return paginatedGroups.sort((a, b) => a.state.localeCompare(b.state));
  }, [stateGroups, currentPage, recordsPerPage]);

  const totalPages = Math.ceil(filteredMembers.length / recordsPerPage);
  const startRecord = filteredMembers.length === 0 ? 0 : (currentPage - 1) * recordsPerPage + 1;
  const endRecord = Math.min(currentPage * recordsPerPage, filteredMembers.length);

  const uniqueStates = useMemo(() =>
    [...new Set(members.map(m => m.state))].sort(),
    [members]
  );

  const uniqueDistricts = useMemo(() => {
    return allDistricts;
  }, [allDistricts]);

  const loadDistrictsForState = useCallback(async (stateName: string) => {
    console.log('[Directory] Loading districts for state:', stateName);
    try {
      const districts = await locationsService.getActiveDistrictsByStateName(stateName);
      const districtNames = districts.map(d => d.district_name).sort();
      console.log('[Directory] Districts loaded:', districtNames.length, 'districts');
      setAllDistricts(districtNames);
    } catch (error) {
      console.error('[Directory] Error loading districts:', error);
      setAllDistricts([]);
    }
  }, []);

  const loadCitiesForDistrict = useCallback(async (districtName: string) => {
    console.log('[Directory] Loading cities for district:', districtName);
    try {
      const districts = await locationsService.getActiveDistrictsByStateName(selectedState);
      const district = districts.find(d => d.district_name === districtName);
      if (district) {
        const cities = await locationsService.getActiveCitiesByDistrictId(district.district_id);
        const approvedCities = cities.filter(c => c.city_name !== 'Other');
        console.log('[Directory] Cities loaded:', approvedCities.length, 'cities');
        setAllCities(approvedCities.map(c => ({ id: c.city_id, city_name: c.city_name })));
      } else {
        console.log('[Directory] District not found');
      }
    } catch (error) {
      console.error('[Directory] Error loading cities:', error);
      setAllCities([]);
    }
  }, [selectedState]);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  useEffect(() => {
    const params: Record<string, string> = {};
    if (searchTerm) params.search = searchTerm;
    if (selectedState) params.state = selectedState;
    if (selectedDistrict) params.district = selectedDistrict;
    if (currentPage > 1) params.page = currentPage.toString();
    if (recordsPerPage !== 25) params.perPage = recordsPerPage.toString();

    setSearchParams(params);
    setExpandedMemberId(null);
  }, [currentPage, recordsPerPage, searchTerm, selectedDistrict, selectedState, setSearchParams]);

  useEffect(() => {
    if (selectedState) {
      void loadDistrictsForState(selectedState);
    } else {
      setAllDistricts([]);
      setAllCities([]);
    }
  }, [loadDistrictsForState, selectedState]);

  useEffect(() => {
    if (selectedDistrict) {
      void loadCitiesForDistrict(selectedDistrict);
    } else {
      setAllCities([]);
    }
  }, [loadCitiesForDistrict, selectedDistrict]);

  const clearFilters = () => {
    setSearchTerm('');
    setSelectedState('');
    setSelectedDistrict('');
    setSelectedCity('');
    setCurrentPage(1);
  };

  const handlePageChange = (page: number) => {
    console.log('[Directory] Page changed to:', page);
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleRecordsPerPageChange = (newPerPage: number) => {
    console.log('[Directory] Records per page changed to:', newPerPage);
    setRecordsPerPage(newPerPage);
    setCurrentPage(1);
  };

  const formatMemberSince = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  };

  const MemberCard: React.FC<{ member: MemberData }> = ({ member }) => {
    const isExpanded = expandedMemberId === member.id;

    const handleCardClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      setExpandedMemberId(isExpanded ? null : member.id);
    };

    return (
      <div className="bg-card rounded-lg shadow-sm border border-border overflow-hidden">
        <div
          className="p-6 hover:shadow-md transition-all duration-200 cursor-pointer group"
          onClick={handleCardClick}
        >
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            <h3 className="text-section font-semibold text-foreground mb-2 group-hover:text-primary transition-colors">
              {member.full_name}
            </h3>
            <p className="text-sm font-medium text-primary mb-1">
              {member.company_name}
            </p>
          </div>
        </div>

        <div className="flex items-center text-sm text-muted-foreground mb-4">
          <MapPin className="w-4 h-4 mr-1 flex-shrink-0" />
          <span>{member.district}, {formatCityDisplay(member.city, member.other_city_name, member.is_custom_city)}</span>
        </div>

        {userRole.isLoggedIn && (
          <>
            {member.company_designations && (
              <div className="mb-3">
                <p className="text-sm text-muted-foreground">
                  {member.company_designations.designation_name}
                </p>
              </div>
            )}

            <div className="flex items-center text-xs text-muted-foreground mb-4">
              <Calendar className="w-3 h-3 mr-1" />
              Member since {formatMemberSince(member.created_at)}
            </div>

            <div className="border-t border-border pt-4 space-y-2">
              <div className="flex items-center text-sm text-foreground">
                <Phone className="w-4 h-4 text-muted-foreground mr-2 flex-shrink-0" />
                <a
                  href={`tel:+91${member.mobile_number}`}
                  onClick={(e) => e.stopPropagation()}
                  className="hover:text-primary"
                >
                  +91 {member.mobile_number}
                </a>
              </div>
              <div className="flex items-center text-sm text-foreground">
                <Mail className="w-4 h-4 text-muted-foreground mr-2 flex-shrink-0" />
                <a
                  href={`mailto:${member.email}`}
                  onClick={(e) => e.stopPropagation()}
                  className="hover:text-primary truncate"
                >
                  {member.email}
                </a>
              </div>
              <div className="flex items-start text-sm text-foreground">
                <Building2 className="w-4 h-4 text-muted-foreground mr-2 flex-shrink-0 mt-0.5" />
                <span className="line-clamp-2">{member.company_address}</span>
              </div>
              {member.website && (
                <div className="flex items-center text-sm">
                  <ExternalLink className="w-4 h-4 text-muted-foreground mr-2 flex-shrink-0" />
                  <a
                    href={member.website.startsWith('http') ? member.website : `https://${member.website}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-primary hover:text-primary/80 truncate"
                  >
                    {member.website}
                  </a>
                </div>
              )}

              {userRole.isAdmin && (member.gst_certificate_url || member.udyam_certificate_url || member.payment_proof_url) && (
                <div className="border-t border-border pt-3 mt-3">
                  <p className="text-label font-medium text-muted-foreground uppercase tracking-wider mb-2">Documents</p>
                  <div className="flex flex-wrap gap-2">
                    {member.gst_certificate_url && (
                      <a
                        href={member.gst_certificate_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center px-2 py-1 text-xs font-medium text-primary bg-primary/10 rounded-full hover:bg-primary/20 transition-colors"
                      >
                        <FileText className="w-3 h-3 mr-1" />
                        GST
                      </a>
                    )}
                    {member.udyam_certificate_url && (
                      <a
                        href={member.udyam_certificate_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center px-2 py-1 text-xs font-medium text-primary bg-primary/10 rounded-full hover:bg-primary/20 transition-colors"
                      >
                        <FileText className="w-3 h-3 mr-1" />
                        UDYAM
                      </a>
                    )}
                    {member.payment_proof_url && (
                      <a
                        href={member.payment_proof_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center px-2 py-1 text-xs font-medium text-amber-600 bg-amber-50 rounded-full hover:bg-amber-100 transition-colors"
                      >
                        <FileText className="w-3 h-3 mr-1" />
                        Payment
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        </div>
        {isExpanded && (
          <ExpandedMemberDetails member={member} userRole={userRole} />
        )}
      </div>
    );
  };

  const MemberTableRow: React.FC<{ member: MemberData }> = ({ member }) => {
    const isExpanded = expandedMemberId === member.id;

    const handleRowClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      setExpandedMemberId(isExpanded ? null : member.id);
    };

    return (
      <>
        <tr
          className="border-b border-border hover:bg-muted/50 transition-colors cursor-pointer"
          onClick={handleRowClick}
        >
        <td className="px-6 py-4">
          <div className="flex flex-col">
            <span className="font-semibold text-foreground hover:text-primary">
              {member.full_name}
            </span>
            {member.company_designations && (
              <span className="text-xs text-muted-foreground mt-1">
                {member.company_designations.designation_name}
              </span>
            )}
          </div>
        </td>
        <td className="px-6 py-4">
          <span className="text-foreground font-medium">{member.company_name}</span>
        </td>
        <td className="px-6 py-4">
          <div className="flex items-center text-foreground">
            <span>{formatCityDisplay(member.city, member.other_city_name, member.is_custom_city)}</span>
          </div>
        </td>
        <td className="px-6 py-4">
          <span className="text-foreground">{member.district}</span>
        </td>
        </tr>
        {isExpanded && (
          <tr>
            <td colSpan={4} className="p-0">
              <ExpandedMemberDetails member={member} userRole={userRole} />
            </td>
          </tr>
        )}
      </>
    );
  };

  const StateHeader: React.FC<{ state: string }> = ({ state }) => (
    <div className="col-span-full bg-muted/50 border border-border rounded-lg p-4 mb-4">
      <div className="flex items-center">
        <MapPin className="w-5 h-5 text-primary mr-2" />
        <h2 className="text-section font-semibold text-foreground">{state}</h2>
      </div>
    </div>
  );

  const Pagination: React.FC = () => {
    const getPageNumbers = () => {
      const pages: (number | string)[] = [];

      if (totalPages <= 7) {
        for (let i = 1; i <= totalPages; i++) {
          pages.push(i);
        }
      } else {
        pages.push(1);

        if (currentPage > 3) {
          pages.push('...');
        }

        for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) {
          pages.push(i);
        }

        if (currentPage < totalPages - 2) {
          pages.push('...');
        }

        pages.push(totalPages);
      }

      return pages;
    };

    return (
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-8">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Show:</span>
          <select
            value={recordsPerPage}
            onChange={(e) => handleRecordsPerPageChange(Number(e.target.value))}
            className="px-3 py-2 border border-border rounded-lg text-sm bg-background text-foreground focus:ring-1 focus:ring-ring focus:border-ring"
          >
            {RECORDS_PER_PAGE_OPTIONS.map(option => (
              <option key={option} value={option}>{option} per page</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className="p-2 border border-border rounded-lg hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-1">
            {getPageNumbers().map((page, index) => (
              page === '...' ? (
                <span key={`ellipsis-${index}`} className="px-3 py-2 text-muted-foreground">...</span>
              ) : (
                <button
                  key={page}
                  onClick={() => handlePageChange(page as number)}
                  className={`min-w-[40px] px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    currentPage === page
                      ? 'bg-primary text-primary-foreground'
                      : 'border border-border text-foreground hover:bg-muted/50'
                  }`}
                >
                  {page}
                </button>
              )
            ))}
          </div>

          <button
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="p-2 border border-border rounded-lg hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    );
  };

  if (error) {
    return (
      <div className="min-h-screen bg-background py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-6 text-center">
            <div className="text-destructive text-section font-semibold mb-2">Error Loading Members</div>
            <p className="text-destructive mb-4">{error}</p>
            <button
              onClick={loadMembers}
              className="px-4 py-2 bg-destructive text-destructive-foreground rounded-lg hover:bg-destructive/90 transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <Users className="w-10 h-10 text-primary mr-3" />
            <h1 className="text-xl font-semibold text-foreground">Members Directory</h1>
          </div>
          <p className="text-muted-foreground max-w-3xl mx-auto">
            Connect with our network of approved MSME entrepreneurs across India
          </p>

        </div>

        <div className="bg-card rounded-lg shadow-sm border border-border p-6 mb-8">
          <div className="flex flex-col sm:flex-row gap-4 mb-4">
            <div className="flex-1 relative">
              <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search by name, company, location, or products..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full pl-10 pr-4 py-3 border border-border rounded-lg bg-background text-foreground focus:ring-1 focus:ring-ring focus:border-ring"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>
            <div className="flex gap-2">
              {!isMobile && (
                <div className="inline-flex border border-border rounded-lg overflow-hidden bg-card">
                  <button
                    onClick={() => handleViewModeChange('list')}
                    className={`px-4 py-3 transition-colors ${
                      viewMode === 'list'
                        ? 'bg-primary text-primary-foreground'
                        : 'text-foreground hover:bg-muted/50'
                    }`}
                    title="List View"
                  >
                    <List className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => handleViewModeChange('card')}
                    className={`px-4 py-3 transition-colors ${
                      viewMode === 'card'
                        ? 'bg-primary text-primary-foreground'
                        : 'text-foreground hover:bg-muted/50'
                    }`}
                    title="Card View"
                  >
                    <LayoutGrid className="w-5 h-5" />
                  </button>
                </div>
              )}
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="inline-flex items-center px-6 py-3 border border-border rounded-lg text-foreground bg-card hover:bg-muted/50 transition-colors"
              >
                <Filter className="w-5 h-5 mr-2" />
                Filters
                <ChevronDown className={`w-4 h-4 ml-2 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
              </button>
            </div>
          </div>

          {showFilters && (
            <div className="border-t border-border pt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-label font-medium text-muted-foreground uppercase tracking-wider mb-2">State</label>
                  <select
                    value={selectedState}
                    onChange={(e) => {
                      setSelectedState(e.target.value);
                      setSelectedDistrict('');
                      setSelectedCity('');
                      setCurrentPage(1);
                    }}
                    className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:ring-1 focus:ring-ring focus:border-ring"
                  >
                    <option value="">All States</option>
                    {uniqueStates.map(state => (
                      <option key={state} value={state}>{state}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-label font-medium text-muted-foreground uppercase tracking-wider mb-2">District</label>
                  <select
                    value={selectedDistrict}
                    onChange={(e) => {
                      setSelectedDistrict(e.target.value);
                      setSelectedCity('');
                      setCurrentPage(1);
                    }}
                    className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:ring-1 focus:ring-ring focus:border-ring disabled:bg-muted/50 disabled:cursor-not-allowed"
                    disabled={!selectedState}
                  >
                    <option value="">{selectedState ? 'All Districts' : 'Select a state first'}</option>
                    {uniqueDistricts.map(district => (
                      <option key={district} value={district}>{district}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-label font-medium text-muted-foreground uppercase tracking-wider mb-2">City</label>
                  <select
                    value={selectedCity}
                    onChange={(e) => {
                      setSelectedCity(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:ring-1 focus:ring-ring focus:border-ring disabled:bg-muted/50 disabled:cursor-not-allowed"
                    disabled={!selectedDistrict}
                  >
                    <option value="">{selectedDistrict ? 'All Cities' : 'Select a district first'}</option>
                    {allCities.map(city => (
                      <option key={city.id} value={city.city_name}>{city.city_name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end">
                  <button
                    onClick={clearFilters}
                    className="w-full px-4 py-2 text-sm font-medium text-foreground bg-muted rounded-lg hover:bg-muted/80 transition-colors"
                  >
                    Clear Filters
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="mt-4 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              Showing <span className="font-semibold">{startRecord}-{endRecord}</span> of{' '}
              <span className="font-semibold">{filteredMembers.length}</span> members
              {filteredMembers.length !== members.length && (
                <span className="text-muted-foreground"> (filtered from {members.length} total)</span>
              )}
            </span>
            {(searchTerm || selectedState || selectedDistrict || selectedCity) && (
              <button
                onClick={clearFilters}
                className="text-primary hover:text-primary/80 font-medium"
              >
                Clear all filters
              </button>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-16">
            <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading members...</p>
          </div>
        ) : filteredMembers.length === 0 ? (
          <div className="text-center py-16 bg-card rounded-lg border border-border">
            <Users className="w-20 h-20 text-muted-foreground/40 mx-auto mb-4" />
            <h3 className="text-section font-semibold text-foreground mb-2">No members found</h3>
            <p className="text-muted-foreground mb-6">
              {selectedCity && selectedDistrict
                ? `No members found in ${selectedCity}. Try selecting a different city or clear filters.`
                : selectedDistrict && selectedState
                ? `No members found in ${selectedDistrict} district. Try selecting a different district or clear filters.`
                : searchTerm || selectedState || selectedDistrict || selectedCity
                ? 'Try adjusting your search or filter criteria'
                : 'No approved members are available yet'}
            </p>
            {(searchTerm || selectedState || selectedDistrict || selectedCity) && (
              <button
                onClick={clearFilters}
                className="px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
              >
                Clear all filters
              </button>
            )}
          </div>
        ) : (
          <>
            {viewMode === 'card' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {paginatedStateGroups.map((group) => (
                  <React.Fragment key={group.state}>
                    <StateHeader state={group.state} />
                    {group.members.map((member) => (
                      <MemberCard key={member.id} member={member} />
                    ))}
                  </React.Fragment>
                ))}
              </div>
            ) : (
              <div className="space-y-6">
                {paginatedStateGroups.map((group) => (
                  <div key={group.state} className="bg-card rounded-lg shadow-sm border border-border overflow-hidden">
                    <div className="bg-muted/50 border-b border-border px-6 py-4">
                      <div className="flex items-center">
                        <MapPin className="w-5 h-5 text-primary mr-2" />
                        <h2 className="text-section font-semibold text-foreground">{group.state}</h2>
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-muted/50 border-b border-border">
                          <tr>
                            <th className="px-6 py-3 text-left text-label font-medium text-muted-foreground uppercase tracking-wider">
                              Member Name
                            </th>
                            <th className="px-6 py-3 text-left text-label font-medium text-muted-foreground uppercase tracking-wider">
                              Company Name
                            </th>
                            <th className="px-6 py-3 text-left text-label font-medium text-muted-foreground uppercase tracking-wider">
                              City/Town
                            </th>
                            <th className="px-6 py-3 text-left text-label font-medium text-muted-foreground uppercase tracking-wider">
                              District
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-card divide-y divide-border">
                          {group.members.map((member) => (
                            <MemberTableRow key={member.id} member={member} />
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!userRole.isLoggedIn && filteredMembers.length > 0 && (
              <div className="mt-6 bg-primary/10 border border-primary/20 rounded-lg p-4">
                <div className="flex items-center justify-center text-center">
                  <EyeOff className="w-5 h-5 mr-2 text-primary" />
                  <span className="text-sm text-foreground">
                    Contact details are hidden. <button
                      onClick={() => navigate('/signin')}
                      className="font-semibold underline hover:text-primary/80"
                    >
                      Sign in
                    </button> to view full details
                  </span>
                </div>
              </div>
            )}

            {totalPages > 1 && <Pagination />}
          </>
        )}
      </div>
    </div>
  );
};

export default Directory;
