import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Edit,
  Loader2,
  Plus,
  Send,
  Sparkles,
  Trash2,
  Wand2,
  X,
} from 'lucide-react';
import MemberNav from '../components/MemberNav';
import Toast from '../components/Toast';
import { useMember } from '../contexts/useMember';
import { sessionManager } from '../lib/sessionManager';
import {
  showcaseService,
  ShowcaseListing,
  ShowcaseListingDraft,
  statesService,
} from '../lib/supabase';

const CATEGORIES = [
  'Manufacturing', 'Agriculture', 'Food & Beverages', 'Textiles & Garments',
  'Engineering & Fabrication', 'Chemicals & Pharma', 'Construction & Materials',
  'IT & Technology', 'Trading', 'Consultancy & Services', 'Education & Training',
  'Healthcare', 'Other',
];

const CONTACT_PREF_OPTIONS = [
  { value: 'member_contact', label: 'Member Contact' },
  { value: 'email',          label: 'Email' },
  { value: 'phone',          label: 'Phone' },
  { value: 'any',            label: 'Any' },
];

const EMPTY_DRAFT: ShowcaseListingDraft = {
  title: '', productServiceName: '', category: '', shortDescription: '',
  detailedDescription: '', state: '', district: '', photoUrl: '', contactPreference: 'member_contact',
};

type ModalMode = 'create' | 'edit';

interface StatusBadgeProps { status: ShowcaseListing['status'] }
const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const map: Record<string, { label: string; className: string }> = {
    draft:          { label: 'Draft',          className: 'bg-muted text-muted-foreground' },
    pending_review: { label: 'Pending Review', className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' },
    approved:       { label: 'Approved',       className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
    rejected:       { label: 'Rejected',       className: 'bg-destructive/10 text-destructive' },
    archived:       { label: 'Archived',       className: 'bg-muted text-muted-foreground' },
  };
  const conf = map[status] ?? map.draft;
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${conf.className}`}>
      {conf.label}
    </span>
  );
};

const MemberShowcaseListings: React.FC = () => {
  const navigate  = useNavigate();
  const { member, isAuthenticated, isLoading: authLoading } = useMember();

  const isMemberApproved = isAuthenticated && member?.status === 'approved';

  const [listings, setListings]   = useState<ShowcaseListing[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [states, setStates]       = useState<string[]>([]);

  const [modalMode,      setModalMode]      = useState<ModalMode>('create');
  const [editingId,      setEditingId]      = useState<string | null>(null);
  const [isModalOpen,    setIsModalOpen]    = useState(false);
  const [draft,          setDraft]          = useState<ShowcaseListingDraft>(EMPTY_DRAFT);
  const [isSaving,       setIsSaving]       = useState(false);
  const [isSubmitting,   setIsSubmitting]   = useState(false);
  const [isDeleting,     setIsDeleting]     = useState<string | null>(null);
  const [isAILoading,    setIsAILoading]    = useState(false);
  const [photoFile,      setPhotoFile]      = useState<File | null>(null);
  const [photoPreview,   setPhotoPreview]   = useState<string | null>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [formError,      setFormError]      = useState<string | null>(null);
  const [deleteConfirm,  setDeleteConfirm]  = useState<string | null>(null);

  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string; isVisible: boolean }>({
    type: 'success', message: '', isVisible: false,
  });
  const showToast = (type: 'success' | 'error', message: string) =>
    setToast({ type, message, isVisible: true });

  useEffect(() => {
    if (!authLoading && !isAuthenticated) navigate('/signin', { replace: true });
  }, [authLoading, isAuthenticated, navigate]);

  useEffect(() => {
    statesService.getPublicPaymentStates()
      .then(s => setStates(s.map(st => st.state).sort()))
      .catch(() => {});
  }, []);

  const loadListings = useCallback(async () => {
    const token = sessionManager.getSessionToken();
    if (!token) return;
    setIsLoading(true);
    const result = await showcaseService.getMemberListings(token);
    if (result.success) setListings(result.listings ?? []);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (!authLoading && isAuthenticated) loadListings();
  }, [authLoading, isAuthenticated, loadListings]);

  const openCreate = () => {
    setModalMode('create');
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
    setPhotoFile(null);
    setPhotoPreview(null);
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEdit = (listing: ShowcaseListing) => {
    setModalMode('edit');
    setEditingId(listing.id);
    setDraft({
      title:               listing.title,
      productServiceName:  listing.productServiceName ?? '',
      category:            listing.category ?? '',
      shortDescription:    listing.shortDescription,
      detailedDescription: listing.detailedDescription ?? '',
      state:               listing.state ?? '',
      district:            listing.district ?? '',
      photoUrl:            listing.photoUrl ?? '',
      contactPreference:   listing.contactPreference,
    });
    setPhotoFile(null);
    setPhotoPreview(listing.photoUrl ?? null);
    setFormError(null);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    if (isSaving || isAILoading || isUploadingPhoto) return;
    setIsModalOpen(false);
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(file.type)) {
      setFormError('Only JPEG, PNG, or WebP images are allowed.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setFormError('Image must be under 5 MB.');
      return;
    }
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
    setFormError(null);
  };

  const handleSave = async (submit = false) => {
    if (!draft.title.trim()) { setFormError('Title is required.'); return; }
    if (!draft.shortDescription.trim()) { setFormError('Short description is required.'); return; }

    const token = sessionManager.getSessionToken();
    if (!token) { showToast('error', 'Session expired. Please sign in again.'); return; }

    setIsSaving(true);
    setFormError(null);

    let finalPhotoUrl = draft.photoUrl;

    // Upload photo if a new file was selected
    if (photoFile) {
      setIsUploadingPhoto(true);
      const uploadResult = await showcaseService.uploadPhoto(token, photoFile);
      setIsUploadingPhoto(false);
      if (!uploadResult.success) {
        setFormError(uploadResult.error ?? 'Photo upload failed. Please try again.');
        setIsSaving(false);
        return;
      }
      finalPhotoUrl = uploadResult.url ?? '';
    }

    const draftToSave: ShowcaseListingDraft = { ...draft, photoUrl: finalPhotoUrl };

    let result: { success: boolean; id?: string; error?: string };
    if (modalMode === 'create') {
      result = await showcaseService.createListing(token, draftToSave);
    } else {
      result = await showcaseService.updateListing(token, editingId!, draftToSave);
    }

    if (!result.success) {
      setFormError(result.error ?? 'Failed to save listing.');
      setIsSaving(false);
      return;
    }

    const newId = modalMode === 'create' ? (result.id ?? editingId) : editingId;

    if (submit && newId) {
      setIsSubmitting(true);
      const submitResult = await showcaseService.submitListing(token, newId);
      setIsSubmitting(false);
      if (!submitResult.success) {
        showToast('error', submitResult.error ?? 'Failed to submit for review.');
        setIsSaving(false);
        setIsModalOpen(false);
        await loadListings();
        return;
      }
      showToast('success', 'Listing submitted for admin review.');
    } else {
      showToast('success', modalMode === 'create' ? 'Listing saved as draft.' : 'Listing updated.');
    }

    setIsSaving(false);
    setIsModalOpen(false);
    await loadListings();
  };

  const handleSubmitForReview = async (listing: ShowcaseListing) => {
    const token = sessionManager.getSessionToken();
    if (!token) return;
    const result = await showcaseService.submitListing(token, listing.id);
    if (result.success) {
      showToast('success', 'Listing submitted for admin review.');
      await loadListings();
    } else {
      showToast('error', result.error ?? 'Failed to submit.');
    }
  };

  const handleDelete = async (listing: ShowcaseListing) => {
    if (deleteConfirm !== listing.id) {
      setDeleteConfirm(listing.id);
      return;
    }
    const token = sessionManager.getSessionToken();
    if (!token) return;
    setIsDeleting(listing.id);
    const result = await showcaseService.deleteListing(token, listing.id);
    setIsDeleting(null);
    setDeleteConfirm(null);
    if (result.success) {
      showToast('success', listing.status === 'approved' ? 'Listing archived.' : 'Listing deleted.');
      await loadListings();
    } else {
      showToast('error', result.error ?? 'Failed to delete listing.');
    }
  };

  const handleImproveWithAI = async () => {
    const token = sessionManager.getSessionToken();
    if (!token) return;
    setIsAILoading(true);
    const result = await showcaseService.improveWithAI(token, {
      title:               draft.title,
      productServiceName:  draft.productServiceName,
      category:            draft.category,
      shortDescription:    draft.shortDescription,
      detailedDescription: draft.detailedDescription,
      state:               draft.state,
    });
    setIsAILoading(false);
    if (!result.success) {
      setFormError(
        result.error_code === 'ai_disabled'
          ? 'AI helper is not configured. An admin can enable it in AI Settings.'
          : result.error ?? 'AI improvement failed.'
      );
      return;
    }
    if (result.data) {
      setDraft(prev => ({
        ...prev,
        title:               result.data!.title || prev.title,
        productServiceName:  result.data!.product_service_name || prev.productServiceName,
        shortDescription:    result.data!.short_description || prev.shortDescription,
        detailedDescription: result.data!.detailed_description || prev.detailedDescription,
      }));
      setFormError(null);
    }
  };

  if (authLoading) {
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

  if (!isMemberApproved) {
    return (
      <div className="min-h-screen bg-background">
        <MemberNav />
        <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 text-center">
          <Sparkles className="mx-auto mb-4 h-12 w-12 text-muted-foreground/30" />
          <h2 className="mb-2 text-xl font-bold text-foreground">Business Showcase</h2>
          <p className="mb-6 text-muted-foreground">
            The Business Showcase is available to approved Paid LUB Members only.
            Once your membership application is approved, you can list your products and services here.
          </p>
          {member?.status === 'pending' ? (
            <p className="text-sm text-muted-foreground">
              Your application is under review. You will gain access once it is approved.
            </p>
          ) : (
            <a
              href="/join"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Apply for Paid Membership
              <Sparkles className="h-4 w-4" />
            </a>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <MemberNav />
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">My Showcase Listings</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Create and manage your LUB Business Showcase listings.
            </p>
          </div>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            New Listing
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Loading your listings…
          </div>
        ) : listings.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border py-16 text-center">
            <Sparkles className="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" />
            <h3 className="mb-1 text-base font-semibold text-foreground">No listings yet</h3>
            <p className="mb-5 text-sm text-muted-foreground">
              Create your first showcase listing to appear in the LUB Business Showcase.
            </p>
            <button
              onClick={openCreate}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" />
              Create First Listing
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {listings.map(listing => (
              <div key={listing.id} className="rounded-xl border border-border bg-card p-5">
                <div className="mb-3 flex items-start gap-3">
                  {listing.photoUrl && (
                    <img
                      src={listing.photoUrl}
                      alt={listing.title}
                      className="h-14 w-14 rounded-lg object-cover border border-border shrink-0"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-semibold text-foreground truncate">{listing.title}</h3>
                      <StatusBadge status={listing.status} />
                    </div>
                    {listing.productServiceName && (
                      <p className="mt-0.5 text-xs text-muted-foreground">{listing.productServiceName}</p>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{listing.shortDescription}</p>
                  </div>
                </div>

                {listing.adminNote && listing.status === 'rejected' && (
                  <div className="mb-3 flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-xs text-destructive">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span><strong>Admin note:</strong> {listing.adminNote}</span>
                  </div>
                )}

                {listing.status === 'approved' && (
                  <div className="mb-3 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 dark:border-green-900/30 dark:bg-green-900/10 p-3 text-xs text-green-700 dark:text-green-400">
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                    Your listing is live on the Business Showcase.
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  {(listing.status === 'draft' || listing.status === 'rejected') && (
                    <>
                      <button
                        onClick={() => openEdit(listing)}
                        className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted/50"
                      >
                        <Edit className="h-3 w-3" />
                        Edit
                      </button>
                      <button
                        onClick={() => handleSubmitForReview(listing)}
                        className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                      >
                        <Send className="h-3 w-3" />
                        Submit for Review
                      </button>
                    </>
                  )}

                  {listing.status === 'pending_review' && (
                    <div className="flex items-center gap-1.5 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 px-3 py-1.5 text-xs font-medium text-yellow-700 dark:text-yellow-400">
                      <Clock className="h-3 w-3" />
                      Awaiting admin review
                    </div>
                  )}

                  <button
                    onClick={() => handleDelete(listing)}
                    disabled={isDeleting === listing.id}
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                      deleteConfirm === listing.id
                        ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                        : 'border border-border bg-card text-muted-foreground hover:bg-destructive/10 hover:text-destructive'
                    }`}
                  >
                    {isDeleting === listing.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Trash2 className="h-3 w-3" />
                    )}
                    {deleteConfirm === listing.id
                      ? (listing.status === 'approved' ? 'Confirm Archive' : 'Confirm Delete')
                      : (listing.status === 'approved' ? 'Archive' : 'Delete')}
                  </button>

                  {deleteConfirm === listing.id && (
                    <button
                      onClick={() => setDeleteConfirm(null)}
                      className="flex items-center gap-1 rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/50"
                    >
                      <X className="h-3 w-3" />
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 py-8 px-4">
          <div className="relative w-full max-w-xl rounded-xl bg-card shadow-lg">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h2 className="text-base font-semibold text-foreground">
                {modalMode === 'create' ? 'New Showcase Listing' : 'Edit Listing'}
              </h2>
              <button
                onClick={closeModal}
                className="rounded-lg p-1 text-muted-foreground hover:bg-muted/50"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 px-6 py-5">
              {formError && (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  {formError}
                </div>
              )}

              {/* Photo upload */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">
                  Photo
                </label>
                {photoPreview && (
                  <div className="mb-2 relative inline-block">
                    <img
                      src={photoPreview}
                      alt="Preview"
                      className="h-28 w-28 rounded-lg object-cover border border-border"
                    />
                    <button
                      onClick={() => { setPhotoFile(null); setPhotoPreview(null); setDraft(d => ({ ...d, photoUrl: '' })); }}
                      className="absolute -top-1.5 -right-1.5 rounded-full bg-destructive p-0.5 text-destructive-foreground"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )}
                <input
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/webp"
                  onChange={handlePhotoChange}
                  className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-primary/10 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-primary hover:file:bg-primary/20"
                />
                <p className="mt-1 text-xs text-muted-foreground">JPEG, PNG, or WebP. Max 5 MB.</p>
              </div>

              {/* Title */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">
                  Title <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  value={draft.title}
                  onChange={e => setDraft(d => ({ ...d, title: e.target.value }))}
                  placeholder="e.g. Precision CNC Machine Parts"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                  maxLength={150}
                />
              </div>

              {/* Product/service name */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">
                  Product / Service Name
                </label>
                <input
                  type="text"
                  value={draft.productServiceName}
                  onChange={e => setDraft(d => ({ ...d, productServiceName: e.target.value }))}
                  placeholder="e.g. CNC Machining Services"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                  maxLength={150}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Category */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">Category</label>
                  <select
                    value={draft.category}
                    onChange={e => setDraft(d => ({ ...d, category: e.target.value }))}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="">Select…</option>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                {/* Contact preference */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">Contact Via</label>
                  <select
                    value={draft.contactPreference}
                    onChange={e => setDraft(d => ({ ...d, contactPreference: e.target.value }))}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    {CONTACT_PREF_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* State */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">State</label>
                  <select
                    value={draft.state}
                    onChange={e => setDraft(d => ({ ...d, state: e.target.value }))}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="">Select…</option>
                    {states.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                {/* District */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">District</label>
                  <input
                    type="text"
                    value={draft.district}
                    onChange={e => setDraft(d => ({ ...d, district: e.target.value }))}
                    placeholder="e.g. Visakhapatnam"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
              </div>

              {/* Short description */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">
                  Short Description <span className="text-destructive">*</span>
                </label>
                <textarea
                  value={draft.shortDescription}
                  onChange={e => setDraft(d => ({ ...d, shortDescription: e.target.value }))}
                  rows={2}
                  maxLength={300}
                  placeholder="One-line summary of your product or service (max 300 chars)"
                  className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <p className="mt-1 text-right text-xs text-muted-foreground">
                  {draft.shortDescription.length}/300
                </p>
              </div>

              {/* Detailed description */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">
                  Detailed Description
                </label>
                <textarea
                  value={draft.detailedDescription}
                  onChange={e => setDraft(d => ({ ...d, detailedDescription: e.target.value }))}
                  rows={4}
                  placeholder="Describe your product or service in detail — quality, use cases, differentiators…"
                  className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>

              {/* AI improve button */}
              <button
                type="button"
                onClick={handleImproveWithAI}
                disabled={isAILoading || (!draft.title && !draft.shortDescription)}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-muted/30 px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isAILoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Wand2 className="h-4 w-4 text-primary" />
                )}
                {isAILoading ? 'Improving with AI…' : 'Improve with AI (optional)'}
              </button>
              <p className="text-center text-xs text-muted-foreground -mt-2">
                AI suggests improved copy — you review and accept before saving.
              </p>
            </div>

            <div className="flex gap-3 border-t border-border px-6 py-4">
              <button
                onClick={closeModal}
                className="flex-1 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted/50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleSave(false)}
                disabled={isSaving || isUploadingPhoto}
                className="flex-1 rounded-lg border border-border bg-muted/50 px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isUploadingPhoto ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Save Draft'}
              </button>
              <button
                onClick={() => handleSave(true)}
                disabled={isSaving || isUploadingPhoto}
                className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSaving && !isUploadingPhoto ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {isSubmitting ? 'Submitting…' : 'Saving…'}
                  </span>
                ) : 'Save & Submit'}
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
  );
};

export default MemberShowcaseListings;
