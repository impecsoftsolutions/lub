import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, ExternalLink, Loader2, XCircle } from 'lucide-react';
import Toast from '../components/Toast';
import { sessionManager } from '../lib/sessionManager';
import { membershipUpgradeService, MembershipUpgradeRequestAdmin } from '../lib/supabase';

type StatusFilter = 'pending' | 'approved' | 'rejected' | 'all';

const STATUS_TABS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'pending',  label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'all',      label: 'All' },
];

const AdminUpgradeRequests: React.FC = () => {
  const [requests, setRequests] = useState<MembershipUpgradeRequestAdmin[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
  const [actingId, setActingId] = useState<string | null>(null);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string; isVisible: boolean }>({
    type: 'success', message: '', isVisible: false,
  });
  const showToast = (type: 'success' | 'error', message: string) =>
    setToast({ type, message, isVisible: true });

  const load = useCallback(async () => {
    const token = sessionManager.getSessionToken();
    if (!token) return;
    setIsLoading(true);
    try {
      const items = await membershipUpgradeService.adminListUpgradeRequests(
        token,
        statusFilter === 'all' ? undefined : statusFilter,
      );
      setRequests(items);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to load upgrade requests.');
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { void load(); }, [load]);

  const handleReview = async (id: string, action: 'approve' | 'reject', adminNote?: string) => {
    const token = sessionManager.getSessionToken();
    if (!token) return;
    setActingId(id);
    const result = await membershipUpgradeService.adminReviewUpgrade(token, id, action, adminNote);
    setActingId(null);
    if (result.success) {
      showToast('success', action === 'approve' ? 'Upgrade approved. Member is now Paid.' : 'Upgrade request rejected.');
      setNoteFor(null);
      setNote('');
      await load();
    } else {
      showToast('error', result.error ?? 'Action failed.');
    }
  };

  return (
    <div className="space-y-4">
      {/* Status tabs */}
      <div className="flex items-center gap-1 flex-wrap">
        {STATUS_TABS.map(t => (
          <button
            key={t.value}
            onClick={() => setStatusFilter(t.value)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              statusFilter === t.value
                ? 'bg-primary text-primary-foreground'
                : 'border border-border bg-card text-foreground hover:bg-muted/50'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Loading upgrade requests…
        </div>
      ) : requests.length === 0 ? (
        <div className="rounded-xl border border-border py-16 text-center">
          <p className="text-sm text-muted-foreground">
            {statusFilter === 'pending' ? 'No upgrade requests awaiting review.' : 'No upgrade requests found.'}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Member</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Payment</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Proof</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r, i) => (
                <React.Fragment key={r.id}>
                  <tr className={`border-b border-border last:border-0 ${i % 2 === 0 ? '' : 'bg-muted/10'}`}>
                    <td className="px-4 py-3 align-top">
                      <p className="font-medium text-foreground">{r.fullName ?? '—'}</p>
                      <p className="text-xs text-muted-foreground">{r.companyName ?? ''}</p>
                      <p className="text-xs text-muted-foreground">{r.email ?? ''} · {r.mobileNumber ?? ''}</p>
                    </td>
                    <td className="px-4 py-3 align-top hidden md:table-cell">
                      <p className="text-foreground">{r.amount ? `₹${r.amount}` : '—'}</p>
                      <p className="text-xs text-muted-foreground">{r.paymentMode ?? ''}</p>
                      {r.paymentDate && <p className="text-xs text-muted-foreground">{new Date(r.paymentDate).toLocaleDateString('en-IN')}</p>}
                    </td>
                    <td className="px-4 py-3 align-top">
                      {r.paymentProofUrl ? (
                        <a
                          href={r.paymentProofUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-md border border-blue-400 bg-blue-50 px-2 py-0.5 text-xs text-blue-800 dark:bg-blue-900/40 dark:text-blue-200"
                        >
                          View <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <StatusChip status={r.status} />
                    </td>
                    <td className="px-4 py-3 align-top text-right">
                      {r.status === 'pending' ? (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleReview(r.id, 'approve')}
                            disabled={actingId === r.id}
                            className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                          >
                            {actingId === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                            Approve
                          </button>
                          <button
                            onClick={() => { setNoteFor(noteFor === r.id ? null : r.id); setNote(''); }}
                            disabled={actingId === r.id}
                            className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-destructive hover:bg-muted/50 disabled:opacity-50"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            Reject
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {r.adminNote ? r.adminNote : 'Reviewed'}
                        </span>
                      )}
                    </td>
                  </tr>
                  {noteFor === r.id && (
                    <tr className="bg-muted/20">
                      <td colSpan={5} className="px-4 py-3">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                          <input
                            type="text"
                            value={note}
                            onChange={e => setNote(e.target.value)}
                            placeholder="Reason for rejection (optional, shown to member)…"
                            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleReview(r.id, 'reject', note || undefined)}
                              disabled={actingId === r.id}
                              className="rounded-lg bg-destructive px-3 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
                            >
                              Confirm Reject
                            </button>
                            <button
                              onClick={() => { setNoteFor(null); setNote(''); }}
                              className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground hover:bg-muted/50"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Toast
        type={toast.type}
        message={toast.message}
        isVisible={toast.isVisible}
        onClose={() => setToast(prev => ({ ...prev, isVisible: false }))}
      />
    </div>
  );
};

const StatusChip: React.FC<{ status: 'pending' | 'approved' | 'rejected' }> = ({ status }) => {
  const map = {
    pending:  { label: 'Pending',  className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' },
    approved: { label: 'Approved', className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
    rejected: { label: 'Rejected', className: 'bg-destructive/10 text-destructive' },
  };
  const c = map[status];
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${c.className}`}>{c.label}</span>;
};

export default AdminUpgradeRequests;
