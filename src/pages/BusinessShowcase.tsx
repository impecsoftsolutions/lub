import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Building2,
  Loader2,
  MapPin,
  Search,
  Sparkles,
  Tag,
  X,
} from 'lucide-react';
import { showcaseService, ShowcaseListing, statesService } from '../lib/supabase';
import { useMember } from '../contexts/useMember';

const CATEGORIES = [
  'Manufacturing',
  'Agriculture',
  'Food & Beverages',
  'Textiles & Garments',
  'Engineering & Fabrication',
  'Chemicals & Pharma',
  'Construction & Materials',
  'IT & Technology',
  'Trading',
  'Consultancy & Services',
  'Education & Training',
  'Healthcare',
  'Other',
];

const BusinessShowcase: React.FC = () => {
  const { member, isAuthenticated } = useMember();
  const isMemberApproved = isAuthenticated && member?.status === 'approved';

  const [listings, setListings]   = useState<ShowcaseListing[]>([]);
  const [states, setStates]       = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError]         = useState<string | null>(null);

  const [filterState,    setFilterState]    = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterSearch,   setFilterSearch]   = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(filterSearch), 350);
    return () => clearTimeout(t);
  }, [filterSearch]);

  // Load states for filter
  useEffect(() => {
    statesService.getPublicPaymentStates()
      .then(s => setStates(s.map(st => st.state).sort()))
      .catch(() => {});
  }, []);

  const loadListings = useCallback(() => {
    setIsLoading(true);
    setError(null);
    showcaseService.getPublicListings({
      state:    filterState    || undefined,
      category: filterCategory || undefined,
      search:   debouncedSearch || undefined,
      limit:    60,
    })
      .then(setListings)
      .catch(() => setError('Failed to load showcase listings. Please try again.'))
      .finally(() => setIsLoading(false));
  }, [filterState, filterCategory, debouncedSearch]);

  useEffect(() => { loadListings(); }, [loadListings]);

  const clearFilters = () => {
    setFilterState('');
    setFilterCategory('');
    setFilterSearch('');
  };

  const hasFilters = filterState || filterCategory || filterSearch;

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <div className="bg-gradient-to-r from-blue-700 to-blue-800 py-10 text-white sm:py-14">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-blue-200 mb-1">
                Laghu Udyog Bharati
              </p>
              <h1 className="text-2xl font-bold sm:text-3xl">LUB Business Showcase</h1>
              <p className="mt-1 text-blue-100 text-sm sm:text-base">
                Discover MSME products and services from LUB paid members across India.
              </p>
            </div>
            {isMemberApproved ? (
              <Link
                to="/dashboard/showcase"
                className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-blue-800 transition-colors hover:bg-blue-50 shrink-0"
              >
                <Sparkles className="h-4 w-4" />
                Manage My Listings
              </Link>
            ) : (
              <Link
                to="/membership-plans"
                className="inline-flex items-center gap-2 rounded-lg border border-white/30 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/20 shrink-0"
              >
                Get Listed — Join LUB
                <ArrowRight className="h-4 w-4" />
              </Link>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Filters */}
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search products, companies…"
              value={filterSearch}
              onChange={e => setFilterSearch(e.target.value)}
              className="w-full rounded-lg border border-border bg-background py-2.5 pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <select
            value={filterState}
            onChange={e => setFilterState(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">All States</option>
            {states.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          <select
            value={filterCategory}
            onChange={e => setFilterCategory(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">All Categories</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          {hasFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 rounded-lg border border-border bg-card px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted/50"
            >
              <X className="h-3.5 w-3.5" />
              Clear
            </button>
          )}
        </div>

        {/* Results */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Loading listings…
          </div>
        ) : error ? (
          <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-6 text-center text-sm text-destructive">
            {error}
            <button onClick={loadListings} className="ml-2 underline">Retry</button>
          </div>
        ) : listings.length === 0 ? (
          <div className="py-16 text-center">
            <Sparkles className="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" />
            <h3 className="mb-1 text-base font-semibold text-foreground">
              {hasFilters ? 'No listings match your filters' : 'No showcase listings yet'}
            </h3>
            <p className="text-sm text-muted-foreground">
              {hasFilters
                ? 'Try adjusting your search or filters.'
                : 'LUB paid members can submit their business listings here.'}
            </p>
            {hasFilters && (
              <button
                onClick={clearFilters}
                className="mt-4 text-sm text-primary underline"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <>
            <p className="mb-4 text-sm text-muted-foreground">
              {listings.length} listing{listings.length !== 1 ? 's' : ''} found
              {hasFilters ? ' — filtered results' : ''}
            </p>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {listings.map(listing => (
                <ShowcaseCard key={listing.id} listing={listing} />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Not a member CTA */}
      {!isMemberApproved && (
        <div className="border-t border-border bg-muted/30 py-10">
          <div className="mx-auto max-w-2xl px-4 text-center sm:px-6">
            <h2 className="mb-2 text-lg font-bold text-foreground">
              Showcase Your Business to the LUB Community
            </h2>
            <p className="mb-5 text-sm text-muted-foreground">
              Paid LUB members can list their products and services here. Join LUB to be part of India's leading MSME network.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Link
                to="/membership-plans"
                className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                View Membership Plans
              </Link>
              <Link
                to="/join"
                className="rounded-lg border border-border bg-card px-5 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted/50"
              >
                Apply for Membership
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const ShowcaseCard: React.FC<{ listing: ShowcaseListing }> = ({ listing }) => {
  return (
    <div className="flex flex-col rounded-xl border border-border bg-card shadow-sm transition-shadow hover:shadow-md">
      {listing.photoUrl ? (
        <div className="aspect-video overflow-hidden rounded-t-xl bg-muted">
          <img
            src={listing.photoUrl}
            alt={listing.title}
            className="h-full w-full object-cover"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        </div>
      ) : (
        <div className="flex aspect-video items-center justify-center rounded-t-xl bg-muted/40">
          <Building2 className="h-10 w-10 text-muted-foreground/30" />
        </div>
      )}

      <div className="flex flex-1 flex-col p-4">
        <div className="mb-2 flex items-start gap-2">
          {listing.category && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              <Tag className="h-3 w-3" />
              {listing.category}
            </span>
          )}
        </div>

        <h3 className="mb-1 text-sm font-semibold leading-snug text-foreground line-clamp-2">
          {listing.title}
        </h3>

        {listing.productServiceName && (
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            {listing.productServiceName}
          </p>
        )}

        <p className="mb-3 flex-1 text-xs text-muted-foreground leading-relaxed line-clamp-3">
          {listing.shortDescription}
        </p>

        <div className="border-t border-border pt-3">
          {listing.companyName && (
            <p className="flex items-center gap-1 text-xs text-foreground font-medium truncate">
              <Building2 className="h-3 w-3 shrink-0 text-muted-foreground" />
              {listing.companyName}
            </p>
          )}
          {(listing.state || listing.district) && (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3 shrink-0" />
              {[listing.district, listing.state].filter(Boolean).join(', ')}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default BusinessShowcase;
