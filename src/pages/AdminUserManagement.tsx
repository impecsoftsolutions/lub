import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Plus, Search, CreditCard as Edit3, Trash2, ArrowLeft, Shield, User, Building2, Mail, Phone, CheckCircle, X, Lock } from 'lucide-react';
import { userRolesService, UserRole, AdminUser } from '../lib/supabase';
import Toast from '../components/Toast';
import { PermissionGate } from '../components/permissions/PermissionGate';
import { useHasPermission } from '../hooks/usePermissions';

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

  const roleColors: Record<UserRole['role'], string> = {
    super_admin: 'bg-purple-100 text-purple-800',
    admin: 'bg-blue-100 text-blue-800',
    editor: 'bg-green-100 text-green-800',
    viewer: 'bg-gray-100 text-gray-800'
  };

  const roleDescriptions: Record<UserRole['role'], string> = {
    super_admin: 'Full control over the entire portal (bypass all restrictions)',
    admin: 'Manage members, payments, states, districts, cities, and roles (cannot manage admin users)',
    editor: 'Edit member details, documents, company roles, LUB role assignments, and organization profile',
    viewer: 'Read-only access to view members, roles, payments, and analytics'
  };

  useEffect(() => {
    loadAdminUsers();
  }, []);

  const loadAdminUsers = async () => {
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
  };

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message, isVisible: true });
  };

  const hideToast = () => {
    setToast(prev => ({ ...prev, isVisible: false }));
  };

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
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <Lock className="w-10 h-10 text-red-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h2>
            <p className="text-gray-600 mb-6">
              You don't have permission to view admin user management.
            </p>
            <button
              onClick={() => navigate('/admin')}
              className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </button>
          </div>
        </div>
      }
    >
      <div className="min-h-screen bg-gray-50">
        <Toast
          type={toast.type}
          message={toast.message}
          isVisible={toast.isVisible}
          onClose={hideToast}
        />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center">
                <Shield className="w-8 h-8 mr-3 text-blue-600" />
                Admin User Management
              </h1>
              <p className="text-gray-600 mt-2">
                Manage admin users and their role permissions
              </p>
            </div>
            <PermissionGate permission="users.create">
              <button
                onClick={() => setShowAddModal(true)}
                className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Admin User
              </button>
            </PermissionGate>
          </div>
        </div>
        {/* Search */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="relative">
            <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search by email, name, or role..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        {/* Admin Users List */}
        {isLoading ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading admin users...</p>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No admin users found</h3>
            <p className="text-gray-600">
              {searchTerm ? 'Try adjusting your search criteria' : 'No admin users have been added yet'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredUsers.map((user) => (
              <div key={user.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between">
                  {/* User Info */}
                  <div className="flex-1 mb-4 lg:mb-0">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <div className="flex items-center mb-2">
                          <Mail className="w-4 h-4 text-gray-400 mr-2" />
                          <span className="font-medium text-gray-900">{user.email}</span>
                        </div>
                        
                        {user.member_info && (
                          <div className="space-y-1 text-sm text-gray-600">
                            <div className="flex items-center">
                              <User className="w-4 h-4 text-gray-400 mr-2" />
                              <span>{user.member_info.full_name}</span>
                            </div>
                            <div className="flex items-center">
                              <Building2 className="w-4 h-4 text-gray-400 mr-2" />
                              <span>{user.member_info.company_name}</span>
                            </div>
                            <div className="flex items-center">
                              <Phone className="w-4 h-4 text-gray-400 mr-2" />
                              <span>{user.member_info.mobile_number}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Roles */}
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 mb-2">Assigned Roles:</h4>
                      <div className="space-y-2">
                        {user.roles.map((role) => (
                          <div key={role.id} className="flex items-center justify-between bg-gray-50 rounded-lg p-3">
                            <div className="flex items-center space-x-3">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${roleColors[role.role]}`}>
                                {roleLabels[role.role]}
                              </span>
                              {role.is_member_linked && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                  <CheckCircle className="w-3 h-3 mr-1" />
                                  Member Linked
                                </span>
                              )}
                            </div>
                            
                            <div className="flex items-center space-x-2">
                              <PermissionGate permission="users.roles.assign">
                                <button
                                  onClick={() => handleEditRole(user, role)}
                                  className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                                  title="Edit role"
                                >
                                  <Edit3 className="w-4 h-4" />
                                </button>
                              </PermissionGate>
                              <PermissionGate permission="users.delete">
                                <button
                                  onClick={() => handleRemoveRole(role.id!)}
                                  className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                                  title="Remove role"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
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
        {showAddModal && canCreateUsers && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Add Admin User</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  value={addUserForm.email}
                  onChange={(e) => handleEmailChange(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="user@example.com"
                />
                
                {addUserForm.memberInfo && (
                  <div className="mt-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                    <div className="flex items-center mb-2">
                      <CheckCircle className="w-4 h-4 text-green-600 mr-2" />
                      <span className="text-sm font-medium text-green-800">Existing LUB Member Found</span>
                    </div>
                    <div className="text-sm text-green-700">
                      <p><strong>{addUserForm.memberInfo.full_name}</strong></p>
                      <p>{addUserForm.memberInfo.company_name}</p>
                      <p>{addUserForm.memberInfo.mobile_number}</p>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Role
                </label>
                <select
                  value={addUserForm.role}
                  onChange={(e) => setAddUserForm(prev => ({ ...prev, role: e.target.value as UserRole['role'] }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
                  <p className="text-xs text-gray-500 mt-1">
                    {roleDescriptions[addUserForm.role]}
                  </p>
                )}
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="isMemberLinked"
                  checked={addUserForm.isMemberLinked}
                  onChange={(e) => setAddUserForm(prev => ({ ...prev, isMemberLinked: e.target.checked }))}
                  className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                />
                <label htmlFor="isMemberLinked" className="ml-2 text-sm font-medium text-gray-700">
                  Link to LUB member account
                </label>
              </div>
            </div>
            
            <div className="flex gap-3 justify-end mt-6">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddUser}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
              >
                Add User
              </button>
            </div>
          </div>
        </div>
        )}

        {/* Edit Role Modal */}
        {showEditModal && selectedRole && canAssignRoles && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Edit Role</h3>
              <button
                onClick={() => setShowEditModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Role
                </label>
                <select
                  value={editRoleForm.role}
                  onChange={(e) => setEditRoleForm(prev => ({ ...prev, role: e.target.value as UserRole['role'] }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  title={editRoleForm.role ? roleDescriptions[editRoleForm.role] : 'Select a role to see description'}
                >
                  {Object.entries(roleLabels).map(([value, label]) => (
                    <option key={value} value={value} title={roleDescriptions[value as UserRole['role']]}>
                      {label}
                    </option>
                  ))}
                </select>
                {editRoleForm.role && (
                  <p className="text-xs text-gray-500 mt-1">
                    {roleDescriptions[editRoleForm.role]}
                  </p>
                )}
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="editIsMemberLinked"
                  checked={editRoleForm.isMemberLinked}
                  onChange={(e) => setEditRoleForm(prev => ({ ...prev, isMemberLinked: e.target.checked }))}
                  className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                />
                <label htmlFor="editIsMemberLinked" className="ml-2 text-sm font-medium text-gray-700">
                  Link to LUB member account
                </label>
              </div>
            </div>
            
            <div className="flex gap-3 justify-end mt-6">
              <button
                onClick={() => setShowEditModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateRole}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
              >
                Update Role
              </button>
            </div>
          </div>
          </div>
        )}
      </div>
    </PermissionGate>
  );
};

export default AdminUserManagement;
