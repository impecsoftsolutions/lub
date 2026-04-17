import React from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { useAdmin } from '../contexts/useAdmin';
import MemberEditProfile from './MemberEditProfile';

/**
 * Thin admin wrapper that supplies adminRegistrationId + isSuperAdmin to
 * MemberEditProfile so the component never needs to call useAdmin() itself
 * (which would crash when rendered outside AdminLayout at /dashboard/edit).
 */
const AdminMemberEdit: React.FC = () => {
  const { registrationId } = useParams<{ registrationId: string }>();
  const { isSuperAdmin } = useAdmin();

  if (!registrationId) {
    return <Navigate to="/admin/members/registrations" replace />;
  }

  return (
    <MemberEditProfile
      adminRegistrationId={registrationId}
      isSuperAdmin={isSuperAdmin}
    />
  );
};

export default AdminMemberEdit;
