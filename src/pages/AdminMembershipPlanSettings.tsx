import React, { useCallback, useEffect, useState } from 'react';
import { GripVertical, Loader2, Plus, Save } from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { PermissionGate } from '../components/permissions/PermissionGate';
import Toast from '../components/Toast';
import { sessionManager } from '../lib/sessionManager';
import {
  membershipPlanService,
  MembershipPlanSetting,
  MembershipPlanFeature,
} from '../lib/supabase';

const AdminMembershipPlanSettings: React.FC = () => {
  const [plans, setPlans]         = useState<MembershipPlanSetting[]>([]);
  const [features, setFeatures]   = useState<MembershipPlanFeature[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving]   = useState(false);

  const [newFeatureLabel, setNewFeatureLabel] = useState('');
  const [newFeatureFree,  setNewFeatureFree]  = useState('');
  const [newFeaturePaid,  setNewFeaturePaid]  = useState('');
  const [isAddingFeature, setIsAddingFeature] = useState(false);

  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string; isVisible: boolean }>({
    type: 'success', message: '', isVisible: false,
  });
  const showToast = (type: 'success' | 'error', message: string) =>
    setToast({ type, message, isVisible: true });

  const load = useCallback(async () => {
    setIsLoading(true);
    const [p, f] = await Promise.all([
      membershipPlanService.getPublicPlanSettings(),
      membershipPlanService.getPublicPlanFeatures(),
    ]);
    setPlans(p);
    setFeatures(f);
    setIsLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handlePlanChange = (planKey: string, field: keyof MembershipPlanSetting, value: string) => {
    setPlans(prev => prev.map(p => p.planKey === planKey ? { ...p, [field]: value } : p));
  };

  const handleSavePlan = async (plan: MembershipPlanSetting) => {
    const token = sessionManager.getSessionToken();
    if (!token) return;
    setIsSaving(true);
    const result = await membershipPlanService.adminUpdatePlanSettings(token, plan);
    setIsSaving(false);
    if (result.success) showToast('success', `${plan.title} saved.`);
    else showToast('error', result.error ?? 'Failed to save plan settings.');
  };

  const handleSaveFeature = async (feature: MembershipPlanFeature) => {
    const token = sessionManager.getSessionToken();
    if (!token) return;
    setIsSaving(true);
    const result = await membershipPlanService.adminUpsertFeature(token, feature);
    setIsSaving(false);
    if (result.success) showToast('success', 'Feature row saved.');
    else showToast('error', result.error ?? 'Failed to save feature.');
  };

  const handleFeatureChange = (id: string, field: keyof MembershipPlanFeature, value: string | boolean) => {
    setFeatures(prev => prev.map(f => f.id === id ? { ...f, [field]: value } : f));
  };

  const handleAddFeature = async () => {
    if (!newFeatureLabel.trim()) return;
    const token = sessionManager.getSessionToken();
    if (!token) return;
    setIsAddingFeature(true);
    const result = await membershipPlanService.adminUpsertFeature(token, {
      featureLabel: newFeatureLabel.trim(),
      freeValue:    newFeatureFree.trim() || null,
      paidValue:    newFeaturePaid.trim() || null,
      displayOrder: features.length,
      isActive:     true,
    });
    setIsAddingFeature(false);
    if (result.success) {
      showToast('success', 'Feature added.');
      setNewFeatureLabel('');
      setNewFeatureFree('');
      setNewFeaturePaid('');
      await load();
    } else {
      showToast('error', result.error ?? 'Failed to add feature.');
    }
  };

  return (
    <PermissionGate
      permission="members.view"
      fallback={<PageHeader title="Membership Plans" subtitle="You do not have permission to manage membership plan settings." />}
    >
      <div className="space-y-8">
        <PageHeader
          title="Membership Plan Settings"
          subtitle="Edit plan titles, subtitles, and the feature comparison table shown on the public Membership Plans page."
        />

        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Loading settings…
          </div>
        ) : (
          <>
            {/* Plan cards */}
            <section className="grid gap-6 sm:grid-cols-2">
              {plans.map(plan => (
                <div key={plan.id} className="rounded-xl border border-border bg-card p-5">
                  <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                    {plan.planKey === 'free' ? 'Free Membership' : 'Paid LUB Membership'} — Copy
                  </h3>
                  <div className="space-y-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-foreground">Title</label>
                      <input
                        type="text"
                        value={plan.title}
                        onChange={e => handlePlanChange(plan.planKey, 'title', e.target.value)}
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-foreground">Subtitle</label>
                      <input
                        type="text"
                        value={plan.subtitle ?? ''}
                        onChange={e => handlePlanChange(plan.planKey, 'subtitle', e.target.value)}
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-foreground">Description (optional)</label>
                      <textarea
                        value={plan.description ?? ''}
                        onChange={e => handlePlanChange(plan.planKey, 'description', e.target.value)}
                        rows={2}
                        className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                    </div>
                    <button
                      onClick={() => handleSavePlan(plan)}
                      disabled={isSaving}
                      className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                    >
                      {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                      Save
                    </button>
                  </div>
                </div>
              ))}
            </section>

            {/* Feature rows */}
            <section>
              <h2 className="mb-4 text-base font-semibold text-foreground">Feature Comparison Rows</h2>
              <p className="mb-4 text-sm text-muted-foreground">
                These rows appear in the "What's Included" comparison table on the public Membership Plans page.
                Leave a value empty to show a minus (not included) for that plan.
              </p>

              <div className="rounded-xl border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider w-8"></th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Feature Label</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider w-28">Free Value</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider w-28">Paid Value</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider w-20">Active</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider w-20">Save</th>
                    </tr>
                  </thead>
                  <tbody>
                    {features.map((f, i) => (
                      <tr
                        key={f.id}
                        className={`border-b border-border last:border-0 ${i % 2 === 0 ? '' : 'bg-muted/10'}`}
                      >
                        <td className="px-4 py-2 text-muted-foreground/40">
                          <GripVertical className="h-4 w-4" />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            value={f.featureLabel}
                            onChange={e => handleFeatureChange(f.id!, 'featureLabel', e.target.value)}
                            className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            value={f.freeValue ?? ''}
                            onChange={e => handleFeatureChange(f.id!, 'freeValue', e.target.value)}
                            placeholder="Leave empty = not included"
                            className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            value={f.paidValue ?? ''}
                            onChange={e => handleFeatureChange(f.id!, 'paidValue', e.target.value)}
                            placeholder="Leave empty = not included"
                            className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                          />
                        </td>
                        <td className="px-4 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={f.isActive}
                            onChange={e => handleFeatureChange(f.id!, 'isActive', e.target.checked)}
                            className="h-4 w-4 rounded border-border accent-primary"
                          />
                        </td>
                        <td className="px-4 py-2 text-right">
                          <button
                            onClick={() => handleSaveFeature(f)}
                            disabled={isSaving}
                            className="rounded-lg bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                          >
                            <Save className="h-3 w-3" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Add new feature row */}
              <div className="mt-4 rounded-xl border border-dashed border-border bg-muted/20 p-4">
                <h3 className="mb-3 text-sm font-semibold text-foreground">Add New Row</h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-foreground">Feature Label <span className="text-destructive">*</span></label>
                    <input
                      type="text"
                      value={newFeatureLabel}
                      onChange={e => setNewFeatureLabel(e.target.value)}
                      placeholder="e.g. Member Directory Listing"
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-foreground">Free Value</label>
                    <input
                      type="text"
                      value={newFeatureFree}
                      onChange={e => setNewFeatureFree(e.target.value)}
                      placeholder="Included / Custom / leave empty"
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-foreground">Paid Value</label>
                    <input
                      type="text"
                      value={newFeaturePaid}
                      onChange={e => setNewFeaturePaid(e.target.value)}
                      placeholder="Included / Custom / leave empty"
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                </div>
                <button
                  onClick={handleAddFeature}
                  disabled={isAddingFeature || !newFeatureLabel.trim()}
                  className="mt-3 flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/50 disabled:opacity-50"
                >
                  {isAddingFeature
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <Plus className="h-4 w-4" />}
                  Add Row
                </button>
              </div>
            </section>
          </>
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

export default AdminMembershipPlanSettings;
