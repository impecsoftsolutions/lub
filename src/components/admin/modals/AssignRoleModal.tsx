import React, { useEffect, useMemo, useState } from 'react';
import { X, Shield, AlertCircle, Loader2, CheckCircle } from 'lucide-react';
import {
  rolesService,
  type RoleCatalog,
  type UserRole,
  userRolesService,
} from '../../../lib/supabase';
import { sessionManager } from '../../../lib/sessionManager';

type RoleSelection = string;

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

const REMOVE_ROLE = 'remove_role';

const formatRoleLabel = (role: string | null | undefined, roles: RoleCatalog[]): string => {
  if (!role) {
    return 'No role assigned';
  }

  const match = roles.find((option) => option.name === role);
  if (match) {
    return match.display_name;
  }

  return role
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

const AssignRoleModal: React.FC<AssignRoleModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  user,
  currentRole
}) => {
  const [availableRoles, setAvailableRoles] = useState<RoleCatalog[]>([]);
  const [selectedRole, setSelectedRole] = useState<RoleSelection>('');
  const [error, setError] = useState('');
  const [isLoadingRoles, setIsLoadingRoles] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let isMounted = true;

    const loadRoles = async () => {
      const sessionToken = sessionManager.getSessionToken();
      if (!sessionToken) {
        if (isMounted) {
          setError('User session not found. Please log in again.');
          setAvailableRoles([]);
        }
        return;
      }

      setIsLoadingRoles(true);
      try {
        const roles = await rolesService.listRoles(sessionToken);
        if (!isMounted) {
          return;
        }
        setAvailableRoles(roles);
      } catch (loadError) {
        console.error('Error loading roles catalog:', loadError);
        if (isMounted) {
          setAvailableRoles([]);
          setError(loadError instanceof Error ? loadError.message : 'Failed to load roles');
        }
      } finally {
        if (isMounted) {
          setIsLoadingRoles(false);
        }
      }
    };

    setSelectedRole(currentRole?.role ?? '');
    setError('');
    setIsSubmitting(false);
    void loadRoles();

    return () => {
      isMounted = false;
    };
  }, [isOpen, currentRole]);

  const handleClose = () => {
    if (!isSubmitting) {
      onClose();
    }
  };

  const selectedRoleMeta = useMemo(
    () => availableRoles.find((option) => option.name === selectedRole),
    [availableRoles, selectedRole]
  );

  const hasRoleSelection = selectedRole !== '';
  const currentRoleValue = currentRole?.role ?? null;
  const hasMeaningfulChange =
    selectedRole === REMOVE_ROLE ||
    (!currentRoleValue && selectedRole !== '') ||
    (currentRoleValue !== null && selectedRole !== '' && selectedRole !== currentRoleValue);
  const canSubmit = hasRoleSelection && hasMeaningfulChange && !isSubmitting && !isLoadingRoles;

  const handleSubmit = async () => {
    if (!canSubmit) {
      return;
    }

    try {
      setIsSubmitting(true);
      setError('');

      let result: { success: boolean; error?: string };
      let successMessage = 'Role updated successfully';
      const selectedAssignableRole = selectedRole as UserRole['role'];

      if (!currentRole && selectedRole && selectedRole !== REMOVE_ROLE) {
        result = await userRolesService.addUserRole(user.email, selectedAssignableRole, false);
        successMessage = 'Role assigned successfully';
      } else if (currentRole && selectedRole === REMOVE_ROLE) {
        result = await userRolesService.removeUserRole(currentRole.id);
        successMessage = 'Role removed successfully';
      } else if (currentRole && selectedRole && selectedRole !== REMOVE_ROLE) {
        result = await userRolesService.updateUserRole(currentRole.id, { role: selectedAssignableRole });
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
    <div className="fixed inset-0 z-[80] overflow-y-auto">
      <div className="relative flex min-h-screen items-center justify-center px-4 py-6 text-center sm:p-0">
        <div
          className="fixed inset-0 bg-black/50 transition-opacity"
          onClick={handleClose}
        />

        <div className="relative z-10 inline-block w-full max-w-lg transform overflow-hidden rounded-xl border border-border bg-card text-left shadow-2xl transition-all">
          <div className="bg-card px-4 pb-4 pt-5 sm:p-6 sm:pb-4">
            <div className="mb-4 flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                  <Shield className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="text-section font-semibold text-foreground">Assign Role</h3>
                  <p className="text-sm text-muted-foreground">Choose the admin role for this user</p>
                </div>
              </div>
              <button
                onClick={handleClose}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mb-4 space-y-2 rounded-lg border border-border bg-muted/50 p-4">
              <div className="text-sm">
                <span className="font-medium text-foreground">User:</span>{' '}
                <span className="text-foreground">{user.email}</span>
              </div>
              <div className="text-sm">
                <span className="font-medium text-foreground">Current role:</span>{' '}
                <span className="text-foreground">{formatRoleLabel(currentRole?.role, availableRoles)}</span>
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
                <label htmlFor="assign-role-select" className="mb-1 block text-sm font-medium text-foreground">
                  Role
                </label>
                <select
                  id="assign-role-select"
                  value={selectedRole}
                  onChange={(e) => {
                    setSelectedRole(e.target.value);
                    setError('');
                  }}
                  disabled={isLoadingRoles}
                  className="w-full rounded-lg border border-border px-3 py-2 focus:border-ring focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <option value="">
                    {isLoadingRoles ? 'Loading roles...' : 'Select a role'}
                  </option>
                  {availableRoles.map((option) => (
                    <option key={option.name} value={option.name}>
                      {option.display_name}
                    </option>
                  ))}
                  {currentRole && (
                    <option value={REMOVE_ROLE}>Remove Role</option>
                  )}
                </select>
              </div>

              {selectedRoleMeta && (
                <div className="rounded-lg border border-border bg-primary/5 p-3 text-sm text-foreground">
                  {selectedRoleMeta.description}
                </div>
              )}

              {selectedRole === REMOVE_ROLE && (
                <div className="rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm text-orange-800">
                  Removing the role will leave this user without admin role access.
                </div>
              )}
            </div>
          </div>

          <div className="gap-3 bg-muted/50 px-4 py-3 sm:flex sm:flex-row-reverse sm:px-6">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="inline-flex w-full justify-center rounded-lg border border-transparent bg-primary px-4 py-2 text-base font-medium text-primary-foreground shadow-sm hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:text-sm"
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
              className="mt-3 inline-flex w-full justify-center rounded-lg border border-border bg-card px-4 py-2 text-base font-medium text-foreground shadow-sm hover:bg-muted/50 sm:mt-0 sm:w-auto sm:text-sm"
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
