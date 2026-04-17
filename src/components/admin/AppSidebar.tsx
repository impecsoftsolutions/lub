import * as React from "react";
import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  MapPin,
  Building2,
  Settings,
  Shield,
  BarChart3,
  LogOut,
  PanelLeftClose
} from "lucide-react";

import { useIsMobile } from "@/hooks/use-mobile";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarGroup,
  SidebarGroupContent,
  useSidebar
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from "@/components/ui/collapsible";
import { ChevronRight } from "lucide-react";
import { useAdmin } from "../../contexts/useAdmin";
import { useOrganisationProfile } from "../../hooks/useOrganisationProfile";
import { logoutService } from "../../lib/logoutService";

interface NavChild {
  label: string;
  path: string;
  badge?: string;
}

interface NavSection {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  children: NavChild[];
  disabled?: boolean;
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const location = useLocation();
  const { setOpenMobile, isMobile, toggleSidebar } = useSidebar();
  const isMobileBreakpoint = useIsMobile();
  const { pendingRegistrationsCount, pendingCitiesCount } = useAdmin();
  const { profile: orgProfile } = useOrganisationProfile();

  // Close mobile sidebar on navigation
  useEffect(() => {
    if (isMobile) setOpenMobile(false);
  }, [location.pathname, isMobile, setOpenMobile]);

  const navSections: NavSection[] = [
    {
      label: "Dashboard",
      icon: LayoutDashboard,
      children: [{ label: "Overview", path: "/admin/dashboard" }]
    },
    {
      label: "Members",
      icon: Users,
      children: [
        {
          label: "Registrations",
          path: "/admin/members/registrations",
          badge:
            pendingRegistrationsCount > 0 ? pendingRegistrationsCount.toString() : undefined
        },
        { label: "Directory Visibility", path: "/admin/members/visibility" },
        { label: "Deleted Members", path: "/admin/members/deleted" }
      ]
    },
    {
      label: "Locations",
      icon: MapPin,
      children: [
        { label: "States", path: "/admin/locations/states" },
        { label: "Cities", path: "/admin/locations/cities" },
        {
          label: "Pending Cities",
          path: "/admin/locations/pending-cities",
          badge: pendingCitiesCount > 0 ? pendingCitiesCount.toString() : undefined
        },
        { label: "Payment Settings", path: "/admin/locations/payment-settings" }
      ]
    },
    {
      label: "Organization",
      icon: Building2,
      children: [
        { label: "Profile", path: "/admin/organization/profile" },
        { label: "Designations", path: "/admin/organization/designations" }
      ]
    },
    {
      label: "Settings",
      icon: Settings,
      children: [
        { label: "Settings Hub", path: "/admin/settings" },
        { label: "Form Configuration", path: "/admin/settings/forms" },
        { label: "Validation Settings", path: "/admin/settings/validation" },
        { label: "Normalization Rules", path: "/admin/settings/normalization" },
        { label: "Date & Time Settings", path: "/admin/settings/datetime" },
        { label: "Theme", path: "/admin/settings/appearance" },
        { label: "AI Settings", path: "/admin/settings/ai" }
      ]
    },
    {
      label: "Administration",
      icon: Shield,
      children: [{ label: "Users", path: "/admin/administration/users" }]
    },
    {
      label: "Analytics",
      icon: BarChart3,
      disabled: true,
      children: [{ label: "Coming Soon", path: "#" }]
    }
  ];

  // Determine which section is active based on current path
  const activeSectionLabel = navSections.find((s) =>
    s.children.some((c) => location.pathname === c.path || location.pathname.startsWith(c.path + "/"))
  )?.label;

  const handleSignOut = async () => {
    await logoutService.logoutAdmin();
  };

  return (
    <Sidebar collapsible="icon" {...props}>
      {/* Header — org logo + name */}
      <SidebarHeader>
        <h1 className="sr-only">Admin Portal</h1>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              onClick={toggleSidebar}
              tooltip="Toggle navigation"
              className="hover:bg-sidebar-accent group/logo-btn cursor-pointer">
              {orgProfile?.organization_logo_url ? (
                <img
                  src={orgProfile.organization_logo_url}
                  alt="Logo"
                  className="size-7 rounded object-contain shrink-0"
                />
              ) : (
                <div className="size-7 rounded bg-primary flex items-center justify-center shrink-0">
                  <span className="text-primary-foreground text-xs font-bold">
                    {(orgProfile?.organization_name ?? "A").charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
              <span className="font-semibold truncate flex-1">
                {orgProfile?.organization_name ?? "Admin Portal"}
              </span>
              <PanelLeftClose className="ml-auto size-4 shrink-0 opacity-0 group-hover/logo-btn:opacity-50 transition-opacity" />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      {/* Navigation */}
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navSections.map((section) => (
                <Collapsible
                  key={section.label}
                  defaultOpen={section.label === activeSectionLabel || !isMobileBreakpoint}
                  className="group/collapsible"
                  disabled={section.disabled}>
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton
                        tooltip={section.label}
                        className={section.disabled ? "opacity-40 cursor-not-allowed" : ""}>
                        <section.icon className="size-4 shrink-0" />
                        <span>{section.label}</span>
                        {!section.disabled && (
                          <ChevronRight className="ml-auto size-3.5 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                        )}
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenuSub>
                        {section.children.map((child) => (
                          <SidebarMenuSubItem key={child.path}>
                            <SidebarMenuSubButton
                              asChild
                              isActive={location.pathname === child.path}>
                              <Link to={child.path}>
                                <span>{child.label}</span>
                                {child.badge && (
                                  <SidebarMenuBadge className="ml-auto bg-destructive text-white rounded-full text-xs px-1.5 py-0.5 min-w-[18px] text-center">
                                    {child.badge}
                                  </SidebarMenuBadge>
                                )}
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </SidebarMenuItem>
                </Collapsible>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* Footer — sign out */}
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={handleSignOut}
              tooltip="Sign Out"
              className="text-muted-foreground hover:text-foreground">
              <LogOut className="size-4" />
              <span>Sign Out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
