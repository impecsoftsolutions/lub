import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle, Banknote, Building2, Loader2, MapPin, QrCode } from 'lucide-react';
import { statesService, PublicPaymentState } from '../lib/supabase';

interface StateWiseFeePanelProps {
  initialState?: string;
  ctaLabel?: string;
  ctaBasePath?: string;
  showNavigation?: boolean;
  compact?: boolean;
}

const StateWiseFeePanel: React.FC<StateWiseFeePanelProps> = ({
  initialState,
  ctaLabel = 'Register Now',
  ctaBasePath = '/join',
  showNavigation = true,
  compact = false,
}) => {
  const [allStates, setAllStates] = useState<PublicPaymentState[]>([]);
  const [selectedState, setSelectedState] = useState<string>(initialState ?? '');
  const [details, setDetails] = useState<PublicPaymentState | null>(null);
  const [isLoadingStates, setIsLoadingStates] = useState(true);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    statesService.getPublicPaymentStates()
      .then(states => {
        setAllStates(states.sort((a, b) => a.state.localeCompare(b.state)));
        if (initialState) {
          const match = states.find(s => s.state.toLowerCase() === initialState.toLowerCase());
          if (match) {
            setSelectedState(match.state);
          } else {
            setError(`No payment settings found for '${initialState}'.`);
          }
        }
      })
      .catch(() => setError('Failed to load payment information. Please try again.'))
      .finally(() => setIsLoadingStates(false));
  }, [initialState]);

  useEffect(() => {
    if (!selectedState) {
      setDetails(null);
      return;
    }
    setIsLoadingDetails(true);
    setDetails(null);
    statesService.getPublicPaymentStateByName(selectedState)
      .then(d => {
        if (d) {
          setDetails(d);
          setError(null);
        } else {
          setError(`No payment settings found for '${selectedState}'.`);
        }
      })
      .catch(() => setError('Failed to load fee details. Please try again.'))
      .finally(() => setIsLoadingDetails(false));
  }, [selectedState]);

  const handleStateChange = (value: string) => {
    setSelectedState(value);
    if (showNavigation && value) {
      navigate(`?state=${encodeURIComponent(value)}`, { replace: true });
    }
  };

  const formatCurrency = (amount: number) => `₹${amount.toLocaleString('en-IN')}`;
  const ctaHref = (base: string) =>
    selectedState ? `${base}?state=${encodeURIComponent(selectedState)}` : base;

  return (
    <div className="space-y-6">
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* State selector */}
      <div>
        <label htmlFor="fee-state-select" className="mb-2 block text-sm font-medium text-foreground">
          Select your state <span className="text-destructive">*</span>
        </label>
        {isLoadingStates ? (
          <div className="h-11 animate-pulse rounded-lg bg-muted" />
        ) : allStates.length === 0 ? (
          <div className="rounded-lg border border-border bg-muted/30 p-4 text-center text-sm text-muted-foreground">
            No active states configured. Please contact admin.
          </div>
        ) : (
          <select
            id="fee-state-select"
            value={selectedState}
            onChange={e => handleStateChange(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">Choose your state…</option>
            {allStates.map(s => (
              <option key={s.state} value={s.state}>{s.state}</option>
            ))}
          </select>
        )}
      </div>

      {/* Fee details */}
      {isLoadingDetails && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading fee details…
        </div>
      )}

      {details && !isLoadingDetails && (
        <div className="space-y-4 rounded-lg border border-border bg-muted/30 p-5">
          <h3 className="flex items-center gap-2 font-semibold text-foreground">
            <MapPin className="h-4 w-4 text-primary" />
            {details.state}
          </h3>

          {/* Fees */}
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
              <Banknote className="h-4 w-4 text-primary" />
              Membership Fees
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-border bg-muted/40 p-3 text-center">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Male</p>
                <p className="mt-1 text-lg font-bold text-foreground">{formatCurrency(details.male_fee)}</p>
              </div>
              <div className="rounded-lg border border-border bg-muted/40 p-3 text-center">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Female</p>
                <p className="mt-1 text-lg font-bold text-foreground">{formatCurrency(details.female_fee)}</p>
              </div>
            </div>
            <p className="mt-2 text-center text-xs text-muted-foreground">
              Validity: {details.validity_years} {details.validity_years === 1 ? 'year' : 'years'}
            </p>
          </div>

          {!compact && (
            <>
              {/* QR Code */}
              {details.qr_code_image_url && (
                <div className="rounded-lg border border-border bg-card p-4">
                  <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                    <QrCode className="h-4 w-4 text-primary" />
                    Scan to Pay
                  </p>
                  <div className="mx-auto w-full max-w-[180px]">
                    <img
                      src={details.qr_code_image_url}
                      alt={`Payment QR for ${details.state}`}
                      className="w-full rounded-md border border-border"
                    />
                  </div>
                </div>
              )}

              {/* Bank details */}
              <div className="rounded-lg border border-border bg-card p-4">
                <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Building2 className="h-4 w-4 text-primary" />
                  Bank Transfer / Cheque
                </p>
                <p className="mb-2 text-xs text-muted-foreground">Make payment in favour of:</p>
                <p className="mb-3 font-semibold text-foreground">{details.account_holder_name}</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="font-medium uppercase tracking-wider text-muted-foreground">Account</span>
                    <p className="font-mono text-foreground">{details.account_number}</p>
                  </div>
                  <div>
                    <span className="font-medium uppercase tracking-wider text-muted-foreground">IFSC</span>
                    <p className="font-mono text-foreground">{details.ifsc_code}</p>
                  </div>
                  <div>
                    <span className="font-medium uppercase tracking-wider text-muted-foreground">Bank</span>
                    <p className="text-foreground">{details.bank_name}</p>
                  </div>
                  <div>
                    <span className="font-medium uppercase tracking-wider text-muted-foreground">Branch</span>
                    <p className="text-foreground">{details.branch}</p>
                  </div>
                </div>
                <p className="mt-3 text-center text-xs font-medium text-destructive">
                  Do not pay in cash.
                </p>
              </div>
            </>
          )}

          {/* CTAs */}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link
              to={ctaHref(ctaBasePath)}
              className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-center text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {ctaLabel}
            </Link>
            {ctaBasePath !== '/payment' && (
              <Link
                to={ctaHref('/payment')}
                className="flex-1 rounded-lg border border-border bg-card px-4 py-2.5 text-center text-sm font-medium text-foreground transition-colors hover:bg-muted/50"
              >
                View Full Payment Details
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default StateWiseFeePanel;
