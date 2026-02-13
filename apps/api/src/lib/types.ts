import type {Hono} from 'hono';

export interface PlanLimits {
  plan: string;
  display_name: string;
  max_assistants: number;
  daily_text_messages: number;
  daily_voice_input_minutes: number;
  daily_voice_output_minutes: number;
  daily_tts_characters: number;
  model: string;
  tts_model: string;
  tts_voice_options: string[];
  price_monthly_usd: number;
  price_yearly_usd: number;
}

export interface UsageCounters {
  text_messages: number;
  voice_input_seconds: number;
  tts_characters: number;
}

export type AppEnv = {
  Variables: {
    userId: string;
    userEmail: string;
    limits: PlanLimits;
    usage: UsageCounters;
  };
};

export type AppType = Hono<AppEnv>;
