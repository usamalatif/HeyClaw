import Sound from 'react-native-nitro-sound';
import RNFS from 'react-native-fs';
import {Platform} from 'react-native';

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
