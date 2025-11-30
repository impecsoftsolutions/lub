import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Search, Filter, Mail, Phone, Shield, Calendar, Lock, ChevronUp, ChevronDown } from 'lucide-react';
import { PermissionGate } from '../../components/permissions/PermissionGate';
import { supabase } from '../../lib/supabase';
import Toast from '../../components/Toast';
import { useHasPermission } from '../../hooks/usePermissions';
import EditUserModal from '../../components/admin/modals/EditUserModal';
import DeleteUserModal from '../../components/admin/modals/DeleteUserModal';
import BlockUserModal from '../../components/admin/modals/BlockUserModal';

interface UserRole {
  id: string;
  role: string;
  state: string | null;
  district: string | null;
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
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [blockAction, setBlockAction] = useState<'block' | 'unblock'>('block');

  const navigate = useNavigate();

  useEffect(() => {
    loadUsers();
  }, []);

  useEffect(() => {
    filterUsers();
  }, [users, searchTerm, accountTypeFilter, sortField, sortDirection]);

  const canEdit = useHasPermission('users.edit');
  const canDelete = useHasPermission('users.delete');
  const canBlock = useHasPermission('users.block');

  const loadUsers = async () => {
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
            district: r.district
          }))
        };
      });

      console.log('[AdminUsers] Users with roles prepared:', usersWithRoles.length);
      setUsers(usersWithRoles);
    } catch (error) {
      console.error('[AdminUsers] Error loading users:', error);
      showToast('error', 'Failed to load users');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditClick = (user: any) => {
    setSelectedUser(user);
    setEditModalOpen(true);
  };

  const handleDeleteClick = (user: any) => {
    setSelectedUser(user);
    setDeleteModalOpen(true);
  };

  const handleBlockClick = (user: any, action: 'block' | 'unblock') => {
    setSelectedUser(user);
    setBlockAction(action);
    setBlockModalOpen(true);
  };

  const handleModalSuccess = () => {
    loadUsers();
  };

  const filterUsers = () => {
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
  };

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message, isVisible: true });
  };

  const hideToast = () => {
    setToast(prev => ({ ...prev, isVisible: false }));
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
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
        <span className={`${baseClasses} bg-gray-100 text-gray-800`}>
          <Users className="w-3 h-3 mr-1" />
          {displayText}
        </span>
      );
    }

    if (user.account_type === 'admin' || user.account_type === 'both') {
      return (
        <span className={`${baseClasses} bg-blue-100 text-blue-800`}>
          <Shield className="w-3 h-3 mr-1" />
          {displayText}
        </span>
      );
    }

    if (user.account_type === 'member') {
      return (
        <span className={`${baseClasses} bg-green-100 text-green-800`}>
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
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <Lock className="w-10 h-10 text-red-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h2>
            <p className="text-gray-600 mb-6">
              You don't have permission to view users.
            </p>
            <button
              onClick={() => navigate('/admin/dashboard')}
              className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      }
    >
      <div className="min-h-screen bg-gray-50 py-8">
        <Toast
          type={toast.type}
          message={toast.message}
          isVisible={toast.isVisible}
          onClose={hideToast}
        />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-8">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-gray-900 flex items-center">
                  <Users className="w-8 h-8 mr-3 text-blue-600" />
                  Users
                </h1>
                <p className="text-gray-600 mt-2">
                  View all registered users in the system
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-500">Total Users</p>
                <p className="text-2xl font-bold text-gray-900">{users.length}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search by email or mobile number..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="sm:w-48">
                <div className="relative">
                  <Filter className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                  <select
                    value={accountTypeFilter}
                    onChange={(e) => setAccountTypeFilter(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 appearance-none bg-white"
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

            <div className="mt-4 text-sm text-gray-600">
              Showing {filteredUsers.length} of {users.length} users
            </div>
          </div>

          {isLoading ? (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Loading users...</p>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
              <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No users found</h3>
              <p className="text-gray-600">
                {searchTerm || accountTypeFilter !== 'all'
                  ? 'Try adjusting your search or filter criteria'
                  : 'No users have been registered yet'}
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th
                        className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
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
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Mobile Number
                      </th>
                      <th
                        className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
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
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Created Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredUsers.map((user) => (
                      <tr key={user.id} className={`hover:bg-gray-50 transition-colors ${user.is_frozen ? 'opacity-50 bg-gray-50' : ''}`}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <Mail className="w-4 h-4 text-gray-400 mr-2 flex-shrink-0" />
                            <span className="text-sm text-gray-900">{user.email}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <Phone className="w-4 h-4 text-gray-400 mr-2 flex-shrink-0" />
                            <span className="text-sm text-gray-900">
                              {user.mobile_number || '-'}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex gap-2 items-center">
                            {getAccountTypeBadge(user)}
                            {user.is_frozen && (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                                Frozen
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <Calendar className="w-4 h-4 text-gray-400 mr-2 flex-shrink-0" />
                            <span className="text-sm text-gray-900">
                              {formatDate(user.created_at)}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <div className="flex gap-3 items-center">
                            {canEdit && (
                              <button
                                onClick={() => handleEditClick(user)}
                                className="text-blue-600 hover:text-blue-900"
                                title="Edit user"
                              >
                                Edit
                              </button>
                            )}

                            {canDelete && (
                              <button
                                onClick={() => handleDeleteClick(user)}
                                disabled={user.account_type !== 'general_user'}
                                className={
                                  user.account_type !== 'general_user'
                                    ? 'text-gray-400 opacity-50 cursor-not-allowed'
                                    : 'text-red-600 hover:text-red-900'
                                }
                                title={user.account_type !== 'general_user' ? 'Cannot delete non-general user accounts' : 'Delete user'}
                              >
                                Delete
                              </button>
                            )}

                            {canBlock && (
                              <button
                                onClick={() => handleBlockClick(user, user.is_frozen ? 'unblock' : 'block')}
                                className={user.is_frozen ? 'text-green-600 hover:text-green-900' : 'text-orange-600 hover:text-orange-900'}
                                title={user.is_frozen ? 'Unblock user' : 'Block user'}
                              >
                                {user.is_frozen ? 'Unblock' : 'Block'}
                              </button>
                            )}
                          </div>
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
        </>
      )}
    </PermissionGate>
  );
};

export default AdminUsers;
