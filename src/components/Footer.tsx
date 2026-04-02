import React from 'react';
import { Link } from 'react-router-dom';
import { useOrganisationProfile } from '../hooks/useOrganisationProfile';

const Footer: React.FC = () => {
  const { profile } = useOrganisationProfile();

  const orgName = profile?.organization_name ?? 'LUB';
  const orgEmail = profile?.email_address ?? 'contact@lub.org.in';
  const orgWebsite = profile?.organization_website ?? 'www.lub.org.in';
  const orgLogo = profile?.organization_logo_url ?? '';
  const currentYear = new Date().getFullYear();

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
                  alt={`${orgName} Logo`}
                  className="w-10 h-10 object-contain rounded-lg bg-white p-1"
                />
              ) : (
                <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-lg">L</span>
                </div>
              )}
              <span className="text-2xl font-bold">{orgName}</span>
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
                Email: {orgEmail}
              </p>
              <p className="text-blue-100">
                Website: {orgWebsite}
              </p>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-blue-800 mt-8 pt-6 flex flex-col sm:flex-row justify-between items-center">
          <p className="text-blue-100 text-sm">
            © {currentYear} {orgName}. All rights reserved.
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
