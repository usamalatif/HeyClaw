import {useCallback, useRef} from 'react';
import {useAuthStore, useVoiceStore, useChatStore} from './store';
import {supabase} from './supabase';
import {
  playBase64Audio,
  prepareAudioChunk,
  clearPreparedAudio,
  stopPlayback,
  getRecordingUri,
} from './audio';
import {API_URL} from './config';

interface AudioChunk {
  index: number;
  base64: string;
}

// Full voice conversation flow:
// 1. Record audio (push-to-talk) — handled by HomeScreen via audio.ts
// 2. Send recording to Whisper for transcription
// 3. Send text to agent via SSE streaming
// 4. Receive text + audio chunks
// 5. Play audio chunks in order as they arrive
export function useVoiceFlow() {
  const {selectedModel, deductCredits} = useAuthStore();
  const {
    setRecording,
    setProcessing,
    setPlaying,
    setLastTranscription,
    setLastResponse,
  } = useVoiceStore();

  const audioQueueRef = useRef<AudioChunk[]>([]);
  const isPlayingRef = useRef(false);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const cancelledRef = useRef(false);

  // Play queued audio chunks sequentially
  const playNextChunk = useCallback(async () => {
    if (isPlayingRef.current || audioQueueRef.current.length === 0) return;

    isPlayingRef.current = true;
    setPlaying(true);

    while (audioQueueRef.current.length > 0 && !cancelledRef.current) {
      const chunk = audioQueueRef.current.shift()!;
      await playBase64Audio(chunk.base64, chunk.index);
    }

    isPlayingRef.current = false;
    if (!cancelledRef.current) {
      setPlaying(false);
    }
  }, [setPlaying]);

  // Parse SSE lines and handle events
  const handleSSELine = useCallback(
    (line: string, fullTextRef: {value: string}) => {
      if (!line.startsWith('data:')) return;
      const jsonStr = line.slice(5).trim();
      if (!jsonStr) return;

      try {
        const event = JSON.parse(jsonStr);

        switch (event.type) {
          case 'token':
            // Instant token-by-token display
            fullTextRef.value += event.data;
            setLastResponse(fullTextRef.value.trim());
            break;

          case 'text':
            // Sentence-level (used for TTS grouping) — text already shown via tokens
            break;

          case 'audio':
            // Pre-write to disk immediately so playback starts faster
            prepareAudioChunk(event.data, event.index);
            audioQueueRef.current.push({
              index: event.index,
              base64: event.data,
            });
            playNextChunk();
            break;

          case 'done':
            deductCredits(event.creditsUsed);
            break;

          case 'error':
            console.error('Agent error:', event.message);
            break;
        }
      } catch {
        // Skip malformed SSE lines
      }
    },
    [deductCredits, setLastResponse, playNextChunk],
  );

  // Process SSE stream from /agent/voice using XMLHttpRequest
  // (React Native's fetch doesn't support ReadableStream)
  const streamAgentResponse = useCallback(
    (transcribedText: string): Promise<void> => {
      return new Promise(async (resolve, reject) => {
        const {
          data: {session},
        } = await supabase.auth.getSession();

        if (!session?.access_token) {
          reject(new Error('Not authenticated'));
          return;
        }

        cancelledRef.current = false;
        audioQueueRef.current = [];
        const fullTextRef = {value: ''};
        let lastIndex = 0;
        let buffer = '';

        const xhr = new XMLHttpRequest();
        xhrRef.current = xhr;

        xhr.open('POST', `${API_URL}/agent/voice`);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.setRequestHeader('Authorization', `Bearer ${session.access_token}`);

        xhr.onprogress = () => {
          if (cancelledRef.current) return;

          const newData = xhr.responseText.substring(lastIndex);
          lastIndex = xhr.responseText.length;

          buffer += newData;
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            handleSSELine(line, fullTextRef);
          }
        };

        xhr.onload = () => {
          // Process any remaining buffer
          if (buffer.trim()) {
            handleSSELine(buffer, fullTextRef);
          }
          xhrRef.current = null;
          resolve();
        };

        xhr.onerror = () => {
          xhrRef.current = null;
          reject(new Error('Voice request failed'));
        };

        xhr.onabort = () => {
          xhrRef.current = null;
          resolve();
        };

        xhr.send(
          JSON.stringify({
            text: transcribedText,
            modelTier: selectedModel,
          }),
        );
      });
    },
    [selectedModel, handleSSELine],
  );

  // Main voice flow: called when user releases the mic button
  const processVoiceInput = useCallback(
    async (audioFilePath: string) => {
      try {
        setRecording(false);
        setProcessing(true);
        setLastTranscription(null);
        setLastResponse(null);

        // Step 1: Transcribe audio with Whisper
        const {
          data: {session},
        } = await supabase.auth.getSession();

        const formData = new FormData();
        formData.append('audio', {
          uri: getRecordingUri(audioFilePath),
          type: 'audio/m4a',
          name: 'recording.m4a',
        } as any);

        const transcribeRes = await fetch(`${API_URL}/voice/transcribe`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: formData,
        });

        if (!transcribeRes.ok) {
          throw new Error('Transcription failed');
        }

        const {text: transcribedText} = await transcribeRes.json();
        setLastTranscription(transcribedText);

        // Add user voice message to chat history
        const userMsgId = Date.now().toString();
        useChatStore.getState().addMessage({
          id: userMsgId,
          role: 'user',
          content: transcribedText,
          isVoice: true,
        });

        // Step 2: Stream agent response with audio
        setProcessing(false);
        await streamAgentResponse(transcribedText);

        // Add assistant response to chat history
        const finalResponse = useVoiceStore.getState().lastResponse;
        if (finalResponse) {
          useChatStore.getState().addMessage({
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: finalResponse,
            isVoice: true,
          });
        }
      } catch (err: any) {
        console.error('Voice flow error:', err.message);
        setProcessing(false);
        setPlaying(false);
      }
    },
    [
      setRecording,
      setProcessing,
      setPlaying,
      setLastTranscription,
      setLastResponse,
      streamAgentResponse,
    ],
  );

  // Cancel ongoing stream/playback
  const cancel = useCallback(async () => {
    cancelledRef.current = true;
    xhrRef.current?.abort();
    xhrRef.current = null;
    audioQueueRef.current = [];
    isPlayingRef.current = false;
    clearPreparedAudio();
    await stopPlayback();
    setProcessing(false);
    setPlaying(false);
  }, [setProcessing, setPlaying]);

  return {
    processVoiceInput,
    cancel,
  };
}
