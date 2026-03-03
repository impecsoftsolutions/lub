import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import Directory from './pages/Directory';
import Events from './pages/Events';
import News from './pages/News';
import Activities from './pages/Activities';
import Leadership from './pages/Leadership';
import Join from './pages/Join';
import MembershipBenefits from './pages/MembershipBenefits';
import SignIn from './pages/SignIn';
import SignUp from './pages/SignUp';
import VerifyEmail from './pages/VerifyEmail';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import MemberDashboard from './pages/MemberDashboard';
import MemberViewProfile from './pages/MemberViewProfile';
import MemberEditProfile from './pages/MemberEditProfile';
import MemberReapply from './pages/MemberReapply';
import MemberChangePassword from './pages/MemberChangePassword';
import MemberSettings from './pages/MemberSettings';
import AdminRegistrations from './pages/AdminRegistrations';
import AdminProfileSettings from './pages/AdminProfileSettings';
import AdminUsers from './pages/admin/AdminUsers';
import AdminStateManagement from './pages/AdminStateManagement';
import AdminLocationManagement from './pages/AdminLocationManagement';
import AdminDesignationsManagement from './pages/AdminDesignationsManagement';
import AdminDirectoryVisibility from './pages/AdminDirectoryVisibility';
import AdminCityManagement from './pages/AdminCityManagement';
import AdminPendingCities from './pages/AdminPendingCities';
import AdminFormsList from './pages/AdminFormsList';
import AdminFormFieldConfiguration from './pages/AdminFormFieldConfiguration';
import AdminDeletedMembers from './pages/AdminDeletedMembers';
import AdminValidationSettings from './pages/AdminValidationSettings';
import AdminDashboardOverview from './pages/AdminDashboardOverview';
import PaymentSettings from './pages/AdminDashboard/PaymentSettings';
import Styleguide from './pages/Styleguide';
import Payment from './pages/Payment';
import MemberProfile from './pages/MemberProfile';
import { AdminLayout } from './components/admin/AdminLayout';
import { MemberContextProvider } from './contexts/MemberContext';
import { PermissionProvider } from './contexts/PermissionContext';
import { AdminContextProvider } from './contexts/AdminContext';
import { sessionManager } from './lib/sessionManager';

function AdminLayoutWrapper() {
  const userData = sessionManager.getUserData();
  const isSuperAdmin = userData?.role === 'super_admin';
  const userEmail = userData?.email || '';

  return (
    <AdminContextProvider isSuperAdmin={isSuperAdmin} userEmail={userEmail}>
      <AdminLayout />
    </AdminContextProvider>
  );
}

function App() {
  return (
    <Router>
      <PermissionProvider>
        <MemberContextProvider>
          <Routes>
          {/* Public Routes - All wrapped with MemberContextProvider for global login detection */}
          <Route element={<Layout />}>
            <Route path="/" element={<Home />} />
            <Route path="/members" element={<Directory />} />
            <Route path="/member/:id/:companySlug/:nameSlug" element={<MemberProfile />} />
            <Route path="/events" element={<Events />} />
            <Route path="/news" element={<News />} />
            <Route path="/activities" element={<Activities />} />
            <Route path="/leadership" element={<Leadership />} />
            <Route path="/join" element={<Join />} />
            <Route path="/membership-benefits" element={<MembershipBenefits />} />
            <Route path="/styleguide" element={<Styleguide />} />
            <Route path="/payment" element={<Payment />} />

            {/* Auth-Free Routes - For unauthenticated users (signin, signup, password reset) */}
            <Route path="/signin" element={<SignIn />} />
            <Route path="/signup" element={<SignUp />} />
            <Route path="/verify-email" element={<VerifyEmail />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />

            {/* Member Protected Routes */}
            <Route path="/dashboard" element={<MemberDashboard />} />
            <Route path="/dashboard/profile" element={<MemberViewProfile />} />
            <Route path="/dashboard/edit" element={<MemberEditProfile />} />
            <Route path="/dashboard/settings" element={<MemberSettings />} />
            <Route path="/dashboard/reapply" element={<MemberReapply />} />
            <Route path="/dashboard/change-password" element={<MemberChangePassword />} />
          </Route>

          {/* Admin Routes - Redirect old admin login to unified signin */}
          <Route path="/admin/login" element={<Navigate to="/signin" replace />} />

          <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="/admin/payment-settings" element={<Navigate to="/admin/locations/payment-settings" replace />} />
          <Route path="/admin/registrations" element={<Navigate to="/admin/members/registrations" replace />} />
          <Route path="/admin/profile-settings" element={<Navigate to="/admin/organization/profile" replace />} />
          <Route path="/admin/user-management" element={<Navigate to="/admin/administration/users" replace />} />
          <Route path="/admin/state-management" element={<Navigate to="/admin/locations/states" replace />} />
          <Route path="/admin/designations-management" element={<Navigate to="/admin/organization/designations" replace />} />
          <Route path="/admin/directory-visibility" element={<Navigate to="/admin/members/visibility" replace />} />
          <Route path="/admin/city-management" element={<Navigate to="/admin/locations/cities" replace />} />
          <Route path="/admin/pending-cities" element={<Navigate to="/admin/locations/pending-cities" replace />} />
          <Route path="/admin/deleted-members" element={<Navigate to="/admin/members/deleted" replace />} />
          <Route path="/admin/forms" element={<Navigate to="/admin/settings/forms" replace />} />

          <Route element={<AdminLayoutWrapper />}>
            <Route path="/admin/dashboard" element={<AdminDashboardOverview />} />

            <Route path="/admin/members/registrations" element={<AdminRegistrations />} />
            <Route path="/admin/members/deleted" element={<AdminDeletedMembers />} />
            <Route path="/admin/members/visibility" element={<AdminDirectoryVisibility />} />

            <Route path="/admin/locations/states" element={<AdminStateManagement />} />
            <Route path="/admin/locations/states/:stateName/locations" element={<AdminLocationManagement />} />
            <Route path="/admin/locations/cities" element={<AdminCityManagement />} />
            <Route path="/admin/locations/pending-cities" element={<AdminPendingCities />} />
            <Route path="/admin/locations/payment-settings" element={<PaymentSettings />} />

            <Route path="/admin/organization/profile" element={<AdminProfileSettings />} />
            <Route path="/admin/organization/designations" element={<AdminDesignationsManagement />} />

            <Route path="/admin/settings/forms" element={<AdminFormsList />} />
            <Route path="/admin/settings/forms/join-lub" element={<AdminFormFieldConfiguration />} />
            <Route path="/admin/settings/validation" element={<AdminValidationSettings />} />

            <Route path="/admin/administration/users" element={<AdminUsers />} />
          </Route>
          </Routes>
        </MemberContextProvider>
      </PermissionProvider>
    </Router>
  );
}

export default App;
