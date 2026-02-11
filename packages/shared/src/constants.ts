import type {ModelTier, Plan} from './types.js';

export const CREDIT_COSTS: Record<ModelTier, number> = {
  standard: 10,
  power: 30,
  best: 100,
};

export const PLAN_CREDITS: Record<Plan, number> = {
  free: 50,
  starter: 1400,
  pro: 4200,
  ultra: 12000,
};

export const PLAN_PRICES: Record<Plan, number> = {
  free: 0,
  starter: 24.99,
  pro: 69.99,
  ultra: 179.99,
};

export const MODEL_NAMES: Record<ModelTier, string[]> = {
  standard: ['gpt-4o-mini', 'claude-haiku'],
  power: ['gpt-4o', 'claude-sonnet'],
  best: ['claude-opus', 'gpt-5.3'],
};

export const IAP_PRODUCT_IDS: Record<Plan, string> = {
  free: '',
  starter: 'com.heyclaw.starter.monthly',
  pro: 'com.heyclaw.pro.monthly',
  ultra: 'com.heyclaw.ultra.monthly',
};
