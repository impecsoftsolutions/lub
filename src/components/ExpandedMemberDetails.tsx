import React, { useState, useEffect } from 'react';
import {
  Phone,
  MapPin,
  ExternalLink,
  Calendar,
  Briefcase,
  FileText,
  User,
  Download
} from 'lucide-react';
import { directoryVisibilityService, DirectoryFieldVisibility } from '../lib/supabase';
import { formatMonthYearValue } from '../lib/dateTimeManager';

interface MemberData {
  id: string;
  full_name: string;
  email: string;
  mobile_number: string;
  company_name: string;
  company_designation_id: string | null;
  company_designations: { designation_name: string } | null;
  company_address: string;
  city: string;
  other_city_name?: string;
  is_custom_city?: boolean;
  district: string;
  state: string;
  products_services: string;
  website?: string;
  member_id?: string;
  profile_photo_url?: string;
  gst_certificate_url?: string;
  udyam_certificate_url?: string;
  payment_proof_url?: string;
  created_at: string;
}

interface UserRole {
  isLoggedIn: boolean;
  isAdmin: boolean;
  isMember: boolean;
}

interface ExpandedMemberDetailsProps {
  member: MemberData;
  userRole: UserRole;
  onClose?: () => void;
}

const SectionCard: React.FC<{
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  className?: string;
}> = ({ icon, title, children, className = '' }) => (
  <div className={`rounded-lg border border-border bg-card p-4 ${className}`}>
    <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
      {icon}
      {title}
    </h3>
    {children}
  </div>
);

const LabelValue: React.FC<{
  label: string;
  children: React.ReactNode;
}> = ({ label, children }) => (
  <div>
    <p className="text-xs font-medium text-muted-foreground">{label}</p>
    <div className="text-sm text-foreground mt-0.5">{children}</div>
  </div>
);

const ExpandedMemberDetails: React.FC<ExpandedMemberDetailsProps> = ({
  member,
  userRole
}) => {
  const [visibilitySettings, setVisibilitySettings] = useState<DirectoryFieldVisibility[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const formatCityDisplay = (city: string, otherCityName?: string, isCustomCity?: boolean): string => {
    if (isCustomCity && otherCityName) {
      return userRole.isAdmin ? `Custom (${otherCityName})` : otherCityName;
    }
    return city || '';
  };

  useEffect(() => {
    loadVisibilitySettings();
  }, []);

  const loadVisibilitySettings = async () => {
    try {
      const settings = await directoryVisibilityService.getAllFieldSettings();
      setVisibilitySettings(settings);
    } catch (error) {
      console.error('Error loading visibility settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const isFieldVisible = (fieldName: string): boolean => {
    if (userRole.isAdmin) return true;

    const setting = visibilitySettings.find(s => s.field_name === fieldName);
    if (!setting) return false;

    if (userRole.isLoggedIn) {
      return setting.show_to_members;
    } else {
      return setting.show_to_public;
    }
  };

  const formatProductsServices = (products: string) => {
    return products.split(',').map(item => item.trim()).filter(Boolean);
  };

  const formatMemberSince = (dateString: string) => {
    return formatMonthYearValue(dateString, { monthStyle: 'long' });
  };

  if (isLoading) {
    return (
      <div className="p-6 bg-muted/30 border-t border-border">
        <div className="flex items-center justify-center gap-3">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary" />
          <span className="text-sm text-muted-foreground">Loading details…</span>
        </div>
      </div>
    );
  }

  const handleDownloadPhoto = async () => {
    if (!member.profile_photo_url) return;
    try {
      const response = await fetch(member.profile_photo_url);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${member.full_name.replace(/\s+/g, '_')}_profile_photo.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading photo:', error);
    }
  };

  const getInitials = (name: string): string => {
    const words = name.trim().split(' ');
    if (words.length >= 2) {
      return (words[0][0] + words[words.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  const showContact = isFieldVisible('phone_number') || isFieldVisible('email') || isFieldVisible('website');
  const showLocation = isFieldVisible('full_address') || isFieldVisible('city') || isFieldVisible('district') || isFieldVisible('state');
  const showBusiness = isFieldVisible('designation') || (isFieldVisible('member_id') && !!member.member_id);
  const showCerts = (isFieldVisible('gst_number') || isFieldVisible('udyam_number')) &&
    (!!member.gst_certificate_url || !!member.udyam_certificate_url);

  return (
    <div className="bg-muted/20 border-t border-border animate-slideDown">
      <div className="p-5 space-y-4">

        {/* Profile Photo — full width */}
        {isFieldVisible('profile_photo') && (
          <SectionCard icon={<User className="w-3.5 h-3.5" />} title="Profile Photo">
            <div className="flex items-start gap-4">
              {member.profile_photo_url ? (
                <>
                  <img
                    src={member.profile_photo_url}
                    alt={`${member.full_name} profile`}
                    className="w-20 h-28 object-cover rounded-lg border border-border shrink-0"
                  />
                  <div className="flex flex-col justify-between h-28">
                    <p className="text-sm text-muted-foreground">Member profile photo</p>
                    <button
                      onClick={handleDownloadPhoto}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary bg-primary/10 rounded-md hover:bg-primary/20 transition-colors w-fit"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download Photo
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-4">
                  <div className="w-20 h-28 bg-muted rounded-lg border border-border flex items-center justify-center shrink-0">
                    <span className="text-lg font-semibold text-muted-foreground">
                      {getInitials(member.full_name)}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">No profile photo available</p>
                </div>
              )}
            </div>
          </SectionCard>
        )}

        {/* Products & Services — full width */}
        {isFieldVisible('products_services') && (
          <SectionCard icon={<Briefcase className="w-3.5 h-3.5" />} title="Products & Services">
            <div className="flex flex-wrap gap-2">
              {formatProductsServices(member.products_services).map((product, index) => (
                <span
                  key={index}
                  className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20"
                >
                  {product}
                </span>
              ))}
            </div>
          </SectionCard>
        )}

        {/* Contact + Business — side by side on md+ */}
        {(showContact || showBusiness) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {showContact && (
              <SectionCard icon={<Phone className="w-3.5 h-3.5" />} title="Contact Information">
                <div className="space-y-3">
                  {isFieldVisible('phone_number') && (
                    <LabelValue label="Mobile Number">
                      <a
                        href={`tel:+91${member.mobile_number}`}
                        onClick={(e) => e.stopPropagation()}
                        className="hover:text-primary transition-colors"
                      >
                        +91 {member.mobile_number}
                      </a>
                    </LabelValue>
                  )}
                  {isFieldVisible('email') && (
                    <LabelValue label="Email">
                      <a
                        href={`mailto:${member.email}`}
                        onClick={(e) => e.stopPropagation()}
                        className="hover:text-primary transition-colors break-all"
                      >
                        {member.email}
                      </a>
                    </LabelValue>
                  )}
                  {isFieldVisible('website') && member.website && (
                    <LabelValue label="Website">
                      <a
                        href={member.website.startsWith('http') ? member.website : `https://${member.website}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-primary hover:text-primary/80 transition-colors inline-flex items-center gap-1 break-all"
                      >
                        {member.website}
                        <ExternalLink className="w-3 h-3 shrink-0" />
                      </a>
                    </LabelValue>
                  )}
                </div>
              </SectionCard>
            )}

            {showBusiness && (
              <SectionCard icon={<Briefcase className="w-3.5 h-3.5" />} title="Business Information">
                <div className="space-y-3">
                  {isFieldVisible('designation') && member.company_designations && (
                    <LabelValue label="Designation">
                      <span>{member.company_designations.designation_name}</span>
                    </LabelValue>
                  )}
                  {isFieldVisible('member_id') && member.member_id && (
                    <LabelValue label="Member ID">
                      <span className="font-mono">{member.member_id}</span>
                    </LabelValue>
                  )}
                </div>
              </SectionCard>
            )}
          </div>
        )}

        {/* Location — full width */}
        {showLocation && (
          <SectionCard icon={<MapPin className="w-3.5 h-3.5" />} title="Location">
            <div className="space-y-3">
              {isFieldVisible('full_address') && (
                <LabelValue label="Company Address">
                  <span>{member.company_address}</span>
                </LabelValue>
              )}
              {(isFieldVisible('city') || isFieldVisible('district') || isFieldVisible('state')) && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pt-1">
                  {isFieldVisible('city') && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">City / Town</p>
                      <p className="text-sm text-foreground mt-0.5">
                        {formatCityDisplay(member.city, member.other_city_name, member.is_custom_city)}
                      </p>
                    </div>
                  )}
                  {isFieldVisible('district') && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">District</p>
                      <p className="text-sm text-foreground mt-0.5">{member.district}</p>
                    </div>
                  )}
                  {isFieldVisible('state') && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">State</p>
                      <p className="text-sm text-foreground mt-0.5">{member.state}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </SectionCard>
        )}

        {/* Certificates — full width */}
        {showCerts && (
          <SectionCard icon={<FileText className="w-3.5 h-3.5" />} title="Certificates">
            <div className="flex flex-wrap gap-2">
              {isFieldVisible('gst_number') && member.gst_certificate_url && (
                <a
                  href={member.gst_certificate_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary bg-primary/10 rounded-md hover:bg-primary/20 transition-colors border border-primary/20"
                >
                  <FileText className="w-3.5 h-3.5" />
                  GST Certificate
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
              {isFieldVisible('udyam_number') && member.udyam_certificate_url && (
                <a
                  href={member.udyam_certificate_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary bg-primary/10 rounded-md hover:bg-primary/20 transition-colors border border-primary/20"
                >
                  <FileText className="w-3.5 h-3.5" />
                  UDYAM Certificate
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </SectionCard>
        )}

        {/* Admin-Only Payment Documents */}
        {userRole.isAdmin && member.payment_proof_url && (
          <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-4">
            <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-700 mb-3">
              <FileText className="w-3.5 h-3.5" />
              Payment Documents
              <span className="ml-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-700 border border-amber-200">
                Admin only
              </span>
            </h3>
            <a
              href={member.payment_proof_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-800 bg-amber-100 rounded-md hover:bg-amber-200 transition-colors border border-amber-200"
            >
              <FileText className="w-3.5 h-3.5" />
              Payment Proof
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        )}

        {/* Member Since — footer row */}
        {isFieldVisible('member_since') && (
          <div className="pt-2 border-t border-border flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <Calendar className="w-3.5 h-3.5" />
            Member since {formatMemberSince(member.created_at)}
          </div>
        )}

      </div>
    </div>
  );
};

export default ExpandedMemberDetails;
