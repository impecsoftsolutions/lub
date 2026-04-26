import React, { useCallback, useEffect, useState } from 'react';
import {
  Upload,
  Save,
  Building2,
  Phone,
  Globe,
  Plus,
  Trash2,
  AlertCircle,
  Lock
} from 'lucide-react';
import { PermissionGate } from '../components/permissions/PermissionGate';
import { useHasPermission } from '../hooks/usePermissions';
import { organizationProfileService, OrganizationProfile, SocialMediaHandle, fileUploadService } from '../lib/supabase';
import Toast from '../components/Toast';
import { PageHeader } from '../components/ui/PageHeader';

const AdminProfileSettings: React.FC = () => {
  const [organizationProfile, setOrganizationProfile] = useState<OrganizationProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [toast, setToast] = useState<{
    type: 'success' | 'error';
    message: string;
    isVisible: boolean;
  }>({
    type: 'success',
    message: '',
    isVisible: false
  });

  const canEditProfile = useHasPermission('organization.profile.edit');

  const loadOrganizationProfile = useCallback(async () => {
    try {
      setIsLoading(true);
      const profile = await organizationProfileService.getProfile();
      setOrganizationProfile(profile);
    } catch (error) {
      console.error('Error loading organization profile:', error);
      showToast('error', 'Failed to load organization profile');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrganizationProfile();
  }, [loadOrganizationProfile]);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message, isVisible: true });
  };

  const hideToast = () => {
    setToast(prev => ({ ...prev, isVisible: false }));
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setOrganizationProfile(prev => prev ? {
      ...prev,
      [name]: value
    } : null);
  };

  const handleLogoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setLogoFile(file);
  };

  const handleSocialMediaChange = (index: number, field: keyof SocialMediaHandle, value: string) => {
    setOrganizationProfile(prev => {
      if (!prev) return null;
      const updatedHandles = [...prev.social_media_handles];
      updatedHandles[index] = {
        ...updatedHandles[index],
        [field]: value
      };
      return {
        ...prev,
        social_media_handles: updatedHandles
      };
    });
  };

  const addSocialMediaHandle = () => {
    setOrganizationProfile(prev => {
      if (!prev) return null;
      return {
        ...prev,
        social_media_handles: [
          ...prev.social_media_handles,
          { platform: '', url: '', username: '' }
        ]
      };
    });
  };

  const removeSocialMediaHandle = (index: number) => {
    setOrganizationProfile(prev => {
      if (!prev) return null;
      const updatedHandles = prev.social_media_handles.filter((_, i) => i !== index);
      return {
        ...prev,
        social_media_handles: updatedHandles
      };
    });
  };

  const handleEditToggle = () => {
    if (isEditing) {
      // Cancel editing - reload profile to discard changes
      loadOrganizationProfile();
      setLogoFile(null);
    }
    setIsEditing(!isEditing);
  };

  const handleSaveProfile = async () => {
    if (!organizationProfile) return;

    try {
      setIsSaving(true);
      const updatedProfile = { ...organizationProfile };

      // Upload new logo if selected
      if (logoFile) {
        const fileName = `org-logo-${Date.now()}.${logoFile.name.split('.').pop()}`;
        const logoUrl = await fileUploadService.uploadFile(logoFile, fileName);
        
        if (logoUrl) {
          updatedProfile.organization_logo_url = logoUrl;
        } else {
          throw new Error('Failed to upload organization logo');
        }
      }

      const result = await organizationProfileService.updateProfile(updatedProfile);
      
      if (result) {
        setOrganizationProfile(result);
        setLogoFile(null);
        setIsEditing(false);
        showToast('success', 'Organization profile updated successfully');
      } else {
        throw new Error('Failed to update profile');
      }
    } catch (error) {
      console.error('Error saving profile:', error);
      showToast('error', 'Failed to save organization profile');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <PermissionGate
      permission="organization.profile.view"
      fallback={
        <div className="py-8">
          <div className="max-w-7xl mx-auto py-8 text-center">
            <Lock className="w-16 h-16 text-muted-foreground/50 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-foreground mb-2">Access Denied</h2>
            <p className="text-muted-foreground">You don't have permission to view organization profile.</p>
          </div>
        </div>
      }
    >
    <div>
      <Toast
        type={toast.type}
        message={toast.message}
        isVisible={toast.isVisible}
        onClose={hideToast}
      />

      <div>
        <PageHeader
          title="Organization Profile Settings"
          subtitle="Manage your organization's public profile information"
          actions={canEditProfile ? (
            <>
              {isEditing && (
                <button
                  onClick={handleEditToggle}
                  disabled={isSaving}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-card border border-border text-foreground text-sm font-medium rounded-md hover:bg-muted/50 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
              )}
              <button
                onClick={isEditing ? handleSaveProfile : handleEditToggle}
                disabled={isSaving || isLoading}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-md transition-colors ${
                  isSaving || isLoading
                    ? 'bg-muted text-muted-foreground cursor-not-allowed'
                    : isEditing
                    ? 'bg-primary hover:bg-primary/90 text-primary-foreground'
                    : 'bg-primary hover:bg-primary/90 text-primary-foreground'
                }`}
              >
                <Save className="w-4 h-4" />
                {isSaving ? 'Saving...' : isEditing ? 'Save Changes' : 'Edit Profile'}
              </button>
            </>
          ) : undefined}
        />

        {isLoading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading organization profile...</p>
          </div>
        ) : organizationProfile ? (
          <div className="space-y-8">
            {/* Basic Information */}
            <div className="bg-card rounded-lg shadow-sm border border-border p-8">
              <h2 className="text-section font-semibold text-foreground mb-6 flex items-center">
                <Building2 className="w-5 h-5 mr-2 text-primary" />
                Basic Information
              </h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Organization Name
                  </label>
                  <input
                    type="text"
                    name="organization_name"
                    value={organizationProfile.organization_name}
                    onChange={handleInputChange}
                    disabled={!isEditing || !canEditProfile}
                    className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring disabled:bg-muted/50"
                  />
                </div>
              </div>
            </div>

            {/* Logo Section */}
            <div className="bg-card rounded-lg shadow-sm border border-border p-8">
              <h2 className="text-section font-semibold text-foreground mb-6">Organization Logo</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Current Logo
                  </label>
                  <div className="border border-border rounded-lg p-4">
                    <img 
                      src={organizationProfile.organization_logo_url} 
                      alt="Organization Logo" 
                      className="w-32 h-32 object-contain rounded-lg mx-auto bg-card"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Upload New Logo
                  </label>
                  <div className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                    isEditing 
                      ? 'border-border hover:border-primary cursor-pointer'
                      : 'border-border bg-muted/50 cursor-not-allowed'
                  }`}>
                    <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                    {isEditing && canEditProfile && (
                      <input
                        type="file"
                        onChange={handleLogoFileChange}
                        accept="image/*"
                        disabled={!isEditing || !canEditProfile}
                      className="hidden"
                      id="logo-upload"
                      />
                    )}
                    <label htmlFor="logo-upload" className={isEditing && canEditProfile ? 'cursor-pointer' : 'cursor-not-allowed'}>
                      <span className={`font-medium ${isEditing && canEditProfile ? 'text-primary' : 'text-muted-foreground'}`}>
                        {isEditing && canEditProfile ? 'Click to upload organization logo' : 'Enable editing to upload logo'}
                      </span>
                      <p className="text-sm text-muted-foreground mt-1">
                        {isEditing && canEditProfile ? 'PNG, JPG, JPEG up to 10MB' : 'Click Edit Profile to enable file upload'}
                      </p>
                    </label>
                    {logoFile && (
                      <p className="text-sm text-primary mt-2">Selected: {logoFile.name}</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Contact Information */}
            <div className="bg-card rounded-lg shadow-sm border border-border p-8">
              <h2 className="text-section font-semibold text-foreground mb-6 flex items-center">
                <Phone className="w-5 h-5 mr-2 text-primary" />
                Contact Information
              </h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Contact Number
                  </label>
                  <input
                    type="tel"
                    name="contact_number"
                    value={organizationProfile.contact_number}
                    onChange={handleInputChange}
                    disabled={!isEditing || !canEditProfile}
                    className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring disabled:bg-muted/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Email Address
                  </label>
                  <input
                    type="email"
                    name="email_address"
                    value={organizationProfile.email_address}
                    onChange={handleInputChange}
                    disabled={!isEditing || !canEditProfile}
                    className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring disabled:bg-muted/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Website
                  </label>
                  <input
                    type="url"
                    name="organization_website"
                    value={organizationProfile.organization_website ?? ''}
                    onChange={handleInputChange}
                    disabled={!isEditing || !canEditProfile}
                    placeholder="https://www.example.org"
                    className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring disabled:bg-muted/50"
                  />
                </div>
              </div>

              <div className="mt-6">
                <label className="block text-sm font-medium text-foreground mb-2">
                  Address
                </label>
                <textarea
                  name="address"
                  value={organizationProfile.address}
                  onChange={handleInputChange}
                  disabled={!isEditing || !canEditProfile}
                  rows={3}
                  className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring disabled:bg-muted/50"
                />
              </div>
            </div>

            {/* Social Media Handles */}
            <div className="bg-card rounded-lg shadow-sm border border-border p-8">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-section font-semibold text-foreground flex items-center">
                  <Globe className="w-5 h-5 mr-2 text-primary" />
                  Social Media Handles
                </h2>
                {isEditing && canEditProfile && (
                  <button
                    onClick={addSocialMediaHandle}
                    className="inline-flex items-center px-3 py-2 text-sm font-medium text-primary bg-primary/10 rounded-lg hover:bg-primary/20 transition-colors"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Add Social Media
                  </button>
                )}
              </div>
              
              {organizationProfile.social_media_handles.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Globe className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                  <p>No social media handles added yet</p>
                  {isEditing && canEditProfile && (
                    <button
                      onClick={addSocialMediaHandle}
                      className="mt-2 text-primary hover:text-primary font-medium"
                    >
                      Add your first social media handle
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {organizationProfile.social_media_handles.map((handle, index) => (
                    <div key={index} className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 border border-border rounded-lg">
                      <div>
                        <label className="block text-sm font-medium text-foreground mb-1">
                          Platform
                        </label>
                        <select
                          value={handle.platform}
                          onChange={(e) => handleSocialMediaChange(index, 'platform', e.target.value)}
                          disabled={!isEditing || !canEditProfile}
                          className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring disabled:bg-muted/50"
                        >
                          <option value="">Select Platform</option>
                          <option value="facebook">Facebook</option>
                          <option value="twitter">Twitter</option>
                          <option value="instagram">Instagram</option>
                          <option value="linkedin">LinkedIn</option>
                          <option value="youtube">YouTube</option>
                          <option value="whatsapp">WhatsApp</option>
                          <option value="telegram">Telegram</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-foreground mb-1">
                          URL
                        </label>
                        <input
                          type="url"
                          value={handle.url}
                          onChange={(e) => handleSocialMediaChange(index, 'url', e.target.value)}
                          disabled={!isEditing || !canEditProfile}
                          placeholder="https://..."
                          className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring disabled:bg-muted/50"
                        />
                      </div>
                      <div className="flex items-end">
                        {isEditing && canEditProfile && (
                          <button
                            onClick={() => removeSocialMediaHandle(index)}
                            className="w-full px-3 py-2 text-sm font-medium text-destructive bg-destructive/5 rounded-lg hover:bg-destructive/10 transition-colors flex items-center justify-center"
                          >
                            <Trash2 className="w-4 h-4 mr-1" />
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="text-center py-12">
            <AlertCircle className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="text-sm font-medium text-foreground mb-2">No Organization Profile Found</h3>
            <p className="text-muted-foreground">Organization profile will be created when you save for the first time.</p>
          </div>
        )}
      </div>
    </div>
    </PermissionGate>
  );
};

export default AdminProfileSettings;


