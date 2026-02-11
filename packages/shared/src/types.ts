export type ModelTier = 'standard' | 'power' | 'best';

export type Plan = 'free' | 'starter' | 'pro' | 'ultra';

export type AgentStatus =
  | 'pending'
  | 'provisioning'
  | 'running'
  | 'sleeping'
  | 'error';

export interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  plan: Plan;
  subscription_status: string;
  subscription_ends_at: string | null;
  agent_machine_id: string | null;
  agent_status: AgentStatus;
  agent_name: string;
  agent_personality: string | null;
  credits_remaining: number;
  credits_monthly_limit: number;
  credits_reset_at: string | null;
  tts_voice: string;
  tts_speed: number;
  created_at: string;
  updated_at: string;
  last_active_at: string | null;
}

export interface CreditInfo {
  plan: Plan;
  credits_remaining: number;
  credits_monthly_limit: number;
  credits_reset_at: string | null;
}

export interface UsageLog {
  id: string;
  user_id: string;
  type: 'stt' | 'tts' | 'agent_message';
  model_tier: ModelTier | null;
  model_name: string | null;
  credits_used: number;
  duration_ms: number | null;
  tokens: number | null;
  cost_usd: number | null;
  created_at: string;
}

export interface ChatSession {
  id: string;
  user_id: string;
  title: string | null;
  messages: ChatMessage[];
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  model_tier?: ModelTier;
  is_voice?: boolean;
  timestamp: string;
}
