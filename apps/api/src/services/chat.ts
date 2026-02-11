import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import type {ChatCompletionMessageParam} from 'openai/resources/chat/completions';
import type {ModelTier} from '@heyclaw/shared';

const openai = new OpenAI({apiKey: process.env.OPENAI_API_KEY});
const anthropic = new Anthropic({apiKey: process.env.ANTHROPIC_API_KEY});

// Map model tiers to models
const OPENAI_MODELS: Record<string, string> = {
  standard: 'gpt-4o-mini',
  power: 'gpt-4o',
};

const ANTHROPIC_MODEL = 'claude-sonnet-4-5-20250929';

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

  // Best tier → Anthropic Claude
  if (modelTier === 'best') {
    const response = await anthropic.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: 500,
      system: systemPrompt,
      messages: messages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content as string,
      })),
    });
    const block = response.content[0];
    return block.type === 'text' ? block.text : 'I couldn\'t generate a response.';
  }

  // Standard/Power → OpenAI
  const response = await openai.chat.completions.create({
    model: OPENAI_MODELS[modelTier] || 'gpt-4o-mini',
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

  // Best tier → Anthropic Claude streaming
  if (modelTier === 'best') {
    const stream = anthropic.messages.stream({
      model: ANTHROPIC_MODEL,
      max_tokens: 500,
      system: systemPrompt,
      messages: messages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content as string,
      })),
    });
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield event.delta.text;
      }
    }
    return;
  }

  // Standard/Power → OpenAI streaming
  const stream = await openai.chat.completions.create({
    model: OPENAI_MODELS[modelTier] || 'gpt-4o-mini',
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
