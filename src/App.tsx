import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
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
import SignUpV2 from './pages/SignUpV2';
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
import AdminAppearanceSettings from './pages/admin/AdminAppearanceSettings';
import AdminSettingsHub from './pages/AdminSettingsHub';
import AdminAISettings from './pages/AdminAISettings';
import AdminNormalizationSettings from './pages/AdminNormalizationSettings';
import AdminFormBuilderV2 from './pages/AdminFormBuilderV2';
import AdminFormEditorV2 from './pages/AdminFormEditorV2';
import AdminFieldLibrary from './pages/AdminFieldLibrary';
import AdminFormStudio from './pages/AdminFormStudio';
import Styleguide from './pages/Styleguide';
import Payment from './pages/Payment';
import MemberProfile from './pages/MemberProfile';
import { MemberContextProvider } from './contexts/MemberContext';
import { PermissionProvider } from './contexts/PermissionContext';
import { AdminContextProvider } from './contexts/AdminContext';
import { sessionManager } from './lib/sessionManager';
import { applyStoredTheme } from './lib/themeManager';

// Restore persisted theme and color mode before first render
applyStoredTheme();

const LAST_NON_SIGNIN_ROUTE_KEY = 'lub:last_non_signin_route';

function RouteHistoryTracker() {
  const location = useLocation();

  useEffect(() => {
    if (location.pathname === '/signin' || location.pathname === '/admin/login') {
      return;
    }

    const fullPath = `${location.pathname}${location.search}${location.hash}`;
    try {
      sessionStorage.setItem(LAST_NON_SIGNIN_ROUTE_KEY, fullPath);
    } catch {
      // Ignore storage errors; signin guard has fallbacks.
    }
  }, [location]);

  return null;
}

const AdminLayoutLazy = React.lazy(() =>
  import('./components/admin/AdminLayout').then(m => ({ default: m.AdminLayout }))
);

function AdminLayoutWrapper() {
  const userData = sessionManager.getUserData();
  const isSuperAdmin = userData?.role === 'super_admin';
  const userEmail = userData?.email || '';

  return (
    <AdminContextProvider isSuperAdmin={isSuperAdmin} userEmail={userEmail}>
      <React.Suspense fallback={
        <div className="min-h-screen flex items-center justify-center bg-muted">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
        </div>
      }>
        <AdminLayoutLazy />
      </React.Suspense>
    </AdminContextProvider>
  );
}

function App() {
  return (
    <Router>
      <PermissionProvider>
        <MemberContextProvider>
          <RouteHistoryTracker />
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
            <Route path="/signup" element={<SignUpV2 />} />
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

          {/* Form Studio — minimal chrome, opens in new tab */}
          <Route path="/admin/form-studio/:formKey" element={<AdminFormStudio />} />

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
            <Route path="/admin/settings" element={<AdminSettingsHub />} />
            <Route path="/admin/settings/forms/join-lub" element={<AdminFormFieldConfiguration />} />
            <Route path="/admin/settings/forms/builder" element={<AdminFormBuilderV2 />} />
            <Route path="/admin/settings/forms/builder/:formKey" element={<AdminFormEditorV2 />} />
            <Route path="/admin/settings/forms/library" element={<AdminFieldLibrary />} />
            <Route path="/admin/settings/validation" element={<AdminValidationSettings />} />
            <Route path="/admin/settings/normalization" element={<AdminNormalizationSettings />} />
            <Route path="/admin/settings/appearance" element={<AdminAppearanceSettings />} />
            <Route path="/admin/settings/ai" element={<AdminAISettings />} />

            <Route path="/admin/administration/users" element={<AdminUsers />} />
          </Route>
          </Routes>
        </MemberContextProvider>
      </PermissionProvider>
    </Router>
  );
}

export default App;
