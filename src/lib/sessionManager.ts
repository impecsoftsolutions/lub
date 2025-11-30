import { DEFAULT_SESSION_CONFIG, SessionConfig } from '../types/auth.types';
import { customAuth } from './customAuth';

class SessionManager {
  private config: SessionConfig;
  private refreshIntervalId: number | null = null;
  private activityTimeoutId: number | null = null;
  private lastActivityTime: number = Date.now();

  constructor(config: Partial<SessionConfig> = {}) {
    this.config = { ...DEFAULT_SESSION_CONFIG, ...config };
  }

  saveSession(sessionToken: string, expiresAt: string, userData?: any): void {
    try {
      const sessionData = {
        token: sessionToken,
        expiresAt,
        createdAt: new Date().toISOString(),
      };

      localStorage.setItem(this.config.storageKey, JSON.stringify(sessionData));
      localStorage.setItem(`${this.config.storageKey}_expiry`, expiresAt);

      // Cache user data if provided
      if (userData) {
        localStorage.setItem(`${this.config.storageKey}_user`, JSON.stringify(userData));
        console.log('[SessionManager] Session and user data saved successfully');
      } else {
        console.log('[SessionManager] Session saved successfully');
      }
    } catch (error) {
      console.error('[SessionManager] Error saving session:', error);
    }
  }

  getSessionToken(): string | null {
    try {
      const sessionData = localStorage.getItem(this.config.storageKey);

      if (!sessionData) {
        return null;
      }

      const parsed = JSON.parse(sessionData);
      return parsed.token || null;
    } catch (error) {
      console.error('[SessionManager] Error getting session token:', error);
      return null;
    }
  }

  getUserData(): any | null {
    try {
      // FIXED: Use the correct key with _user suffix
      const userData = localStorage.getItem(`${this.config.storageKey}_user`);

      if (!userData) {
        return null;
      }

      return JSON.parse(userData);
    } catch (error) {
      console.error('[SessionManager] Error getting user data:', error);
      return null;
    }
  }

  saveUserData(userData: any): void {
    try {
      localStorage.setItem(`${this.config.storageKey}_user`, JSON.stringify(userData));
      console.log('[SessionManager] User data saved successfully');
    } catch (error) {
      console.error('[SessionManager] Error saving user data:', error);
    }
  }

  clearUserDataCache(): void {
    try {
      localStorage.removeItem(`${this.config.storageKey}_user`);
      console.log('[SessionManager] User data cache cleared (session token preserved)');
    } catch (error) {
      console.error('[SessionManager] Error clearing user data cache:', error);
    }
  }

  clearSession(): void {
    try {
      localStorage.removeItem(this.config.storageKey);
      localStorage.removeItem(`${this.config.storageKey}_expiry`);
      localStorage.removeItem(`${this.config.storageKey}_user`);
      this.stopSessionRefresh();
      this.stopActivityTracking();

      console.log('[SessionManager] Session cleared');
    } catch (error) {
      console.error('[SessionManager] Error clearing session:', error);
    }
  }

  hasSession(): boolean {
    return this.getSessionToken() !== null;
  }

  getSessionExpiration(): string | null {
    try {
      return localStorage.getItem(`${this.config.storageKey}_expiry`);
    } catch (error) {
      console.error('[SessionManager] Error getting session expiration:', error);
      return null;
    }
  }

  isSessionExpired(): boolean {
    const expiry = this.getSessionExpiration();

    if (!expiry) {
      return true;
    }

    return new Date(expiry) < new Date();
  }

  setupActivityTracking(onActivity: () => void): () => void {
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
    let lastRefresh = Date.now();

    const handleActivity = () => {
      this.lastActivityTime = Date.now();
      const timeSinceLastRefresh = Date.now() - lastRefresh;
      const refreshInterval = this.config.refreshIntervalMinutes * 60 * 1000;

      if (timeSinceLastRefresh >= refreshInterval) {
        lastRefresh = Date.now();
        onActivity();
      }
    };

    const throttledHandler = this.throttle(handleActivity, 1000);

    events.forEach(event => {
      window.addEventListener(event, throttledHandler, { passive: true });
    });

    return () => {
      events.forEach(event => {
        window.removeEventListener(event, throttledHandler);
      });
    };
  }

  startSessionRefresh(): () => void {
    this.stopSessionRefresh();

    const refreshInterval = this.config.refreshIntervalMinutes * 60 * 1000;

    const refresh = async () => {
      const token = this.getSessionToken();

      if (!token) {
        console.log('[SessionManager] No session token, stopping refresh');
        this.stopSessionRefresh();
        return;
      }

      if (this.isSessionExpired()) {
        console.log('[SessionManager] Session expired, clearing');
        this.clearSession();
        this.stopSessionRefresh();
        return;
      }

      const timeSinceLastActivity = Date.now() - this.lastActivityTime;
      const maxInactivity = 10 * 60 * 1000;

      if (timeSinceLastActivity > maxInactivity) {
        console.log('[SessionManager] No recent activity, skipping refresh');
        return;
      }

      const success = await customAuth.refreshSession(token);

      if (success) {
        const newExpiresAt = new Date();
        newExpiresAt.setDate(newExpiresAt.getDate() + this.config.sessionDurationDays);
        localStorage.setItem(`${this.config.storageKey}_expiry`, newExpiresAt.toISOString());
        console.log('[SessionManager] Session refreshed successfully');
      } else {
        console.log('[SessionManager] Session refresh failed');
      }
    };

    this.refreshIntervalId = window.setInterval(refresh, refreshInterval);

    console.log(
      `[SessionManager] Session refresh started (every ${this.config.refreshIntervalMinutes} minutes)`
    );

    return () => {
      this.stopSessionRefresh();
    };
  }

  stopSessionRefresh(): void {
    if (this.refreshIntervalId !== null) {
      clearInterval(this.refreshIntervalId);
      this.refreshIntervalId = null;
      console.log('[SessionManager] Session refresh stopped');
    }
  }

  stopActivityTracking(): void {
    if (this.activityTimeoutId !== null) {
      clearTimeout(this.activityTimeoutId);
      this.activityTimeoutId = null;
    }
  }

  private throttle<T extends (...args: any[]) => void>(
    func: T,
    delay: number
  ): (...args: Parameters<T>) => void {
    let lastCall = 0;

    return (...args: Parameters<T>) => {
      const now = Date.now();

      if (now - lastCall >= delay) {
        lastCall = now;
        func(...args);
      }
    };
  }

  getSessionInfo(): {
    hasSession: boolean;
    token: string | null;
    expiresAt: string | null;
    isExpired: boolean;
    userData: any | null;
  } {
    return {
      hasSession: this.hasSession(),
      token: this.getSessionToken(),
      expiresAt: this.getSessionExpiration(),
      isExpired: this.isSessionExpired(),
      userData: this.getUserData(),
    };
  }

  updateConfig(config: Partial<SessionConfig>): void {
    this.config = { ...this.config, ...config };
    console.log('[SessionManager] Config updated:', this.config);
  }
}

export const sessionManager = new SessionManager();