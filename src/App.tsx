import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import Directory from './pages/Directory';
import Events from './pages/Events';
import News from './pages/News';
import ActivityDetail from './pages/ActivityDetail';
import EventBadgeDownload from './pages/EventBadgeDownload';
import EventMaterialPreview from './pages/EventMaterialPreview';
import EventShortRedirect from './pages/EventShortRedirect';
import ActivityShortRedirect from './pages/ActivityShortRedirect';
import AdminActivities from './pages/AdminActivities';
import AdminActivityForm from './pages/AdminActivityForm';
import AdminActivitySettings from './pages/AdminActivitySettings';
import AdminEvents from './pages/AdminEvents';
import AdminEventForm from './pages/AdminEventForm';
import AdminEventRegistrations from './pages/AdminEventRegistrations';
import AdminEventCheckin from './pages/AdminEventCheckin';
import Leadership from './pages/Leadership';
import Join from './pages/Join';
import MembershipBenefits from './pages/MembershipBenefits';
import SignIn from './pages/SignIn';
import SignUpV2 from './pages/SignUpV2';
import VerifyEmail from './pages/VerifyEmail';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import RedirectIfAuthenticated from './components/RedirectIfAuthenticated';
import MemberDashboard from './pages/MemberDashboard';
import MemberViewProfile from './pages/MemberViewProfile';
import MemberEditProfile from './pages/MemberEditProfile';
import AdminMemberEdit from './pages/AdminMemberEdit';
import MemberReapply from './pages/MemberReapply';
import MemberChangePassword from './pages/MemberChangePassword';
import MemberSettings from './pages/MemberSettings';
import AdminRegistrations from './pages/AdminRegistrations';
import AdminProfileSettings from './pages/AdminProfileSettings';
import AdminUsers from './pages/admin/AdminUsers';
import AdminRolesPrivileges from './pages/AdminRolesPrivileges';
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
import AdminLeadershipContacts from './pages/AdminLeadershipContacts';
import AdminReportsPayments from './pages/AdminReportsPayments';
import PaymentSettings from './pages/AdminDashboard/PaymentSettings';
import AdminAppearanceSettings from './pages/admin/AdminAppearanceSettings';
import AdminSettingsHub from './pages/AdminSettingsHub';
import AdminAISettings from './pages/AdminAISettings';
import AdminNormalizationSettings from './pages/AdminNormalizationSettings';
import AdminDateTimeSettings from './pages/AdminDateTimeSettings';
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
import { DateTimeFormatBootstrap } from './components/DateTimeFormatBootstrap';
import { useOrganisationProfile } from './hooks/useOrganisationProfile';
// Restore persisted theme and color mode before first render
applyStoredTheme();

const LAST_NON_SIGNIN_ROUTE_KEY = 'lub:last_non_signin_route';
const PUBLIC_SITE_URL = (import.meta.env.VITE_PUBLIC_SITE_URL ?? 'https://lub.org.in').replace(/\/+$/, '');

interface SeoMetaConfig {
  title: string;
  description: string;
  robots: string;
  canonicalPath: string;
  structuredData?: Record<string, unknown>[];
}

const DEFAULT_PUBLIC_DESCRIPTION = 'Laghu Udyog Bharati portal for members, events, leadership updates, and organization information.';

function normalizePath(pathname: string): string {
  if (!pathname || pathname === '/') return '/';
  return pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
}

function isNoIndexPath(pathname: string): boolean {
  return (
    pathname.startsWith('/admin') ||
    pathname.startsWith('/dashboard') ||
    pathname === '/signin' ||
    pathname === '/signup' ||
    pathname === '/verify-email' ||
    pathname === '/forgot-password' ||
    pathname === '/reset-password' ||
    pathname === '/events/badge' ||
    pathname.startsWith('/events/badge/') ||
    pathname.startsWith('/events/') && pathname.includes('/material/') ||
    pathname.startsWith('/r/') ||
    pathname.startsWith('/a/')
  );
}

function getSeoMetaConfig(pathname: string): SeoMetaConfig {
  const normalizedPath = normalizePath(pathname);
  const noIndex = isNoIndexPath(normalizedPath);

  const baseConfig: SeoMetaConfig = {
    title: 'Laghu Udyog Bharati',
    description: DEFAULT_PUBLIC_DESCRIPTION,
    robots: noIndex ? 'noindex, nofollow' : 'index, follow',
    canonicalPath: normalizedPath,
  };

  if (noIndex) {
    if (normalizedPath.startsWith('/admin')) {
      return {
        ...baseConfig,
        title: 'Admin Portal | Laghu Udyog Bharati',
        description: 'Secure administrative workspace for Laghu Udyog Bharati operations.',
      };
    }

    if (normalizedPath.startsWith('/dashboard')) {
      return {
        ...baseConfig,
        title: 'Member Dashboard | Laghu Udyog Bharati',
        description: 'Secure member dashboard for profile and membership management.',
      };
    }

    return {
      ...baseConfig,
      title: 'Secure Page | Laghu Udyog Bharati',
      description: 'Secure page for Laghu Udyog Bharati users.',
    };
  }

  if (normalizedPath === '/') {
    return {
      ...baseConfig,
      title: 'Laghu Udyog Bharati | MSME Network and Member Community',
      description: 'Laghu Udyog Bharati supports MSMEs through events, networking, member services, and leadership initiatives.',
      structuredData: [
        {
          '@context': 'https://schema.org',
          '@type': 'Organization',
          name: 'Laghu Udyog Bharati',
          url: PUBLIC_SITE_URL,
        },
        {
          '@context': 'https://schema.org',
          '@type': 'WebSite',
          name: 'Laghu Udyog Bharati',
          url: PUBLIC_SITE_URL,
        },
      ],
    };
  }

  if (normalizedPath === '/events') {
    return {
      ...baseConfig,
      title: 'Events | Laghu Udyog Bharati',
      description: 'Explore upcoming and past Laghu Udyog Bharati events and activities.',
    };
  }

  if (normalizedPath.startsWith('/events/')) {
    return {
      ...baseConfig,
      title: 'Event Details | Laghu Udyog Bharati',
      description: 'Event details, registration information, and updates from Laghu Udyog Bharati.',
    };
  }

  if (normalizedPath === '/members') {
    return {
      ...baseConfig,
      title: 'Member Directory | Laghu Udyog Bharati',
      description: 'Browse the Laghu Udyog Bharati member directory and connect with MSME businesses.',
    };
  }

  if (normalizedPath.startsWith('/member/')) {
    return {
      ...baseConfig,
      title: 'Member Profile | Laghu Udyog Bharati',
      description: 'View member profile information from the Laghu Udyog Bharati directory.',
    };
  }

  if (normalizedPath === '/leadership') {
    return {
      ...baseConfig,
      title: 'Leadership | Laghu Udyog Bharati',
      description: 'Meet the Laghu Udyog Bharati leadership team and committee members.',
    };
  }

  if (normalizedPath === '/news') {
    return {
      ...baseConfig,
      title: 'News | Laghu Udyog Bharati',
      description: 'Latest announcements and updates from Laghu Udyog Bharati.',
    };
  }

  if (normalizedPath === '/join') {
    return {
      ...baseConfig,
      title: 'Join LUB | Laghu Udyog Bharati',
      description: 'Apply to become a Laghu Udyog Bharati member and grow your MSME network.',
    };
  }

  if (normalizedPath === '/membership-benefits') {
    return {
      ...baseConfig,
      title: 'Membership Benefits | Laghu Udyog Bharati',
      description: 'Discover the benefits of becoming a Laghu Udyog Bharati member.',
    };
  }

  if (normalizedPath === '/payment') {
    return {
      ...baseConfig,
      title: 'Payment Information | Laghu Udyog Bharati',
      description: 'State-wise payment details and membership payment guidance for Laghu Udyog Bharati.',
    };
  }

  return baseConfig;
}

function ensureMetaTag(selector: string, attrs: Record<string, string>) {
  let meta = document.head.querySelector(selector) as HTMLMetaElement | null;
  if (!meta) {
    meta = document.createElement('meta');
    Object.entries(attrs).forEach(([key, value]) => {
      if (key !== 'content') {
        meta!.setAttribute(key, value);
      }
    });
    document.head.appendChild(meta);
  }
  if (attrs.content) {
    meta.setAttribute('content', attrs.content);
  }
  return meta;
}

function ensureCanonicalLink(href: string) {
  let link = document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement('link');
    link.rel = 'canonical';
    document.head.appendChild(link);
  }
  link.href = href;
}

function ensureStructuredData(nodes: Record<string, unknown>[]) {
  const tagId = 'lub-seo-jsonld';
  const existing = document.head.querySelector(`#${tagId}`);

  if (!nodes.length) {
    existing?.remove();
    return;
  }

  let script = existing as HTMLScriptElement | null;
  if (!script) {
    script = document.createElement('script');
    script.id = tagId;
    script.type = 'application/ld+json';
    document.head.appendChild(script);
  }
  script.textContent = JSON.stringify(nodes.length === 1 ? nodes[0] : nodes);
}

function ActivitySlugRedirect() {
  const { slug } = useParams<{ slug: string }>();
  return <Navigate to={`/events/${slug ?? ''}`} replace />;
}

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

function SeoManager() {
  const location = useLocation();

  useEffect(() => {
    const { title, description, robots, canonicalPath, structuredData } = getSeoMetaConfig(location.pathname);
    const canonicalUrl = `${PUBLIC_SITE_URL}${canonicalPath === '/' ? '' : canonicalPath}`;

    document.title = title;
    ensureMetaTag('meta[name="description"]', { name: 'description', content: description });
    ensureMetaTag('meta[name="robots"]', { name: 'robots', content: robots });

    ensureMetaTag('meta[property="og:title"]', { property: 'og:title', content: title });
    ensureMetaTag('meta[property="og:description"]', { property: 'og:description', content: description });
    ensureMetaTag('meta[property="og:type"]', { property: 'og:type', content: canonicalPath.startsWith('/events/') ? 'article' : 'website' });
    ensureMetaTag('meta[property="og:url"]', { property: 'og:url', content: canonicalUrl });

    ensureMetaTag('meta[name="twitter:card"]', { name: 'twitter:card', content: 'summary_large_image' });
    ensureMetaTag('meta[name="twitter:title"]', { name: 'twitter:title', content: title });
    ensureMetaTag('meta[name="twitter:description"]', { name: 'twitter:description', content: description });

    ensureCanonicalLink(canonicalUrl);
    ensureStructuredData(structuredData ?? []);
  }, [location.pathname]);

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
    <DateTimeFormatBootstrap>
      <Router>
        <PermissionProvider>
          <MemberContextProvider>
          <RouteHistoryTracker />
          <SeoManager />
          <Routes>
          {/* Public Routes - All wrapped with MemberContextProvider for global login detection */}
          <Route element={<Layout />}>
            <Route path="/" element={<Home />} />
            <Route path="/members" element={<Directory />} />
            <Route path="/member/:id/:companySlug/:nameSlug" element={<MemberProfile />} />
            <Route path="/events" element={<Events />} />
            <Route path="/r/:code" element={<EventShortRedirect />} />
            <Route path="/a/:code" element={<ActivityShortRedirect />} />
            <Route path="/events/badge" element={<EventBadgeDownload />} />
            <Route path="/events/badge/:code" element={<EventBadgeDownload />} />
            <Route path="/events/:slug/material/:assetId" element={<EventMaterialPreview />} />
            <Route path="/events/:slug" element={<ActivityDetail />} />
            <Route path="/news" element={<News />} />
            <Route path="/activities" element={<Navigate to="/events" replace />} />
            <Route path="/activities/:slug" element={<ActivitySlugRedirect />} />
            <Route path="/leadership" element={<Leadership />} />
            <Route path="/join" element={<Join />} />
            <Route path="/membership-benefits" element={<MembershipBenefits />} />
            <Route path="/styleguide" element={<Styleguide />} />
            <Route path="/payment" element={<Payment />} />

            {/* Auth-Free Routes - For unauthenticated users (signin, signup, password reset) */}
            <Route path="/signin" element={<SignIn />} />
            <Route path="/signup" element={<SignUpV2 />} />
            <Route path="/verify-email" element={<VerifyEmail />} />
            <Route path="/forgot-password" element={<RedirectIfAuthenticated><ForgotPassword /></RedirectIfAuthenticated>} />
            <Route path="/reset-password" element={<RedirectIfAuthenticated><ResetPassword /></RedirectIfAuthenticated>} />

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
            <Route path="/admin/dashboard/leadership-contacts" element={<AdminLeadershipContacts />} />
            <Route path="/admin/reports/payments" element={<AdminReportsPayments />} />

            <Route path="/admin/members/registrations" element={<AdminRegistrations />} />
            <Route path="/admin/members/registrations/:registrationId/edit" element={<AdminMemberEdit />} />
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
            <Route path="/admin/settings/datetime" element={<AdminDateTimeSettings />} />
            <Route path="/admin/settings/appearance" element={<AdminAppearanceSettings />} />
            <Route path="/admin/settings/ai" element={<AdminAISettings />} />

            <Route path="/admin/administration/users" element={<AdminUsers />} />
            <Route path="/admin/administration/roles" element={<AdminRolesPrivileges />} />

            {/* Content — Events & Activities CMS */}
            <Route path="/admin/content/events" element={<AdminEvents />} />
            <Route path="/admin/content/events/new" element={<AdminEventForm />} />
            <Route path="/admin/content/events/:id/edit" element={<AdminEventForm />} />
            <Route path="/admin/content/events/:id/registrations" element={<AdminEventRegistrations />} />
            <Route path="/admin/content/events/:id/checkin" element={<AdminEventCheckin />} />
            <Route path="/admin/content/activities" element={<AdminActivities />} />
            <Route path="/admin/content/activities/new" element={<AdminActivityForm />} />
            <Route path="/admin/content/activities/:id/edit" element={<AdminActivityForm />} />
            <Route path="/admin/content/activities/settings" element={<AdminActivitySettings />} />
          </Route>
          </Routes>
          </MemberContextProvider>
        </PermissionProvider>
      </Router>
    </DateTimeFormatBootstrap>
  );
}

function FaviconManager() {
  const { profile } = useOrganisationProfile();

  useEffect(() => {
    const logoUrl = (profile?.organization_logo_url ?? '').trim();
    if (!logoUrl) return;

    const ensureLink = (rel: string) => {
      let link = document.head.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null;
      if (!link) {
        link = document.createElement('link');
        link.rel = rel;
        document.head.appendChild(link);
      }
      link.href = logoUrl;
      return link;
    };

    ensureLink('icon');
    ensureLink('shortcut icon');
    ensureLink('apple-touch-icon');
  }, [profile?.organization_logo_url]);

  return null;
}

function AppWithFavicon() {
  return (
    <>
      <FaviconManager />
      <App />
    </>
  );
}

export default AppWithFavicon;
