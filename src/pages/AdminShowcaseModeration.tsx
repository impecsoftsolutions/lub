import React, { useCallback, useEffect, useState } from 'react';
import {
  Building2,
  CheckCircle2,
  Eye,
  EyeOff,
  Filter,
  Globe,
  Loader2,
  MapPin,
  MoreHorizontal,
  Pencil,
  Save,
  Search,
  Sparkles,
  Tag,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { PermissionGate } from '../components/permissions/PermissionGate';
import Toast from '../components/Toast';
import { sessionManager } from '../lib/sessionManager';
import { showcaseService, ShowcaseListing } from '../lib/supabase';

type StatusFilter = 'all' | ShowcaseListing['status'];

interface AdminEditDraft {
  title: string;
  productServiceName: string;
  category: string;
  keywords: string;
  shortDescription: string;
  detailedDescription: string;
  contactEmail: string;
  contactPhone: string;
  websiteUrl: string;
}

const EMPTY_EDIT_DRAFT: AdminEditDraft = {
  title: '', productServiceName: '', category: '', keywords: '', shortDescription: '',
  detailedDescription: '', contactEmail: '', contactPhone: '', websiteUrl: '',
};

const STATUS_FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all',            label: 'All' },
  { value: 'pending_review', label: 'Pending Review' },
  { value: 'approved',       label: 'Approved' },
  { value: 'rejected',       label: 'Rejected' },
  { value: 'draft',          label: 'Draft' },
  { value: 'archived',       label: 'Archived' },
];

const AdminShowcaseModeration: React.FC = () => {
  const [listings, setListings]     = useState<ShowcaseListing[]>([]);
  const [isLoading, setIsLoading]   = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending_review');
  const [search, setSearch]         = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [viewingListing, setViewingListing]   = useState<ShowcaseListing | null>(null);
  const [noteInput, setNoteInput]   = useState('');
  const [isActing, setIsActing]     = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<ShowcaseListing | null>(null);

  const [editingListing, setEditingListing] = useState<ShowcaseListing | null>(null);
  const [editDraft, setEditDraft] = useState<AdminEditDraft>(EMPTY_EDIT_DRAFT);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string; isVisible: boolean }>({
    type: 'success', message: '', isVisible: false,
  });
  const showToast = (type: 'success' | 'error', message: string) =>
    setToast({ type, message, isVisible: true });

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  const loadListings = useCallback(async () => {
    const token = sessionManager.getSessionToken();
    if (!token) return;
    setIsLoading(true);
    const result = await showcaseService.adminGetListings(token, {
      status: statusFilter === 'all' ? undefined : statusFilter,
      search: debouncedSearch || undefined,
    });
    if (result.success) setListings(result.listings ?? []);
    else showToast('error', result.error ?? 'Failed to load listings.');
    setIsLoading(false);
  }, [statusFilter, debouncedSearch]);

  useEffect(() => { void loadListings(); }, [loadListings]);

  const handleAction = async (
    listing: ShowcaseListing,
    action: 'approved' | 'rejected' | 'archived',
    note?: string,
  ) => {
    const token = sessionManager.getSessionToken();
    if (!token) return;
    setIsActing(listing.id);
    const result = await showcaseService.adminUpdateStatus(token, listing.id, action, note);
    setIsActing(null);
    if (result.success) {
      showToast('success', `Listing ${action === 'approved' ? 'approved' : action === 'rejected' ? 'rejected' : 'archived'} successfully.`);
      setViewingListing(null);
      await loadListings();
    } else {
      showToast('error', result.error ?? 'Action failed.');
    }
  };

  const handleSetVisibility = async (listing: ShowcaseListing, isPublic: boolean) => {
    const token = sessionManager.getSessionToken();
    if (!token) return;
    setIsActing(listing.id);
    const result = await showcaseService.adminSetVisibility(token, listing.id, isPublic);
    setIsActing(null);
    if (result.success) {
      showToast('success', isPublic ? 'Listing is now visible to the public.' : 'Listing is hidden from the public.');
      await loadListings();
    } else {
      showToast('error', result.error ?? 'Failed to update visibility.');
    }
  };

  const performDelete = async () => {
    const listing = deleteConfirm;
    if (!listing) return;
    const token = sessionManager.getSessionToken();
    if (!token) return;
    setIsActing(listing.id);
    const result = await showcaseService.adminDeleteArchived(token, listing.id);
    setIsActing(null);
    setDeleteConfirm(null);
    if (result.success) {
      showToast('success', 'Listing permanently deleted.');
      await loadListings();
    } else {
      showToast('error', result.error ?? 'Failed to delete listing.');
    }
  };

  const openEdit = (listing: ShowcaseListing) => {
    setEditingListing(listing);
    setEditError(null);
    setEditDraft({
      title:               listing.title,
      productServiceName:  listing.productServiceName ?? '',
      category:            listing.category ?? '',
      keywords:            listing.keywords ?? '',
      shortDescription:    listing.shortDescription,
      detailedDescription: listing.detailedDescription ?? '',
      contactEmail:        listing.contactEmail ?? '',
      contactPhone:        listing.contactPhone ?? '',
      websiteUrl:          listing.websiteUrl ?? '',
    });
  };

  const handleSaveEdit = async () => {
    if (!editingListing) return;
    if (!editDraft.title.trim()) { setEditError('Title is required.'); return; }
    if (!editDraft.shortDescription.trim()) { setEditError('Short description is required.'); return; }
    const token = sessionManager.getSessionToken();
    if (!token) return;
    setIsSavingEdit(true);
    setEditError(null);
    const result = await showcaseService.adminUpdateListing(token, editingListing.id, editDraft);
    setIsSavingEdit(false);
    if (result.success) {
      showToast('success', 'Listing updated.');
      setEditingListing(null);
      await loadListings();
    } else {
      setEditError(result.error ?? 'Failed to update listing.');
    }
  };

  const pendingCount = listings.filter(l => l.status === 'pending_review').length;

  return (
    <PermissionGate
      permission="members.view"
      fallback={
        <div>
          <PageHeader title="Showcase Moderation" subtitle="You do not have permission to view showcase listings." />
        </div>
      }
    >
      <div className="space-y-5">
        <PageHeader
          title="Showcase Moderation"
          subtitle="Review and moderate member business showcase listings."
        />

        {/* Filters */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search listings…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <div className="flex items-center gap-1 flex-wrap">
            <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
            {STATUS_FILTERS.map(f => (
              <button
                key={f.value}
                onClick={() => setStatusFilter(f.value)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  statusFilter === f.value
                    ? 'bg-primary text-primary-foreground'
                    : 'border border-border bg-card text-foreground hover:bg-muted/50'
                }`}
              >
                {f.label}
                {f.value === 'pending_review' && pendingCount > 0 && ` (${pendingCount})`}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Loading listings…
          </div>
        ) : listings.length === 0 ? (
          <div className="rounded-xl border border-border py-16 text-center">
            <Sparkles className="mx-auto mb-3 h-8 w-8 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">
              {statusFilter === 'pending_review' ? 'No listings pending review.' : 'No listings found.'}
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Listing</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Company</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">Location</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {listings.map((listing, i) => (
                  <tr
                    key={listing.id}
                    className={`border-b border-border last:border-0 ${i % 2 === 0 ? '' : 'bg-muted/10'}`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-start gap-3">
                        {listing.photoUrl ? (
                          <img
                            src={listing.photoUrl}
                            alt={listing.title}
                            className="h-10 w-10 rounded-lg object-cover border border-border shrink-0"
                          />
                        ) : (
                          <div className="h-10 w-10 rounded-lg bg-muted/40 flex items-center justify-center shrink-0">
                            <Building2 className="h-4 w-4 text-muted-foreground/40" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate max-w-[200px]">{listing.title}</p>
                          {listing.category && (
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                              <Tag className="h-3 w-3" />
                              {listing.category}
                            </span>
                          )}
                          <p className="text-xs text-muted-foreground line-clamp-1">{listing.shortDescription}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <p className="text-sm text-foreground">{listing.companyName ?? '—'}</p>
                      <p className="text-xs text-muted-foreground">{listing.memberName ?? ''}</p>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      {(listing.state || listing.district) ? (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <MapPin className="h-3 w-3" />
                          {[listing.district, listing.state].filter(Boolean).join(', ')}
                        </span>
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <StatusChip status={listing.status} />
                        {listing.status === 'approved' && !listing.isPublic && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                            <EyeOff className="h-3 w-3" /> Hidden
                          </span>
                        )}
                      </div>
                      {listing.submittedAt && (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {new Date(listing.submittedAt).toLocaleDateString('en-IN')}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => { setViewingListing(listing); setNoteInput(listing.adminNote ?? ''); }}
                          className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted/50"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              disabled={isActing === listing.id}
                              className="rounded-lg border border-border bg-card p-1.5 text-foreground hover:bg-muted/50 disabled:opacity-50"
                              aria-label="Actions"
                            >
                              {isActing === listing.id
                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                : <MoreHorizontal className="h-3.5 w-3.5" />}
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {/* pending_review: Approve, Reject with Note, Archive */}
                            {listing.status === 'pending_review' && (
                              <>
                                <DropdownMenuItem
                                  onClick={() => handleAction(listing, 'approved')}
                                  className="text-green-700 dark:text-green-400"
                                >
                                  <CheckCircle2 className="mr-2 h-4 w-4" />
                                  Approve
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => { setViewingListing(listing); setNoteInput(''); }}
                                  className="text-destructive"
                                >
                                  <XCircle className="mr-2 h-4 w-4" />
                                  Reject with Note
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => handleAction(listing, 'archived')} className="text-muted-foreground">
                                  Archive
                                </DropdownMenuItem>
                              </>
                            )}

                            {/* approved: Hide/Show, Edit, Archive */}
                            {listing.status === 'approved' && (
                              <>
                                {listing.isPublic ? (
                                  <DropdownMenuItem onClick={() => handleSetVisibility(listing, false)}>
                                    <EyeOff className="mr-2 h-4 w-4" />
                                    Hide from Public
                                  </DropdownMenuItem>
                                ) : (
                                  <DropdownMenuItem onClick={() => handleSetVisibility(listing, true)}>
                                    <Eye className="mr-2 h-4 w-4" />
                                    Show Publicly
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem onClick={() => openEdit(listing)}>
                                  <Pencil className="mr-2 h-4 w-4" />
                                  Edit Listing
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => handleAction(listing, 'archived')} className="text-muted-foreground">
                                  Archive
                                </DropdownMenuItem>
                              </>
                            )}

                            {/* rejected: Edit, Approve, Archive */}
                            {listing.status === 'rejected' && (
                              <>
                                <DropdownMenuItem onClick={() => openEdit(listing)}>
                                  <Pencil className="mr-2 h-4 w-4" />
                                  Edit Listing
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => handleAction(listing, 'approved')}
                                  className="text-green-700 dark:text-green-400"
                                >
                                  <CheckCircle2 className="mr-2 h-4 w-4" />
                                  Approve
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => handleAction(listing, 'archived')} className="text-muted-foreground">
                                  Archive
                                </DropdownMenuItem>
                              </>
                            )}

                            {/* draft: Edit, Archive */}
                            {listing.status === 'draft' && (
                              <>
                                <DropdownMenuItem onClick={() => openEdit(listing)}>
                                  <Pencil className="mr-2 h-4 w-4" />
                                  Edit Listing
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => handleAction(listing, 'archived')} className="text-muted-foreground">
                                  Archive
                                </DropdownMenuItem>
                              </>
                            )}

                            {/* archived: Delete only (permanent) */}
                            {listing.status === 'archived' && (
                              <DropdownMenuItem onClick={() => setDeleteConfirm(listing)} className="text-destructive">
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete Permanently
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Detail / Action Modal */}
        {viewingListing && (
          <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 py-8 px-4">
            <div className="relative w-full max-w-lg rounded-xl bg-card shadow-lg">
              <div className="flex items-center justify-between border-b border-border px-6 py-4">
                <h2 className="text-base font-semibold text-foreground">Listing Details</h2>
                <button
                  onClick={() => setViewingListing(null)}
                  className="rounded-lg p-1 text-muted-foreground hover:bg-muted/50"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-4 px-6 py-5">
                {viewingListing.photos.length > 0 && (
                  <div className="flex gap-2 overflow-x-auto">
                    {viewingListing.photos.map((p, i) => (
                      <img
                        key={i}
                        src={p}
                        alt={`${viewingListing.title} photo ${i + 1}`}
                        className={`h-32 w-32 shrink-0 rounded-lg object-cover border-2 ${i === 0 ? 'border-primary' : 'border-border'}`}
                      />
                    ))}
                  </div>
                )}

                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Title</p>
                  <p className="text-sm font-semibold text-foreground">{viewingListing.title}</p>
                </div>

                {viewingListing.productServiceName && (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Product / Service</p>
                    <p className="text-sm text-foreground">{viewingListing.productServiceName}</p>
                  </div>
                )}

                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Short Description</p>
                  <p className="text-sm text-foreground">{viewingListing.shortDescription}</p>
                </div>

                {viewingListing.detailedDescription && (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Detailed Description</p>
                    <p className="text-sm text-foreground whitespace-pre-wrap">{viewingListing.detailedDescription}</p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Company</p>
                    <p className="text-foreground">{viewingListing.companyName ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Member</p>
                    <p className="text-foreground">{viewingListing.memberName ?? '—'}</p>
                  </div>
                  {(viewingListing.city || viewingListing.district || viewingListing.state) && (
                    <div className="col-span-2">
                      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Location</p>
                      <p className="text-foreground">
                        {[viewingListing.city, viewingListing.district, viewingListing.state].filter(Boolean).join(', ')}
                      </p>
                    </div>
                  )}
                  {viewingListing.category && (
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Category</p>
                      <p className="text-foreground">{viewingListing.category}</p>
                    </div>
                  )}
                  {viewingListing.keywords && (
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Keywords</p>
                      <p className="text-foreground">{viewingListing.keywords}</p>
                    </div>
                  )}
                </div>

                {/* Public contact fields */}
                {(viewingListing.contactEmail || viewingListing.contactPhone || viewingListing.websiteUrl) && (
                  <div className="rounded-lg border border-border bg-muted/20 p-3 text-sm">
                    <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Contact</p>
                    {viewingListing.contactEmail && (
                      <p className="flex items-center justify-between gap-2 text-foreground">
                        <span>{viewingListing.contactEmail}</span>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${viewingListing.showContactEmail ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 'bg-muted text-muted-foreground'}`}>
                          {viewingListing.showContactEmail ? 'Public' : 'Hidden'}
                        </span>
                      </p>
                    )}
                    {viewingListing.contactPhone && (
                      <p className="mt-1 flex items-center justify-between gap-2 text-foreground">
                        <span>{viewingListing.contactPhone}</span>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${viewingListing.showContactPhone ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 'bg-muted text-muted-foreground'}`}>
                          {viewingListing.showContactPhone ? 'Public' : 'Hidden'}
                        </span>
                      </p>
                    )}
                    {viewingListing.websiteUrl && (
                      <p className="mt-1 flex items-center gap-2 text-foreground">
                        <Globe className="h-4 w-4 text-muted-foreground" />
                        <a href={viewingListing.websiteUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                          {viewingListing.websiteUrl}
                        </a>
                      </p>
                    )}
                  </div>
                )}

                {/* Admin note input */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">
                    Admin Note <span className="text-xs text-muted-foreground">(shown to member if rejected)</span>
                  </label>
                  <textarea
                    value={noteInput}
                    onChange={e => setNoteInput(e.target.value)}
                    rows={3}
                    placeholder="Explain why the listing is being rejected (optional for approval)…"
                    className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
              </div>

              <div className="flex gap-3 border-t border-border px-6 py-4">
                <button
                  onClick={() => setViewingListing(null)}
                  className="flex-1 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted/50"
                >
                  Close
                </button>
                {(viewingListing.status === 'pending_review' || viewingListing.status === 'rejected') && (
                  <button
                    onClick={() => handleAction(viewingListing, 'approved', noteInput || undefined)}
                    disabled={isActing === viewingListing.id}
                    className="flex-1 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50"
                  >
                    {isActing === viewingListing.id ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Approve'}
                  </button>
                )}
                {viewingListing.status === 'pending_review' && (
                  <button
                    onClick={() => handleAction(viewingListing, 'rejected', noteInput || undefined)}
                    disabled={isActing === viewingListing.id}
                    className="flex-1 rounded-lg bg-destructive px-4 py-2.5 text-sm font-medium text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:opacity-50"
                  >
                    {isActing === viewingListing.id ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Reject'}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Admin Edit Modal */}
        {editingListing && (
          <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 py-8 px-4">
            <div className="relative w-full max-w-lg rounded-xl bg-card shadow-lg">
              <div className="flex items-center justify-between border-b border-border px-6 py-4">
                <h2 className="text-base font-semibold text-foreground">Edit Listing</h2>
                <button
                  onClick={() => { if (!isSavingEdit) setEditingListing(null); }}
                  className="rounded-lg p-1 text-muted-foreground hover:bg-muted/50"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-3 px-6 py-5">
                <p className="rounded-md bg-muted/40 p-2 text-xs text-muted-foreground">
                  Editing does not change the listing status. Photos and location are managed by the member and are not edited here.
                </p>

                {editError && (
                  <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                    {editError}
                  </div>
                )}

                <div>
                  <label className="mb-1 block text-sm font-medium text-foreground">Title <span className="text-destructive">*</span></label>
                  <input
                    type="text"
                    value={editDraft.title}
                    onChange={e => setEditDraft(d => ({ ...d, title: e.target.value }))}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-foreground">Product / Service Name</label>
                    <input
                      type="text"
                      value={editDraft.productServiceName}
                      onChange={e => setEditDraft(d => ({ ...d, productServiceName: e.target.value }))}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-foreground">Category</label>
                    <input
                      type="text"
                      value={editDraft.category}
                      onChange={e => setEditDraft(d => ({ ...d, category: e.target.value }))}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-foreground">Keywords</label>
                  <input
                    type="text"
                    value={editDraft.keywords}
                    onChange={e => setEditDraft(d => ({ ...d, keywords: e.target.value }))}
                    placeholder="Comma-separated search keywords"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-foreground">Short Description <span className="text-destructive">*</span></label>
                  <textarea
                    value={editDraft.shortDescription}
                    onChange={e => setEditDraft(d => ({ ...d, shortDescription: e.target.value }))}
                    rows={2}
                    maxLength={300}
                    className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-foreground">Detailed Description</label>
                  <textarea
                    value={editDraft.detailedDescription}
                    onChange={e => setEditDraft(d => ({ ...d, detailedDescription: e.target.value }))}
                    rows={4}
                    className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-foreground">Contact Email</label>
                    <input
                      type="email"
                      value={editDraft.contactEmail}
                      onChange={e => setEditDraft(d => ({ ...d, contactEmail: e.target.value }))}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-foreground">Contact Number</label>
                    <input
                      type="tel"
                      value={editDraft.contactPhone}
                      onChange={e => setEditDraft(d => ({ ...d, contactPhone: e.target.value }))}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                </div>
                <p className="-mt-1 text-xs text-muted-foreground">
                  A contact email or number that is filled in is shown publicly on the listing; leave blank to hide it.
                </p>

                <div>
                  <label className="mb-1 block text-sm font-medium text-foreground">Website</label>
                  <input
                    type="url"
                    value={editDraft.websiteUrl}
                    onChange={e => setEditDraft(d => ({ ...d, websiteUrl: e.target.value }))}
                    placeholder="https://example.com"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
              </div>

              <div className="flex gap-3 border-t border-border px-6 py-4">
                <button
                  onClick={() => { if (!isSavingEdit) setEditingListing(null); }}
                  className="flex-1 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted/50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={isSavingEdit}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  {isSavingEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Permanent delete confirm (archived only) */}
        {deleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
            <div className="w-full max-w-sm rounded-xl bg-card p-6 shadow-lg">
              <div className="mb-3 flex items-center gap-2 text-destructive">
                <Trash2 className="h-5 w-5" />
                <h2 className="text-base font-semibold text-foreground">Delete permanently?</h2>
              </div>
              <p className="mb-5 text-sm text-muted-foreground">
                This permanently deletes the archived listing
                {deleteConfirm.title ? <> "<span className="font-medium text-foreground">{deleteConfirm.title}</span>"</> : null}.
                This cannot be undone.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="flex-1 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted/50"
                >
                  Cancel
                </button>
                <button
                  onClick={performDelete}
                  disabled={isActing === deleteConfirm.id}
                  className="flex-1 rounded-lg bg-destructive px-4 py-2.5 text-sm font-medium text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:opacity-50"
                >
                  {isActing === deleteConfirm.id ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        )}

        <Toast
          type={toast.type}
          message={toast.message}
          isVisible={toast.isVisible}
          onClose={() => setToast(prev => ({ ...prev, isVisible: false }))}
        />
      </div>
    </PermissionGate>
  );
};

const StatusChip: React.FC<{ status: ShowcaseListing['status'] }> = ({ status }) => {
  const map: Record<string, { label: string; className: string }> = {
    draft:          { label: 'Draft',    className: 'bg-muted text-muted-foreground' },
    pending_review: { label: 'Pending',  className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' },
    approved:       { label: 'Approved', className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
    rejected:       { label: 'Rejected', className: 'bg-destructive/10 text-destructive' },
    archived:       { label: 'Archived', className: 'bg-muted text-muted-foreground' },
  };
  const c = map[status] ?? map.draft;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${c.className}`}>
      {c.label}
    </span>
  );
};

export default AdminShowcaseModeration;
