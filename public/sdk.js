/**
 * ViaAuthSDK
 * Unified Ecosystem Authentication SDK
 * 
 * Handles Passport authentication, ecosystem_uid propagation, intent-aware routing,
 * and session continuity across the Via Ecosystem.
 */

export class ViaAuthSDK {
  constructor(config = {}) {
    this.passportUrl = config.passportUrl || 'https://aporaksha.com';
    this.appId = config.appId || 'unknown_app';
    
    // In browser context, extract intent and restore parameters
    if (typeof window !== 'undefined') {
      this.initFromUrl();
    }
  }

  // --- Environment & Intent ---
  
  initFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const ecosystem_uid = params.get('ecosystem_uid');
    const session = params.get('session');
    const intent = params.get('intent');
    const restore = params.get('restore');

    if (ecosystem_uid) {
      this.setEcosystemUid(ecosystem_uid);
    }
    if (session) {
      localStorage.setItem('via_session_id', session);
    }
    if (intent) {
      this.handleIntent(intent, restore);
    }
  }

  handleIntent(intent, restoreState) {
    console.log(`[ViaAuth] Intent received: ${intent}, restore: ${restoreState}`);
    // Apps can override this or listen to an event
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('via-intent', { detail: { intent, restoreState } }));
    }
  }

  // --- Token Management ---

  getAccessToken() {
    return localStorage.getItem('via_access_token') || localStorage.getItem('aporaksha_access');
  }

  getRefreshToken() {
    return localStorage.getItem('via_refresh_token') || localStorage.getItem('aporaksha_refresh');
  }

  setTokens(accessToken, refreshToken) {
    localStorage.setItem('via_access_token', accessToken);
    if (refreshToken) {
      localStorage.setItem('via_refresh_token', refreshToken);
    }
  }

  setEcosystemUid(uid) {
    localStorage.setItem('ecosystem_uid', uid);
  }

  getEcosystemUid() {
    return localStorage.getItem('ecosystem_uid');
  }

  clearTokens() {
    localStorage.removeItem('via_access_token');
    localStorage.removeItem('via_refresh_token');
    localStorage.removeItem('aporaksha_access');
    localStorage.removeItem('aporaksha_refresh');
    localStorage.removeItem('ecosystem_uid');
    localStorage.removeItem('via_session_id');
  }

  // --- API Methods ---

  async validateSession() {
    const token = this.getAccessToken();
    if (!token) return { valid: false };

    try {
      const res = await fetch(`${this.passportUrl}/api/auth`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ action: 'validate' })
      });
      
      if (!res.ok) throw new Error('Validation request failed');
      const data = await res.json();
      return data;
    } catch (e) {
      console.error('[ViaAuth] Session validation error:', e);
      return { valid: false };
    }
  }

  async refreshToken() {
    const refresh = this.getRefreshToken();
    if (!refresh) return null;

    try {
      const res = await fetch(`${this.passportUrl}/api/auth`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action: 'refresh', refreshToken: refresh })
      });
      
      if (!res.ok) throw new Error('Refresh request failed');
      const data = await res.json();
      
      if (data.accessToken) {
        this.setTokens(data.accessToken, data.refreshToken);
        this.setEcosystemUid(data.ecosystem_uid);
        return data;
      }
      return null;
    } catch (e) {
      console.error('[ViaAuth] Token refresh error:', e);
      return null;
    }
  }

  async fetchIdentity() {
    const token = this.getAccessToken();
    if (!token) return null;

    try {
      const res = await fetch(`${this.passportUrl}/api/auth`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ action: 'introspect' })
      });
      
      if (!res.ok) throw new Error('Introspect failed');
      const data = await res.json();
      return data.active ? data : null;
    } catch (e) {
      console.error('[ViaAuth] Identity fetch error:', e);
      return null;
    }
  }

  async logout() {
    const token = this.getAccessToken();
    this.clearTokens();
    
    if (token) {
      try {
        await fetch(`${this.passportUrl}/api/auth`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ action: 'logout' })
        });
      } catch (e) {
        console.warn('[ViaAuth] Logout API call failed, but local tokens cleared.');
      }
    }
    
    // Dispatch global logout event
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('via-logout'));
    }
  }

  // --- Cross-App Navigation ---

  redirectToApp(targetUrl, intent = null, restore = null) {
    const url = new URL(targetUrl);
    const uid = this.getEcosystemUid();
    const session = localStorage.getItem('via_session_id');
    
    if (uid) url.searchParams.set('ecosystem_uid', uid);
    if (session) url.searchParams.set('session', session);
    if (intent) url.searchParams.set('intent', intent);
    if (restore) url.searchParams.set('restore', restore);
    
    // In a real environment with secure cookies or short-lived transfer tokens,
    // we would pass a one-time session transfer token here.
    // For now, we rely on the uid to map session at the target.

    window.location.href = url.toString();
  }

  redirectToPassportLogin(returnUrl) {
    const url = new URL(`${this.passportUrl}/passport/index.html`);
    url.searchParams.set('redirect', returnUrl || window.location.href);
    window.location.href = url.toString();
  }
}

// Export a singleton instance with default configuration
export const viaAuth = new ViaAuthSDK();
