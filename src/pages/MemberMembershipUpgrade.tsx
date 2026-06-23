import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Clock, Loader2, Upload, X } from 'lucide-react';
import MemberNav from '../components/MemberNav';
import StateWiseFeePanel from '../components/StateWiseFeePanel';
import Toast from '../components/Toast';
import { useMember } from '../contexts/useMember';
import { sessionManager } from '../lib/sessionManager';
import { membershipUpgradeService, MembershipUpgradeRequest } from '../lib/supabase';

const PAYMENT_MODES = ['UPI / QR', 'Bank Transfer (NEFT/RTGS/IMPS)', 'Cheque', 'Other'];

const MemberMembershipUpgrade: React.FC = () => {
  const navigate = useNavigate();
  const { member, isAuthenticated, isLoading: memberLoading } = useMember();

  const [existingRequest, setExistingRequest] = useState<MembershipUpgradeRequest | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [state, setState]           = useState('');
  const [amount, setAmount]         = useState('');
  const [paymentMode, setPaymentMode] = useState('');
  const [paymentDate, setPaymentDate] = useState('');
  const [transactionId, setTransactionId] = useState('');
  const [bankReference, setBankReference] = useState('');
  const [proofFile, setProofFile]   = useState<File | null>(null);
  const [proofPreview, setProofPreview] = useState<string | null>(null);

  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string; isVisible: boolean }>({
    type: 'success', message: '', isVisible: false,
  });
  const showToast = (type: 'success' | 'error', message: string) =>
    setToast({ type, message, isVisible: true });

  const isMemberApproved = member?.status === 'approved';
  const isAlreadyPaid = member?.account_type === 'member' || member?.account_type === 'both';

  useEffect(() => {
    if (!memberLoading && !isAuthenticated) navigate('/signin');
  }, [memberLoading, isAuthenticated, navigate]);

  useEffect(() => {
    const load = async () => {
      const token = sessionManager.getSessionToken();
      if (!token) { setIsLoading(false); return; }
      try {
        const req = await membershipUpgradeService.getMyUpgradeRequest(token);
        setExistingRequest(req);
      } catch {
        // Non-fatal; allow the form to show.
      } finally {
        setIsLoading(false);
      }
    };
    if (isAuthenticated) void load();
  }, [isAuthenticated]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowed.includes(file.type)) {
      showToast('error', 'Upload a JPG, PNG, WebP, or PDF file.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast('error', 'File must be 5 MB or smaller.');
      return;
    }
    setProofFile(file);
    setProofPreview(file.type.startsWith('image/') ? URL.createObjectURL(file) : null);
  };

  const handleSubmit = async () => {
    if (!proofFile) { showToast('error', 'Payment proof is required to upgrade.'); return; }
    if (!state.trim()) { showToast('error', 'Please select your state.'); return; }
    const token = sessionManager.getSessionToken();
    if (!token) { showToast('error', 'Session expired. Please sign in again.'); return; }

    setIsSubmitting(true);
    const result = await membershipUpgradeService.submitUpgrade(
      token,
      { state, amount, paymentMode, paymentDate, transactionId, bankReference },
      proofFile,
    );
    setIsSubmitting(false);

    if (result.success) {
      showToast('success', 'Upgrade request submitted. An admin will review it shortly.');
      const req = await membershipUpgradeService.getMyUpgradeRequest(token).catch(() => null);
      setExistingRequest(req);
    } else {
      showToast('error', result.error ?? 'Failed to submit upgrade request.');
    }
  };

  if (memberLoading || isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <MemberNav />
        <div className="flex items-center justify-center py-24 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Loading…
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <MemberNav />
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <button
          onClick={() => navigate('/dashboard')}
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </button>

        <h1 className="text-2xl font-bold text-foreground">Upgrade to Paid Membership</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Submit your payment details and proof. Your paid benefits unlock only after an admin approves the upgrade.
        </p>

        {/* Already paid */}
        {isAlreadyPaid ? (
          <div className="mt-8 rounded-xl border border-green-200 bg-green-50 p-6 text-center dark:border-green-900/40 dark:bg-green-900/20">
            <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-green-600" />
            <h2 className="text-base font-semibold text-foreground">You are already a Paid Member</h2>
            <p className="mt-1 text-sm text-muted-foreground">No upgrade is needed. Enjoy your full member benefits.</p>
          </div>
        ) : existingRequest && existingRequest.status === 'pending' ? (
          <div className="mt-8 rounded-xl border border-yellow-200 bg-yellow-50 p-6 dark:border-yellow-900/40 dark:bg-yellow-900/20">
            <div className="flex items-start gap-3">
              <Clock className="mt-0.5 h-6 w-6 shrink-0 text-yellow-600" />
              <div>
                <h2 className="text-base font-semibold text-foreground">Upgrade under review</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Your Paid Membership upgrade request was submitted and is awaiting admin approval. You will keep your
                  current Free Member access until it is approved.
                </p>
              </div>
            </div>
          </div>
        ) : !isMemberApproved ? (
          <div className="mt-8 rounded-xl border border-border bg-muted/30 p-6">
            <h2 className="text-base font-semibold text-foreground">Approved Free Membership required</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              You can upgrade to Paid Membership once your Free Membership application is approved. If you have not
              applied yet, please submit your membership application first.
            </p>
            <button
              onClick={() => navigate('/join')}
              className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Go to Application
            </button>
          </div>
        ) : (
          <>
            {existingRequest && existingRequest.status === 'rejected' && (
              <div className="mt-6 rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
                Your previous upgrade request was not approved
                {existingRequest.adminNote ? `: ${existingRequest.adminNote}` : '.'} You may submit a new request below.
              </div>
            )}

            {/* Fee reference */}
            <div className="mt-6 rounded-xl border border-border bg-card p-5">
              <h2 className="mb-3 text-sm font-semibold text-foreground">State-wise Paid Membership Fee</h2>
              <StateWiseFeePanel
                initialState={member?.state}
                ctaBasePath="/payment"
                showNavigation={false}
                compact
              />
            </div>

            {/* Upgrade form */}
            <div className="mt-6 space-y-4 rounded-xl border border-border bg-card p-5">
              <h2 className="text-sm font-semibold text-foreground">Payment Details</h2>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-foreground">State <span className="text-destructive">*</span></label>
                  <input
                    type="text"
                    value={state}
                    onChange={e => setState(e.target.value)}
                    placeholder={member?.state ?? 'Your state'}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-foreground">Amount Paid (₹)</label>
                  <input
                    type="text"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    placeholder="e.g. 1000"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-foreground">Payment Mode</label>
                  <select
                    value={paymentMode}
                    onChange={e => setPaymentMode(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="">Select…</option>
                    {PAYMENT_MODES.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-foreground">Payment Date</label>
                  <input
                    type="date"
                    value={paymentDate}
                    onChange={e => setPaymentDate(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-foreground">Transaction / Reference ID</label>
                  <input
                    type="text"
                    value={transactionId}
                    onChange={e => setTransactionId(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-foreground">Bank Reference</label>
                  <input
                    type="text"
                    value={bankReference}
                    onChange={e => setBankReference(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
              </div>

              {/* Payment proof */}
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">
                  Payment Proof <span className="text-destructive">*</span>
                </label>
                {proofFile ? (
                  <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3">
                    {proofPreview ? (
                      <img src={proofPreview} alt="Proof preview" className="h-12 w-12 rounded object-cover" />
                    ) : (
                      <div className="flex h-12 w-12 items-center justify-center rounded bg-muted text-xs text-muted-foreground">PDF</div>
                    )}
                    <span className="flex-1 truncate text-sm text-foreground">{proofFile.name}</span>
                    <button
                      onClick={() => { setProofFile(null); setProofPreview(null); }}
                      className="rounded p-1 text-muted-foreground hover:bg-muted"
                      aria-label="Remove file"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/20 px-4 py-6 text-sm text-muted-foreground hover:bg-muted/40">
                    <Upload className="h-4 w-4" />
                    Upload payment receipt (JPG, PNG, WebP, PDF — max 5 MB)
                    <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={handleFileChange} className="hidden" />
                  </label>
                )}
              </div>

              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 sm:w-auto"
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Submit Upgrade Request
              </button>
            </div>
          </>
        )}

        <Toast
          type={toast.type}
          message={toast.message}
          isVisible={toast.isVisible}
          onClose={() => setToast(prev => ({ ...prev, isVisible: false }))}
        />
      </div>
    </div>
  );
};

export default MemberMembershipUpgrade;
