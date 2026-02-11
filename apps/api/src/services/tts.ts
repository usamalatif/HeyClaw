import OpenAI from 'openai';

const openai = new OpenAI({apiKey: process.env.OPENAI_API_KEY});

// Strip markdown formatting so TTS doesn't speak asterisks, hashes, etc.
function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')   // **bold**
    .replace(/\*([^*]+)\*/g, '$1')        // *italic*
    .replace(/_{1,2}([^_]+)_{1,2}/g, '$1') // _italic_ / __bold__
    .replace(/^#{1,6}\s+/gm, '')          // # headings
    .replace(/`([^`]+)`/g, '$1')          // `code`
    .replace(/```[\s\S]*?```/g, '')       // ```code blocks```
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // [links](url)
    .replace(/~~([^~]+)~~/g, '$1')        // ~~strikethrough~~
    .trim();
}

// TTS for a single sentence chunk — returns base64 audio
export async function chunkToSpeech(
  text: string,
  voice: string = 'alloy',
): Promise<string> {
  const cleanText = stripMarkdown(text);
  const response = await openai.audio.speech.create({
    model: 'tts-1',
    voice: voice as any,
    input: cleanText,
    response_format: 'mp3',
  });

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer).toString('base64');
}

// Split text into speakable chunks (sentences + long clauses)
// Splits on .!? and also on ,;:— when the preceding clause is > 40 chars
export function splitIntoSentences(text: string): string[] {
  const chunks: string[] = [];
  // Split on sentence endings first
  const raw = text.match(/[^.!?]+[.!?]+\s*/g);

  if (!raw) {
    // No sentence endings — try splitting long text on clause boundaries
    if (text.length > 50) {
      const clauses = text.split(/(?<=[,;:—])\s+/);
      let current = '';
      for (const clause of clauses) {
        current += (current ? ' ' : '') + clause;
        if (current.length > 40) {
          chunks.push(current.trim());
          current = '';
        }
      }
      if (current.trim()) chunks.push(current.trim());
      if (chunks.length > 1) return chunks;
    }
    return text.trim() ? [text.trim()] : [];
  }

  // For each sentence, split long ones on clause boundaries
  for (const sentence of raw) {
    const trimmed = sentence.trim();
    if (trimmed.length > 80) {
      // Split long sentence on clause boundaries
      const parts = trimmed.split(/(?<=[,;:—])\s+/);
      let current = '';
      for (const part of parts) {
        current += (current ? ' ' : '') + part;
        if (current.length > 40) {
          chunks.push(current.trim());
          current = '';
        }
      }
      if (current.trim()) {
        if (chunks.length > 0 && current.trim().length < 20) {
          chunks[chunks.length - 1] += ' ' + current.trim();
        } else {
          chunks.push(current.trim());
        }
      }
    } else if (chunks.length > 0 && trimmed.length < 20) {
      chunks[chunks.length - 1] += ' ' + trimmed;
    } else {
      chunks.push(trimmed);
    }
  }

  return chunks;
}
