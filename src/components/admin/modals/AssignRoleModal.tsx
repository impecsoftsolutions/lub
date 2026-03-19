import React, { useEffect, useState } from 'react';
import { X, Shield, AlertCircle, Loader2, CheckCircle } from 'lucide-react';
import { userRolesService } from '../../../lib/supabase';

type AssignableRole = 'super_admin' | 'admin' | 'editor' | 'viewer';
type RoleSelection = AssignableRole | 'remove_role' | '';

interface CurrentRole {
  id: string;
  role: string;
  state: string | null;
  district: string | null;
}

interface AssignRoleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (message: string) => Promise<void> | void;
  user: {
    id: string;
    email: string;
  };
  currentRole: CurrentRole | null;
}

const ROLE_OPTIONS: Array<{ value: AssignableRole; label: string; description: string }> = [
  {
    value: 'super_admin',
    label: 'Super Admin',
    description: 'Full control over the entire portal and permission system.'
  },
  {
    value: 'admin',
    label: 'Admin',
    description: 'Operational access across members, locations, payments, and roles.'
  },
  {
    value: 'editor',
    label: 'Editor',
    description: 'Edit-focused access for members, documents, and organization data.'
  },
  {
    value: 'viewer',
    label: 'Viewer',
    description: 'Read-only access for admin-facing data.'
  }
];

const formatRoleLabel = (role: string | null | undefined): string => {
  if (!role) {
    return 'No role assigned';
  }

  const match = ROLE_OPTIONS.find((option) => option.value === role);
  if (match) {
    return match.label;
  }

  return role.replace(/_/g, ' ');
};

const AssignRoleModal: React.FC<AssignRoleModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  user,
  currentRole
}) => {
  const [selectedRole, setSelectedRole] = useState<RoleSelection>('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setSelectedRole(currentRole?.role && ROLE_OPTIONS.some((option) => option.value === currentRole.role as AssignableRole)
        ? (currentRole.role as AssignableRole)
        : '');
      setError('');
      setIsSubmitting(false);
    }
  }, [isOpen, currentRole]);

  const handleClose = () => {
    if (!isSubmitting) {
      onClose();
    }
  };

  const selectedRoleMeta = ROLE_OPTIONS.find((option) => option.value === selectedRole);
  const hasRoleSelection = selectedRole !== '';
  const currentRoleValue = currentRole?.role ?? null;
  const hasMeaningfulChange =
    selectedRole === 'remove_role' ||
    (!currentRoleValue && selectedRole !== '') ||
    (currentRoleValue !== null && selectedRole !== '' && selectedRole !== currentRoleValue);
  const canSubmit = hasRoleSelection && hasMeaningfulChange && !isSubmitting;

  const handleSubmit = async () => {
    if (!canSubmit) {
      return;
    }

    try {
      setIsSubmitting(true);
      setError('');

      let result: { success: boolean; error?: string };
      let successMessage = 'Role updated successfully';

      if (!currentRole && selectedRole && selectedRole !== 'remove_role') {
        result = await userRolesService.addUserRole(user.email, selectedRole, false);
        successMessage = 'Role assigned successfully';
      } else if (currentRole && selectedRole === 'remove_role') {
        result = await userRolesService.removeUserRole(currentRole.id);
        successMessage = 'Role removed successfully';
      } else if (currentRole && selectedRole && selectedRole !== 'remove_role') {
        result = await userRolesService.updateUserRole(currentRole.id, { role: selectedRole });
      } else {
        setError('Please select a valid role action.');
        return;
      }

      if (!result.success) {
        setError(result.error || 'Failed to update role');
        return;
      }

      await Promise.resolve(onSuccess(successMessage));
      onClose();
    } catch (submitError) {
      console.error('Error assigning role:', submitError);
      setError('An unexpected error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <div
          className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75"
          onClick={handleClose}
        />

        <span className="hidden sm:inline-block sm:align-middle sm:h-screen">&#8203;</span>

        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-10 h-10 bg-blue-100 rounded-full">
                  <Shield className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Assign Role</h3>
                  <p className="text-sm text-gray-600">Choose the admin role for this user</p>
                </div>
              </div>
              <button
                onClick={handleClose}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mb-4 space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div className="text-sm">
                <span className="font-medium text-gray-700">User:</span>{' '}
                <span className="text-gray-900">{user.email}</span>
              </div>
              <div className="text-sm">
                <span className="font-medium text-gray-700">Current role:</span>{' '}
                <span className="text-gray-900">{formatRoleLabel(currentRole?.role)}</span>
              </div>
            </div>

            {error && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-red-600" />
                  <p className="text-sm font-medium text-red-800">{error}</p>
                </div>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label htmlFor="assign-role-select" className="mb-1 block text-sm font-medium text-gray-700">
                  Role
                </label>
                <select
                  id="assign-role-select"
                  value={selectedRole}
                  onChange={(e) => {
                    setSelectedRole(e.target.value as RoleSelection);
                    setError('');
                  }}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select a role</option>
                  {ROLE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                  {currentRole && (
                    <option value="remove_role">Remove Role</option>
                  )}
                </select>
              </div>

              {selectedRoleMeta && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
                  {selectedRoleMeta.description}
                </div>
              )}

              {selectedRole === 'remove_role' && (
                <div className="rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm text-orange-800">
                  Removing the role will leave this user without admin role access.
                </div>
              )}
            </div>
          </div>

          <div className="bg-gray-50 px-4 py-3 sm:flex sm:flex-row-reverse sm:px-6 gap-3">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="w-full inline-flex justify-center rounded-lg border border-transparent bg-blue-600 px-4 py-2 text-base font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed sm:w-auto sm:text-sm"
            >
              {isSubmitting ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </span>
              ) : (
                <span className="inline-flex items-center gap-2">
                  <CheckCircle className="h-4 w-4" />
                  Save Role
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              className="mt-3 inline-flex w-full justify-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-base font-medium text-gray-700 shadow-sm hover:bg-gray-50 sm:mt-0 sm:w-auto sm:text-sm"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AssignRoleModal;
