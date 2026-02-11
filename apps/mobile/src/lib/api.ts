import {supabase} from './supabase';
import {API_URL} from './config';

async function getAuthHeaders(): Promise<Record<string, string>> {
  const {
    data: {session},
  } = await supabase.auth.getSession();
  return {
    'Content-Type': 'application/json',
    ...(session?.access_token && {
      Authorization: `Bearer ${session.access_token}`,
    }),
  };
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {...headers, ...options.headers},
  });

  if (!res.ok) {
    // Auto-sign out on 401 (expired/invalid token)
    if (res.status === 401) {
      await supabase.auth.signOut();
    }
    const error = await res.json().catch(() => ({message: 'Request failed'}));
    throw new Error(error.message || `HTTP ${res.status}`);
  }

  return res.json();
}

export const api = {
  // User
  getMe: () => request<any>('/user/me'),
  getCredits: () => request<any>('/user/credits'),

  // Agent
  sendMessage: (text: string, modelTier: string) =>
    request<any>('/agent/message', {
      method: 'POST',
      body: JSON.stringify({text, modelTier}),
    }),
  // Voice streaming handled directly in useVoiceFlow via SSE (POST /agent/voice)
  getAgentStatus: () => request<any>('/agent/status'),
  provisionAgent: () => request<any>('/agent/provision', {method: 'POST'}),
  wakeAgent: () => request<any>('/agent/wake', {method: 'POST'}),

  // Voice
  transcribe: (audioFormData: FormData) =>
    fetch(`${API_URL}/voice/transcribe`, {
      method: 'POST',
      body: audioFormData,
    }).then(res => res.json()),

  // Billing
  verifyReceipt: (receiptData: string) =>
    request<any>('/billing/verify', {
      method: 'POST',
      body: JSON.stringify({receiptData}),
    }),
  getBillingStatus: () => request<any>('/billing/status'),

  // Chat
  getSessions: () => request<any>('/chat/sessions'),
  getSession: (id: string) => request<any>(`/chat/sessions/${id}`),
  createSession: () =>
    request<any>('/chat/sessions', {method: 'POST'}),
  deleteSession: (id: string) =>
    request<any>(`/chat/sessions/${id}`, {method: 'DELETE'}),
};
