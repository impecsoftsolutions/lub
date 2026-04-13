import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Search, Filter, Mail, Phone, Shield, Lock, ChevronUp, ChevronDown, MoreHorizontal, Edit3, Ban, Trash2, ShieldCheck } from 'lucide-react';
import { PermissionGate } from '../../components/permissions/PermissionGate';
import { supabase } from '../../lib/supabase';
import Toast from '../../components/Toast';
import { PageHeader } from '../../components/ui/PageHeader';
import { useHasPermission } from '../../hooks/usePermissions';
import EditUserModal from '../../components/admin/modals/EditUserModal';
import DeleteUserModal from '../../components/admin/modals/DeleteUserModal';
import BlockUserModal from '../../components/admin/modals/BlockUserModal';
import AssignRoleModal from '../../components/admin/modals/AssignRoleModal';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';

interface UserRole {
  id: string;
  role: string;
  state: string | null;
  district: string | null;
  is_member_linked?: boolean;
}

interface User {
  id: string;
  email: string;
  mobile_number: string | null;
  account_type: 'admin' | 'member' | 'both' | 'general_user';
  created_at: string;
  is_frozen: boolean;
  roles: UserRole[];
}

type SortField = 'email' | 'account_type' | null;
type SortDirection = 'asc' | 'desc';
type SelectedUser = User | null;

const AdminUsers: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [accountTypeFilter, setAccountTypeFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<SortField>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [toast, setToast] = useState<{
    type: 'success' | 'error';
    message: string;
    isVisible: boolean;
  }>({
    type: 'success',
    message: '',
    isVisible: false
  });
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [blockModalOpen, setBlockModalOpen] = useState(false);
  const [assignRoleModalOpen, setAssignRoleModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<SelectedUser>(null);
  const [blockAction, setBlockAction] = useState<'block' | 'unblock'>('block');

  const navigate = useNavigate();

  const canEdit = useHasPermission('users.edit');
  const canDelete = useHasPermission('users.delete');
  const canBlock = useHasPermission('users.edit');
  const canAssignRoles = useHasPermission('users.roles.assign');

  const loadUsers = useCallback(async () => {
    try {
      setIsLoading(true);

      const { data: usersData, error: usersError } = await supabase
        .from('users')
        .select('id, email, mobile_number, account_type, created_at, is_frozen')
        .order('created_at', { ascending: false });

      if (usersError) {
        throw usersError;
      }

      console.log('[AdminUsers] Loaded users:', usersData?.length || 0);

      const { data: rolesData, error: rolesError } = await supabase
        .from('user_roles')
        .select('id, user_id, role, state, district');

      if (rolesError) {
        console.error('[AdminUsers] Error loading user roles:', rolesError);
      } else {
        console.log('[AdminUsers] Loaded roles:', rolesData?.length || 0);
        console.log('[AdminUsers] Roles data:', rolesData);
      }

      const usersWithRoles = (usersData || []).map(user => {
        const userRoles = (rolesData || []).filter(role => role.user_id === user.id);

        if (user.account_type === 'admin' || user.account_type === 'both') {
          console.log(`[AdminUsers] User ${user.email} (${user.account_type}):`, {
            userId: user.id,
            foundRoles: userRoles.length,
            roles: userRoles.map(r => r.role)
          });
        }

        return {
          ...user,
          roles: userRoles.map(r => ({
            id: r.id,
            role: r.role,
            state: r.state,
            district: r.district,
            is_member_linked: false
          }))
        };
      });

      console.log('[AdminUsers] Users with roles prepared:', usersWithRoles.length);
      setUsers(usersWithRoles);
    } catch (error) {
      console.error('[AdminUsers] Error loading users:', error);
      setToast({ type: 'error', message: 'Failed to load users', isVisible: true });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleEditClick = (user: User) => {
    setSelectedUser(user);
    setEditModalOpen(true);
  };

  const handleDeleteClick = (user: User) => {
    setSelectedUser(user);
    setDeleteModalOpen(true);
  };

  const handleBlockClick = (user: User, action: 'block' | 'unblock') => {
    setSelectedUser(user);
    setBlockAction(action);
    setBlockModalOpen(true);
  };

  const handleAssignRoleClick = (user: User) => {
    setSelectedUser(user);
    setAssignRoleModalOpen(true);
  };

  const handleModalSuccess = () => {
    loadUsers();
  };

  const handleAssignRoleSuccess = async (message: string) => {
    await loadUsers();
    showToast('success', message);
  };

  const filterUsers = useCallback(() => {
    let filtered = users;

    if (accountTypeFilter !== 'all') {
      filtered = filtered.filter(user => user.account_type === accountTypeFilter);
    }

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        user =>
          user.email.toLowerCase().includes(term) ||
          (user.mobile_number && user.mobile_number.includes(term))
      );
    }

    if (sortField) {
      filtered = [...filtered].sort((a, b) => {
        let compareResult = 0;

        if (sortField === 'email') {
          compareResult = a.email.localeCompare(b.email);
        } else if (sortField === 'account_type') {
          compareResult = a.account_type.localeCompare(b.account_type);
        }

        return sortDirection === 'asc' ? compareResult : -compareResult;
      });
    }

    setFilteredUsers(filtered);
  }, [users, searchTerm, accountTypeFilter, sortField, sortDirection]);

  useEffect(() => {
    filterUsers();
  }, [filterUsers]);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message, isVisible: true });
  };

  const hideToast = () => {
    setToast(prev => ({ ...prev, isVisible: false }));
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const formatRoleName = (role: string): string => {
    const roleNames: Record<string, string> = {
      'super_admin': 'Super Admin',
      'admin': 'Admin',
      'editor': 'Editor',
      'viewer': 'Viewer',
      'state_president': 'State President',
      'state_general_secretary': 'State General Secretary',
      'district_president': 'District President',
      'district_general_secretary': 'District General Secretary',
      'it_division_head': 'IT Division Head',
      'accounts_head': 'Accounts Head'
    };
    return roleNames[role] || role;
  };

  const getAccountTypeDisplay = (user: User): string => {
    console.log(`[getAccountTypeDisplay] Processing user ${user.email}:`, {
      account_type: user.account_type,
      roles_length: user.roles?.length || 0,
      roles: user.roles?.map(r => r.role) || []
    });

    if (user.account_type === 'general_user') {
      return 'General User';
    }

    if (user.account_type === 'member') {
      return 'Member';
    }

    if (user.account_type === 'admin' && user.roles && user.roles.length > 0) {
      const formattedRoles = user.roles.map(r => formatRoleName(r.role)).join(', ');
      console.log(`[getAccountTypeDisplay] Admin user ${user.email} formatted roles:`, formattedRoles);
      return formattedRoles;
    }

    if (user.account_type === 'both' && user.roles && user.roles.length > 0) {
      const roleNames = user.roles.map(r => formatRoleName(r.role)).join(', ');
      const display = `Member + ${roleNames}`;
      console.log(`[getAccountTypeDisplay] Both user ${user.email} display:`, display);
      return display;
    }

    console.log(`[getAccountTypeDisplay] Fallback for user ${user.email}`);
    return user.account_type === 'admin' ? 'Admin' : user.account_type === 'both' ? 'Member + Admin' : 'Unknown';
  };

  const getAccountTypeBadge = (user: User) => {
    const baseClasses = "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium";
    const displayText = getAccountTypeDisplay(user);

    if (user.account_type === 'general_user') {
      return (
        <span className={`${baseClasses} bg-muted text-muted-foreground`}>
          <Users className="w-3 h-3 mr-1" />
          {displayText}
        </span>
      );
    }

    if (user.account_type === 'admin' || user.account_type === 'both') {
      return (
        <span className={`${baseClasses} bg-primary/10 text-primary`}>
          <Shield className="w-3 h-3 mr-1" />
          {displayText}
        </span>
      );
    }

    if (user.account_type === 'member') {
      return (
        <span className={`${baseClasses} bg-secondary text-secondary-foreground`}>
          <Users className="w-3 h-3 mr-1" />
          {displayText}
        </span>
      );
    }

    return null;
  };

  return (
    <PermissionGate
      permission="users.view"
      fallback={
        <div className="flex items-center justify-center p-8">
          <div className="text-center">
            <div className="w-20 h-20 bg-destructive/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <Lock className="w-10 h-10 text-destructive" />
            </div>
            <h2 className="text-xl font-semibold text-foreground mb-2">Access Denied</h2>
            <p className="text-muted-foreground mb-6">
              You don't have permission to view users.
            </p>
            <button
              onClick={() => navigate('/admin/dashboard')}
              className="inline-flex items-center px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      }
    >
      <div className="p-6">
        <Toast
          type={toast.type}
          message={toast.message}
          isVisible={toast.isVisible}
          onClose={hideToast}
        />

        <div>
          <PageHeader
            title="Users"
            subtitle="View all registered users in the system"
            actions={
              <span className="text-sm text-muted-foreground">{users.length} total</span>
            }
          />

          <div className="bg-card rounded-lg shadow-sm border border-border p-6 mb-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search by email or mobile number..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-border bg-background rounded-md focus:ring-1 focus:ring-primary/30 focus:border-primary"
                  />
                </div>
              </div>

              <div className="sm:w-48">
                <div className="relative">
                  <Filter className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
                  <select
                    value={accountTypeFilter}
                    onChange={(e) => setAccountTypeFilter(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-border rounded-md focus:ring-1 focus:ring-primary/30 focus:border-primary appearance-none bg-card"
                  >
                    <option value="all">All Types</option>
                    <option value="general_user">General User</option>
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                    <option value="both">Both</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="mt-4 text-sm text-muted-foreground">
              Showing {filteredUsers.length} of {users.length} users
            </div>
          </div>

          {isLoading ? (
            <div className="bg-card rounded-lg shadow-sm border border-border p-12 text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-muted-foreground">Loading users...</p>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="bg-card rounded-lg shadow-sm border border-border p-12 text-center">
              <Users className="w-16 h-16 text-muted-foreground/50 mx-auto mb-4" />
              <h3 className="text-sm font-medium text-foreground mb-2">No users found</h3>
              <p className="text-muted-foreground">
                {searchTerm || accountTypeFilter !== 'all'
                  ? 'Try adjusting your search or filter criteria'
                  : 'No users have been registered yet'}
              </p>
            </div>
          ) : (
            <div className="bg-card rounded-lg shadow-sm border border-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full divide-y divide-border">
                  <thead className="bg-muted/50">
                    <tr>
                      <th
                        className="px-4 py-3 text-left text-label font-medium text-muted-foreground uppercase tracking-wider cursor-pointer hover:bg-muted transition-colors w-[35%]"
                        onClick={() => handleSort('email')}
                      >
                        <div className="flex items-center justify-between">
                          <span>Email</span>
                          {sortField === 'email' && (
                            sortDirection === 'asc' ?
                              <ChevronUp className="w-4 h-4" /> :
                              <ChevronDown className="w-4 h-4" />
                          )}
                        </div>
                      </th>
                      <th className="px-4 py-3 text-left text-label font-medium text-muted-foreground uppercase tracking-wider w-[16%]">
                        Mobile Number
                      </th>
                      <th
                        className="px-4 py-3 text-left text-label font-medium text-muted-foreground uppercase tracking-wider cursor-pointer hover:bg-muted transition-colors w-[20%]"
                        onClick={() => handleSort('account_type')}
                      >
                        <div className="flex items-center justify-between">
                          <span>Account Type</span>
                          {sortField === 'account_type' && (
                            sortDirection === 'asc' ?
                              <ChevronUp className="w-4 h-4" /> :
                              <ChevronDown className="w-4 h-4" />
                          )}
                        </div>
                      </th>
                      <th className="px-4 py-3 text-left text-label font-medium text-muted-foreground uppercase tracking-wider w-[20%]">
                        Role
                      </th>
                      <th className="px-4 py-3 text-left text-label font-medium text-muted-foreground uppercase tracking-wider w-[9%]">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-card divide-y divide-border">
                    {filteredUsers.map((user) => (
                      <tr key={user.id} className={`hover:bg-muted/50 transition-colors ${user.is_frozen ? 'opacity-50 bg-muted/50' : ''}`}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Mail className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                            <span className="text-sm text-foreground">{user.email}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <Phone className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                            <span className="text-sm text-foreground">{user.mobile_number || '-'}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex gap-2 items-center">
                            {getAccountTypeBadge(user)}
                            {user.is_frozen && (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-destructive/10 text-destructive">
                                Frozen
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap items-center gap-1">
                            {user.roles.length > 0 ? (
                              user.roles.map((role) => (
                                <span
                                  key={role.id}
                                  className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"
                                >
                                  {formatRoleName(role.role)}
                                </span>
                              ))
                            ) : (
                              <span className="text-sm text-muted-foreground">No role</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <DropdownMenu>
                            <DropdownMenuTrigger className={cn(buttonVariants({ variant: 'ghost', size: 'icon-sm' }), 'h-7 w-7')}>
                              <span className="sr-only">Open actions menu</span>
                              <MoreHorizontal className="w-4 h-4" aria-hidden="true" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {canEdit && (
                                <DropdownMenuItem onClick={() => handleEditClick(user)}>
                                  <Edit3 className="w-4 h-4" />Edit
                                </DropdownMenuItem>
                              )}
                              {canBlock && (
                                <DropdownMenuItem onClick={() => handleBlockClick(user, user.is_frozen ? 'unblock' : 'block')}>
                                  <Ban className="w-4 h-4" />{user.is_frozen ? 'Unblock' : 'Block'}
                                </DropdownMenuItem>
                              )}
                              {canDelete && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    variant="destructive"
                                    disabled={user.account_type !== 'general_user'}
                                    onClick={() => handleDeleteClick(user)}
                                  >
                                    <Trash2 className="w-4 h-4" />Delete
                                  </DropdownMenuItem>
                                </>
                              )}
                              {canAssignRoles && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onClick={() => handleAssignRoleClick(user)}>
                                    <ShieldCheck className="w-4 h-4" />{user.roles.length > 0 ? 'Change Role' : 'Assign Role'}
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {selectedUser && (
        <>
          <EditUserModal
            isOpen={editModalOpen}
            onClose={() => setEditModalOpen(false)}
            user={selectedUser}
            onSuccess={handleModalSuccess}
          />
          <DeleteUserModal
            isOpen={deleteModalOpen}
            onClose={() => setDeleteModalOpen(false)}
            user={selectedUser}
            onSuccess={handleModalSuccess}
          />
          <BlockUserModal
            isOpen={blockModalOpen}
            onClose={() => setBlockModalOpen(false)}
            user={selectedUser}
            action={blockAction}
            onSuccess={handleModalSuccess}
          />
          <AssignRoleModal
            isOpen={assignRoleModalOpen}
            onClose={() => setAssignRoleModalOpen(false)}
            user={selectedUser}
            currentRole={selectedUser?.roles?.[0] || null}
            onSuccess={handleAssignRoleSuccess}
          />
        </>
      )}
    </PermissionGate>
  );
};

export default AdminUsers;


