import Sound from 'react-native-nitro-sound';
import Tts from 'react-native-tts';
import Voice, {SpeechResultsEvent} from '@react-native-voice/voice';
import RNFS from 'react-native-fs';
import {Platform} from 'react-native';

// Native TTS setup
let ttsInitialized = false;

async function initTts() {
  if (ttsInitialized) return;
  try {
    await Tts.setDefaultLanguage('en-US');
    await Tts.setDefaultRate(0.5);
    await Tts.setIgnoreSilentSwitch('ignore');

    // Pick a premium/enhanced Siri-quality voice
    const voices = await Tts.voices();
    const enVoices = voices.filter(
      (v: any) => v.language === 'en-US' && !v.notInstalled,
    );
    // Prefer premium > enhanced > default. Samantha is the classic Siri voice.
    const premium = enVoices.find((v: any) =>
      v.quality && (v.quality === 500 || v.id?.includes('premium')),
    );
    const enhanced = enVoices.find((v: any) =>
      v.quality && (v.quality === 300 || v.id?.includes('enhanced')),
    );
    const siri = enVoices.find((v: any) =>
      v.id?.toLowerCase().includes('samantha'),
    );
    const best = premium || enhanced || siri || enVoices[0];
    if (best) {
      await Tts.setDefaultVoice(best.id);
    }

    ttsInitialized = true;
  } catch {
    // TTS init failed — will retry next call
  }
}

// Audio recording + playback utilities for HeyClaw voice flow

let isRecorderActive = false;

/**
 * Start recording audio (m4a format on iOS)
 * Returns when recording has started
 */
export async function startRecording(): Promise<void> {
  if (isRecorderActive) {
    await Sound.stopRecorder();
  }
  await Sound.startRecorder();
  isRecorderActive = true;
}

/**
 * Stop recording and return the file path
 */
export async function stopRecording(): Promise<string> {
  const result = await Sound.stopRecorder();
  isRecorderActive = false;
  // result is the file path of the recorded audio
  return result;
}

/**
 * Play an audio file from a local path
 * Returns a promise that resolves when playback completes
 */
export function playAudioFile(filePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    Sound.startPlayer(filePath)
      .then(() => {
        Sound.addPlayBackListener((e) => {
          // Check if playback is complete
          if (e.currentPosition >= e.duration - 100) {
            Sound.removePlayBackListener();
            Sound.stopPlayer();
            resolve();
          }
        });
      })
      .catch(reject);
  });
}

// Pre-written file cache: write next chunk while current one plays
const preparedFiles = new Map<number, string>();

/**
 * Write a base64 audio chunk to a temp file (for pre-buffering)
 */
export async function prepareAudioChunk(
  base64Data: string,
  chunkIndex: number,
): Promise<void> {
  const tempPath = `${RNFS.CachesDirectoryPath}/heyclaw_chunk_${chunkIndex}.mp3`;
  await RNFS.writeFile(tempPath, base64Data, 'base64');
  preparedFiles.set(chunkIndex, tempPath);
}

/**
 * Play audio from a base64-encoded mp3 string
 * Uses pre-written file if available, otherwise writes then plays
 */
export async function playBase64Audio(
  base64Data: string,
  chunkIndex: number,
): Promise<void> {
  let tempPath = preparedFiles.get(chunkIndex);

  if (!tempPath) {
    tempPath = `${RNFS.CachesDirectoryPath}/heyclaw_chunk_${chunkIndex}.mp3`;
    await RNFS.writeFile(tempPath, base64Data, 'base64');
  } else {
    preparedFiles.delete(chunkIndex);
  }

  // Play the file
  await playAudioFile(tempPath);

  // Clean up temp file
  try {
    await RNFS.unlink(tempPath);
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Clean up any remaining prepared files
 */
export function clearPreparedAudio(): void {
  for (const [, path] of preparedFiles) {
    RNFS.unlink(path).catch(() => {});
  }
  preparedFiles.clear();
}

/**
 * Stop any currently playing audio
 */
export async function stopPlayback(): Promise<void> {
  try {
    Sound.removePlayBackListener();
    await Sound.stopPlayer();
  } catch {
    // Ignore if nothing is playing
  }
}

/**
 * Stop any active recording
 */
export async function cancelRecording(): Promise<void> {
  if (isRecorderActive) {
    try {
      await Sound.stopRecorder();
    } catch {
      // Ignore
    }
    isRecorderActive = false;
  }
}

/**
 * Get the recording file URI formatted for upload
 */
export function getRecordingUri(filePath: string): string {
  if (Platform.OS === 'ios' && !filePath.startsWith('file://')) {
    return `file://${filePath}`;
  }
  return filePath;
}

/**
 * Speak text using native iOS TTS (near-instant, no network)
 * Returns a promise that resolves when speech finishes
 */
export async function speakNative(text: string): Promise<void> {
  await initTts();
  return new Promise((resolve) => {
    let finished = false;

    const onFinish = () => {
      if (finished) return;
      finished = true;
      resolve();
    };

    Tts.addEventListener('tts-finish', onFinish);
    Tts.addEventListener('tts-cancel', onFinish);
    Tts.speak(text);
  });
}

/**
 * Stop native TTS playback
 */
export async function stopNativeTts(): Promise<void> {
  try {
    Tts.stop();
  } catch {
    // Ignore
  }
}

/**
 * Set native TTS voice and speed
 */
export async function setNativeTtsVoice(rate?: number): Promise<void> {
  await initTts();
  if (rate !== undefined) {
    // react-native-tts uses 0.0–1.0 scale; 0.5 is normal
    await Tts.setDefaultRate(rate * 0.5);
  }
}

// ==========================================
// On-device Speech Recognition (SFSpeechRecognizer)
// ==========================================

let recognitionCallback: ((text: string) => void) | null = null;
let recognitionFinalText = '';
let voiceEngineReady = false;

/**
 * Warm up the Voice engine so first recognition starts instantly.
 * Call this when HomeScreen mounts (after permissions are granted).
 * 
 * NOTE: We just check availability - don't actually start/stop as that
 * can interfere with the first real recognition attempt.
 */
export async function warmUpVoice(): Promise<void> {
  if (voiceEngineReady) {
    console.log('[Voice] Engine already warm');
    return;
  }
  
  console.log('[Voice] Checking voice availability...');
  
  try {
    const available = await Voice.isAvailable();
    console.log('[Voice] Voice available:', available);
    voiceEngineReady = true;
  } catch (err: any) {
    console.log('[Voice] Availability check error:', err.message);
    voiceEngineReady = true; // Assume ready, let startSpeechRecognition handle errors
  }
}

/**
 * Request microphone and speech recognition permissions upfront.
 * Call this during onboarding/setup so voice works on first use.
 * Returns true if permissions are granted.
 * 
 * NOTE: SetupScreen now uses react-native-permissions for explicit permission requests.
 * This function just verifies Voice module is available after permissions are granted.
 */
export async function requestVoicePermissions(): Promise<boolean> {
  console.log('[Voice] Verifying voice availability after permissions...');
  
  try {
    const available = await Voice.isAvailable();
    const isAvailable = !!available;
    console.log('[Voice] Voice module available:', isAvailable);
    voiceEngineReady = isAvailable;
    return isAvailable;
  } catch (err: any) {
    console.log('[Voice] Availability check error:', err.message);
    return false;
  }
}

/**
 * Start real-time on-device speech recognition.
 * Calls onPartialResult with live transcription as user speaks.
 * Returns immediately — use stopSpeechRecognition() to get final text.
 * 
 * IMPORTANT: On first run, iOS will prompt for permissions. If this happens,
 * Voice.start() may fail. We retry with exponential backoff to give user time
 * to grant permissions in the dialog.
 */
export async function startSpeechRecognition(
  onPartialResult: (text: string) => void,
): Promise<void> {
  recognitionCallback = onPartialResult;
  recognitionFinalText = '';

  // Set up callbacks BEFORE starting
  Voice.onSpeechStart = () => {
    console.log('[Voice] onSpeechStart fired');
  };
  
  Voice.onSpeechEnd = () => {
    console.log('[Voice] onSpeechEnd fired');
  };

  Voice.onSpeechResults = (e: SpeechResultsEvent) => {
    const text = e.value?.[0] || '';
    console.log('[Voice] onSpeechResults:', text);
    recognitionFinalText = text;
    recognitionCallback?.(text);
  };

  Voice.onSpeechPartialResults = (e: SpeechResultsEvent) => {
    const text = e.value?.[0] || '';
    console.log('[Voice] onSpeechPartialResults:', text);
    recognitionCallback?.(text);
  };

  // Handle errors (permissions denied, etc.)
  Voice.onSpeechError = (e: any) => {
    console.log('[Voice] onSpeechError:', e?.error?.code, e?.error?.message);
  };

  // Try to start voice recognition with retries for permission dialogs
  const MAX_RETRIES = 4;
  const RETRY_DELAYS = [300, 800, 1500, 2500]; // Total ~5s for user to tap Allow
  
  let lastError: Error | null = null;
  
  console.log('[Voice] startSpeechRecognition called, voiceEngineReady:', voiceEngineReady);
  
  // Full reset to ensure clean state - this is critical for first-tap to work
  try {
    await Voice.destroy();
    console.log('[Voice] Destroyed previous session');
  } catch {
    // Ignore - might not have been active
  }
  
  // Small delay to let audio session fully reset
  await new Promise<void>(resolve => setTimeout(resolve, 150));
  
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        // Stop any previous attempt, but don't destroy (keeps engine ready)
        await Voice.stop().catch(() => {});
        await new Promise<void>(resolve => setTimeout(resolve, RETRY_DELAYS[attempt - 1]));
        console.log(`[Voice] Retry attempt ${attempt}...`);
      }
      
      console.log(`[Voice] Calling Voice.start() attempt ${attempt + 1}`);
      await Voice.start('en-US');
      console.log(`[Voice] Voice.start() succeeded on attempt ${attempt + 1}`);
      
      // Another small delay to let the recognizer fully initialize
      await new Promise<void>(resolve => setTimeout(resolve, 50));
      
      return; // Success!
    } catch (err: any) {
      lastError = err;
      console.log(`[Voice] Attempt ${attempt + 1} failed:`, err.message);
      
      // If it's clearly a permission denied error (not just "in progress"), don't retry
      if (err.message?.toLowerCase().includes('denied') && 
          !err.message?.toLowerCase().includes('busy')) {
        break;
      }
    }
  }
  
  // All retries failed
  throw lastError || new Error('Failed to start speech recognition');
}

/**
 * Stop speech recognition and return the final transcribed text.
 * Waits for the final onSpeechResults callback after Voice.stop()
 * so the last few words aren't cut off.
 */
export async function stopSpeechRecognition(): Promise<string> {
  return new Promise<string>(resolve => {
    // Capture the final result callback that fires after Voice.stop()
    const timeout = setTimeout(() => {
      // Safety fallback — resolve with whatever we have after 1.5s
      cleanup();
      resolve(recognitionFinalText);
    }, 1500);

    const cleanup = () => {
      clearTimeout(timeout);
      Voice.onSpeechResults = undefined as any;
      Voice.onSpeechPartialResults = undefined as any;
      const result = recognitionFinalText;
      recognitionCallback = null;
      recognitionFinalText = '';
      resolve(result);
    };

    // Listen for the final results event that Voice.stop() triggers
    Voice.onSpeechResults = (e: SpeechResultsEvent) => {
      const text = e.value?.[0] || '';
      recognitionFinalText = text;
      recognitionCallback?.(text);
      // Small delay to let iOS flush any remaining results
      setTimeout(cleanup, 200);
    };

    Voice.stop().catch(() => {});
  });
}

/**
 * Cancel speech recognition without returning results.
 */
export async function cancelSpeechRecognition(): Promise<void> {
  try {
    await Voice.cancel();
  } catch {
    // Ignore
  }
  Voice.onSpeechResults = undefined as any;
  Voice.onSpeechPartialResults = undefined as any;
  recognitionCallback = null;
  recognitionFinalText = '';
}
