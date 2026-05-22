import React, { useState, useEffect, useMemo } from 'react';
import { Search, X, Phone, Mail, ChevronUp, ChevronDown } from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { PermissionGate } from '../components/permissions/PermissionGate';
import { memberLubRolesService, MemberLubRoleAssignment } from '../lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

type RoleFamily = 'all' | 'president' | 'secretary';
type Level = 'all' | 'national' | 'state' | 'district' | 'city';
type SortKey = 'role' | 'name' | 'level' | 'state' | 'year';
type SortDir = 'asc' | 'desc';

const LEADERSHIP_ROLE_KEYWORDS = ['president', 'general secretary', 'secretary general'];

function isLeadershipRole(roleName: string): boolean {
  const lower = roleName.toLowerCase();
  return LEADERSHIP_ROLE_KEYWORDS.some((kw) => lower.includes(kw));
}

function getRoleFamily(roleName: string): RoleFamily {
  const lower = roleName.toLowerCase();
  if (lower.includes('president')) return 'president';
  if (lower.includes('secretary')) return 'secretary';
  return 'all';
}

function getDisplayName(a: MemberLubRoleAssignment): string {
  if (a.assignee_kind === 'alternate' && a.alternate_contact_name_snapshot) {
    return a.alternate_contact_name_snapshot;
  }
  return a.member_name ?? a.member_registrations?.full_name ?? '—';
}

function getMobile(a: MemberLubRoleAssignment): string {
  if (a.assignee_kind === 'alternate') {
    return a.alternate_contact_mobile_snapshot ?? '—';
  }
  return a.member_registrations?.mobile_number ?? '—';
}

function getEmail(a: MemberLubRoleAssignment): string {
  return a.member_email ?? a.member_registrations?.email ?? '—';
}

function formatPeriod(a: MemberLubRoleAssignment & { role_start_date?: string | null; role_end_date?: string | null }): string {
  const start = a.role_start_date;
  const end = a.role_end_date;
  if (!start && !end) return '—';
  if (start && end) return `${start} – ${end}`;
  if (start) return `From ${start}`;
  if (end) return `Until ${end}`;
  return '—';
}

function levelLabel(level: string): string {
  return level.charAt(0).toUpperCase() + level.slice(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// Extended assignment type (extra fields mapped from RPC but not in interface)
// ─────────────────────────────────────────────────────────────────────────────

interface LeadershipAssignment extends MemberLubRoleAssignment {
  committee_year?: string | null;
  role_start_date?: string | null;
  role_end_date?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

const LEVEL_OPTIONS: { value: Level; label: string }[] = [
  { value: 'all', label: 'All levels' },
  { value: 'national', label: 'National' },
  { value: 'state', label: 'State' },
  { value: 'district', label: 'District' },
  { value: 'city', label: 'City' },
];

const FAMILY_OPTIONS: { value: RoleFamily; label: string }[] = [
  { value: 'all', label: 'All roles' },
  { value: 'president', label: 'Presidents' },
  { value: 'secretary', label: 'Secretaries' },
];

const AdminLeadershipContacts: React.FC = () => {
  const [allAssignments, setAllAssignments] = useState<LeadershipAssignment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState<Level>('all');
  const [familyFilter, setFamilyFilter] = useState<RoleFamily>('all');
  const [sortKey, setSortKey] = useState<SortKey>('role');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // ── Load ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const all = (await memberLubRolesService.getAllAssignments({})) as LeadershipAssignment[];
        if (!cancelled) {
          const leadership = all.filter((a) => isLeadershipRole(a.role_name ?? a.lub_roles_master?.role_name ?? ''));
          setAllAssignments(leadership);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('[AdminLeadershipContacts] load error:', err);
          setError('Failed to load leadership contacts. Please try again.');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void load();
    return () => { cancelled = true; };
  }, []);

  // ── Filter + sort ────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const lq = search.toLowerCase().trim();

    return allAssignments
      .filter((a) => {
        if (levelFilter !== 'all' && a.level !== levelFilter) return false;
        if (familyFilter !== 'all' && getRoleFamily(a.role_name ?? '') !== familyFilter) return false;
        if (!lq) return true;

        const name = getDisplayName(a).toLowerCase();
        const role = (a.role_name ?? '').toLowerCase();
        const state = (a.state ?? '').toLowerCase();
        const district = (a.district ?? '').toLowerCase();
        const mobile = getMobile(a).toLowerCase();
        const email = getEmail(a).toLowerCase();
        const year = (a.committee_year ?? '').toLowerCase();

        return (
          name.includes(lq) ||
          role.includes(lq) ||
          state.includes(lq) ||
          district.includes(lq) ||
          mobile.includes(lq) ||
          email.includes(lq) ||
          year.includes(lq)
        );
      })
      .sort((a, b) => {
        let va = '';
        let vb = '';

        switch (sortKey) {
          case 'role':
            va = a.role_name ?? '';
            vb = b.role_name ?? '';
            break;
          case 'name':
            va = getDisplayName(a);
            vb = getDisplayName(b);
            break;
          case 'level':
            va = a.level;
            vb = b.level;
            break;
          case 'state':
            va = a.state ?? '';
            vb = b.state ?? '';
            break;
          case 'year':
            va = a.committee_year ?? '';
            vb = b.committee_year ?? '';
            break;
        }

        const cmp = va.localeCompare(vb);
        return sortDir === 'asc' ? cmp : -cmp;
      });
  }, [allAssignments, search, levelFilter, familyFilter, sortKey, sortDir]);

  // ── Sort toggle ──────────────────────────────────────────────────────────────
  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return null;
    return sortDir === 'asc'
      ? <ChevronUp className="inline w-3 h-3 ml-0.5" />
      : <ChevronDown className="inline w-3 h-3 ml-0.5" />;
  };

  const hasFilters = search.trim() !== '' || levelFilter !== 'all' || familyFilter !== 'all';

  const clearFilters = () => {
    setSearch('');
    setLevelFilter('all');
    setFamilyFilter('all');
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <PermissionGate permission="dashboard.view">
      <div>
        <PageHeader
          title="Leadership Contacts"
          subtitle="Presidents and Secretaries across all levels and committee years"
        />

        {/* Filters */}
        <div className="mb-4 flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, role, state, mobile…"
              className="pl-9 h-9"
            />
          </div>

          <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value as Level)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {LEVEL_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          <select
            value={familyFilter}
            onChange={(e) => setFamilyFilter(e.target.value as RoleFamily)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {FAMILY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1.5">
              <X className="w-3.5 h-3.5" />
              Clear
            </Button>
          )}

          {!isLoading && (
            <span className="ml-auto text-xs text-muted-foreground">
              {filtered.length} contact{filtered.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Table */}
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th
                    className="px-4 py-3 text-left font-medium text-muted-foreground cursor-pointer select-none whitespace-nowrap hover:text-foreground"
                    onClick={() => handleSort('role')}
                  >
                    Role <SortIcon k="role" />
                  </th>
                  <th
                    className="px-4 py-3 text-left font-medium text-muted-foreground cursor-pointer select-none whitespace-nowrap hover:text-foreground"
                    onClick={() => handleSort('name')}
                  >
                    Name <SortIcon k="name" />
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">
                    Kind
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">
                    Mobile
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">
                    Email
                  </th>
                  <th
                    className="px-4 py-3 text-left font-medium text-muted-foreground cursor-pointer select-none whitespace-nowrap hover:text-foreground"
                    onClick={() => handleSort('level')}
                  >
                    Level <SortIcon k="level" />
                  </th>
                  <th
                    className="px-4 py-3 text-left font-medium text-muted-foreground cursor-pointer select-none whitespace-nowrap hover:text-foreground"
                    onClick={() => handleSort('state')}
                  >
                    State <SortIcon k="state" />
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">
                    District
                  </th>
                  <th
                    className="px-4 py-3 text-left font-medium text-muted-foreground cursor-pointer select-none whitespace-nowrap hover:text-foreground"
                    onClick={() => handleSort('year')}
                  >
                    Year <SortIcon k="year" />
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">
                    Period
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      {Array.from({ length: 10 }).map((__, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 rounded bg-muted" style={{ width: `${60 + (j * 7) % 40}%` }} />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-12 text-center text-muted-foreground">
                      {hasFilters
                        ? 'No contacts match your filters.'
                        : 'No leadership contacts found.'}
                    </td>
                  </tr>
                ) : (
                  filtered.map((a) => {
                    const mobile = getMobile(a);
                    const email = getEmail(a);
                    return (
                      <tr key={a.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 font-medium text-foreground whitespace-nowrap">
                          {a.role_name ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-foreground whitespace-nowrap">
                          {getDisplayName(a)}
                        </td>
                        <td className="px-4 py-3">
                          {a.assignee_kind === 'alternate' ? (
                            <span className="inline-flex items-center rounded-full bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                              Alternate
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                              Main
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {mobile !== '—' ? (
                            <a
                              href={`tel:${mobile}`}
                              className="inline-flex items-center gap-1.5 text-foreground hover:text-primary transition-colors"
                            >
                              <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                              {mobile}
                            </a>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {email !== '—' ? (
                            <a
                              href={`mailto:${email}`}
                              className="inline-flex items-center gap-1.5 text-foreground hover:text-primary transition-colors"
                            >
                              <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                              {email}
                            </a>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="text-muted-foreground">{levelLabel(a.level)}</span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {a.state ?? <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {a.district ?? <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {a.committee_year ?? <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-muted-foreground text-xs">
                          {formatPeriod(a)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </PermissionGate>
  );
};

export default AdminLeadershipContacts;
