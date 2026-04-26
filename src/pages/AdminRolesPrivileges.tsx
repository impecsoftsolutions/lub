import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Shield, Users, Key, ChevronRight, Check, X, Plus, Trash2, RefreshCw, Lock,
  Pause, Play, Copy, Pencil, MoreHorizontal, Search, UserPlus, AlertTriangle,
} from 'lucide-react';
import { PermissionGate } from '../components/permissions/PermissionGate';
import { PageHeader } from '../components/ui/PageHeader';
import { useHasPermission } from '../hooks/usePermissions';
import { sessionManager } from '../lib/sessionManager';
import {
  rolesService,
  type RoleCatalog,
  type RolePermissionItem,
  type PermissionCatalogItem,
  type UserWithRole,
  type UserPermissionOverride,
  type UserSearchResult,
} from '../lib/supabase';
import Toast from '../components/Toast';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SYSTEM_ROLE_COLORS: Record<string, string> = {
  super_admin: 'bg-red-100 text-red-800 border-red-200',
  admin:       'bg-orange-100 text-orange-800 border-orange-200',
  manager:     'bg-blue-100 text-blue-800 border-blue-200',
  editor:      'bg-green-100 text-green-800 border-green-200',
  viewer:      'bg-gray-100 text-gray-700 border-gray-200',
};

const CUSTOM_ROLE_COLOR = 'bg-purple-100 text-purple-800 border-purple-200';

const OVERRIDE_COLORS: Record<string, string> = {
  grant:  'bg-green-100 text-green-800 border-green-200',
  revoke: 'bg-red-100 text-red-800 border-red-200',
};

function roleBadgeClass(role: RoleCatalog | { name: string; is_system?: boolean } | null | undefined): string {
  if (!role) return 'bg-muted text-muted-foreground border-border';
  if (role.is_system === false) return CUSTOM_ROLE_COLOR;
  return SYSTEM_ROLE_COLORS[role.name] ?? CUSTOM_ROLE_COLOR;
}

function groupByCategory<T extends { category: string }>(items: T[]): Record<string, T[]> {
  return items.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {} as Record<string, T[]>);
}

function formatCategory(cat: string): string {
  return cat.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ─── Main Component ───────────────────────────────────────────────────────────

const AdminRolesPrivileges: React.FC = () => {
  const canManage = useHasPermission('users.roles.assign');

  // ── Top-level data ────────────────────────────────────────────────────────
  const [isLoading, setIsLoading] = useState(true);
  const [roles, setRoles] = useState<RoleCatalog[]>([]);
  const [permissions, setPermissions] = useState<PermissionCatalogItem[]>([]);
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [metrics, setMetrics] = useState<{ total_roles: number; users_with_overrides: number; total_overrides: number } | null>(null);

  // ── Role drawer (permission editor) ───────────────────────────────────────
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<RoleCatalog | null>(null);
  const [rolePerms, setRolePerms] = useState<RolePermissionItem[]>([]);
  const [rolePermsLoading, setRolePermsLoading] = useState(false);
  const [togglingPerm, setTogglingPerm] = useState<string | null>(null);

  // ── Create role dialog ────────────────────────────────────────────────────
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createDisplay, setCreateDisplay] = useState('');
  const [createDesc, setCreateDesc] = useState('');
  const [createSaving, setCreateSaving] = useState(false);

  // ── Clone role dialog ─────────────────────────────────────────────────────
  const [cloneOpen, setCloneOpen] = useState(false);
  const [cloneSource, setCloneSource] = useState<RoleCatalog | null>(null);
  const [cloneName, setCloneName] = useState('');
  const [cloneDisplay, setCloneDisplay] = useState('');
  const [cloneDesc, setCloneDesc] = useState('');
  const [cloneSaving, setCloneSaving] = useState(false);

  // ── Edit role dialog ──────────────────────────────────────────────────────
  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<RoleCatalog | null>(null);
  const [editDisplay, setEditDisplay] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  // ── Delete role confirm ───────────────────────────────────────────────────
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<RoleCatalog | null>(null);
  const [deleteSaving, setDeleteSaving] = useState(false);

  // ── User search & assignment ──────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Assign / change role dialog
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignTarget, setAssignTarget] = useState<UserSearchResult | null>(null);
  const [assignRole, setAssignRole] = useState('');
  const [assignSaving, setAssignSaving] = useState(false);

  // Remove role confirm
  const [removeOpen, setRemoveOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<UserSearchResult | null>(null);
  const [removeSaving, setRemoveSaving] = useState(false);

  // ── User overrides dialog ─────────────────────────────────────────────────
  const [overrideDialogOpen, setOverrideDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserWithRole | null>(null);
  const [userOverrides, setUserOverrides] = useState<UserPermissionOverride[]>([]);
  const [overridesLoading, setOverridesLoading] = useState(false);

  // Add override sub-dialog
  const [addOverrideOpen, setAddOverrideOpen] = useState(false);
  const [addOverrideType, setAddOverrideType] = useState<'grant' | 'revoke'>('grant');
  const [addOverrideSearch, setAddOverrideSearch] = useState('');
  const [addOverrideSelectedCode, setAddOverrideSelectedCode] = useState('');
  const [addOverrideReason, setAddOverrideReason] = useState('');
  const [addOverrideSaving, setAddOverrideSaving] = useState(false);

  // ── Toast ─────────────────────────────────────────────────────────────────
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string; isVisible: boolean }>({
    type: 'success', message: '', isVisible: false,
  });

  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    setToast({ type, message, isVisible: true });
    setTimeout(() => setToast(t => ({ ...t, isVisible: false })), 4000);
  }, []);

  // ── Loaders ───────────────────────────────────────────────────────────────

  const loadAll = useCallback(async () => {
    const token = sessionManager.getSessionToken();
    if (!token) return;
    setIsLoading(true);
    try {
      const [rolesData, permsData, usersData, metricsData] = await Promise.all([
        rolesService.listRoles(token),
        rolesService.listPermissionsCatalog(token),
        rolesService.listUsersWithRoles(token),
        rolesService.getMetrics(token),
      ]);
      setRoles(rolesData);
      setPermissions(permsData);
      setUsers(usersData);
      setMetrics({
        total_roles: metricsData.total_roles,
        users_with_overrides: metricsData.users_with_overrides,
        total_overrides: metricsData.total_overrides,
      });
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  useEffect(() => { void loadAll(); }, [loadAll]);

  // Debounced user search
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      const token = sessionManager.getSessionToken();
      if (!token) return;
      setSearchLoading(true);
      try {
        const data = await rolesService.searchUsersForRoleAssignment(token, searchQuery, 50);
        setSearchResults(data);
      } catch (err) {
        showToast('error', err instanceof Error ? err.message : 'Search failed');
      } finally {
        setSearchLoading(false);
      }
    }, 250);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [searchQuery, showToast]);

  const refreshAfterMutation = useCallback(async () => {
    const token = sessionManager.getSessionToken();
    if (!token) return;
    try {
      const [rolesData, usersData, metricsData, searchData] = await Promise.all([
        rolesService.listRoles(token),
        rolesService.listUsersWithRoles(token),
        rolesService.getMetrics(token),
        rolesService.searchUsersForRoleAssignment(token, searchQuery, 50),
      ]);
      setRoles(rolesData);
      setUsers(usersData);
      setMetrics({
        total_roles: metricsData.total_roles,
        users_with_overrides: metricsData.users_with_overrides,
        total_overrides: metricsData.total_overrides,
      });
      setSearchResults(searchData);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to refresh');
    }
  }, [searchQuery, showToast]);

  const loadRolePermissions = useCallback(async (roleName: string) => {
    const token = sessionManager.getSessionToken();
    if (!token) return;
    setRolePermsLoading(true);
    try {
      const data = await rolesService.listRolePermissions(token, roleName);
      setRolePerms(data);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to load role permissions');
    } finally {
      setRolePermsLoading(false);
    }
  }, [showToast]);

  const loadUserOverrides = useCallback(async (userId: string) => {
    const token = sessionManager.getSessionToken();
    if (!token) return;
    setOverridesLoading(true);
    try {
      const data = await rolesService.getUserPermissionOverrides(token, userId);
      setUserOverrides(data);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to load overrides');
    } finally {
      setOverridesLoading(false);
    }
  }, [showToast]);

  // ── Role drawer ───────────────────────────────────────────────────────────

  const openRoleDrawer = useCallback((role: RoleCatalog) => {
    setSelectedRole(role);
    setDrawerOpen(true);
    void loadRolePermissions(role.name);
  }, [loadRolePermissions]);

  const handleTogglePermission = useCallback(async (permCode: string, currentlyGranted: boolean) => {
    if (!canManage || !selectedRole) return;
    const token = sessionManager.getSessionToken();
    if (!token) return;

    setTogglingPerm(permCode);
    try {
      if (currentlyGranted) {
        await rolesService.revokeRolePermission(token, selectedRole.name, permCode);
      } else {
        await rolesService.grantRolePermission(token, selectedRole.name, permCode);
      }
      setRolePerms(prev => prev.map(p => p.code === permCode ? { ...p, is_granted: !currentlyGranted } : p));
      const rolesData = await rolesService.listRoles(token);
      setRoles(rolesData);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to update permission');
      void loadRolePermissions(selectedRole.name);
    } finally {
      setTogglingPerm(null);
    }
  }, [canManage, selectedRole, showToast, loadRolePermissions]);

  // ── Custom role lifecycle handlers ────────────────────────────────────────

  const handleCreateRole = useCallback(async () => {
    if (!canManage) return;
    const token = sessionManager.getSessionToken();
    if (!token) return;
    if (!createName.trim() || !createDisplay.trim()) {
      showToast('error', 'Name and display name are required');
      return;
    }
    setCreateSaving(true);
    try {
      await rolesService.createRole(token, createName.trim(), createDisplay.trim(), createDesc.trim() || undefined);
      showToast('success', 'Role created');
      setCreateOpen(false);
      setCreateName(''); setCreateDisplay(''); setCreateDesc('');
      await refreshAfterMutation();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to create role');
    } finally {
      setCreateSaving(false);
    }
  }, [canManage, createName, createDisplay, createDesc, refreshAfterMutation, showToast]);

  const openClone = useCallback((role: RoleCatalog) => {
    setCloneSource(role);
    setCloneName(`${role.name}_copy`);
    setCloneDisplay(`${role.display_name} (Copy)`);
    setCloneDesc(role.description ?? '');
    setCloneOpen(true);
  }, []);

  const handleCloneRole = useCallback(async () => {
    if (!canManage || !cloneSource) return;
    const token = sessionManager.getSessionToken();
    if (!token) return;
    if (!cloneName.trim() || !cloneDisplay.trim()) {
      showToast('error', 'Name and display name are required');
      return;
    }
    setCloneSaving(true);
    try {
      const r = await rolesService.cloneRole(token, cloneSource.name, cloneName.trim(), cloneDisplay.trim(), cloneDesc.trim() || undefined);
      showToast('success', `Role cloned (${r.permissions_copied} permissions copied)`);
      setCloneOpen(false);
      setCloneSource(null);
      await refreshAfterMutation();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to clone role');
    } finally {
      setCloneSaving(false);
    }
  }, [canManage, cloneSource, cloneName, cloneDisplay, cloneDesc, refreshAfterMutation, showToast]);

  const openEdit = useCallback((role: RoleCatalog) => {
    setEditTarget(role);
    setEditDisplay(role.display_name);
    setEditDesc(role.description ?? '');
    setEditOpen(true);
  }, []);

  const handleEditRole = useCallback(async () => {
    if (!canManage || !editTarget) return;
    const token = sessionManager.getSessionToken();
    if (!token) return;
    setEditSaving(true);
    try {
      await rolesService.updateRole(token, editTarget.name, {
        display_name: editDisplay.trim() || undefined,
        description: editDesc.trim() || null,
      });
      showToast('success', 'Role updated');
      setEditOpen(false);
      setEditTarget(null);
      await refreshAfterMutation();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to update role');
    } finally {
      setEditSaving(false);
    }
  }, [canManage, editTarget, editDisplay, editDesc, refreshAfterMutation, showToast]);

  const handleTogglePauseRole = useCallback(async (role: RoleCatalog) => {
    if (!canManage) return;
    const token = sessionManager.getSessionToken();
    if (!token) return;
    try {
      if (role.is_paused) {
        await rolesService.unpauseRole(token, role.name);
        showToast('success', `${role.display_name} unpaused`);
      } else {
        await rolesService.pauseRole(token, role.name);
        showToast('success', `${role.display_name} paused`);
      }
      await refreshAfterMutation();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to toggle pause');
    }
  }, [canManage, refreshAfterMutation, showToast]);

  const openDelete = useCallback((role: RoleCatalog) => {
    setDeleteTarget(role);
    setDeleteOpen(true);
  }, []);

  const handleDeleteRole = useCallback(async () => {
    if (!canManage || !deleteTarget) return;
    const token = sessionManager.getSessionToken();
    if (!token) return;
    setDeleteSaving(true);
    try {
      await rolesService.deleteRole(token, deleteTarget.name);
      showToast('success', 'Role deleted');
      setDeleteOpen(false);
      setDeleteTarget(null);
      await refreshAfterMutation();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to delete role');
    } finally {
      setDeleteSaving(false);
    }
  }, [canManage, deleteTarget, refreshAfterMutation, showToast]);

  // ── User assignment handlers ──────────────────────────────────────────────

  const openAssign = useCallback((user: UserSearchResult) => {
    setAssignTarget(user);
    setAssignRole(user.current_role ?? '');
    setAssignOpen(true);
  }, []);

  const handleAssign = useCallback(async () => {
    if (!canManage || !assignTarget || !assignRole) return;
    const token = sessionManager.getSessionToken();
    if (!token) return;
    setAssignSaving(true);
    try {
      if (!assignTarget.current_role) {
        await rolesService.assignUserRole(token, assignTarget.user_id, assignRole);
        showToast('success', 'Role assigned');
      } else if (assignTarget.role_record_id && assignTarget.current_role !== assignRole) {
        await rolesService.changeUserRole(token, assignTarget.role_record_id, assignRole);
        showToast('success', 'Role changed');
      } else {
        showToast('success', 'No change');
      }
      setAssignOpen(false);
      setAssignTarget(null);
      await refreshAfterMutation();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to assign role');
    } finally {
      setAssignSaving(false);
    }
  }, [canManage, assignTarget, assignRole, refreshAfterMutation, showToast]);

  const openRemove = useCallback((user: UserSearchResult) => {
    setRemoveTarget(user);
    setRemoveOpen(true);
  }, []);

  const handleRemove = useCallback(async () => {
    if (!canManage || !removeTarget?.role_record_id) return;
    const token = sessionManager.getSessionToken();
    if (!token) return;
    setRemoveSaving(true);
    try {
      await rolesService.removeUserRoleSafe(token, removeTarget.role_record_id);
      showToast('success', 'Role removed');
      setRemoveOpen(false);
      setRemoveTarget(null);
      await refreshAfterMutation();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to remove role');
    } finally {
      setRemoveSaving(false);
    }
  }, [canManage, removeTarget, refreshAfterMutation, showToast]);

  // ── Override handlers ─────────────────────────────────────────────────────

  const openOverrideDialog = useCallback((user: UserWithRole) => {
    setSelectedUser(user);
    setOverrideDialogOpen(true);
    void loadUserOverrides(user.user_id);
  }, [loadUserOverrides]);

  const handleRemoveOverride = useCallback(async (overrideId: string) => {
    if (!canManage || !selectedUser) return;
    const token = sessionManager.getSessionToken();
    if (!token) return;
    try {
      await rolesService.removeUserOverride(token, overrideId);
      setUserOverrides(prev => prev.filter(o => o.id !== overrideId));
      await refreshAfterMutation();
      showToast('success', 'Override removed');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to remove override');
    }
  }, [canManage, selectedUser, refreshAfterMutation, showToast]);

  const handleClearAllOverrides = useCallback(async () => {
    if (!canManage || !selectedUser) return;
    const token = sessionManager.getSessionToken();
    if (!token) return;
    try {
      const count = await rolesService.clearUserOverrides(token, selectedUser.user_id);
      setUserOverrides([]);
      await refreshAfterMutation();
      showToast('success', `Cleared ${count} override${count !== 1 ? 's' : ''}`);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to clear overrides');
    }
  }, [canManage, selectedUser, refreshAfterMutation, showToast]);

  const handleAddOverride = useCallback(async () => {
    if (!canManage || !selectedUser || !addOverrideSelectedCode) return;
    const token = sessionManager.getSessionToken();
    if (!token) return;
    setAddOverrideSaving(true);
    try {
      if (addOverrideType === 'grant') {
        await rolesService.addUserGrantOverride(token, selectedUser.user_id, addOverrideSelectedCode, addOverrideReason || undefined);
      } else {
        await rolesService.addUserRevokeOverride(token, selectedUser.user_id, addOverrideSelectedCode, addOverrideReason || undefined);
      }
      setAddOverrideOpen(false);
      setAddOverrideSelectedCode('');
      setAddOverrideReason('');
      await loadUserOverrides(selectedUser.user_id);
      await refreshAfterMutation();
      showToast('success', `Override ${addOverrideType === 'grant' ? 'grant' : 'revoke'} added`);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to add override');
    } finally {
      setAddOverrideSaving(false);
    }
  }, [canManage, selectedUser, addOverrideType, addOverrideSelectedCode, addOverrideReason, loadUserOverrides, refreshAfterMutation, showToast]);

  // ── Computed ─────────────────────────────────────────────────────────────

  const sortedCategories = useMemo(
    () => Object.keys(groupByCategory(permissions)).sort(),
    [permissions]
  );

  const filteredPermissions = addOverrideSearch
    ? permissions.filter(p =>
        p.name.toLowerCase().includes(addOverrideSearch.toLowerCase()) ||
        p.code.toLowerCase().includes(addOverrideSearch.toLowerCase()) ||
        p.category.toLowerCase().includes(addOverrideSearch.toLowerCase())
      )
    : permissions;

  const overriddenCodes = new Set(userOverrides.map(o => o.permission_code));

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <PermissionGate
      permission="users.view"
      fallback={
        <div className="flex items-center justify-center py-16">
          <div className="text-center">
            <Lock className="w-16 h-16 text-muted-foreground/50 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-foreground mb-2">Access Denied</h2>
            <p className="text-muted-foreground">You don't have permission to view roles and privileges.</p>
          </div>
        </div>
      }
    >
      <div>
        <PageHeader
          title="Roles & Privileges"
          subtitle="Create roles, assign them to users, and apply per-user permission overrides"
        />

        {/* ── Metrics ─────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="bg-card border border-border rounded-lg p-4 flex items-center gap-4">
            <div className="p-3 bg-primary/10 rounded-lg">
              <Shield className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{metrics?.total_roles ?? '—'}</p>
              <p className="text-sm text-muted-foreground">Active Roles</p>
            </div>
          </div>
          <div className="bg-card border border-border rounded-lg p-4 flex items-center gap-4">
            <div className="p-3 bg-primary/10 rounded-lg">
              <Users className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{metrics?.users_with_overrides ?? '—'}</p>
              <p className="text-sm text-muted-foreground">Users with Overrides</p>
            </div>
          </div>
          <div className="bg-card border border-border rounded-lg p-4 flex items-center gap-4">
            <div className="p-3 bg-primary/10 rounded-lg">
              <Key className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{metrics?.total_overrides ?? '—'}</p>
              <p className="text-sm text-muted-foreground">Total Overrides</p>
            </div>
          </div>
        </div>

        {/* ── Roles section ───────────────────────────────────────────────── */}
        <section className="mb-10">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h2 className="text-lg font-semibold text-foreground">Roles</h2>
            {canManage && (
              <button
                onClick={() => { setCreateName(''); setCreateDisplay(''); setCreateDesc(''); setCreateOpen(true); }}
                className={cn(buttonVariants({ size: 'sm' }), 'gap-2')}
              >
                <Plus className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">New Role</span>
                <span className="sm:hidden">New</span>
              </button>
            )}
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="bg-card border border-border rounded-lg p-5 animate-pulse h-36" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {roles.map(role => (
                <div
                  key={role.name}
                  className={cn(
                    'bg-card border rounded-lg p-5 hover:border-primary/40 hover:shadow-sm transition-all group relative',
                    role.is_paused ? 'border-amber-300/60 bg-amber-50/30 dark:bg-amber-950/10' : 'border-border',
                  )}
                >
                  <div className="flex items-start justify-between mb-3 gap-2">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      <span className={cn(
                        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border',
                        roleBadgeClass(role)
                      )}>
                        {role.display_name}
                      </span>
                      {!role.is_system && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide bg-purple-100 text-purple-700 border border-purple-200">
                          Custom
                        </span>
                      )}
                      {role.is_paused && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide bg-amber-100 text-amber-800 border border-amber-200">
                          <Pause className="w-2.5 h-2.5" /> Paused
                        </span>
                      )}
                    </div>
                    {canManage && role.name !== 'super_admin' && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'h-7 w-7 p-0 shrink-0')}>
                            <MoreHorizontal className="w-4 h-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(role)}>
                            <Pencil className="w-4 h-4 mr-2" /> Rename
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openClone(role)}>
                            <Copy className="w-4 h-4 mr-2" /> Clone
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => void handleTogglePauseRole(role)}>
                            {role.is_paused ? (
                              <><Play className="w-4 h-4 mr-2" /> Unpause</>
                            ) : (
                              <><Pause className="w-4 h-4 mr-2" /> Pause</>
                            )}
                          </DropdownMenuItem>
                          {!role.is_system && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => openDelete(role)}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 className="w-4 h-4 mr-2" /> Delete
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                  <button
                    onClick={() => openRoleDrawer(role)}
                    className="text-left w-full"
                  >
                    <p className="text-sm text-muted-foreground mb-4 line-clamp-2 min-h-[2.5rem]">
                      {role.description ?? <span className="italic">No description</span>}
                    </p>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{role.permission_count} permission{role.permission_count !== 1 ? 's' : ''}</span>
                      <span className="flex items-center gap-1">
                        {role.user_count} user{role.user_count !== 1 ? 's' : ''}
                        <ChevronRight className="w-3.5 h-3.5 group-hover:text-primary transition-colors" />
                      </span>
                    </div>
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Users & Assignments ─────────────────────────────────────────── */}
        <section className="mb-10">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h2 className="text-lg font-semibold text-foreground">Users & Role Assignment</h2>
            <button
              onClick={() => void refreshAfterMutation()}
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-2')}
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>

          <div className="bg-card border border-border rounded-lg p-4 mb-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search users by name, email, mobile, or company…"
                className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              {searchLoading && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              )}
            </div>
          </div>

          {searchResults.length === 0 ? (
            <div className="bg-card border border-border rounded-lg p-8 text-center text-muted-foreground text-sm">
              {searchLoading ? 'Searching…' : (searchQuery ? 'No users found.' : 'Start typing to search users.')}
            </div>
          ) : (
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              {/* Mobile: card list */}
              <div className="sm:hidden divide-y divide-border">
                {searchResults.map(u => (
                  <div key={u.user_id} className="p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium text-foreground truncate">
                          {u.full_name || u.email}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                        {u.mobile_number && (
                          <div className="text-xs text-muted-foreground">{u.mobile_number}</div>
                        )}
                        {u.company_name && (
                          <div className="text-xs text-muted-foreground italic truncate">{u.company_name}</div>
                        )}
                      </div>
                      {u.current_role ? (
                        <span className={cn(
                          'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border shrink-0',
                          roleBadgeClass(roles.find(r => r.name === u.current_role) ?? null)
                        )}>
                          {roles.find(r => r.name === u.current_role)?.display_name ?? u.current_role}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground shrink-0">No role</span>
                      )}
                    </div>
                    {canManage && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => openAssign(u)}
                          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-1.5 flex-1')}
                        >
                          {u.current_role ? <Pencil className="w-3.5 h-3.5" /> : <UserPlus className="w-3.5 h-3.5" />}
                          {u.current_role ? 'Change' : 'Assign'}
                        </button>
                        {u.current_role && u.role_record_id && (
                          <button
                            onClick={() => openRemove(u)}
                            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/5')}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Desktop: table */}
              <table className="w-full text-sm hidden sm:table">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left font-medium text-muted-foreground px-4 py-3">User</th>
                    <th className="text-left font-medium text-muted-foreground px-4 py-3 hidden md:table-cell">Contact</th>
                    <th className="text-left font-medium text-muted-foreground px-4 py-3">Current Role</th>
                    <th className="w-32 px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {searchResults.map(u => (
                    <tr key={u.user_id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground">{u.full_name || u.email}</div>
                        {u.full_name && (
                          <div className="text-xs text-muted-foreground">{u.email}</div>
                        )}
                        {u.company_name && (
                          <div className="text-xs text-muted-foreground italic">{u.company_name}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-muted-foreground text-xs">
                        {u.mobile_number ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        {u.current_role ? (
                          <span className={cn(
                            'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border',
                            roleBadgeClass(roles.find(r => r.name === u.current_role) ?? null)
                          )}>
                            {roles.find(r => r.name === u.current_role)?.display_name ?? u.current_role}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs">No role</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {canManage && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'h-7 w-7 p-0')}>
                                <MoreHorizontal className="w-4 h-4" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openAssign(u)}>
                                {u.current_role ? (
                                  <><Pencil className="w-4 h-4 mr-2" /> Change Role</>
                                ) : (
                                  <><UserPlus className="w-4 h-4 mr-2" /> Assign Role</>
                                )}
                              </DropdownMenuItem>
                              {u.current_role && u.role_record_id && (
                                <DropdownMenuItem
                                  onClick={() => openRemove(u)}
                                  className="text-destructive focus:text-destructive"
                                >
                                  <Trash2 className="w-4 h-4 mr-2" /> Remove Role
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ── User permission overrides ───────────────────────────────────── */}
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-4">User Permission Overrides</h2>
          {isLoading ? (
            <div className="bg-card border border-border rounded-lg divide-y divide-border animate-pulse">
              {[...Array(4)].map((_, i) => <div key={i} className="h-14" />)}
            </div>
          ) : users.length === 0 ? (
            <div className="bg-card border border-border rounded-lg p-8 text-center text-muted-foreground">
              No users found.
            </div>
          ) : (
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left font-medium text-muted-foreground px-4 py-3">Email</th>
                    <th className="text-left font-medium text-muted-foreground px-4 py-3 hidden sm:table-cell">Role</th>
                    <th className="text-left font-medium text-muted-foreground px-4 py-3 hidden md:table-cell">Account</th>
                    <th className="text-center font-medium text-muted-foreground px-4 py-3">Overrides</th>
                    <th className="w-10 px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {users.map(user => (
                    <tr key={user.user_id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 text-foreground font-medium">{user.email}</td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        {user.role ? (
                          <span className={cn(
                            'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border',
                            roleBadgeClass(roles.find(r => r.name === user.role) ?? null)
                          )}>
                            {roles.find(r => r.name === user.role)?.display_name ?? user.role}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs">None</span>
                        )}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-muted-foreground text-xs">{user.account_type}</td>
                      <td className="px-4 py-3 text-center">
                        {user.override_count > 0 ? (
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold">
                            {user.override_count}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'h-7 w-7 p-0')}>
                              <MoreHorizontal className="w-4 h-4" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openOverrideDialog(user)}>
                              <Key className="w-4 h-4 mr-2" />
                              Manage Overrides
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ── Role permissions drawer ──────────────────────────────────────── */}
        <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
          <SheetContent side="right" className="sm:max-w-xl w-full flex flex-col p-0">
            <SheetHeader className="p-6 border-b border-border shrink-0">
              <SheetTitle className="flex items-center gap-3">
                {selectedRole && (
                  <span className={cn(
                    'inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium border',
                    roleBadgeClass(selectedRole)
                  )}>
                    {selectedRole.display_name}
                  </span>
                )}
              </SheetTitle>
              <SheetDescription>
                {selectedRole?.description ?? <span className="italic">No description</span>}
                {selectedRole?.name === 'super_admin' && (
                  <span className="block mt-1 text-amber-600 dark:text-amber-400 font-medium">
                    super_admin has all permissions via system.admin wildcard. Individual toggles cannot be changed.
                  </span>
                )}
                {selectedRole?.is_paused && selectedRole?.name !== 'super_admin' && (
                  <span className="block mt-1 text-amber-600 dark:text-amber-400 font-medium">
                    This role is paused — assigned users contribute zero permissions until unpaused.
                  </span>
                )}
                {!canManage && selectedRole?.name !== 'super_admin' && (
                  <span className="block mt-1 text-muted-foreground italic">
                    You have read-only access to this view.
                  </span>
                )}
              </SheetDescription>
            </SheetHeader>

            <div className="flex-1 overflow-y-auto p-6">
              {rolePermsLoading ? (
                <div className="space-y-4">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="animate-pulse">
                      <div className="h-4 bg-muted rounded w-1/3 mb-2" />
                      <div className="space-y-2">
                        {[...Array(3)].map((_, j) => <div key={j} className="h-8 bg-muted rounded" />)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-6">
                  {sortedCategories.map(category => {
                    const categoryPerms = rolePerms.filter(p => p.category === category);
                    if (categoryPerms.length === 0) return null;
                    const grantedCount = categoryPerms.filter(p => p.is_granted).length;
                    return (
                      <div key={category}>
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">
                            {formatCategory(category)}
                          </h3>
                          <span className="text-xs text-muted-foreground">
                            {grantedCount}/{categoryPerms.length}
                          </span>
                        </div>
                        <div className="space-y-1 border border-border rounded-lg overflow-hidden">
                          {categoryPerms.map((perm, idx) => {
                            const isSuperAdmin = selectedRole?.name === 'super_admin';
                            const isDisabled = isSuperAdmin || !canManage || togglingPerm === perm.code;
                            return (
                              <button
                                key={perm.code}
                                disabled={isDisabled}
                                onClick={() => !isDisabled && void handleTogglePermission(perm.code, perm.is_granted)}
                                className={cn(
                                  'w-full flex items-center justify-between px-3 py-2.5 text-left transition-colors text-sm',
                                  idx > 0 && 'border-t border-border',
                                  !isDisabled && 'hover:bg-muted/50 cursor-pointer',
                                  isDisabled && 'cursor-default opacity-60',
                                  perm.is_granted && 'bg-primary/5',
                                )}
                              >
                                <div>
                                  <span className="font-medium text-foreground">{perm.name}</span>
                                  {perm.description && (
                                    <span className="block text-xs text-muted-foreground mt-0.5">{perm.description}</span>
                                  )}
                                  <span className="block text-xs text-muted-foreground/60 font-mono mt-0.5">{perm.code}</span>
                                </div>
                                <div className="ml-3 shrink-0">
                                  {togglingPerm === perm.code ? (
                                    <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                                  ) : perm.is_granted || isSuperAdmin ? (
                                    <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                                      <Check className="w-3 h-3 text-primary-foreground" />
                                    </div>
                                  ) : (
                                    <div className="w-5 h-5 rounded-full border-2 border-border" />
                                  )}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </SheetContent>
        </Sheet>

        {/* ── Create Role dialog ───────────────────────────────────────────── */}
        <Dialog open={createOpen} onOpenChange={v => { if (!createSaving) setCreateOpen(v); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Create Custom Role</DialogTitle>
              <DialogDescription>
                A new custom role starts with no permissions. Custom roles do not get admin portal access by default — grant <code>portal.admin_access</code> if needed.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Machine Name</label>
                <input
                  type="text"
                  value={createName}
                  onChange={e => setCreateName(e.target.value)}
                  placeholder="e.g. content_reviewer"
                  className="w-full px-3 py-2 text-sm border border-border rounded-md bg-background font-mono focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                <p className="text-xs text-muted-foreground mt-1">Lowercase letters, digits, underscores only.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Display Name</label>
                <input
                  type="text"
                  value={createDisplay}
                  onChange={e => setCreateDisplay(e.target.value)}
                  placeholder="e.g. Content Reviewer"
                  className="w-full px-3 py-2 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Description <span className="text-muted-foreground font-normal">(optional)</span></label>
                <textarea
                  value={createDesc}
                  onChange={e => setCreateDesc(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>
            <DialogFooter>
              <button
                onClick={() => setCreateOpen(false)}
                disabled={createSaving}
                className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
              >Cancel</button>
              <button
                onClick={() => void handleCreateRole()}
                disabled={createSaving || !createName.trim() || !createDisplay.trim()}
                className={cn(buttonVariants({ size: 'sm' }))}
              >{createSaving ? 'Creating…' : 'Create Role'}</button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Clone Role dialog ────────────────────────────────────────────── */}
        <Dialog open={cloneOpen} onOpenChange={v => { if (!cloneSaving) setCloneOpen(v); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Clone Role</DialogTitle>
              <DialogDescription>
                Creates a new custom role with the same permissions as <strong>{cloneSource?.display_name}</strong>. You can edit the new role's permissions independently.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Machine Name</label>
                <input
                  type="text"
                  value={cloneName}
                  onChange={e => setCloneName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-border rounded-md bg-background font-mono focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Display Name</label>
                <input
                  type="text"
                  value={cloneDisplay}
                  onChange={e => setCloneDisplay(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Description <span className="text-muted-foreground font-normal">(optional)</span></label>
                <textarea
                  value={cloneDesc}
                  onChange={e => setCloneDesc(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>
            <DialogFooter>
              <button
                onClick={() => setCloneOpen(false)}
                disabled={cloneSaving}
                className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
              >Cancel</button>
              <button
                onClick={() => void handleCloneRole()}
                disabled={cloneSaving || !cloneName.trim() || !cloneDisplay.trim()}
                className={cn(buttonVariants({ size: 'sm' }))}
              >{cloneSaving ? 'Cloning…' : 'Clone'}</button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Edit Role dialog ─────────────────────────────────────────────── */}
        <Dialog open={editOpen} onOpenChange={v => { if (!editSaving) setEditOpen(v); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Role</DialogTitle>
              <DialogDescription>
                Update the display name and description for <strong>{editTarget?.name}</strong>. The machine name cannot be changed.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Display Name</label>
                <input
                  type="text"
                  value={editDisplay}
                  onChange={e => setEditDisplay(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Description</label>
                <textarea
                  value={editDesc}
                  onChange={e => setEditDesc(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>
            <DialogFooter>
              <button
                onClick={() => setEditOpen(false)}
                disabled={editSaving}
                className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
              >Cancel</button>
              <button
                onClick={() => void handleEditRole()}
                disabled={editSaving || !editDisplay.trim()}
                className={cn(buttonVariants({ size: 'sm' }))}
              >{editSaving ? 'Saving…' : 'Save'}</button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Delete Role confirm ──────────────────────────────────────────── */}
        <Dialog open={deleteOpen} onOpenChange={v => { if (!deleteSaving) setDeleteOpen(v); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-destructive" />
                Delete Role
              </DialogTitle>
              <DialogDescription>
                Permanently delete <strong>{deleteTarget?.display_name}</strong>? This cannot be undone.
                {deleteTarget && deleteTarget.user_count > 0 && (
                  <span className="block mt-2 text-destructive font-medium">
                    {deleteTarget.user_count} user{deleteTarget.user_count !== 1 ? 's are' : ' is'} still assigned to this role. Reassign them first.
                  </span>
                )}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <button
                onClick={() => setDeleteOpen(false)}
                disabled={deleteSaving}
                className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
              >Cancel</button>
              <button
                onClick={() => void handleDeleteRole()}
                disabled={deleteSaving || (deleteTarget?.user_count ?? 0) > 0}
                className={cn(buttonVariants({ variant: 'destructive', size: 'sm' }))}
              >{deleteSaving ? 'Deleting…' : 'Delete'}</button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Assign / Change Role dialog ──────────────────────────────────── */}
        <Dialog open={assignOpen} onOpenChange={v => { if (!assignSaving) setAssignOpen(v); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{assignTarget?.current_role ? 'Change Role' : 'Assign Role'}</DialogTitle>
              <DialogDescription>
                {assignTarget?.full_name || assignTarget?.email}
                {assignTarget?.current_role && (
                  <span className="block mt-1 text-muted-foreground text-xs">
                    Current: {roles.find(r => r.name === assignTarget.current_role)?.display_name ?? assignTarget.current_role}
                  </span>
                )}
              </DialogDescription>
            </DialogHeader>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Role</label>
              <select
                value={assignRole}
                onChange={e => setAssignRole(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="">Select a role…</option>
                {roles.map(r => (
                  <option key={r.name} value={r.name}>
                    {r.display_name}{r.is_paused ? ' (paused)' : ''}{!r.is_system ? ' • custom' : ''}
                  </option>
                ))}
              </select>
            </div>
            <DialogFooter>
              <button
                onClick={() => setAssignOpen(false)}
                disabled={assignSaving}
                className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
              >Cancel</button>
              <button
                onClick={() => void handleAssign()}
                disabled={assignSaving || !assignRole || assignRole === assignTarget?.current_role}
                className={cn(buttonVariants({ size: 'sm' }))}
              >{assignSaving ? 'Saving…' : 'Save'}</button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Remove Role confirm ──────────────────────────────────────────── */}
        <Dialog open={removeOpen} onOpenChange={v => { if (!removeSaving) setRemoveOpen(v); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-destructive" />
                Remove Role
              </DialogTitle>
              <DialogDescription>
                Remove role from <strong>{removeTarget?.full_name || removeTarget?.email}</strong>? They will lose all role-based permissions until reassigned.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <button
                onClick={() => setRemoveOpen(false)}
                disabled={removeSaving}
                className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
              >Cancel</button>
              <button
                onClick={() => void handleRemove()}
                disabled={removeSaving}
                className={cn(buttonVariants({ variant: 'destructive', size: 'sm' }))}
              >{removeSaving ? 'Removing…' : 'Remove'}</button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── User overrides dialog ────────────────────────────────────────── */}
        <Dialog open={overrideDialogOpen} onOpenChange={setOverrideDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
            <DialogHeader className="shrink-0">
              <DialogTitle>Permission Overrides — {selectedUser?.email}</DialogTitle>
              <DialogDescription>
                {selectedUser?.role
                  ? `Current role: ${selectedUser.role}. Overrides take precedence over role permissions.`
                  : 'No role assigned. Overrides apply to base (deny-all) permissions.'}
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto min-h-0">
              {canManage && (
                <div className="flex gap-2 mb-4 flex-wrap">
                  <button
                    onClick={() => { setAddOverrideType('grant'); setAddOverrideOpen(true); }}
                    className={cn(buttonVariants({ variant: 'default', size: 'sm' }), 'gap-2')}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Grant
                  </button>
                  <button
                    onClick={() => { setAddOverrideType('revoke'); setAddOverrideOpen(true); }}
                    className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-2 text-destructive border-destructive/30 hover:bg-destructive/5')}
                  >
                    <X className="w-3.5 h-3.5" />
                    Add Revoke
                  </button>
                  {userOverrides.length > 0 && (
                    <button
                      onClick={() => void handleClearAllOverrides()}
                      className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'gap-2 text-muted-foreground sm:ml-auto')}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Clear All
                    </button>
                  )}
                </div>
              )}

              {overridesLoading ? (
                <div className="space-y-2">
                  {[...Array(4)].map((_, i) => <div key={i} className="h-12 bg-muted animate-pulse rounded" />)}
                </div>
              ) : userOverrides.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  <Key className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No permission overrides for this user.</p>
                  {canManage && (
                    <p className="text-xs mt-1">Use the buttons above to add grant or revoke overrides.</p>
                  )}
                </div>
              ) : (
                <div className="border border-border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/30 border-b border-border">
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">Permission</th>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">Type</th>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground hidden sm:table-cell">Reason</th>
                        {canManage && <th className="w-10 px-3 py-2" />}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {userOverrides.map(override => (
                        <tr key={override.id} className="hover:bg-muted/20">
                          <td className="px-3 py-2.5">
                            <div className="font-medium text-foreground">{override.permission_name}</div>
                            <div className="text-xs text-muted-foreground font-mono">{override.permission_code}</div>
                          </td>
                          <td className="px-3 py-2.5">
                            <span className={cn(
                              'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border',
                              OVERRIDE_COLORS[override.override_type]
                            )}>
                              {override.override_type === 'grant' ? (
                                <Check className="w-3 h-3 mr-1" />
                              ) : (
                                <X className="w-3 h-3 mr-1" />
                              )}
                              {override.override_type}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 hidden sm:table-cell text-muted-foreground text-xs">
                            {override.reason ?? '—'}
                          </td>
                          {canManage && (
                            <td className="px-3 py-2.5">
                              <button
                                onClick={() => void handleRemoveOverride(override.id)}
                                className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'h-7 w-7 p-0 text-muted-foreground hover:text-destructive')}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* ── Add override sub-dialog ──────────────────────────────────────── */}
        <Dialog open={addOverrideOpen} onOpenChange={v => { if (!addOverrideSaving) setAddOverrideOpen(v); }}>
          <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
            <DialogHeader className="shrink-0">
              <DialogTitle>
                Add {addOverrideType === 'grant' ? 'Grant' : 'Revoke'} Override
              </DialogTitle>
              <DialogDescription>
                {addOverrideType === 'grant'
                  ? 'Explicitly grant a permission to this user, overriding their role.'
                  : 'Explicitly revoke a permission from this user, overriding their role.'}
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto min-h-0 flex flex-col gap-4">
              <input
                type="text"
                placeholder="Search permissions…"
                value={addOverrideSearch}
                onChange={e => setAddOverrideSearch(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
              />

              <div className="border border-border rounded-lg overflow-y-auto max-h-64">
                {filteredPermissions.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground text-sm">No permissions found.</div>
                ) : (
                  Object.entries(groupByCategory(filteredPermissions))
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([cat, perms]) => (
                      <div key={cat}>
                        <div className="px-3 py-1.5 bg-muted/40 text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b border-border">
                          {formatCategory(cat)}
                        </div>
                        {perms.map(perm => {
                          const alreadyOverridden = overriddenCodes.has(perm.code);
                          return (
                            <button
                              key={perm.code}
                              disabled={alreadyOverridden}
                              onClick={() => setAddOverrideSelectedCode(perm.code)}
                              className={cn(
                                'w-full flex items-center justify-between px-3 py-2 text-left text-sm border-b border-border last:border-0 transition-colors',
                                addOverrideSelectedCode === perm.code
                                  ? 'bg-primary/10'
                                  : 'hover:bg-muted/30',
                                alreadyOverridden && 'opacity-40 cursor-not-allowed',
                              )}
                            >
                              <div>
                                <span className="font-medium text-foreground">{perm.name}</span>
                                {alreadyOverridden && (
                                  <span className="ml-2 text-xs text-muted-foreground">(already overridden)</span>
                                )}
                                <span className="block text-xs text-muted-foreground/60 font-mono">{perm.code}</span>
                              </div>
                              {addOverrideSelectedCode === perm.code && (
                                <Check className="w-4 h-4 text-primary shrink-0" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    ))
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Reason <span className="text-muted-foreground font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={addOverrideReason}
                  onChange={e => setAddOverrideReason(e.target.value)}
                  placeholder="Why is this override needed?"
                  className="w-full px-3 py-2 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button
                  onClick={() => setAddOverrideOpen(false)}
                  disabled={addOverrideSaving}
                  className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
                >
                  Cancel
                </button>
                <button
                  onClick={() => void handleAddOverride()}
                  disabled={!addOverrideSelectedCode || addOverrideSaving}
                  className={cn(
                    buttonVariants({ size: 'sm' }),
                    addOverrideType === 'revoke' && 'bg-destructive hover:bg-destructive/90',
                  )}
                >
                  {addOverrideSaving ? 'Saving…' : `Add ${addOverrideType === 'grant' ? 'Grant' : 'Revoke'}`}
                </button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* ── Toast ──────────────────────────────────────────────────────────── */}
        <Toast
          type={toast.type}
          message={toast.message}
          isVisible={toast.isVisible}
          onClose={() => setToast(t => ({ ...t, isVisible: false }))}
        />
      </div>
    </PermissionGate>
  );
};

export default AdminRolesPrivileges;
