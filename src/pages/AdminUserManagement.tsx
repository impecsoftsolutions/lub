import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Plus, Search, CreditCard as Edit3, Trash2, ArrowLeft, User, Building2, Mail, Phone, CheckCircle, Lock } from 'lucide-react';
import { userRolesService, UserRole, AdminUser } from '../lib/supabase';
import Toast from '../components/Toast';
import { PageHeader } from '../components/ui/PageHeader';
import { PermissionGate } from '../components/permissions/PermissionGate';
import { useHasPermission } from '../hooks/usePermissions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@/components/ui/dialog';

const AdminUserManagement: React.FC = () => {
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);
  const [toast, setToast] = useState<{
    type: 'success' | 'error';
    message: string;
    isVisible: boolean;
  }>({
    type: 'success',
    message: '',
    isVisible: false
  });

  // Add user form state
  const [addUserForm, setAddUserForm] = useState({
    email: '',
    role: '' as UserRole['role'] | '',
    isMemberLinked: false,
    memberInfo: null as { full_name: string; company_name: string; mobile_number: string } | null
  });

  // Edit role form state
  const [editRoleForm, setEditRoleForm] = useState({
    role: '' as UserRole['role'] | '',
    isMemberLinked: false
  });

  const navigate = useNavigate();

  // Permission checks
  const canCreateUsers = useHasPermission('users.create');
  const canAssignRoles = useHasPermission('users.roles.assign');
  const roleLabels: Record<UserRole['role'], string> = {
    super_admin: 'Super Admin',
    admin: 'Admin',
    editor: 'Editor',
    viewer: 'Viewer'
  };

  const roleBadgeVariant: Record<UserRole['role'], 'default' | 'info' | 'success' | 'secondary'> = {
    super_admin: 'default',
    admin: 'info',
    editor: 'success',
    viewer: 'secondary'
  };

  const roleDescriptions: Record<UserRole['role'], string> = {
    super_admin: 'Full control over the entire portal (bypass all restrictions)',
    admin: 'Manage members, payments, states, districts, cities, and roles (cannot manage admin users)',
    editor: 'Edit member details, documents, company roles, LUB role assignments, and organization profile',
    viewer: 'Read-only access to view members, roles, payments, and analytics'
  };

  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    setToast({ type, message, isVisible: true });
  }, []);

  const hideToast = useCallback(() => {
    setToast(prev => ({ ...prev, isVisible: false }));
  }, []);

  const loadAdminUsers = useCallback(async () => {
    try {
      setIsLoading(true);
      const users = await userRolesService.getAllAdminUsers();
      setAdminUsers(users);
    } catch (error) {
      console.error('Error loading admin users:', error);
      showToast('error', 'Failed to load admin users');
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void loadAdminUsers();
  }, [loadAdminUsers]);

  const handleEmailChange = async (email: string) => {
    setAddUserForm(prev => ({ ...prev, email, memberInfo: null }));
    
    if (email.includes('@')) {
      // Search for existing member
      const memberInfo = await userRolesService.searchMemberByEmail(email);
      if (memberInfo) {
        setAddUserForm(prev => ({ 
          ...prev, 
          memberInfo,
          isMemberLinked: true 
        }));
      }
    }
  };

  const handleAddUser = async () => {
    if (!addUserForm.email || !addUserForm.role) {
      showToast('error', 'Please fill in all required fields');
      return;
    }

    try {
      const result = await userRolesService.addUserRole(
        addUserForm.email,
        addUserForm.role,
        addUserForm.isMemberLinked
      );

      if (result.success) {
        showToast('success', 'User role added successfully');
        setShowAddModal(false);
        setAddUserForm({
          email: '',
          role: '' as UserRole['role'] | '',
          isMemberLinked: false,
          memberInfo: null
        });
        await loadAdminUsers();
      } else {
        showToast('error', result.error || 'Failed to add user role');
      }
    } catch (error) {
      console.error('Error adding user:', error);
      showToast('error', 'An unexpected error occurred');
    }
  };

  const handleEditRole = (user: AdminUser, role: UserRole) => {
    void user;
    setSelectedRole(role);
    setEditRoleForm({
      role: role.role,
      isMemberLinked: role.is_member_linked
    });
    setShowEditModal(true);
  };

  const handleUpdateRole = async () => {
    if (!selectedRole) return;

    try {
      const result = await userRolesService.updateUserRole(selectedRole.id!, {
        role: editRoleForm.role,
        is_member_linked: editRoleForm.isMemberLinked
      });

      if (result.success) {
        showToast('success', 'Role updated successfully');
        setShowEditModal(false);
        setSelectedUser(null);
        setSelectedRole(null);
        await loadAdminUsers();
      } else {
        showToast('error', result.error || 'Failed to update role');
      }
    } catch (error) {
      console.error('Error updating role:', error);
      showToast('error', 'An unexpected error occurred');
    }
  };

  const handleRemoveRole = async (roleId: string) => {
    if (!confirm('Are you sure you want to remove this role?')) return;

    try {
      const result = await userRolesService.removeUserRole(roleId);

      if (result.success) {
        showToast('success', 'Role removed successfully');
        await loadAdminUsers();
      } else {
        showToast('error', result.error || 'Failed to remove role');
      }
    } catch (error) {
      console.error('Error removing role:', error);
      showToast('error', 'An unexpected error occurred');
    }
  };

  const filteredUsers = adminUsers.filter(user =>
    user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.member_info?.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.roles.some(role => roleLabels[role.role].toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <PermissionGate
      permission="users.view"
      fallback={
        <div className="min-h-screen bg-muted flex items-center justify-center">
          <div className="text-center">
            <div className="w-20 h-20 bg-destructive/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <Lock className="w-10 h-10 text-destructive" />
            </div>
            <h2 className="text-xl font-semibold text-foreground mb-2">Access Denied</h2>
            <p className="text-muted-foreground mb-6">
              You don't have permission to view admin user management.
            </p>
            <Button onClick={() => navigate('/admin')}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </Button>
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
          title="Admin User Management"
          subtitle="Manage admin users and their role permissions"
          actions={
            <PermissionGate permission="users.create">
              <Button size="sm" onClick={() => setShowAddModal(true)}>
                <Plus className="w-4 h-4" />
                Add Admin User
              </Button>
            </PermissionGate>
          }
        />
        {/* Search */}
        <div className="bg-card rounded-lg border p-6 mb-6">
          <div className="relative">
            <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search by email, name, or role..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Admin Users List */}
        {isLoading ? (
          <div className="bg-card rounded-lg border p-12 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading admin users...</p>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="bg-card rounded-lg border p-12 text-center">
            <Users className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="text-sm font-medium text-foreground mb-2">No admin users found</h3>
            <p className="text-muted-foreground">
              {searchTerm ? 'Try adjusting your search criteria' : 'No admin users have been added yet'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredUsers.map((user) => (
              <div key={user.id} className="bg-card rounded-lg border p-6">
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between">
                  {/* User Info */}
                  <div className="flex-1 mb-4 lg:mb-0">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <div className="flex items-center mb-2">
                          <Mail className="w-4 h-4 text-muted-foreground mr-2" />
                          <span className="font-medium text-foreground">{user.email}</span>
                        </div>

                        {user.member_info && (
                          <div className="space-y-1 text-sm text-muted-foreground">
                            <div className="flex items-center">
                              <User className="w-4 h-4 text-muted-foreground mr-2" />
                              <span>{user.member_info.full_name}</span>
                            </div>
                            <div className="flex items-center">
                              <Building2 className="w-4 h-4 text-muted-foreground mr-2" />
                              <span>{user.member_info.company_name}</span>
                            </div>
                            <div className="flex items-center">
                              <Phone className="w-4 h-4 text-muted-foreground mr-2" />
                              <span>{user.member_info.mobile_number}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Roles */}
                    <div>
                      <h4 className="text-sm font-medium text-foreground mb-2">Assigned Roles:</h4>
                      <div className="space-y-2">
                        {user.roles.map((role) => (
                          <div key={role.id} className="flex items-center justify-between bg-muted rounded-lg p-3">
                            <div className="flex items-center space-x-3">
                              <Badge variant={roleBadgeVariant[role.role]}>
                                {roleLabels[role.role]}
                              </Badge>
                              {role.is_member_linked && (
                                <Badge variant="success">
                                  <CheckCircle className="w-3 h-3 mr-1" />
                                  Member Linked
                                </Badge>
                              )}
                            </div>

                            <div className="flex items-center space-x-2">
                              <PermissionGate permission="users.roles.assign">
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  onClick={() => handleEditRole(user, role)}
                                  title="Edit role"
                                >
                                  <Edit3 className="w-4 h-4" />
                                </Button>
                              </PermissionGate>
                              <PermissionGate permission="users.delete">
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  onClick={() => handleRemoveRole(role.id!)}
                                  title="Remove role"
                                  className="text-muted-foreground hover:text-destructive"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </PermissionGate>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        </div>

        {/* Add User Modal */}
        <Dialog open={showAddModal && !!canCreateUsers} onOpenChange={(open) => !open && setShowAddModal(false)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Add Admin User</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="add-email">Email Address</Label>
                <Input
                  id="add-email"
                  type="email"
                  value={addUserForm.email}
                  onChange={(e) => handleEmailChange(e.target.value)}
                  placeholder="user@example.com"
                />

                {addUserForm.memberInfo && (
                  <div className="mt-2 p-3 bg-success/10 border border-success/20 rounded-lg">
                    <div className="flex items-center mb-2">
                      <CheckCircle className="w-4 h-4 text-success mr-2" />
                      <span className="text-sm font-medium text-success">Existing LUB Member Found</span>
                    </div>
                    <div className="text-sm text-success/80">
                      <p><strong>{addUserForm.memberInfo.full_name}</strong></p>
                      <p>{addUserForm.memberInfo.company_name}</p>
                      <p>{addUserForm.memberInfo.mobile_number}</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="add-role">Role</Label>
                <select
                  id="add-role"
                  value={addUserForm.role}
                  onChange={(e) => setAddUserForm(prev => ({ ...prev, role: e.target.value as UserRole['role'] }))}
                  className="w-full px-3 py-2 border border-input rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  title={addUserForm.role ? roleDescriptions[addUserForm.role] : 'Select a role to see description'}
                >
                  <option value="">Select Role</option>
                  {Object.entries(roleLabels).map(([value, label]) => (
                    <option key={value} value={value} title={roleDescriptions[value as UserRole['role']]}>
                      {label}
                    </option>
                  ))}
                </select>
                {addUserForm.role && (
                  <p className="text-xs text-muted-foreground">
                    {roleDescriptions[addUserForm.role]}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isMemberLinked"
                  checked={addUserForm.isMemberLinked}
                  onChange={(e) => setAddUserForm(prev => ({ ...prev, isMemberLinked: e.target.checked }))}
                  className="w-4 h-4 rounded border-input"
                />
                <Label htmlFor="isMemberLinked">Link to LUB member account</Label>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddModal(false)}>Cancel</Button>
              <Button onClick={handleAddUser}>Add User</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Role Modal */}
        <Dialog open={showEditModal && !!selectedRole && !!canAssignRoles} onOpenChange={(open) => !open && setShowEditModal(false)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Role</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="edit-role">Role</Label>
                <select
                  id="edit-role"
                  value={editRoleForm.role}
                  onChange={(e) => setEditRoleForm(prev => ({ ...prev, role: e.target.value as UserRole['role'] }))}
                  className="w-full px-3 py-2 border border-input rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  title={editRoleForm.role ? roleDescriptions[editRoleForm.role] : 'Select a role to see description'}
                >
                  {Object.entries(roleLabels).map(([value, label]) => (
                    <option key={value} value={value} title={roleDescriptions[value as UserRole['role']]}>
                      {label}
                    </option>
                  ))}
                </select>
                {editRoleForm.role && (
                  <p className="text-xs text-muted-foreground">
                    {roleDescriptions[editRoleForm.role]}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="editIsMemberLinked"
                  checked={editRoleForm.isMemberLinked}
                  onChange={(e) => setEditRoleForm(prev => ({ ...prev, isMemberLinked: e.target.checked }))}
                  className="w-4 h-4 rounded border-input"
                />
                <Label htmlFor="editIsMemberLinked">Link to LUB member account</Label>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowEditModal(false)}>Cancel</Button>
              <Button onClick={handleUpdateRole}>Update Role</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PermissionGate>
  );
};

export default AdminUserManagement;
