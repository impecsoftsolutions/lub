import React, { useState, useEffect } from 'react';
import {
  Phone,
  Mail,
  MapPin,
  Building2,
  Globe,
  ExternalLink,
  Calendar,
  Briefcase,
  FileText,
  User,
  Download
} from 'lucide-react';
import { directoryVisibilityService, DirectoryFieldVisibility } from '../lib/supabase';

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
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  if (isLoading) {
    return (
      <div className="p-6 bg-muted/50 border-t border-border">
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
          <span className="ml-3 text-muted-foreground">Loading details...</span>
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

  return (
    <div className="bg-muted/30 border-t border-border animate-slideDown">
      <div className="p-6 space-y-6">
        {/* Profile Photo */}
        {isFieldVisible('profile_photo') && (
          <div className="bg-card rounded-lg p-4 border border-border">
            <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center">
              <User className="w-4 h-4 mr-2 text-blue-600" />
              Profile Photo
            </h3>
            <div className="flex items-start gap-4">
              {member.profile_photo_url ? (
                <>
                  <img
                    src={member.profile_photo_url}
                    alt={`${member.full_name} profile`}
                    className="w-24 h-32 object-cover rounded-lg border-2 border-border"
                  />
                  <div className="flex-1">
                    <p className="text-sm text-muted-foreground mb-2">
                      Member profile photo
                    </p>
                    <button
                      onClick={handleDownloadPhoto}
                      className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-primary bg-primary/10 rounded-lg hover:bg-primary/20 transition-colors"
                    >
                      <Download className="w-4 h-4 mr-1" />
                      Download Photo
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex items-start gap-4">
                  <div className="w-24 h-32 bg-gradient-to-br from-muted to-muted/60 rounded-lg border-2 border-border flex items-center justify-center">
                    <div className="text-center">
                      <div className="w-16 h-16 bg-card rounded-full flex items-center justify-center mb-2 mx-auto">
                        <span className="text-2xl font-bold text-muted-foreground">
                          {getInitials(member.full_name)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-muted-foreground">
                      No profile photo available
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Products & Services - Always visible if setting allows */}
        {isFieldVisible('products_services') && (
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center">
              <Briefcase className="w-4 h-4 mr-2 text-primary" />
              Products & Services
            </h3>
            <div className="flex flex-wrap gap-2">
              {formatProductsServices(member.products_services).map((product, index) => (
                <span
                  key={index}
                  className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20"
                >
                  {product}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Contact Information Section */}
        {(isFieldVisible('phone_number') || isFieldVisible('email') || isFieldVisible('website')) && (
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center">
              <Phone className="w-4 h-4 mr-2 text-primary" />
              Contact Information
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {isFieldVisible('phone_number') && (
                <div className="flex items-center">
                  <Phone className="w-4 h-4 text-muted-foreground mr-3" />
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Mobile Number</p>
                    <a
                      href={`tel:+91${member.mobile_number}`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-sm text-foreground hover:text-primary"
                    >
                      +91 {member.mobile_number}
                    </a>
                  </div>
                </div>
              )}
              {isFieldVisible('email') && (
                <div className="flex items-center">
                  <Mail className="w-4 h-4 text-muted-foreground mr-3" />
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Email</p>
                    <a
                      href={`mailto:${member.email}`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-sm text-foreground hover:text-primary truncate"
                    >
                      {member.email}
                    </a>
                  </div>
                </div>
              )}
            </div>
            {isFieldVisible('website') && member.website && (
              <div className="flex items-center mt-4">
                <Globe className="w-4 h-4 text-muted-foreground mr-3" />
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Website</p>
                  <a
                    href={member.website.startsWith('http') ? member.website : `https://${member.website}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-sm text-primary hover:text-primary/80 flex items-center"
                  >
                    {member.website}
                    <ExternalLink className="w-3 h-3 ml-1" />
                  </a>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Location Information */}
        {(isFieldVisible('full_address') || isFieldVisible('city') || isFieldVisible('district') || isFieldVisible('state')) && (
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center">
              <MapPin className="w-4 h-4 mr-2 text-primary" />
              Location
            </h3>
            {isFieldVisible('full_address') && (
              <div className="flex items-start mb-3">
                <Building2 className="w-4 h-4 text-muted-foreground mr-3 mt-0.5" />
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Company Address</p>
                  <p className="text-sm text-foreground">{member.company_address}</p>
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {isFieldVisible('city') && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground">City/Town</p>
                  <p className="text-sm text-foreground">{formatCityDisplay(member.city, member.other_city_name, member.is_custom_city)}</p>
                </div>
              )}
              {isFieldVisible('district') && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground">District</p>
                  <p className="text-sm text-foreground">{member.district}</p>
                </div>
              )}
              {isFieldVisible('state') && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground">State</p>
                  <p className="text-sm text-foreground">{member.state}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Business Information */}
        {(isFieldVisible('designation') || (isFieldVisible('member_id') && member.member_id)) && (
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center">
              <Briefcase className="w-4 h-4 mr-2 text-primary" />
              Business Information
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {isFieldVisible('designation') && member.company_designations && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Designation</p>
                  <p className="text-sm text-foreground">{member.company_designations.designation_name}</p>
                </div>
              )}
              {isFieldVisible('member_id') && member.member_id && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Member ID</p>
                  <p className="text-sm text-foreground font-mono">{member.member_id}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Documents Section - Visible to certain users */}
        {(isFieldVisible('gst_number') || isFieldVisible('udyam_number')) &&
         (member.gst_certificate_url || member.udyam_certificate_url) && (
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center">
              <FileText className="w-4 h-4 mr-2 text-primary" />
              Certificates
            </h3>
            <div className="flex flex-wrap gap-2">
              {isFieldVisible('gst_number') && member.gst_certificate_url && (
                <a
                  href={member.gst_certificate_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-primary bg-primary/10 rounded-full hover:bg-primary/20 transition-colors border border-primary/20"
                >
                  <FileText className="w-3 h-3 mr-1" />
                  GST Certificate
                </a>
              )}
              {isFieldVisible('udyam_number') && member.udyam_certificate_url && (
                <a
                  href={member.udyam_certificate_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-green-600 bg-green-50 rounded-full hover:bg-green-100 transition-colors border border-green-200"
                >
                  <FileText className="w-3 h-3 mr-1" />
                  UDYAM Certificate
                </a>
              )}
            </div>
          </div>
        )}

        {/* Admin-Only Documents */}
        {userRole.isAdmin && member.payment_proof_url && (
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center">
              <FileText className="w-4 h-4 mr-2 text-red-600" />
              Admin Only - Payment Documents
            </h3>
            <div className="flex flex-wrap gap-2">
              <a
                href={member.payment_proof_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-amber-600 bg-amber-50 rounded-full hover:bg-amber-100 transition-colors border border-amber-200"
              >
                <FileText className="w-3 h-3 mr-1" />
                Payment Proof
              </a>
            </div>
          </div>
        )}

        {/* Member Since */}
        {isFieldVisible('member_since') && (
          <div className="pt-4 border-t border-border text-center">
            <div className="flex items-center justify-center text-xs text-muted-foreground">
              <Calendar className="w-3 h-3 mr-1" />
              Member since {formatMemberSince(member.created_at)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ExpandedMemberDetails;
