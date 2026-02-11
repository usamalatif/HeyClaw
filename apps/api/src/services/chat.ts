import OpenAI from 'openai';
import type {ChatCompletionMessageParam} from 'openai/resources/chat/completions';
import type {ModelTier} from '@heyclaw/shared';

const openai = new OpenAI({apiKey: process.env.OPENAI_API_KEY});

// Map model tiers to OpenAI models
const MODELS: Record<ModelTier, string> = {
  standard: 'gpt-4o-mini',
  power: 'gpt-4o',
  best: 'o3-mini',
};

const DEFAULT_SYSTEM_PROMPT = `You are HeyClaw, a helpful and friendly AI assistant. You are concise and conversational — your responses are meant to be spoken aloud, so keep them natural and to the point. Avoid markdown, bullet points, or long lists. Respond in 2-4 sentences unless the user asks for more detail.`;

export function buildSystemPrompt(personality: string | null): string {
  if (personality?.trim()) {
    return `${DEFAULT_SYSTEM_PROMPT}\n\nAdditional personality instructions:\n${personality}`;
  }
  return DEFAULT_SYSTEM_PROMPT;
}

// Non-streaming chat completion
export async function chatCompletion(
  messages: ChatCompletionMessageParam[],
  modelTier: ModelTier,
  personality: string | null,
): Promise<string> {
  const systemPrompt = buildSystemPrompt(personality);

  const response = await openai.chat.completions.create({
    model: MODELS[modelTier],
    messages: [
      {role: 'system', content: systemPrompt},
      ...messages,
    ],
    max_tokens: 500,
  });

  return response.choices[0]?.message?.content || 'I couldn\'t generate a response.';
}

// Streaming chat completion — yields text chunks
export async function* streamChatCompletion(
  messages: ChatCompletionMessageParam[],
  modelTier: ModelTier,
  personality: string | null,
): AsyncGenerator<string> {
  const systemPrompt = buildSystemPrompt(personality);

  const stream = await openai.chat.completions.create({
    model: MODELS[modelTier],
    messages: [
      {role: 'system', content: systemPrompt},
      ...messages,
    ],
    max_tokens: 500,
    stream: true,
  });

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content;
    if (content) {
      yield content;
    }
  }
}
