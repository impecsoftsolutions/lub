import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ExternalLink,
  Eye,
  FileX,
  Loader2,
  Lock,
  MoreHorizontal,
  RefreshCw,
  Search,
} from 'lucide-react';
import { PermissionGate } from '../components/permissions/PermissionGate';
import { PageHeader } from '../components/ui/PageHeader';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import {
  locationsService,
  reportsService,
  statesService,
  type AdminPaymentsReportFilters,
  type AdminPaymentsReportRow,
} from '../lib/supabase';
import { sessionManager } from '../lib/sessionManager';
import { formatDateTimeValue, formatDateValue } from '../lib/dateTimeManager';
import ViewApplicationModal from '../components/ViewApplicationModal';

type StatusFilter = 'pending_approved' | 'pending' | 'approved' | 'rejected' | 'all';
type PaymentProofFilter = 'all' | 'yes' | 'no';
type SortDirection = 'asc' | 'desc';
type SortKey = 'paymentDate' | 'member' | 'location' | 'status' | 'amount' | 'modeRef' | 'submitted';

const CURRENCY = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const AdminReportsPayments: React.FC = () => {
  const [rows, setRows] = useState<AdminPaymentsReportRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [viewingApplicationId, setViewingApplicationId] = useState<string>('');
  const [showViewModal, setShowViewModal] = useState(false);
  const [sortState, setSortState] = useState<{ key: SortKey; direction: SortDirection }>({
    key: 'paymentDate',
    direction: 'desc',
  });
  const [stateOptions, setStateOptions] = useState<string[]>([]);
  const [districtOptions, setDistrictOptions] = useState<string[]>([]);
  const [paymentModeOptions, setPaymentModeOptions] = useState<string[]>([]);

  const [searchInput, setSearchInput] = useState('');
  const [filters, setFilters] = useState<{
    status: StatusFilter;
    state: string;
    district: string;
    paymentMode: string;
    paymentProof: PaymentProofFilter;
    fromDate: string;
    toDate: string;
    searchQuery: string;
  }>({
    status: 'pending_approved',
    state: 'all',
    district: 'all',
    paymentMode: 'all',
    paymentProof: 'all',
    fromDate: '',
    toDate: '',
    searchQuery: '',
  });

  const loadRows = useCallback(async (activeFilters: typeof filters) => {
    const sessionToken = sessionManager.getSessionToken();
    if (!sessionToken) {
      setError('User session not found. Please log in again.');
      setRows([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    const reportFilters: AdminPaymentsReportFilters = {
      status:
        activeFilters.status === 'all'
          ? null
          : activeFilters.status,
      state: activeFilters.state === 'all' ? null : activeFilters.state,
      district: activeFilters.district === 'all' ? null : activeFilters.district,
      paymentMode: activeFilters.paymentMode === 'all' ? null : activeFilters.paymentMode,
      hasPaymentProof:
        activeFilters.paymentProof === 'all'
          ? null
          : activeFilters.paymentProof === 'yes',
      fromDate: activeFilters.fromDate || null,
      toDate: activeFilters.toDate || null,
      searchQuery: activeFilters.searchQuery || null,
      limit: 1000,
      offset: 0,
    };

    try {
      const result = await reportsService.getPaymentsReportWithSession(sessionToken, reportFilters);
      setRows(result);
    } catch (loadError) {
      console.error('[AdminReportsPayments] loadRows error:', loadError);
      setError(loadError instanceof Error ? loadError.message : 'Failed to load payments report.');
      setRows([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRows(filters);
  }, [filters, loadRows]);

  useEffect(() => {
    const loadFilterMasters = async () => {
      try {
        const [activeStates, paymentModes] = await Promise.all([
          statesService.getActiveStates(),
          reportsService.getPaymentModeOptions(),
        ]);

        setStateOptions(activeStates.map((item) => item.state_name).filter(Boolean));
        setPaymentModeOptions(paymentModes);
      } catch (filterError) {
        console.error('[AdminReportsPayments] loadFilterMasters error:', filterError);
      }
    };

    void loadFilterMasters();
  }, []);

  useEffect(() => {
    const loadDistrictOptions = async () => {
      if (filters.state === 'all') {
        setDistrictOptions([]);
        return;
      }

      try {
        const districts = await locationsService.getActiveDistrictsByStateName(filters.state);
        setDistrictOptions(districts.map((item) => item.district_name).filter(Boolean));
      } catch (districtError) {
        console.error('[AdminReportsPayments] loadDistrictOptions error:', districtError);
        setDistrictOptions([]);
      }
    };

    void loadDistrictOptions();
  }, [filters.state]);

  const visibleRows = rows;

  const summary = useMemo(() => {
    const totalCollected = visibleRows.reduce((sum, row) => sum + (Number.isFinite(row.amountPaid) ? row.amountPaid : 0), 0);
    const pendingApprovedAmount = visibleRows
      .filter((row) => row.status === 'pending' || row.status === 'approved')
      .reduce((sum, row) => sum + (Number.isFinite(row.amountPaid) ? row.amountPaid : 0), 0);
    const missingProofCount = visibleRows.filter((row) => !row.paymentProofUrl).length;

    return {
      totalCollected,
      count: visibleRows.length,
      pendingApprovedAmount,
      missingProofCount,
    };
  }, [visibleRows]);

  const sortedRows = useMemo(() => {
    const directionFactor = sortState.direction === 'asc' ? 1 : -1;
    const list = [...visibleRows];

    const getComparableValue = (row: AdminPaymentsReportRow): number | string => {
      switch (sortState.key) {
        case 'paymentDate':
          return row.paymentDate ? new Date(row.paymentDate).getTime() : -1;
        case 'member':
          return `${row.fullName} ${row.companyName}`.toLowerCase();
        case 'location':
          return `${row.state ?? ''} ${row.district ?? ''}`.toLowerCase();
        case 'status':
          return row.status.toLowerCase();
        case 'amount':
          return Number.isFinite(row.amountPaid) ? row.amountPaid : 0;
        case 'modeRef':
          return `${row.paymentMode ?? ''} ${row.transactionId ?? ''} ${row.bankReference ?? ''}`.toLowerCase();
        case 'submitted':
          return row.createdAt ? new Date(row.createdAt).getTime() : -1;
      }
    };

    list.sort((a, b) => {
      const aValue = getComparableValue(a);
      const bValue = getComparableValue(b);

      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return (aValue - bValue) * directionFactor;
      }
      return String(aValue).localeCompare(String(bValue)) * directionFactor;
    });

    return list;
  }, [sortState, visibleRows]);

  const handleApplySearch = () => {
    setFilters((prev) => ({ ...prev, searchQuery: searchInput.trim() }));
  };

  const handleOpenApplication = (registrationId: string) => {
    setViewingApplicationId(registrationId);
    setShowViewModal(true);
  };

  const handleResetFilters = () => {
    setSearchInput('');
    setFilters({
      status: 'pending_approved',
      state: 'all',
      district: 'all',
      paymentMode: 'all',
      paymentProof: 'all',
      fromDate: '',
      toDate: '',
      searchQuery: '',
    });
  };

  const handleSort = (key: SortKey) => {
    setSortState((prev) => {
      if (prev.key === key) {
        return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      const defaultDirection: SortDirection =
        key === 'paymentDate' || key === 'amount' || key === 'submitted' ? 'desc' : 'asc';
      return { key, direction: defaultDirection };
    });
  };

  const getSortIcon = (key: SortKey) => {
    if (sortState.key !== key) {
      return <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground/70" />;
    }
    return sortState.direction === 'asc' ? (
      <ArrowUp className="h-3.5 w-3.5 text-foreground" />
    ) : (
      <ArrowDown className="h-3.5 w-3.5 text-foreground" />
    );
  };

  const getStatusVariant = (status: string) => {
    if (status === 'approved') return 'success';
    if (status === 'pending') return 'warning';
    if (status === 'rejected') return 'destructive';
    return 'secondary';
  };

  return (
    <PermissionGate
      permission="reports.payments.view"
      fallback={
        <div className="py-8">
          <div className="max-w-3xl rounded-lg border border-border bg-card p-6">
            <div className="flex items-start gap-3">
              <Lock className="mt-0.5 h-5 w-5 text-muted-foreground" />
              <div>
                <h2 className="text-base font-semibold text-foreground">Access denied</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  You do not have permission to view the Payments report.
                </p>
              </div>
            </div>
          </div>
        </div>
      }
    >
      <div className="space-y-6">
        <PageHeader
          title="Payments Report"
          subtitle="Submitted payment records from membership applications."
          actions={
            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadRows(filters)}
              disabled={isLoading}
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Refresh
            </Button>
          }
        />

        <div className="grid grid-cols-1 gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">Total collected</p>
            <p className="text-lg font-semibold text-foreground">{CURRENCY.format(summary.totalCollected)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Payment records</p>
            <p className="text-lg font-semibold text-foreground">{summary.count}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Pending + Approved amount</p>
            <p className="text-lg font-semibold text-foreground">{CURRENCY.format(summary.pendingApprovedAmount)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Missing payment proof</p>
            <p className="text-lg font-semibold text-foreground">{summary.missingProofCount}</p>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="xl:col-span-2">
              <label className="mb-1 block text-xs text-muted-foreground">Search</label>
              <div className="flex gap-2">
                <Input
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="Name, company, mobile, transaction ID, bank reference"
                />
                <Button variant="outline" onClick={handleApplySearch}>
                  <Search className="h-4 w-4" />
                  Apply
                </Button>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Status</label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
                value={filters.status}
                onChange={(event) =>
                  setFilters((prev) => ({ ...prev, status: event.target.value as StatusFilter }))
                }
              >
                <option value="pending_approved">Pending + Approved</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="all">All</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Payment proof</label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
                value={filters.paymentProof}
                onChange={(event) =>
                  setFilters((prev) => ({ ...prev, paymentProof: event.target.value as PaymentProofFilter }))
                }
              >
                <option value="all">All</option>
                <option value="yes">Available</option>
                <option value="no">Missing</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs text-muted-foreground">State</label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
                value={filters.state}
                onChange={(event) =>
                  setFilters((prev) => ({
                    ...prev,
                    state: event.target.value,
                    district: 'all',
                  }))
                }
              >
                <option value="all">All states</option>
                {stateOptions.map((stateName) => (
                  <option key={stateName} value={stateName}>
                    {stateName}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs text-muted-foreground">District</label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
                value={filters.district}
                disabled={filters.state === 'all'}
                onChange={(event) => setFilters((prev) => ({ ...prev, district: event.target.value }))}
              >
                <option value="all">All districts</option>
                {districtOptions.map((districtName) => (
                  <option key={districtName} value={districtName}>
                    {districtName}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Payment mode</label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
                value={filters.paymentMode}
                onChange={(event) => setFilters((prev) => ({ ...prev, paymentMode: event.target.value }))}
              >
                <option value="all">All modes</option>
                {paymentModeOptions.map((modeName) => (
                  <option key={modeName} value={modeName}>
                    {modeName}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs text-muted-foreground">From date</label>
              <Input
                type="date"
                value={filters.fromDate}
                onChange={(event) => setFilters((prev) => ({ ...prev, fromDate: event.target.value }))}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-muted-foreground">To date</label>
              <Input
                type="date"
                value={filters.toDate}
                onChange={(event) => setFilters((prev) => ({ ...prev, toDate: event.target.value }))}
              />
            </div>
          </div>

          <div className="mt-3">
            <Button variant="ghost" size="sm" onClick={handleResetFilters}>
              Reset filters
            </Button>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <button type="button" className="inline-flex items-center gap-1" onClick={() => handleSort('paymentDate')}>
                      Payment Date
                      {getSortIcon('paymentDate')}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <button type="button" className="inline-flex items-center gap-1" onClick={() => handleSort('member')}>
                      Member
                      {getSortIcon('member')}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <button type="button" className="inline-flex items-center gap-1" onClick={() => handleSort('location')}>
                      Location
                      {getSortIcon('location')}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <button type="button" className="inline-flex items-center gap-1" onClick={() => handleSort('status')}>
                      Status
                      {getSortIcon('status')}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <button type="button" className="inline-flex items-center gap-1" onClick={() => handleSort('amount')}>
                      Amount
                      {getSortIcon('amount')}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <button type="button" className="inline-flex items-center gap-1" onClick={() => handleSort('modeRef')}>
                      Mode / Ref
                      {getSortIcon('modeRef')}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <button type="button" className="inline-flex items-center gap-1" onClick={() => handleSort('submitted')}>
                      Submitted
                      {getSortIcon('submitted')}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-sm text-muted-foreground">
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading payment records...
                      </span>
                    </td>
                  </tr>
                ) : sortedRows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-sm text-muted-foreground">
                      <span className="inline-flex items-center gap-2">
                        <FileX className="h-4 w-4" />
                        No payment records found for the selected filters.
                      </span>
                    </td>
                  </tr>
                ) : (
                  sortedRows.map((row) => (
                    <tr key={row.registrationId} className="hover:bg-muted/30">
                      <td className="px-4 py-3 text-sm text-foreground">{formatDateValue(row.paymentDate) || '-'}</td>
                      <td className="px-4 py-3 text-sm text-foreground">
                        <div className="font-medium">{row.fullName}</div>
                        <div className="text-xs text-muted-foreground">{row.companyName}</div>
                        <div className="text-xs text-muted-foreground">{row.mobileNumber}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground">
                        <div>{row.state || '-'}</div>
                        <div className="text-xs text-muted-foreground">{row.district || '-'}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground">
                        <Badge variant={getStatusVariant(row.status)}>
                          {row.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-foreground">{CURRENCY.format(row.amountPaid || 0)}</td>
                      <td className="px-4 py-3 text-sm text-foreground">
                        <div>{row.paymentMode || '-'}</div>
                        <div className="text-xs text-muted-foreground">{row.transactionId || row.bankReference || '-'}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground">{formatDateTimeValue(row.createdAt) || '-'}</td>
                      <td className="px-4 py-3 text-sm text-foreground">
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            className={cn(buttonVariants({ variant: 'ghost', size: 'icon-sm' }), 'h-8 w-8')}
                          >
                            <span className="sr-only">Open payment actions</span>
                            <span aria-hidden="true">
                              <MoreHorizontal className="h-4 w-4" />
                            </span>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="z-[9999] min-w-[12rem]">
                            <DropdownMenuItem onClick={() => handleOpenApplication(row.registrationId)}>
                              <Eye className="h-4 w-4" />
                              View Application
                            </DropdownMenuItem>
                            {row.paymentProofUrl ? (
                              <DropdownMenuItem asChild>
                                <a href={row.paymentProofUrl} target="_blank" rel="noopener noreferrer">
                                  <ExternalLink className="h-4 w-4" />
                                  Payment Proof
                                </a>
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem disabled>
                                <FileX className="h-4 w-4" />
                                No Payment Proof
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {showViewModal && viewingApplicationId && (
          <ViewApplicationModal
            applicationId={viewingApplicationId}
            isOpen={showViewModal}
            onClose={() => {
              setShowViewModal(false);
              setViewingApplicationId('');
            }}
            onEdit={() => {
              // Read-only mode for Reports: no edit action.
            }}
            onApprove={() => {
              // Read-only mode for Reports: no approve action.
            }}
            onReject={() => {
              // Read-only mode for Reports: no reject action.
            }}
            readOnly
          />
        )}
      </div>
    </PermissionGate>
  );
};

export default AdminReportsPayments;
