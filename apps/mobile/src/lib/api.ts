import {API_URL} from './config';
import {getAccessToken, getTokens, saveTokens, clearTokens} from './auth';
import {useAuthStore} from './store';

async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  return {
    'Content-Type': 'application/json',
    ...(token && {Authorization: `Bearer ${token}`}),
  };
}

// Try to refresh the access token using the refresh token
async function tryRefresh(): Promise<boolean> {
  const tokens = await getTokens();
  if (!tokens?.refreshToken) return false;

  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({refresh_token: tokens.refreshToken}),
    });

    if (!res.ok) return false;

    const data = await res.json();
    await saveTokens({
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
    });
    return true;
  } catch {
    return false;
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = await getAuthHeaders();
  let res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {...headers, ...options.headers},
  });

  // Auto-refresh on 401
  if (res.status === 401) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      const newHeaders = await getAuthHeaders();
      res = await fetch(`${API_URL}${path}`, {
        ...options,
        headers: {...newHeaders, ...options.headers},
      });
    }

    if (res.status === 401) {
      // Refresh failed — sign out
      await clearTokens();
      useAuthStore.getState().setAuthenticated(false);
      useAuthStore.getState().setProfile(null);
      throw new Error('Session expired. Please sign in again.');
    }
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({message: 'Request failed'}));
    throw new Error(error.message || `HTTP ${res.status}`);
  }

  return res.json();
}

export const api = {
  // Auth - OTP Flow
  sendOTP: async (email: string) => {
    const res = await fetch(`${API_URL}/auth/send-otp`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({email}),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Failed to send code');
    return {isNewUser: data.is_new_user};
  },

  verifyOTP: async (email: string, code: string) => {
    const res = await fetch(`${API_URL}/auth/verify-otp`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({email, code}),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Invalid code');
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      user: data.user,
      isNewUser: data.is_new_user,
    };
  },

  appleSignIn: async (credentials: {
    identityToken: string;
    authorizationCode: string;
    fullName?: {givenName?: string | null; familyName?: string | null} | null;
    email?: string | null;
  }) => {
    const res = await fetch(`${API_URL}/auth/apple`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(credentials),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Apple Sign In failed');
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      user: data.user,
      isNewUser: data.is_new_user,
    };
  },

  // Legacy password auth (keep for migration)
  signup: async (email: string, password: string, name?: string) => {
    const res = await fetch(`${API_URL}/auth/signup`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({email, password, name}),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Signup failed');
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      user: data.user,
    };
  },

  login: async (email: string, password: string) => {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({email, password}),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Login failed');
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      user: data.user,
    };
  },

  logout: async () => {
    try {
      await request('/auth/logout', {method: 'POST'});
    } catch {
      // Logout best-effort — always clear local tokens
    }
    await clearTokens();
  },

  // User
  deleteAccount: async () => {
    await request('/user/me', {method: 'DELETE'});
    await clearTokens();
  },
  getMe: () => request<any>('/user/me'),
  updateMe: (data: Record<string, any>) =>
    request<any>('/user/me', {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  getUsage: () => request<any>('/user/usage'),

  // Agent
  sendMessage: (text: string) =>
    request<any>('/agent/message', {
      method: 'POST',
      body: JSON.stringify({text}),
    }),
  getAgentStatus: () => request<any>('/agent/status'),
  getAgentHealth: () => request<any>('/agent/health'),
  updatePersonality: (data: {displayName?: string; voice?: string}) =>
    request<any>('/agent/personality', {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  // Voice
  transcribe: async (audioFormData: FormData) => {
    const token = await getAccessToken();
    return fetch(`${API_URL}/voice/transcribe`, {
      method: 'POST',
      headers: token ? {Authorization: `Bearer ${token}`} : {},
      body: audioFormData,
    }).then(res => res.json());
  },

  // Billing
  verifyReceipt: (receiptData: string, productId: string) =>
    request<any>('/billing/verify', {
      method: 'POST',
      body: JSON.stringify({receiptData, productId}),
    }),
  getBillingStatus: () => request<any>('/billing/status'),

  // Chat
  getRecentMessages: () => request<any>('/chat/recent'),
  getSessions: () => request<any>('/chat/sessions'),
  getSession: (id: string) => request<any>(`/chat/sessions/${id}`),
  createSession: () =>
    request<any>('/chat/sessions', {method: 'POST'}),
  updateSession: (id: string, data: {messages?: any[]; title?: string}) =>
    request<any>(`/chat/sessions/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteSession: (id: string) =>
    request<any>(`/chat/sessions/${id}`, {method: 'DELETE'}),

  // Automation
  checkAutomation: () =>
    request<any>('/automation/check', {method: 'POST'}),
  getAutomationUnseen: () =>
    request<any>('/automation/unseen'),
  markAutomationSeen: (ids?: string[]) =>
    request<any>('/automation/mark-seen', {
      method: 'POST',
      body: JSON.stringify({ids}),
    }),
  getAutomationJobs: () =>
    request<any>('/automation/jobs'),
  getAutomationRuns: (limit?: number) =>
    request<any>(`/automation/runs${limit ? `?limit=${limit}` : ''}`),
};
