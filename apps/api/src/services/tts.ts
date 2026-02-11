const TTS_API_KEY = process.env.ELEVENLABS_API_KEY;
const TTS_BASE_URL = 'https://prompt2voice.com/publicapiv3.php';

// Map app voice names to ElevenLabs voice IDs
const ELEVENLABS_VOICES: Record<string, string> = {
  alloy: '21m00Tcm4TlvDq8ikWAM',   // Rachel
  ash: '29vD33N1CtxCmqQRPOHJ',     // Drew
  coral: 'EXAVITQu4vr4xnSDxMaL',   // Bella
  echo: 'ErXwobaYiN019PkySvjV',     // Antoni
  fable: 'MF3mGyEYCl7XYWbV9V6O',   // Elli
  nova: 'jBpfuIE2acCO8z3wKNLl',     // Gigi
  onyx: 'onwK4e9ZLuTAKqWW03F9',    // Daniel
  sage: 'pqHfZKP75CvOlQylNhV4',    // Bill
  shimmer: 'z9fAnlkpzviPz146aGWa',  // Glinda
};

const DEFAULT_VOICE_ID = '21m00Tcm4TlvDq8ikWAM'; // Rachel

/**
 * Generate speech for full text using prompt2voice ElevenLabs proxy.
 * This is an async API: submit → poll status → download audio.
 * Returns base64-encoded audio.
 */
export async function generateSpeech(
  text: string,
  voice: string = 'alloy',
): Promise<string> {
  const voiceId = ELEVENLABS_VOICES[voice] || DEFAULT_VOICE_ID;

  // 1. Submit generation request (multipart/form-data)
  const formData = new FormData();
  formData.append('text', text);
  formData.append('voice_id', voiceId);
  formData.append('model_id', 'eleven_multilingual_v2');
  formData.append('stability', '0.5');
  formData.append('similarity', '0.75');
  formData.append('speed', '1.0');

  const submitRes = await fetch(`${TTS_BASE_URL}/generate`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TTS_API_KEY}`,
    },
    body: formData,
  });

  if (!submitRes.ok) {
    const errText = await submitRes.text();
    throw new Error(`TTS submit failed (${submitRes.status}): ${errText}`);
  }

  const submitData = await submitRes.json() as {
    success: boolean;
    task_id: string;
    status_url: string;
    [key: string]: any;
  };

  if (!submitData.success) {
    throw new Error(`TTS submit rejected: ${JSON.stringify(submitData)}`);
  }

  // 2. Poll status until complete (max 2 minutes)
  const statusUrl = submitData.status_url;
  const maxAttempts = 120;

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 1000));

    const statusRes = await fetch(statusUrl, {
      headers: {
        'Authorization': `Bearer ${TTS_API_KEY}`,
      },
    });

    const statusData = await statusRes.json() as {
      status: string;
      audio_url?: string;
      url?: string;
      output_url?: string;
      download_url?: string;
      error?: string;
      [key: string]: any;
    };

    if (statusData.status === 'completed') {
      const audioUrl =
        statusData.audio_url ||
        statusData.url ||
        statusData.output_url ||
        statusData.download_url;

      if (!audioUrl) {
        throw new Error('TTS completed but no audio URL returned');
      }

      // 3. Download audio and convert to base64
      const audioRes = await fetch(audioUrl);
      if (!audioRes.ok) {
        throw new Error(`Failed to download audio (${audioRes.status})`);
      }

      const arrayBuffer = await audioRes.arrayBuffer();
      return Buffer.from(arrayBuffer).toString('base64');
    }

    if (statusData.status === 'failed' || statusData.status === 'error') {
      throw new Error(`TTS generation failed: ${statusData.error || 'unknown'}`);
    }

    // Otherwise still processing — keep polling
  }

  throw new Error('TTS generation timed out after 2 minutes');
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
