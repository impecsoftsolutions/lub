import React, { useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X, LogOut, LayoutDashboard, Shield, User, ChevronDown, Key } from 'lucide-react';
import { organizationProfileService } from '../lib/supabase';
import { useMember } from '../contexts/useMember';
import { logoutService } from '../lib/logoutService';

const Header: React.FC = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isJoinDropdownOpen, setIsJoinDropdownOpen] = useState(false);
  const [orgLogo, setOrgLogo] = useState<string>('');
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [photoError, setPhotoError] = useState(false);
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false);
  const dropdownTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const userDropdownRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const { member, isAuthenticated: isMemberAuthenticated } = useMember();

  useEffect(() => {
    const loadOrgLogo = async () => {
      try {
        const profile = await organizationProfileService.getProfile();
        if (profile?.organization_logo_url) {
          setOrgLogo(profile.organization_logo_url);
        }
      } catch (error) {
        console.error('Error loading organization logo:', error);
        setOrgLogo('');
      }
    };
    loadOrgLogo();
  }, []);

  useEffect(() => {
    const checkIfAdmin = () => {
      if (member && (member.account_type === 'admin' || member.account_type === 'both')) {
        setIsAdminUser(true);
      } else {
        setIsAdminUser(false);
      }
    };
    checkIfAdmin();
  }, [member]);

  useEffect(() => {
    setPhotoError(false);
  }, [member]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userDropdownRef.current && !userDropdownRef.current.contains(event.target as Node)) {
        setIsUserDropdownOpen(false);
      }
    };

    if (isUserDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isUserDropdownOpen]);

  const navLinks = [
    { path: '/', label: 'Home' },
    { path: '/members', label: 'Directory' },
    { path: '/events', label: 'Events' },
    { path: '/news', label: 'News' },
    { path: '/leadership', label: 'Leadership' },
  ];

  const isActiveLink = (path: string) => {
    return location.pathname === path;
  };

  const handleMouseEnter = () => {
    if (dropdownTimeoutRef.current) {
      clearTimeout(dropdownTimeoutRef.current);
      dropdownTimeoutRef.current = null;
    }
    setIsJoinDropdownOpen(true);
  };

  const handleMouseLeave = () => {
    dropdownTimeoutRef.current = setTimeout(() => {
      setIsJoinDropdownOpen(false);
    }, 200);
  };

  const handleLogout = async () => {
    try {
      setIsLoggingOut(true);

      // Close dropdowns before logout
      setIsMobileMenuOpen(false);
      setIsUserDropdownOpen(false);
      setIsAdminUser(false);

      // Use unified logout service
      await logoutService.logoutMember();
    } catch (error) {
      console.error('[Header] Error during logout:', error);
      // logoutService handles redirect even on error
    } finally {
      setIsLoggingOut(false);
    }
  };

  const isMemberApproved = isMemberAuthenticated && member && member.status === 'approved';

  const getFirstName = (fullName: string) => {
    return fullName.split(' ')[0];
  };

  const isAnyUserAuthenticated = isMemberAuthenticated;
  const shouldShowJoinOptions = !isAnyUserAuthenticated || (isMemberAuthenticated && !isMemberApproved);

  return (
    <header className="bg-card border-b-2 border-border sticky top-0 z-50 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <Link to="/" className="flex items-center space-x-3">
            {orgLogo ? (
              <img 
                src={orgLogo} 
                alt="LUB Logo" 
                className="w-10 h-10 object-contain rounded-lg"
              />
            ) : (
              <div className="w-10 h-10 bg-orange-500 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-lg">L</span>
              </div>
            )}
            <span className="text-2xl font-bold text-orange-500">LUB</span>
          </Link>

          <nav className="hidden md:flex items-center space-x-8">
            {navLinks.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                className={`text-sm font-medium transition-colors duration-200 hover:text-primary ${
                  isActiveLink(link.path)
                    ? 'text-primary border-b-2 border-primary pb-1'
                    : 'text-foreground'
                }`}
              >
                {link.label}
              </Link>
            ))}

            {shouldShowJoinOptions && (
              <div
                className="relative"
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
              >
                <button className="text-sm font-medium text-foreground hover:text-primary transition-colors duration-200 flex items-center gap-1">
                  Join
                  <ChevronDown className="w-4 h-4" />
                </button>
                {isJoinDropdownOpen && (
                  <div className="absolute left-0 mt-2 w-48 bg-card rounded-lg shadow-lg border border-border py-2 z-50">
                    <Link
                      to="/membership-benefits"
                      className="block px-4 py-2 text-sm text-foreground hover:bg-muted/50 hover:text-primary transition-colors"
                    >
                      Membership Benefits
                    </Link>
                    <Link
                      to="/signup"
                      className="block px-4 py-2 text-sm text-foreground hover:bg-muted/50 hover:text-primary transition-colors"
                    >
                      Register
                    </Link>
                  </div>
                )}
              </div>
            )}
          </nav>

          <div className="hidden md:flex items-center space-x-4">
            {isAnyUserAuthenticated ? (
              <div className="relative" ref={userDropdownRef}>
                <button
                  onClick={() => setIsUserDropdownOpen(!isUserDropdownOpen)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-muted transition-colors"
                >
                  {member?.profile_photo_url && !photoError ? (
                    <img
                      src={member.profile_photo_url}
                      alt={member.full_name}
                      className="w-8 h-8 rounded-full object-cover"
                      onError={() => setPhotoError(true)}
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-muted border border-border flex items-center justify-center flex-shrink-0">
                      <User className="w-4 h-4 text-muted-foreground" />
                    </div>
                  )}
                  {member && (
                    <span className="text-sm font-medium text-foreground max-w-[120px] truncate">
                      {getFirstName(member.full_name)}
                    </span>
                  )}
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                </button>

                {isUserDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-56 bg-card rounded-lg shadow-lg border border-border py-2 z-50">
                    {member ? (
                      <>
                        <div className="px-4 py-3 border-b border-border">
                          <p className="text-sm font-semibold text-foreground">{member.full_name}</p>
                          <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                        </div>

                        <Link
                          to="/dashboard"
                          onClick={() => setIsUserDropdownOpen(false)}
                          className="flex items-center gap-2 px-4 py-2 text-sm text-foreground hover:bg-muted/50 hover:text-primary transition-colors"
                        >
                          <LayoutDashboard className="w-4 h-4" />
                          Dashboard
                        </Link>

                        <Link
                          to="/dashboard/profile"
                          onClick={() => setIsUserDropdownOpen(false)}
                          className="flex items-center gap-2 px-4 py-2 text-sm text-foreground hover:bg-muted/50 hover:text-primary transition-colors"
                        >
                          <User className="w-4 h-4" />
                          My Profile
                        </Link>

                        <Link
                          to="/dashboard/settings"
                          onClick={() => setIsUserDropdownOpen(false)}
                          className="flex items-center gap-2 px-4 py-2 text-sm text-foreground hover:bg-muted/50 hover:text-primary transition-colors"
                        >
                          <Key className="w-4 h-4" />
                          Settings
                        </Link>

                        {isAdminUser && (
                          <a
                            href="/admin"
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => setIsUserDropdownOpen(false)}
                            className="flex items-center gap-2 px-4 py-2 text-sm text-foreground hover:bg-muted/50 hover:text-primary transition-colors"
                          >
                            <Shield className="w-4 h-4" />
                            Admin Panel
                          </a>
                        )}

                        <button
                          onClick={handleLogout}
                          disabled={isLoggingOut}
                          className="flex items-center gap-2 w-full px-4 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <LogOut className="w-4 h-4" />
                          {isLoggingOut ? 'Logging out...' : 'Logout'}
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="px-4 py-3 border-b border-border">
                          <p className="text-sm font-semibold text-foreground">Signed in</p>
                          <p className="text-xs text-muted-foreground">Registration incomplete</p>
                        </div>

                        <Link
                          to="/join"
                          onClick={() => setIsUserDropdownOpen(false)}
                          className="flex items-center gap-2 px-4 py-2 text-sm text-foreground hover:bg-muted/50 hover:text-primary transition-colors"
                        >
                          <User className="w-4 h-4" />
                          Complete Registration
                        </Link>

                        <button
                          onClick={handleLogout}
                          disabled={isLoggingOut}
                          className="flex items-center gap-2 w-full px-4 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <LogOut className="w-4 h-4" />
                          {isLoggingOut ? 'Logging out...' : 'Logout'}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <Link
                to="/signin"
                className="bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-200"
              >
                Sign In
              </Link>
            )}
          </div>

          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="md:hidden p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
          >
            {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {isMobileMenuOpen && (
          <div className="md:hidden border-t border-border py-4">
            <div className="flex flex-col space-y-3">
              {navLinks.map((link) => (
                <Link
                  key={link.path}
                  to={link.path}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`px-3 py-2 text-base font-medium transition-colors duration-200 ${
                    isActiveLink(link.path)
                      ? 'text-primary bg-primary/10'
                      : 'text-foreground hover:text-primary'
                  }`}
                >
                  {link.label}
                </Link>
              ))}

              {isMemberAuthenticated && isAdminUser && (
                <a
                  href="/admin"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="px-3 py-2 text-base font-medium transition-colors duration-200 flex items-center gap-2 text-foreground hover:text-primary"
                >
                  <Shield className="w-4 h-4" />
                  Admin Panel
                </a>
              )}

              {shouldShowJoinOptions && (
                <>
                  <div className="px-3 py-2 text-base font-medium text-foreground border-t border-border mt-2 pt-4">
                    Join
                  </div>
                  <Link
                    to="/membership-benefits"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`px-6 py-2 text-base font-medium transition-colors duration-200 ${
                      isActiveLink('/membership-benefits')
                        ? 'text-primary bg-primary/10'
                        : 'text-foreground hover:text-primary'
                    }`}
                  >
                    Membership Benefits
                  </Link>
                  <Link
                    to="/signup"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`px-6 py-2 text-base font-medium transition-colors duration-200 ${
                      isActiveLink('/signup')
                        ? 'text-primary bg-primary/10'
                        : 'text-foreground hover:text-primary'
                    }`}
                  >
                    Register
                  </Link>
                </>
              )}

              <div className="flex items-center justify-between pt-3 border-t border-border">
                {isAnyUserAuthenticated ? (
                  <div className="flex flex-col gap-2 w-full">
                    <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 rounded-lg">
                      {member?.profile_photo_url && !photoError ? (
                        <img
                          src={member.profile_photo_url}
                          alt={member.full_name}
                          className="w-8 h-8 rounded-full object-cover"
                          onError={() => setPhotoError(true)}
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-muted border border-border flex items-center justify-center flex-shrink-0">
                          <User className="w-4 h-4 text-muted-foreground" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        {member ? (
                          <>
                            <p className="text-sm font-semibold text-foreground">{member.full_name}</p>
                            <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                          </>
                        ) : (
                          <>
                            <p className="text-sm font-semibold text-foreground">Signed in</p>
                            <p className="text-xs text-muted-foreground">Registration incomplete</p>
                          </>
                        )}
                      </div>
                    </div>
                    {!member && (
                      <Link
                        to="/join"
                        onClick={() => setIsMobileMenuOpen(false)}
                        className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-foreground hover:text-primary transition-colors"
                      >
                        <User className="w-4 h-4" />
                        Complete Registration
                      </Link>
                    )}
                    <button
                      onClick={handleLogout}
                      disabled={isLoggingOut}
                      className="bg-destructive hover:bg-destructive/90 text-destructive-foreground px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-200 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <LogOut className="w-4 h-4" />
                      {isLoggingOut ? 'Logging out...' : 'Logout'}
                    </button>
                  </div>
                ) : (
                  <Link
                    to="/signin"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-200"
                  >
                    Sign In
                  </Link>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </header>
  );
};

export default Header;
