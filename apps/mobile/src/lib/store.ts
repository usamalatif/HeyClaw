import {create} from 'zustand';

interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  plan: 'free' | 'starter' | 'pro' | 'premium';
  agentName: string;
  voice: string;
  dailyMessagesUsed: number;
  dailyMessagesLimit: number;
  dailyVoiceSeconds: number;
  dailyVoiceLimit: number;
}

interface AuthState {
  isAuthenticated: boolean;
  profileLoading: boolean;
  isNewUser: boolean;
  profile: UserProfile | null;
  setAuthenticated: (authenticated: boolean) => void;
  setProfileLoading: (loading: boolean) => void;
  setIsNewUser: (isNew: boolean) => void;
  setProfile: (profile: UserProfile | null) => void;
  updateUsage: (messagesUsed: number, messagesLimit: number, voiceSecondsUsed?: number) => void;
}

export const useAuthStore = create<AuthState>(set => ({
  isAuthenticated: false,
  profileLoading: true,
  isNewUser: false,
  profile: null,
  setAuthenticated: isAuthenticated => set({isAuthenticated}),
  setProfileLoading: profileLoading => set({profileLoading}),
  setIsNewUser: isNewUser => set({isNewUser}),
  setProfile: profile => set({profile}),
  updateUsage: (messagesUsed, messagesLimit, voiceSecondsUsed) =>
    set(state => ({
      profile: state.profile
        ? {
            ...state.profile,
            dailyMessagesUsed: messagesUsed,
            dailyMessagesLimit: messagesLimit,
            ...(voiceSecondsUsed !== undefined ? {dailyVoiceSeconds: voiceSecondsUsed} : {}),
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
