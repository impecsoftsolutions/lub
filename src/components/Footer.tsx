import React from 'react';
import { Link } from 'react-router-dom';
import { organizationProfileService } from '../lib/supabase';

const Footer: React.FC = () => {
  const [orgLogo, setOrgLogo] = React.useState<string>('');

  // Load organization logo
  React.useEffect(() => {
    const loadOrgLogo = async () => {
      try {
        const profile = await organizationProfileService.getProfile();
        if (profile?.organization_logo_url) {
          setOrgLogo(profile.organization_logo_url);
        }
      } catch (error) {
        console.error('Error loading organization logo:', error);
      }
    };
    loadOrgLogo();
  }, []);

  return (
    <footer className="bg-blue-900 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid md:grid-cols-3 gap-8">
          {/* Logo and Description */}
          <div className="space-y-4">
            <div className="flex items-center space-x-3">
              {orgLogo ? (
                <img 
                  src={orgLogo} 
                  alt="LUB Logo" 
                  className="w-10 h-10 object-contain rounded-lg bg-white p-1"
                />
              ) : (
                <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-lg">L</span>
                </div>
              )}
              <span className="text-2xl font-bold">LUB</span>
            </div>
            <p className="text-blue-100 text-sm leading-relaxed">
              Empowering Micro, Small and Medium Enterprises across India through
              comprehensive support and development programs.
            </p>
          </div>

          {/* Quick Links */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Quick Links</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <Link to="/members" className="text-blue-100 hover:text-white transition-colors">
                Directory
              </Link>
              <Link to="/events" className="text-blue-100 hover:text-white transition-colors">
                Events
              </Link>
              <Link to="/news" className="text-blue-100 hover:text-white transition-colors">
                News
              </Link>
              <Link to="/activities" className="text-blue-100 hover:text-white transition-colors">
                Activities
              </Link>
              <Link to="/leadership" className="text-blue-100 hover:text-white transition-colors">
                Leadership
              </Link>
              <Link to="/join" className="text-blue-100 hover:text-white transition-colors">
                Join
              </Link>
            </div>
          </div>

          {/* Contact Info */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Contact</h3>
            <div className="space-y-2 text-sm">
              <p className="text-blue-100">
                Email: contact@lub.org.in
              </p>
              <p className="text-blue-100">
                Website: www.lub.org.in
              </p>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-blue-800 mt-8 pt-6 flex flex-col sm:flex-row justify-between items-center">
          <p className="text-blue-100 text-sm">
            © 2025 Laghu Udyog Bharati India. All rights reserved.
          </p>
          <div className="flex space-x-4 mt-4 sm:mt-0">
            <Link to="/styleguide" className="text-blue-100 hover:text-white text-sm transition-colors">
              Style Guide
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;