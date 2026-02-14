import OpenAI from 'openai';

const openai = new OpenAI({apiKey: process.env.OPENAI_API_KEY});

// Strip markdown and special markers so TTS reads naturally
function cleanForSpeech(text: string): string {
  return text
    // Remove action markers FIRST (important!)
    .replace(/<!--action:[^>]+-->/g, '')
    
    // Remove markdown formatting
    .replace(/\*\*([^*]+)\*\*/g, '$1')      // **bold**
    .replace(/\*([^*]+)\*/g, '$1')           // *italic*
    .replace(/_{1,2}([^_]+)_{1,2}/g, '$1')   // _italic_ / __bold__
    .replace(/^#{1,6}\s+/gm, '')             // # headings
    .replace(/`([^`]+)`/g, '$1')             // `code`
    .replace(/```[\s\S]*?```/g, '')          // ```code blocks```
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // [links](url)
    .replace(/~~([^~]+)~~/g, '$1')           // ~~strikethrough~~
    
    // Remove emojis that TTS reads weirdly (optional - keep common ones)
    // .replace(/[\u{1F600}-\u{1F64F}]/gu, '') // emoticons
    // .replace(/[\u{1F300}-\u{1F5FF}]/gu, '') // symbols & pictographs
    
    // Clean up punctuation for natural speech
    .replace(/\s*[-–—]\s*/g, ', ')           // dashes to pauses
    .replace(/\s*\.\.\.\s*/g, '... ')        // ellipsis
    .replace(/\s+/g, ' ')                     // collapse whitespace
    .replace(/([.!?])\1+/g, '$1')            // multiple punctuation
    
    // Remove URLs
    .replace(/https?:\/\/[^\s]+/g, '')
    
    .trim();
}

// TTS for a single sentence chunk — returns base64 audio
export async function chunkToSpeech(
  text: string,
  voice: string = 'alloy',
): Promise<string> {
  const cleanText = cleanForSpeech(text);
  
  // Skip empty or too-short chunks
  if (!cleanText || cleanText.length < 2) return '';
  
  try {
    const response = await openai.audio.speech.create({
      model: 'tts-1',
      voice: voice as any,
      input: cleanText,
      response_format: 'mp3',
    });

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer).toString('base64');
  } catch (err: any) {
    console.error('[TTS] Error:', err.message);
    return '';
  }
}

// Split text into speakable chunks (sentences)
// More conservative splitting for natural speech
export function splitIntoSentences(text: string): string[] {
  const chunks: string[] = [];
  
  // First, strip action markers so they don't interfere with splitting
  const cleanText = text.replace(/<!--action:[^>]+-->/g, '').trim();
  
  if (!cleanText) return [];
  
  // Split on sentence endings (.!?) followed by space or end
  const sentences = cleanText.match(/[^.!?]*[.!?]+(?:\s|$)/g);
  
  if (!sentences) {
    // No sentence endings found
    if (cleanText.length > 100) {
      // Split long text on commas/semicolons
      const parts = cleanText.split(/(?<=[,;])\s+/);
      let current = '';
      for (const part of parts) {
        if (current.length + part.length > 80) {
          if (current.trim()) chunks.push(current.trim());
          current = part;
        } else {
          current += (current ? ' ' : '') + part;
        }
      }
      if (current.trim()) chunks.push(current.trim());
      return chunks.length > 0 ? chunks : [cleanText];
    }
    return [cleanText];
  }
  
  // Combine very short sentences with previous
  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (!trimmed) continue;
    
    if (chunks.length > 0 && trimmed.length < 15) {
      // Append short sentence to previous
      chunks[chunks.length - 1] += ' ' + trimmed;
    } else if (trimmed.length > 150) {
      // Split very long sentences on clause boundaries
      const parts = trimmed.split(/(?<=[,;:])\s+/);
      let current = '';
      for (const part of parts) {
        if (current.length + part.length > 100) {
          if (current.trim()) chunks.push(current.trim());
          current = part;
        } else {
          current += (current ? ' ' : '') + part;
        }
      }
      if (current.trim()) chunks.push(current.trim());
    } else {
      chunks.push(trimmed);
    }
  }
  
  return chunks;
}
