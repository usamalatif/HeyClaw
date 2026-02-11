import {create} from 'zustand';
import type {Session} from '@supabase/supabase-js';

type ModelTier = 'standard' | 'power' | 'best';

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
  selectedModel: ModelTier;
  setSession: (session: Session | null) => void;
  setProvisioned: (provisioned: boolean) => void;
  setProfileLoading: (loading: boolean) => void;
  setProfile: (profile: UserProfile | null) => void;
  setSelectedModel: (model: ModelTier) => void;
  deductCredits: (amount: number) => void;
}

export const useAuthStore = create<AuthState>(set => ({
  session: null,
  isProvisioned: false,
  profileLoading: true,
  profile: null,
  selectedModel: 'standard',

  setSession: session => set({session}),
  setProvisioned: isProvisioned => set({isProvisioned}),
  setProfileLoading: profileLoading => set({profileLoading}),
  setProfile: profile => set({profile}),
  setSelectedModel: selectedModel => set({selectedModel}),
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
