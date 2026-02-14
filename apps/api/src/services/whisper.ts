import OpenAI from 'openai';

const openai = new OpenAI({apiKey: process.env.OPENAI_API_KEY});

export async function transcribeAudio(audioFile: File): Promise<{text: string; duration: number}> {
  const transcription = await openai.audio.transcriptions.create({
    file: audioFile,
    model: 'whisper-1',
    response_format: 'verbose_json',
  });

  return {
    text: transcription.text,
    duration: (transcription as any).duration ?? 3,
  };
}
