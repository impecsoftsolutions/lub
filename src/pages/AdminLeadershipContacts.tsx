import React, { useState, useEffect, useMemo } from 'react';
import { Search, X, Phone, Mail, ChevronDown, ChevronRight } from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { PermissionGate } from '../components/permissions/PermissionGate';
import { memberLubRolesService, MemberLubRoleAssignment } from '../lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type RoleFilter = 'all' | string;
type Level = 'all' | 'state' | 'district';

interface LeadershipAssignment extends MemberLubRoleAssignment {
  committee_year?: string | null;
  role_start_date?: string | null;
  role_end_date?: string | null;
}

interface UnitData {
  key: string;
  title: string;
  subtitle?: string;
  currentMembers: LeadershipAssignment[];
  /** Historical members grouped by year, sorted desc (newest first). */
  historicalByYear: [string, LeadershipAssignment[]][];
  /**
   * Top role holders for the card header, derived from DB role names
   * and display order only (no hardcoded role keywords).
   */
  summaryAssignments: LeadershipAssignment[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const LEVEL_OPTIONS: { value: Level; label: string }[] = [
  { value: 'all', label: 'All levels' },
  { value: 'state', label: 'State units' },
  { value: 'district', label: 'District units' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Extract a 4-digit numeric year from a string. Returns null for unknown/null. */
function parseYear(y: string | null | undefined): number | null {
  if (!y) return null;
  const match = y.trim().match(/\d{4}/);
  if (!match) return null;
  const n = parseInt(match[0], 10);
  return isNaN(n) ? null : n;
}

function getDisplayName(a: LeadershipAssignment): string {
  if (a.assignee_kind === 'alternate' && a.alternate_contact_name_snapshot) {
    return a.alternate_contact_name_snapshot;
  }
  return a.member_name ?? a.member_registrations?.full_name ?? '—';
}

function getMobile(a: LeadershipAssignment): string {
  if (a.assignee_kind === 'alternate') {
    return a.alternate_contact_mobile_snapshot ?? '';
  }
  return a.member_registrations?.mobile_number ?? '';
}

function getEmail(a: LeadershipAssignment): string {
  return a.member_email ?? a.member_registrations?.email ?? '';
}

/**
 * Sort by lub_role_display_order ascending (Roles Master order), with
 * null/undefined display_order roles falling back to role name alpha AFTER
 * all ordered roles.
 */
function sortByDisplayOrder(assignments: LeadershipAssignment[]): LeadershipAssignment[] {
  return assignments.slice().sort((a, b) => {
    const oa = a.lub_role_display_order ?? null;
    const ob = b.lub_role_display_order ?? null;
    // Both have explicit order → sort by that order asc
    if (oa !== null && ob !== null) return oa - ob;
    // Only a has order → a comes first
    if (oa !== null) return -1;
    // Only b has order → b comes first
    if (ob !== null) return 1;
    // Neither has order → alpha by role name
    return (a.role_name ?? '').localeCompare(b.role_name ?? '');
  });
}

/**
 * Build top card-header slots from DB role ordering only.
 * One row per unique role name, in display-order sequence.
 */
function getTopSummaryAssignments(
  assignments: LeadershipAssignment[],
  maxSlots = 2
): LeadershipAssignment[] {
  const seenRoles = new Set<string>();
  const top: LeadershipAssignment[] = [];
  for (const a of sortByDisplayOrder(assignments)) {
    const roleKey = (a.role_name ?? '').trim().toLowerCase();
    if (!roleKey || seenRoles.has(roleKey)) continue;
    seenRoles.add(roleKey);
    top.push(a);
    if (top.length >= maxSlots) break;
  }
  return top;
}

/**
 * Split a flat member list into:
 * - current: assignments whose committee_year matches effectiveYear
 * - historical: all others, keyed by year string (or 'Unknown')
 *
 * When effectiveYear is empty (''), all members go into current (fallback
 * for datasets with no parseable years).
 */
function splitByYear(
  members: LeadershipAssignment[],
  effectiveYear: string
): { current: LeadershipAssignment[]; historical: Map<string, LeadershipAssignment[]> } {
  const current: LeadershipAssignment[] = [];
  const historical = new Map<string, LeadershipAssignment[]>();

  for (const a of members) {
    const y = (a.committee_year ?? '').trim();
    if (!effectiveYear || y === effectiveYear) {
      current.push(a);
    } else {
      const bucket = y || 'Unknown';
      if (!historical.has(bucket)) historical.set(bucket, []);
      historical.get(bucket)!.push(a);
    }
  }

  return { current, historical };
}

/**
 * Build unit records from a flat list of assignments.
 * Pure function — takes effectiveYear and showHistorical as explicit params
 * so useMemo deps are correctly tracked.
 */
function buildUnits(
  rows: LeadershipAssignment[],
  keyFn: (a: LeadershipAssignment) => string,
  metaFn: (key: string) => { title: string; subtitle?: string },
  effectiveYear: string,
  showHistorical: boolean
): UnitData[] {
  const map = new Map<string, LeadershipAssignment[]>();
  for (const a of rows) {
    const key = keyFn(a);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(a);
  }

  return Array.from(map.entries())
    .sort(([ka], [kb]) => ka.localeCompare(kb))
    .map(([key, members]): UnitData | null => {
      const { current, historical } = splitByYear(members, effectiveYear);

      const historicalByYear = Array.from(historical.entries()).sort(([ya], [yb]) => {
        // Sort desc by numeric year; 'Unknown' goes last
        const na = parseYear(ya) ?? -1;
        const nb = parseYear(yb) ?? -1;
        return nb - na;
      });

      const totalVisible =
        current.length +
        (showHistorical
          ? historicalByYear.reduce((s, [, arr]) => s + arr.length, 0)
          : 0);

      if (totalVisible === 0) return null; // hide units with no visible members

      return {
        key,
        ...metaFn(key),
        currentMembers: current,
        historicalByYear,
        summaryAssignments: getTopSummaryAssignments(current, 2),
      };
    })
    .filter((u): u is UnitData => u !== null);
}

// ─────────────────────────────────────────────────────────────────────────────
// SummarySlot — one row in the collapsed card header
// ─────────────────────────────────────────────────────────────────────────────

interface SummarySlotProps {
  label: string;
  assignment: LeadershipAssignment | null;
}

const SummarySlot: React.FC<SummarySlotProps> = ({ label, assignment }) => {
  const mobile = assignment ? getMobile(assignment) : '';

  return (
    <div className="flex items-start gap-2 min-w-0">
      <span className="shrink-0 w-28 text-xs font-medium text-muted-foreground pt-0.5">
        {label}
      </span>
      {assignment ? (
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground truncate">
            {getDisplayName(assignment)}
          </p>
          {mobile ? (
            <a
              href={`tel:${mobile}`}
              className="text-xs text-muted-foreground hover:text-primary transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              {mobile}
            </a>
          ) : (
            <span className="text-xs text-muted-foreground/60">No mobile</span>
          )}
        </div>
      ) : (
        <span className="text-sm text-muted-foreground/50 italic">—</span>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MemberRow — one row in the expanded committee list
// Kind badges intentionally omitted (assignee_kind used only for display
// name and mobile resolution, not shown to admin users on this page).
// ─────────────────────────────────────────────────────────────────────────────

interface MemberRowProps {
  a: LeadershipAssignment;
}

const MemberRow: React.FC<MemberRowProps> = ({ a }) => {
  const mobile = getMobile(a);
  const email = getEmail(a);
  const period = (() => {
    if (!a.role_start_date && !a.role_end_date) return null;
    if (a.role_start_date && a.role_end_date)
      return `${a.role_start_date} – ${a.role_end_date}`;
    if (a.role_start_date) return `From ${a.role_start_date}`;
    return `Until ${a.role_end_date}`;
  })();

  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-1.5 sm:gap-3 py-3 border-t border-border first:border-t-0">
      {/* Role name + optional date period */}
      <div className="sm:w-48 shrink-0">
        <p className="text-sm font-medium text-foreground">{a.role_name ?? '—'}</p>
        {period && (
          <span className="text-[10px] text-muted-foreground/70 mt-0.5 block">{period}</span>
        )}
      </div>

      {/* Display name + contact links */}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground font-medium">{getDisplayName(a)}</p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
          {mobile ? (
            <a
              href={`tel:${mobile}`}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
            >
              <Phone className="w-3 h-3" />
              {mobile}
            </a>
          ) : null}
          {email ? (
            <a
              href={`mailto:${email}`}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
            >
              <Mail className="w-3 h-3" />
              {email}
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// UnitCard — collapsible card for one state/district unit
// ─────────────────────────────────────────────────────────────────────────────

interface UnitCardProps {
  title: string;
  subtitle?: string;
  /**
   * Top role holders for the card header, derived from DB role names
   * and display order only (no hardcoded role keywords).
   */
  summaryAssignments: LeadershipAssignment[];
  /** Assignments matching the currently selected committee year. */
  currentMembers: LeadershipAssignment[];
  /** Older assignments grouped by year desc (only used when showHistorical=true). */
  historicalByYear: [string, LeadershipAssignment[]][];
  showHistorical: boolean;
  selectedYear: string;
  defaultOpen?: boolean;
}

const UnitCard: React.FC<UnitCardProps> = ({
  title,
  subtitle,
  summaryAssignments,
  currentMembers,
  historicalByYear,
  showHistorical,
  selectedYear,
  defaultOpen = false,
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const totalVisible =
    currentMembers.length +
    (showHistorical
      ? historicalByYear.reduce((s, [, arr]) => s + arr.length, 0)
      : 0);

  const sortedCurrent = useMemo(
    () => sortByDisplayOrder(currentMembers),
    [currentMembers]
  );

  // Dev-only completeness assertion: rendered row count must match header count.
  if (import.meta.env.DEV) {
    const renderedCount =
      sortedCurrent.length +
      (showHistorical
        ? historicalByYear.reduce((s, [, arr]) => s + arr.length, 0)
        : 0);
    if (renderedCount !== totalVisible) {
      console.warn(
        `[UnitCard] "${title}" count mismatch: header=${totalVisible} rendered=${renderedCount}`,
        { sortedCurrent: sortedCurrent.length, historicalByYear }
      );
    }
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {/* Collapsed header / trigger */}
        <CollapsibleTrigger className="w-full text-left">
          <div className="flex items-start gap-3 px-4 py-3 hover:bg-muted/30 transition-colors cursor-pointer select-none">
            <div className="shrink-0 mt-0.5 text-muted-foreground">
              {isOpen ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              {/* Title row */}
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 mb-2">
                <h3 className="text-sm font-semibold text-foreground">{title}</h3>
                {subtitle && (
                  <span className="text-xs text-muted-foreground">{subtitle}</span>
                )}
                <span className="text-xs text-muted-foreground/60">
                  {totalVisible} member{totalVisible !== 1 ? 's' : ''}
                </span>
              </div>

              {/* Summary — top DB-ordered roles for selected year */}
              <div className="flex flex-col gap-1.5">
                {summaryAssignments.length > 0 ? (
                  summaryAssignments.map((a) => (
                    <SummarySlot key={a.id} label={a.role_name ?? 'Role'} assignment={a} />
                  ))
                ) : (
                  <SummarySlot label="Role" assignment={null} />
                )}
              </div>
            </div>
          </div>
        </CollapsibleTrigger>

        {/* Expanded content */}
        <CollapsibleContent>
          <div className="px-4 pb-4 pt-1 border-t border-border bg-muted/10">
            {showHistorical ? (
              <>
                {/* ── Current year section ── */}
                {sortedCurrent.length > 0 && (
                  <>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 mt-2">
                      Current Committee{selectedYear ? ` (${selectedYear})` : ''}
                    </p>
                    {sortedCurrent.map((a) => (
                      <MemberRow key={a.id} a={a} />
                    ))}
                  </>
                )}

                {/* ── Historical years section ── */}
                {historicalByYear.length > 0 && (
                  <div className={sortedCurrent.length > 0 ? 'mt-5' : 'mt-2'}>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
                      Previous Committees
                    </p>
                    {historicalByYear.map(([year, yearMembers]) => (
                      <div key={year} className="mb-4 last:mb-0">
                        <p className="text-[11px] font-semibold text-muted-foreground/80 pb-1 mb-0 border-b border-border">
                          {year === 'Unknown' ? 'Unknown year' : year}
                        </p>
                        {sortByDisplayOrder(yearMembers).map((a) => (
                          <MemberRow key={a.id} a={a} />
                        ))}
                      </div>
                    ))}
                  </div>
                )}

                {sortedCurrent.length === 0 && historicalByYear.length === 0 && (
                  <p className="text-sm text-muted-foreground/60 py-2 mt-2">
                    No members.
                  </p>
                )}
              </>
            ) : (
              <>
                {/* ── Selected year only ── */}
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 mt-2">
                  Full Committee
                </p>
                {sortedCurrent.length > 0 ? (
                  sortedCurrent.map((a) => <MemberRow key={a.id} a={a} />)
                ) : (
                  <p className="text-sm text-muted-foreground/60 py-2">
                    No members for this year.
                  </p>
                )}
              </>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main page component
// ─────────────────────────────────────────────────────────────────────────────

const AdminLeadershipContacts: React.FC = () => {
  const [allAssignments, setAllAssignments] = useState<LeadershipAssignment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter state
  const [search, setSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState<Level>('all');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  /** '' means "auto-select latest year from dataset". */
  const [selectedYear, setSelectedYear] = useState<string>('');
  const [showHistorical, setShowHistorical] = useState(false);

  // ── Load ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const all = (await memberLubRolesService.getAllAssignments(
          {}
        )) as LeadershipAssignment[];
        // Load ALL assignments — level/role filtering happens in the filtered memo.
        // No upfront role-name restriction: the full committee includes all roles.
        // Card summary slots are derived from DB role order in the selected year.
        if (!cancelled) {
          setAllAssignments(all);
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
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Available committee years (sorted desc, numeric years only) ─────────────
  const availableYears = useMemo(() => {
    const years = new Set<string>();
    for (const a of allAssignments) {
      const y = a.committee_year;
      if (y && parseYear(y) !== null) years.add(y.trim());
    }
    return Array.from(years).sort((a, b) => {
      const na = parseYear(a) ?? 0;
      const nb = parseYear(b) ?? 0;
      return nb - na; // desc
    });
  }, [allAssignments]);

  // Effective year: user selection or auto-default to latest
  const effectiveYear = useMemo(
    () => selectedYear || availableYears[0] || '',
    [selectedYear, availableYears]
  );

  const defaultYear = availableYears[0] ?? '';

  const roleOptions = useMemo<{ value: string; label: string }[]>(() => {
    const roleMap = new Map<string, number | null>();
    for (const a of allAssignments) {
      const role = (a.role_name ?? '').trim();
      if (!role) continue;
      const order = a.lub_role_display_order ?? null;
      if (!roleMap.has(role)) {
        roleMap.set(role, order);
      } else {
        const prev = roleMap.get(role);
        if (prev === null && order !== null) roleMap.set(role, order);
        else if (prev !== null && order !== null && order < prev) roleMap.set(role, order);
      }
    }

    return Array.from(roleMap.entries())
      .sort((a, b) => {
        const [roleA, orderA] = a;
        const [roleB, orderB] = b;
        if (orderA !== null && orderB !== null) return orderA - orderB;
        if (orderA !== null) return -1;
        if (orderB !== null) return 1;
        return roleA.localeCompare(roleB);
      })
      .map(([role]) => ({ value: role, label: role }));
  }, [allAssignments]);

  // ── Filter (search + level + role — year applied inside buildUnits) ──────────
  const filtered = useMemo(() => {
    const lq = search.toLowerCase().trim();
    return allAssignments.filter((a) => {
      if (levelFilter === 'state' && a.level !== 'state') return false;
      if (levelFilter === 'district' && a.level !== 'district') return false;
      if (levelFilter === 'all' && a.level !== 'state' && a.level !== 'district')
        return false;
      if (roleFilter !== 'all' && (a.role_name ?? '') !== roleFilter)
        return false;
      if (!lq) return true;
      const searchable = [
        getDisplayName(a),
        a.role_name ?? '',
        a.state ?? '',
        a.district ?? '',
        getMobile(a),
        getEmail(a),
        a.committee_year ?? '',
      ]
        .join(' ')
        .toLowerCase();
      return searchable.includes(lq);
    });
  }, [allAssignments, search, levelFilter, roleFilter]);

  // ── Group into unit cards ───────────────────────────────────────────────────
  const stateUnits = useMemo<UnitData[]>(() => {
    if (levelFilter === 'district') return [];
    return buildUnits(
      filtered.filter((a) => a.level === 'state'),
      (a) => (a.state ?? '').trim() || 'Unknown State',
      (key) => ({ title: `${key} State Unit` }),
      effectiveYear,
      showHistorical
    );
  }, [filtered, levelFilter, effectiveYear, showHistorical]);

  const districtUnits = useMemo<UnitData[]>(() => {
    if (levelFilter === 'state') return [];
    return buildUnits(
      filtered.filter((a) => a.level === 'district'),
      (a) => {
        const state = (a.state ?? '').trim() || 'Unknown State';
        const district = (a.district ?? '').trim() || 'Unknown District';
        return `${state}|||${district}`;
      },
      (key) => {
        const [state, district] = key.split('|||');
        return { title: `${district} District Unit`, subtitle: state };
      },
      effectiveYear,
      showHistorical
    );
  }, [filtered, levelFilter, effectiveYear, showHistorical]);

  // ── Totals ──────────────────────────────────────────────────────────────────
  const totalUnits = stateUnits.length + districtUnits.length;
  const totalContacts = [...stateUnits, ...districtUnits].reduce((s, u) => {
    return (
      s +
      u.currentMembers.length +
      (showHistorical
        ? u.historicalByYear.reduce((s2, [, arr]) => s2 + arr.length, 0)
        : 0)
    );
  }, 0);

  const hasFilters =
    search.trim() !== '' ||
    levelFilter !== 'all' ||
    roleFilter !== 'all' ||
    effectiveYear !== defaultYear ||
    showHistorical;

  const clearFilters = () => {
    setSearch('');
    setLevelFilter('all');
    setRoleFilter('all');
    setSelectedYear('');
    setShowHistorical(false);
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <PermissionGate permission="dashboard.view">
      <div>
        <PageHeader
          title="Leadership Contacts"
          subtitle="Leadership contacts organised by state and district unit"
        />

        {/* Filter bar */}
        <div className="mb-5 flex flex-wrap gap-3 items-center">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, state, mobile, role…"
              className="pl-9 h-9"
            />
          </div>

          {/* Level */}
          <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value as Level)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {LEVEL_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          {/* Role */}
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="all">All roles</option>
            {roleOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          {/* Committee Year — only shown once years are available */}
          {availableYears.length > 0 && (
            <select
              value={effectiveYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {availableYears.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          )}

          {/* Show historical years toggle */}
          <label className="flex items-center gap-1.5 text-sm text-muted-foreground cursor-pointer select-none whitespace-nowrap">
            <input
              type="checkbox"
              checked={showHistorical}
              onChange={(e) => setShowHistorical(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-input accent-primary"
            />
            Show historical years
          </label>

          {/* Clear */}
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1.5">
              <X className="w-3.5 h-3.5" />
              Clear
            </Button>
          )}

          {/* Stats */}
          {!isLoading && (
            <span className="ml-auto text-xs text-muted-foreground">
              {totalUnits} unit{totalUnits !== 1 ? 's' : ''} · {totalContacts} contact
              {totalContacts !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Loading skeleton */}
        {isLoading && (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="rounded-lg border border-border bg-card p-4 animate-pulse"
              >
                <div className="h-4 w-48 bg-muted rounded mb-3" />
                <div className="space-y-2">
                  <div className="h-3 w-64 bg-muted rounded" />
                  <div className="h-3 w-56 bg-muted rounded" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && totalUnits === 0 && (
          <div className="rounded-lg border border-border bg-card px-6 py-12 text-center text-muted-foreground">
            {hasFilters
              ? 'No units match your current filters.'
              : 'No leadership contacts found. Assign roles in the Designations Management page.'}
          </div>
        )}

        {/* State units */}
        {!isLoading && stateUnits.length > 0 && (
          <section className="mb-8">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              State Level Units ({stateUnits.length})
            </h2>
            <div className="space-y-3">
              {stateUnits.map((unit) => (
                <UnitCard
                  key={unit.key}
                  title={unit.title}
                  subtitle={unit.subtitle}
                  summaryAssignments={unit.summaryAssignments}
                  currentMembers={unit.currentMembers}
                  historicalByYear={unit.historicalByYear}
                  showHistorical={showHistorical}
                  selectedYear={effectiveYear}
                />
              ))}
            </div>
          </section>
        )}

        {/* District units */}
        {!isLoading && districtUnits.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              District Units ({districtUnits.length})
            </h2>
            <div className="space-y-3">
              {districtUnits.map((unit) => (
                <UnitCard
                  key={unit.key}
                  title={unit.title}
                  subtitle={unit.subtitle}
                  summaryAssignments={unit.summaryAssignments}
                  currentMembers={unit.currentMembers}
                  historicalByYear={unit.historicalByYear}
                  showHistorical={showHistorical}
                  selectedYear={effectiveYear}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </PermissionGate>
  );
};

export default AdminLeadershipContacts;
