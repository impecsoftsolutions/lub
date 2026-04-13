import React, { useCallback, useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft, 
  Building2, 
  MapPin, 
  Phone, 
  Mail, 
  Globe, 
  FileText, 
  ExternalLink,
  User,
  Eye,
  EyeOff,
  AlertCircle
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { customAuth } from '../lib/customAuth';

interface MemberData {
  id: string;
  full_name: string;
  email: string;
  mobile_number: string;
  company_name: string;
  company_designation_id: string;
  company_designations: { designation_name: string };
  company_address: string;
  city: string;
  other_city_name?: string;
  is_custom_city?: boolean;
  district: string;
  state: string;
  products_services: string;
  website?: string;
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

const MemberProfile: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [member, setMember] = useState<MemberData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [userRole, setUserRole] = useState<UserRole>({
    isLoggedIn: false,
    isAdmin: false,
    isMember: false
  });

  const checkUserRole = useCallback(async () => {
    try {
      const user = await customAuth.getCurrentUserFromSession();
      if (user) {
        const isAdmin = user.account_type === 'admin' || user.account_type === 'both';
        setUserRole({
          isLoggedIn: true,
          isAdmin,
          isMember: true
        });
      } else {
        setUserRole({
          isLoggedIn: false,
          isAdmin: false,
          isMember: false
        });
      }
    } catch (error) {
      console.error('Error checking user role:', error);
    }
  }, []);

  const loadMemberProfile = useCallback(async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('member_registrations')
        .select(`
          id,
          full_name,
          email,
          mobile_number,
          company_name,
         company_designation_id,
         company_designations!inner(designation_name),
          company_address,
          city,
          other_city_name,
          is_custom_city,
          district,
          state,
          products_services,
          website,
          gst_certificate_url,
          udyam_certificate_url,
          payment_proof_url,
          created_at
        `)
        .eq('id', id)
        .eq('status', 'approved')
        .maybeSingle();

      if (error) {
        console.error('Error loading member:', error);
        setNotFound(true);
      } else {
        setMember(data);
        // Set page title
        document.title = `${data.full_name} - LUB Member Directory`;
      }
    } catch (error) {
      console.error('Error loading member profile:', error);
      setNotFound(true);
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) {
      void checkUserRole();
      void loadMemberProfile();
    }
  }, [checkUserRole, id, loadMemberProfile]);

  const formatProductsServices = (products: string) => {
    return products.split(',').map(item => item.trim()).filter(Boolean);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen py-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading member profile...</p>
          </div>
        </div>
      </div>
    );
  }

  if (notFound || !member) {
    return (
      <div className="min-h-screen py-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center py-12">
            <AlertCircle className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h1 className="text-xl font-semibold text-foreground mb-2">Member Not Found</h1>
            <p className="text-muted-foreground mb-6">
              The member profile you're looking for doesn't exist or is not approved yet.
            </p>
            <Link
              to="/members"
              className="inline-flex items-center px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Directory
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Back Button */}
        <div className="mb-6">
          <Link
            to="/members"
            className="inline-flex items-center text-primary hover:text-primary/80 font-medium transition-colors"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Directory
          </Link>
        </div>

        {/* Member Profile Card */}
        <div className="bg-card rounded-lg shadow-sm border border-border overflow-hidden">
          {/* Header Section */}
          <div className="border-b border-border px-8 py-6 bg-card">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center mb-2 text-foreground">
                  <User className="w-7 h-7 mr-3 text-primary" />
                  <h1 className="text-xl font-semibold text-foreground">{member.full_name}</h1>
                </div>
                <div className="flex items-center text-muted-foreground mb-2">
                  <Building2 className="w-5 h-5 mr-2 text-primary" />
                  <span className="text-section font-semibold text-foreground">{member.company_name}</span>
                </div>
                {member.company_designations && (
                  <p className="text-sm text-muted-foreground">{member.company_designations.designation_name}</p>
                )}
                <div className="flex items-center text-sm text-muted-foreground mt-2">
                  <MapPin className="w-4 h-4 mr-2 text-primary" />
                  <span>{member.district}, {member.state}</span>
                </div>
              </div>
              
              {/* Role Indicator */}
              <div className="text-right">
                <div className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary">
                  {userRole.isAdmin ? (
                    <>
                      <Eye className="w-4 h-4 mr-1" />
                      Admin View
                    </>
                  ) : userRole.isLoggedIn ? (
                    <>
                      <Eye className="w-4 h-4 mr-1" />
                      Member View
                    </>
                  ) : (
                    <>
                      <EyeOff className="w-4 h-4 mr-1" />
                      Public View
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Content Sections */}
          <div className="p-8 space-y-8">
            {/* Products & Services */}
            <section>
              <h2 className="text-section font-semibold text-foreground mb-4 flex items-center">
                <Building2 className="w-5 h-5 mr-2 text-primary" />
                Products & Services
              </h2>
              <div className="bg-muted/50 rounded-lg p-4">
                <div className="flex flex-wrap gap-2">
                  {formatProductsServices(member.products_services).map((product, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-primary/10 text-primary"
                    >
                      {product}
                    </span>
                  ))}
                </div>
              </div>
            </section>

            {/* Contact Information - Role-based visibility */}
            {userRole.isLoggedIn ? (
              <section>
                <h2 className="text-section font-semibold text-foreground mb-4 flex items-center">
                  <Phone className="w-5 h-5 mr-2 text-primary" />
                  Contact Information
                </h2>
                <div className="bg-muted/50 rounded-lg p-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="flex items-center">
                      <Phone className="w-5 h-5 text-muted-foreground mr-3" />
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Mobile Number</p>
                        <p className="text-foreground">+91 {member.mobile_number}</p>
                      </div>
                    </div>
                    <div className="flex items-center">
                      <Mail className="w-5 h-5 text-muted-foreground mr-3" />
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Email</p>
                        <p className="text-foreground">{member.email}</p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6">
                    <div className="flex items-start">
                      <MapPin className="w-5 h-5 text-muted-foreground mr-3 mt-1" />
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Company Address</p>
                        <p className="text-foreground">{member.company_address}</p>
                        <p className="text-muted-foreground">{member.is_custom_city && member.other_city_name ? member.other_city_name : member.city}, {member.district}, {member.state}</p>
                      </div>
                    </div>
                  </div>

                  {member.website && (
                    <div className="mt-6">
                      <div className="flex items-center">
                        <Globe className="w-5 h-5 text-muted-foreground mr-3" />
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Website</p>
                          <a
                            href={`https://${member.website}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:text-primary/80 flex items-center"
                          >
                            {member.website}
                            <ExternalLink className="w-4 h-4 ml-1" />
                          </a>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </section>
            ) : (
              /* Public View - Contact Hidden */
              <section>
                <h2 className="text-section font-semibold text-foreground mb-4 flex items-center">
                  <EyeOff className="w-5 h-5 mr-2 text-muted-foreground" />
                  Contact Information
                </h2>
                <div className="bg-muted/50 rounded-lg p-6 text-center">
                  <EyeOff className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-section font-semibold text-foreground mb-2">Contact Details Hidden</h3>
                  <p className="text-muted-foreground mb-4">
                    Sign in to your LUB member account to view contact information
                  </p>
                  <Link
                    to="/signin"
                    className="inline-flex items-center px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
                  >
                    Sign In to View Details
                  </Link>
                </div>
              </section>
            )}

            {/* Admin-only Documents */}
            {userRole.isAdmin && (
              <section>
                <h2 className="text-section font-semibold text-foreground mb-4 flex items-center">
                  <FileText className="w-5 h-5 mr-2 text-primary" />
                  Documents (Admin Only)
                </h2>
                <div className="bg-muted/50 rounded-lg p-6">
                  <div className="flex flex-wrap gap-3">
                    {member.gst_certificate_url && (
                      <a
                        href={member.gst_certificate_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center px-4 py-2 text-sm font-medium text-primary bg-primary/10 border border-primary/20 rounded-lg hover:bg-primary/20 transition-colors"
                      >
                        <FileText className="w-4 h-4 mr-2" />
                        GST Certificate
                        <ExternalLink className="w-4 h-4 ml-2" />
                      </a>
                    )}
                    {member.udyam_certificate_url && (
                      <a
                        href={member.udyam_certificate_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center px-4 py-2 text-sm font-medium text-primary bg-primary/10 border border-primary/20 rounded-lg hover:bg-primary/20 transition-colors"
                      >
                        <FileText className="w-4 h-4 mr-2" />
                        UDYAM Certificate
                        <ExternalLink className="w-4 h-4 ml-2" />
                      </a>
                    )}
                    {member.payment_proof_url && (
                      <a
                        href={member.payment_proof_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center px-4 py-2 text-sm font-medium text-primary bg-primary/10 border border-primary/20 rounded-lg hover:bg-primary/20 transition-colors"
                      >
                        <FileText className="w-4 h-4 mr-2" />
                        Payment Proof
                        <ExternalLink className="w-4 h-4 ml-2" />
                      </a>
                    )}
                  </div>
                  {!member.gst_certificate_url && !member.udyam_certificate_url && !member.payment_proof_url && (
                    <p className="text-muted-foreground text-center">No documents available</p>
                  )}
                </div>
              </section>
            )}

            {/* Member Since */}
            <section>
              <div className="text-center py-4 border-t border-border">
                <p className="text-sm text-muted-foreground">
                  LUB Member since {new Date(member.created_at).toLocaleDateString('en-IN', {
                    year: 'numeric',
                    month: 'long'
                  })}
                </p>
              </div>
            </section>
          </div>
        </div>

        {/* Back to Directory Button */}
        <div className="mt-8 text-center">
          <Link
            to="/members"
            className="inline-flex items-center px-6 py-3 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Directory
          </Link>
        </div>
      </div>
    </div>
  );
};

export default MemberProfile;
