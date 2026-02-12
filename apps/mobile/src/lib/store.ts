import {create} from 'zustand';
import type {Session} from '@supabase/supabase-js';

interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  plan: 'free' | 'starter' | 'pro' | 'ultra';
  creditsRemaining: number;
  creditsMonthlyLimit: number;
  agentStatus: string;
  agentName: string;
  ttsVoice: string;
  ttsSpeed: number;
}

interface AuthState {
  session: Session | null;
  isProvisioned: boolean;
  profileLoading: boolean;
  profile: UserProfile | null;
  setSession: (session: Session | null) => void;
  setProvisioned: (provisioned: boolean) => void;
  setProfileLoading: (loading: boolean) => void;
  setProfile: (profile: UserProfile | null) => void;
  deductCredits: (amount: number) => void;
}

export const useAuthStore = create<AuthState>(set => ({
  session: null,
  isProvisioned: false,
  profileLoading: true,
  profile: null,
  setSession: session => set({session}),
  setProvisioned: isProvisioned => set({isProvisioned}),
  setProfileLoading: profileLoading => set({profileLoading}),
  setProfile: profile => set({profile}),
  deductCredits: amount =>
    set(state => ({
      profile: state.profile
        ? {
            ...state.profile,
            creditsRemaining: Math.max(
              0,
              state.profile.creditsRemaining - amount,
            ),
          }
        : null,
    })),
}));

interface VoiceState {
  isRecording: boolean;
  isProcessing: boolean;
  isPlaying: boolean;
  lastTranscription: string | null;
  lastResponse: string | null;
  setRecording: (recording: boolean) => void;
  setProcessing: (processing: boolean) => void;
  setPlaying: (playing: boolean) => void;
  setLastTranscription: (text: string | null) => void;
  setLastResponse: (text: string | null) => void;
}

// Shared chat messages — used by both ChatScreen and voice flow
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isVoice?: boolean;
}

interface ChatState {
  messages: ChatMessage[];
  sessionId: string | null;
  setMessages: (messages: ChatMessage[]) => void;
  addMessage: (message: ChatMessage) => void;
  updateLastMessage: (content: string) => void;
  setSessionId: (id: string | null) => void;
}

export const useChatStore = create<ChatState>(set => ({
  messages: [],
  sessionId: null,
  setMessages: messages => set({messages}),
  addMessage: message =>
    set(state => ({messages: [...state.messages, message]})),
  updateLastMessage: content =>
    set(state => {
      const updated = [...state.messages];
      if (updated.length > 0) {
        updated[updated.length - 1] = {...updated[updated.length - 1], content};
      }
      return {messages: updated};
    }),
  setSessionId: sessionId => set({sessionId}),
}));

export const useVoiceStore = create<VoiceState>(set => ({
  isRecording: false,
  isProcessing: false,
  isPlaying: false,
  lastTranscription: null,
  lastResponse: null,

  setRecording: isRecording => set({isRecording}),
  setProcessing: isProcessing => set({isProcessing}),
  setPlaying: isPlaying => set({isPlaying}),
  setLastTranscription: lastTranscription => set({lastTranscription}),
  setLastResponse: lastResponse => set({lastResponse}),
}));
