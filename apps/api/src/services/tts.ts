import OpenAI from 'openai';

const openai = new OpenAI({apiKey: process.env.OPENAI_API_KEY});

// TTS for a single sentence chunk — returns base64 audio
export async function chunkToSpeech(
  text: string,
  voice: string = 'alloy',
): Promise<string> {
  const response = await openai.audio.speech.create({
    model: 'tts-1',
    voice: voice as any,
    input: text,
    response_format: 'mp3',
  });

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer).toString('base64');
}

// Split text into speakable sentences
export function splitIntoSentences(text: string): string[] {
  // Split on sentence endings, keeping the delimiter
  const raw = text.match(/[^.!?]+[.!?]+\s*/g);
  if (!raw) return text.trim() ? [text.trim()] : [];

  // Merge very short fragments with the previous sentence
  const merged: string[] = [];
  for (const sentence of raw) {
    const trimmed = sentence.trim();
    if (merged.length > 0 && trimmed.length < 20) {
      merged[merged.length - 1] += ' ' + trimmed;
    } else {
      merged.push(trimmed);
    }
  }

  return merged;
}
