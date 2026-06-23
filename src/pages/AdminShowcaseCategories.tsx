import React, { useCallback, useEffect, useState } from 'react';
import { GripVertical, Loader2, Plus, Save } from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { PermissionGate } from '../components/permissions/PermissionGate';
import Toast from '../components/Toast';
import { sessionManager } from '../lib/sessionManager';
import { showcaseCategoryService, ShowcaseCategory } from '../lib/supabase';

const AdminShowcaseCategories: React.FC = () => {
  const [categories, setCategories] = useState<ShowcaseCategory[]>([]);
  const [isLoading, setIsLoading]   = useState(true);
  const [savingId, setSavingId]     = useState<string | null>(null);

  const [newName, setNewName]   = useState('');
  const [newOrder, setNewOrder] = useState('');
  const [isAdding, setIsAdding] = useState(false);

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
      const cats = await showcaseCategoryService.adminGetCategories(token);
      setCategories(cats);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to load categories.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleChange = (id: string, field: keyof ShowcaseCategory, value: string | number | boolean) =>
    setCategories(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c));

  const handleSave = async (category: ShowcaseCategory) => {
    const token = sessionManager.getSessionToken();
    if (!token) return;
    if (!category.name.trim()) { showToast('error', 'Category name is required.'); return; }
    setSavingId(category.id);
    const result = await showcaseCategoryService.adminUpsertCategory(token, {
      id:           category.id,
      name:         category.name.trim(),
      displayOrder: category.displayOrder,
      isActive:     category.isActive,
    });
    setSavingId(null);
    if (result.success) showToast('success', 'Category saved.');
    else showToast('error', result.error ?? 'Failed to save category.');
  };

  const handleAdd = async () => {
    if (!newName.trim()) return;
    const token = sessionManager.getSessionToken();
    if (!token) return;
    setIsAdding(true);
    const result = await showcaseCategoryService.adminUpsertCategory(token, {
      name:         newName.trim(),
      displayOrder: newOrder.trim() ? Number(newOrder) : categories.length + 1,
      isActive:     true,
    });
    setIsAdding(false);
    if (result.success) {
      showToast('success', 'Category added.');
      setNewName('');
      setNewOrder('');
      await load();
    } else {
      showToast('error', result.error ?? 'Failed to add category.');
    }
  };

  return (
    <PermissionGate
      permission="members.view"
      fallback={<PageHeader title="Showcase Categories" subtitle="You do not have permission to manage showcase categories." />}
    >
      <div className="space-y-6">
        <PageHeader
          title="Showcase Categories"
          subtitle="Manage the categories members choose from when creating Business Showcase listings. Inactive categories are hidden from new listings and filters but stay on any listing already using them."
        />

        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Loading categories…
          </div>
        ) : (
          <>
            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider w-8"></th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Name</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider w-28">Order</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider w-20">Active</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider w-20">Save</th>
                  </tr>
                </thead>
                <tbody>
                  {categories.map((c, i) => (
                    <tr key={c.id} className={`border-b border-border last:border-0 ${i % 2 === 0 ? '' : 'bg-muted/10'}`}>
                      <td className="px-4 py-2 text-muted-foreground/40">
                        <GripVertical className="h-4 w-4" />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="text"
                          value={c.name}
                          onChange={e => handleChange(c.id, 'name', e.target.value)}
                          className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="number"
                          value={c.displayOrder}
                          onChange={e => handleChange(c.id, 'displayOrder', Number(e.target.value))}
                          className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-center text-sm text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                      </td>
                      <td className="px-4 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={c.isActive}
                          onChange={e => handleChange(c.id, 'isActive', e.target.checked)}
                          className="h-4 w-4 rounded border-border accent-primary"
                        />
                      </td>
                      <td className="px-4 py-2 text-right">
                        <button
                          onClick={() => handleSave(c)}
                          disabled={savingId === c.id}
                          className="rounded-lg bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                        >
                          {savingId === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Add new */}
            <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4">
              <h3 className="mb-3 text-sm font-semibold text-foreground">Add New Category</h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_8rem_auto] sm:items-end">
                <div>
                  <label className="mb-1 block text-xs font-medium text-foreground">Name <span className="text-destructive">*</span></label>
                  <input
                    type="text"
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    placeholder="e.g. Renewable Energy"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-foreground">Order</label>
                  <input
                    type="number"
                    value={newOrder}
                    onChange={e => setNewOrder(e.target.value)}
                    placeholder="Auto"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
                <button
                  onClick={handleAdd}
                  disabled={isAdding || !newName.trim()}
                  className="flex items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/50 disabled:opacity-50"
                >
                  {isAdding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Add
                </button>
              </div>
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
    </PermissionGate>
  );
};

export default AdminShowcaseCategories;
