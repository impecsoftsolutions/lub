import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Edit,
  ImagePlus,
  Loader2,
  MapPin,
  Plus,
  Send,
  Sparkles,
  Star,
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
  showcaseCategoryService,
  ShowcaseListing,
  ShowcaseListingDraft,
} from '../lib/supabase';

const MAX_PHOTOS = 3;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_PHOTO_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WEBSITE_PATTERN = /^(https?:\/\/)?([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}(:[0-9]{1,5})?(\/[^\s]*)?$/i;

interface PhotoItem {
  url?: string;   // already-uploaded URL (edit mode or after upload)
  file?: File;    // pending local file to upload on save
  preview: string;
}

const EMPTY_DRAFT: ShowcaseListingDraft = {
  title: '', productServiceName: '', category: '', keywords: '', shortDescription: '',
  detailedDescription: '', photos: [], contactEmail: '', contactPhone: '',
  showContactEmail: false, showContactPhone: false, websiteUrl: '',
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
  const [categories, setCategories] = useState<string[]>([]);

  const [modalMode,      setModalMode]      = useState<ModalMode>('create');
  const [editingId,      setEditingId]      = useState<string | null>(null);
  const [isModalOpen,    setIsModalOpen]    = useState(false);
  const [draft,          setDraft]          = useState<ShowcaseListingDraft>(EMPTY_DRAFT);
  const [photos,         setPhotos]         = useState<PhotoItem[]>([]);
  const [isSaving,       setIsSaving]       = useState(false);
  const [isSubmitting,   setIsSubmitting]   = useState(false);
  const [isDeleting,     setIsDeleting]     = useState<string | null>(null);
  const [isAILoading,    setIsAILoading]    = useState(false);
  const [isKeywordLoading, setIsKeywordLoading] = useState(false);
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
    showcaseCategoryService.getActiveCategories()
      .then(cats => setCategories(cats.map(c => c.name)))
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

  // When editing a listing whose stored category is now inactive, keep it as an option.
  const categoryOptions = (() => {
    const opts = [...categories];
    if (draft.category && !opts.includes(draft.category)) opts.unshift(draft.category);
    return opts.sort((a, b) => {
      const aOther = a.trim().toLowerCase() === 'other';
      const bOther = b.trim().toLowerCase() === 'other';
      if (aOther && !bOther) return 1;
      if (!aOther && bOther) return -1;
      return a.localeCompare(b, undefined, { sensitivity: 'base' });
    });
  })();

  const openCreate = () => {
    setModalMode('create');
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
    setPhotos([]);
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
      keywords:            listing.keywords ?? '',
      shortDescription:    listing.shortDescription,
      detailedDescription: listing.detailedDescription ?? '',
      photos:              listing.photos,
      contactEmail:        listing.contactEmail ?? '',
      contactPhone:        listing.contactPhone ?? '',
      showContactEmail:    listing.showContactEmail,
      showContactPhone:    listing.showContactPhone,
      websiteUrl:          listing.websiteUrl ?? '',
    });
    setPhotos(listing.photos.map(u => ({ url: u, preview: u })));
    setFormError(null);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    if (isSaving || isAILoading || isKeywordLoading || isUploadingPhoto) return;
    setIsModalOpen(false);
  };

  const handleAddPhotos = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ''; // allow re-selecting the same file
    if (files.length === 0) return;
    setFormError(null);

    setPhotos(prev => {
      const next = [...prev];
      for (const file of files) {
        if (next.length >= MAX_PHOTOS) { setFormError(`You can upload up to ${MAX_PHOTOS} photos.`); break; }
        if (!ALLOWED_PHOTO_TYPES.includes(file.type)) { setFormError('Only JPEG, PNG, or WebP images are allowed.'); continue; }
        if (file.size > MAX_PHOTO_BYTES) { setFormError('Each image must be under 10 MB.'); continue; }
        next.push({ file, preview: URL.createObjectURL(file) });
      }
      return next;
    });
  };

  const removePhoto = (index: number) =>
    setPhotos(prev => prev.filter((_, i) => i !== index));

  const setAsMain = (index: number) =>
    setPhotos(prev => {
      if (index <= 0 || index >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.unshift(item);
      return next;
    });

  const handleSave = async (submit = false) => {
    if (!draft.title.trim()) { setFormError('Title is required.'); return; }
    if (!draft.shortDescription.trim()) { setFormError('Short description is required.'); return; }
    if (draft.contactEmail.trim() && !EMAIL_PATTERN.test(draft.contactEmail.trim())) {
      setFormError('Enter a valid contact email address.');
      return;
    }
    if (draft.websiteUrl.trim() && !WEBSITE_PATTERN.test(draft.websiteUrl.trim())) {
      setFormError('Enter a valid website address.');
      return;
    }

    const token = sessionManager.getSessionToken();
    if (!token) { showToast('error', 'Session expired. Please sign in again.'); return; }

    setIsSaving(true);
    setFormError(null);

    // Upload any pending files (preserving order); collect final ordered URLs.
    const finalUrls: string[] = [];
    if (photos.some(p => p.file)) setIsUploadingPhoto(true);
    for (const item of photos) {
      if (item.url) {
        finalUrls.push(item.url);
      } else if (item.file) {
        const uploadResult = await showcaseService.uploadPhoto(token, item.file);
        if (!uploadResult.success || !uploadResult.url) {
          setIsUploadingPhoto(false);
          setFormError(uploadResult.error ?? 'Photo upload failed. Please try again.');
          setIsSaving(false);
          return;
        }
        finalUrls.push(uploadResult.url);
      }
    }
    setIsUploadingPhoto(false);

    const draftToSave: ShowcaseListingDraft = { ...draft, photos: finalUrls };

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

  const getAIPhotoUrls = async (token: string): Promise<string[] | null> => {
    let workingPhotos = photos;
    if (photos.some(p => p.file && !p.url)) {
      setIsUploadingPhoto(true);
      const uploaded: PhotoItem[] = [];
      for (const item of photos) {
        if (item.url) { uploaded.push(item); continue; }
        if (!item.file) continue;
        const r = await showcaseService.uploadPhoto(token, item.file);
        if (!r.success || !r.url) {
          setIsUploadingPhoto(false);
          setFormError(r.error ?? 'Photo upload failed. Please try again.');
          return null;
        }
        uploaded.push({ url: r.url, preview: r.url });
      }
      setIsUploadingPhoto(false);
      workingPhotos = uploaded;
      setPhotos(uploaded);
    }

    return workingPhotos.map(p => p.url).filter((u): u is string => !!u);
  };

  const handleImproveWithAI = async () => {
    const token = sessionManager.getSessionToken();
    if (!token) return;
    setIsAILoading(true);
    setFormError(null);

    const photoUrls = await getAIPhotoUrls(token);
    if (!photoUrls) {
      setIsAILoading(false);
      return;
    }

    const result = await showcaseService.improveWithAI(token, {
      title:               draft.title,
      productServiceName:  draft.productServiceName,
      category:            draft.category,
      keywords:            draft.keywords,
      shortDescription:    draft.shortDescription,
      detailedDescription: draft.detailedDescription,
    }, photoUrls);
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
        keywords:            result.data!.keywords || prev.keywords,
        shortDescription:    result.data!.short_description || prev.shortDescription,
        detailedDescription: result.data!.detailed_description || prev.detailedDescription,
      }));
      setFormError(null);
      if (photoUrls.length > 0 && result.usedImages === false) {
        showToast('error', 'AI could not read your photos this time — suggestions are based on your text. Review before saving.');
      } else {
        showToast('success', 'AI suggestions added. Review and edit before saving.');
      }
    }
  };

  const handleGenerateKeywords = async () => {
    const token = sessionManager.getSessionToken();
    if (!token) return;
    setIsKeywordLoading(true);
    setFormError(null);

    const photoUrls = await getAIPhotoUrls(token);
    if (!photoUrls) {
      setIsKeywordLoading(false);
      return;
    }

    const result = await showcaseService.improveWithAI(token, {
      title:               draft.title,
      productServiceName:  draft.productServiceName,
      category:            draft.category,
      keywords:            draft.keywords,
      shortDescription:    draft.shortDescription,
      detailedDescription: draft.detailedDescription,
    }, photoUrls);
    setIsKeywordLoading(false);

    if (!result.success) {
      setFormError(result.error ?? 'AI keyword generation failed.');
      return;
    }

    if (result.data?.keywords) {
      setDraft(prev => ({ ...prev, keywords: result.data!.keywords ?? prev.keywords }));
      if (photoUrls.length > 0 && result.usedImages === false) {
        showToast('error', 'AI could not read your photos this time — keywords are based on your text. Review before saving.');
      } else {
        showToast('success', 'Keywords generated. Review before saving.');
      }
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
              href="/dashboard/upgrade"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Upgrade to Paid Membership
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
                  {listing.photos.length > 0 && (
                    <div className="relative shrink-0">
                      <img
                        src={listing.photos[0]}
                        alt={listing.title}
                        className="h-14 w-14 rounded-lg object-cover border border-border"
                      />
                      {listing.photos.length > 1 && (
                        <span className="absolute -bottom-1.5 -right-1.5 rounded-full bg-foreground/80 px-1.5 py-0.5 text-[10px] font-medium text-background">
                          +{listing.photos.length - 1}
                        </span>
                      )}
                    </div>
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

            <div className="space-y-5 px-6 py-5">
              {formError && (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  {formError}
                </div>
              )}

              {/* Photos */}
              <section>
                <label className="mb-1.5 block text-sm font-semibold text-foreground">
                  Photos <span className="font-normal text-muted-foreground">(up to {MAX_PHOTOS})</span>
                </label>
                <p className="mb-2 text-xs text-muted-foreground">
                  The first photo is your main public photo. JPEG, PNG, or WebP. Max 10 MB each.
                </p>
                <div className="flex flex-wrap gap-3">
                  {photos.map((p, i) => (
                    <div key={i} className="relative">
                      <img
                        src={p.preview}
                        alt={`Photo ${i + 1}`}
                        className={`h-24 w-24 rounded-lg object-cover border-2 ${i === 0 ? 'border-primary' : 'border-border'}`}
                      />
                      {i === 0 && (
                        <span className="absolute left-1 top-1 inline-flex items-center gap-0.5 rounded bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
                          <Star className="h-2.5 w-2.5" /> Main
                        </span>
                      )}
                      <button
                        onClick={() => removePhoto(i)}
                        className="absolute -top-1.5 -right-1.5 rounded-full bg-destructive p-0.5 text-destructive-foreground"
                        aria-label="Remove photo"
                      >
                        <X className="h-3 w-3" />
                      </button>
                      {i !== 0 && (
                        <button
                          onClick={() => setAsMain(i)}
                          className="absolute bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-foreground/80 px-1.5 py-0.5 text-[10px] font-medium text-background hover:bg-foreground"
                        >
                          Set main
                        </button>
                      )}
                    </div>
                  ))}
                  {photos.length < MAX_PHOTOS && (
                    <label className="flex h-24 w-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-border text-muted-foreground hover:border-primary/40 hover:text-primary">
                      <ImagePlus className="h-5 w-5" />
                      <span className="text-[10px]">Add photo</span>
                      <input
                        type="file"
                        accept="image/jpeg,image/jpg,image/png,image/webp"
                        multiple
                        onChange={handleAddPhotos}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>
              </section>

              {/* Location (read-only, from registration) */}
              <section className="rounded-lg border border-border bg-muted/20 p-3">
                <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                  <MapPin className="h-4 w-4 text-primary" />
                  Business location
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Your listing uses the business location from your approved LUB registration
                  {member?.state ? <> (State: <strong>{member.state}</strong>)</> : null}. No need to re-enter it.
                </p>
              </section>

              {/* Basic details */}
              <section className="space-y-4">
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

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-foreground">Product / Service Name</label>
                    <input
                      type="text"
                      value={draft.productServiceName}
                      onChange={e => setDraft(d => ({ ...d, productServiceName: e.target.value }))}
                      placeholder="e.g. CNC Machining Services"
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                      maxLength={150}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-foreground">Category</label>
                    <select
                      value={draft.category}
                      onChange={e => setDraft(d => ({ ...d, category: e.target.value }))}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                    >
                      <option value="">Select…</option>
                      {categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <div className="mb-1.5 flex items-center justify-between gap-3">
                    <label className="block text-sm font-medium text-foreground">Keywords</label>
                    <button
                      type="button"
                      onClick={handleGenerateKeywords}
                      disabled={isKeywordLoading || isAILoading || (!draft.title && !draft.productServiceName && !draft.keywords && !draft.shortDescription && !draft.detailedDescription && photos.length === 0)}
                      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/30 px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isKeywordLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5 text-primary" />}
                      Generate keywords
                    </button>
                  </div>
                  <textarea
                    value={draft.keywords}
                    onChange={e => setDraft(d => ({ ...d, keywords: e.target.value }))}
                    placeholder="e.g. cashew processing, food packaging, industrial machinery"
                    rows={2}
                    maxLength={500}
                    className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Keywords help visitors find your product or service in search.
                  </p>
                </div>
              </section>

              {/* Contact */}
              <section className="space-y-3">
                <h3 className="text-sm font-semibold text-foreground">Contact</h3>
                <p className="-mt-1 text-xs text-muted-foreground">
                  Add only the contact details you want shown on this listing.
                </p>
                <div>
                  <input
                    type="email"
                    value={draft.contactEmail}
                    onChange={e => setDraft(d => ({ ...d, contactEmail: e.target.value }))}
                    placeholder="Contact email"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
                <div>
                  <input
                    type="tel"
                    value={draft.contactPhone}
                    onChange={e => setDraft(d => ({ ...d, contactPhone: e.target.value }))}
                    placeholder="Contact number"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
                <div>
                  <input
                    type="text"
                    inputMode="url"
                    value={draft.websiteUrl}
                    onChange={e => setDraft(d => ({ ...d, websiteUrl: e.target.value }))}
                    placeholder="Website"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
              </section>

              {/* Description */}
              <section className="space-y-4">
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
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">Detailed Description</label>
                  <textarea
                    value={draft.detailedDescription}
                    onChange={e => setDraft(d => ({ ...d, detailedDescription: e.target.value }))}
                    rows={4}
                    placeholder="Describe your product or service in detail — quality, use cases, differentiators…"
                    className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>

                {/* AI generate / improve — works from photos and/or text */}
                <button
                  type="button"
                  onClick={handleImproveWithAI}
                  disabled={isAILoading || isKeywordLoading || (!draft.title && !draft.productServiceName && !draft.keywords && !draft.shortDescription && !draft.detailedDescription && photos.length === 0)}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-muted/30 px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isAILoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4 text-primary" />}
                  {isAILoading
                    ? (isUploadingPhoto ? 'Preparing photos…' : 'Generating with AI…')
                    : 'Generate / Improve with AI (optional)'}
                </button>
                <p className="text-center text-xs text-muted-foreground -mt-2">
                  AI reads your photos and any text you entered, then suggests the four text fields — you review and accept before saving.
                </p>
              </section>
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
                disabled={isSaving || isUploadingPhoto || isKeywordLoading}
                className="flex-1 rounded-lg border border-border bg-muted/50 px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isUploadingPhoto ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Save Draft'}
              </button>
              <button
                onClick={() => handleSave(true)}
                disabled={isSaving || isUploadingPhoto || isKeywordLoading}
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
