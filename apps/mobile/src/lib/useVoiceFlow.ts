import {useCallback, useRef} from 'react';
import {useAuthStore, useVoiceStore, useChatStore} from './store';
import {getAccessToken} from './auth';
import {
  playBase64Audio,
  prepareAudioChunk,
  clearPreparedAudio,
  stopPlayback,
} from './audio';
import {notifyResponseReady, scheduleReminder} from './notifications';
import {API_URL} from './config';

// Full voice conversation flow:
// 1. On-device speech recognition (push-to-talk)
// 2. Send text to agent via SSE streaming
// 3. Receive tokens (instant display) + audio chunks (ElevenLabs TTS)
// 4. Play audio chunks sequentially with pre-buffering
export function useVoiceFlow() {
  const {updateUsage} = useAuthStore();
  const {
    setRecording,
    setProcessing,
    setPlaying,
    setLastTranscription,
    setLastResponse,
  } = useVoiceStore();

  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const cancelledRef = useRef(false);
  // Queue audio chunks for sequential playback
  const audioQueueRef = useRef<{base64: string; index: number}[]>([]);
  const isPlayingAudioRef = useRef(false);

  // Process audio queue — play chunks one by one, pre-buffer next
  const processAudioQueue = useCallback(async () => {
    if (isPlayingAudioRef.current || audioQueueRef.current.length === 0) return;

    isPlayingAudioRef.current = true;
    setPlaying(true);

    while (audioQueueRef.current.length > 0 && !cancelledRef.current) {
      const chunk = audioQueueRef.current.shift()!;

      // Pre-buffer: write the next chunk to disk while current one plays
      if (audioQueueRef.current.length > 0) {
        const nextChunk = audioQueueRef.current[0];
        prepareAudioChunk(nextChunk.base64, nextChunk.index).catch(() => {});
      }

      await playBase64Audio(chunk.base64, chunk.index);
    }

    isPlayingAudioRef.current = false;
    if (!cancelledRef.current) {
      setPlaying(false);
    }
  }, [setPlaying]);

  // Parse SSE lines and handle events
  const receivedFirstChunkRef = useRef(false);

  const handleSSELine = useCallback(
    (line: string, fullTextRef: {value: string}) => {
      if (!line.startsWith('data:')) return;
      const jsonStr = line.slice(5).trim();
      if (!jsonStr) return;

      try {
        const event = JSON.parse(jsonStr);

        // Turn off "processing" animation once first real data arrives
        if (!receivedFirstChunkRef.current && (event.type === 'token' || event.type === 'text' || event.type === 'audio')) {
          receivedFirstChunkRef.current = true;
          setProcessing(false);
        }

        switch (event.type) {
          case 'token':
            // Instant token-by-token display
            fullTextRef.value += event.data;
            setLastResponse(fullTextRef.value.trim());
            break;

          case 'text':
            // Update display as fallback if no tokens received
            if (!fullTextRef.value.trim()) {
              fullTextRef.value += event.data + ' ';
              setLastResponse(fullTextRef.value.trim());
            }
            break;

          case 'audio':
            // Queue audio chunk for playback
            if (event.data) {
              audioQueueRef.current.push({
                base64: event.data,
                index: event.index,
              });
              processAudioQueue();
            }
            break;

          case 'action': {
            // Handle agent-triggered device actions
            if (event.action === 'reminder' && event.params?.length >= 3) {
              const delaySeconds = parseInt(event.params[0], 10);
              const title = event.params[1];
              const body = event.params[2];
              if (!isNaN(delaySeconds) && delaySeconds > 0) {
                scheduleReminder(title, body, delaySeconds).catch(err => {
                  console.error('[Action] Failed to schedule reminder:', err);
                });
              }
            }
            break;
          }

          case 'done': {
            // Replace streamed text with cleaned version from server
            if (event.fullText) {
              fullTextRef.value = event.fullText;
              setLastResponse(event.fullText.trim());
            }
            // Update usage display
            if (event.usage) {
              updateUsage(event.usage.messagesUsed, event.usage.messagesLimit, event.usage.voiceSecondsUsed);
              console.log('[Voice] Usage update — msgs:', event.usage.messagesUsed, '/', event.usage.messagesLimit, 'voice_sec:', event.usage.voiceSecondsUsed);
            }
            setProcessing(false);
            const agentName = useAuthStore.getState().profile?.agentName;
            notifyResponseReady(agentName);
            break;
          }

          case 'error':
            console.error('Agent error:', event.message);
            setProcessing(false);
            break;
        }
      } catch {
        // Skip malformed SSE lines
      }
    },
    [updateUsage, setLastResponse, setProcessing, processAudioQueue],
  );

  // Process SSE stream from /agent/voice using XMLHttpRequest
  // (React Native's fetch doesn't support ReadableStream)
  const streamAgentResponse = useCallback(
    (transcribedText: string, recordingDuration?: number): Promise<void> => {
      return new Promise(async (resolve, reject) => {
        const token = await getAccessToken();

        if (!token) {
          reject(new Error('Not authenticated'));
          return;
        }

        cancelledRef.current = false;
        receivedFirstChunkRef.current = false;
        audioQueueRef.current = [];
        clearPreparedAudio();
        const fullTextRef = {value: ''};
        let lastIndex = 0;
        let buffer = '';

        const xhr = new XMLHttpRequest();
        xhrRef.current = xhr;

        xhr.open('POST', `${API_URL}/agent/voice`);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);

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
          if (xhr.status === 429) {
            xhrRef.current = null;
            try {
              const err = JSON.parse(xhr.responseText);
              reject(new Error(err.message || 'Limit reached'));
            } catch {
              reject(new Error('Daily limit reached'));
            }
            return;
          }
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
            recordingDuration: recordingDuration || 0,
          }),
        );
      });
    },
    [handleSSELine],
  );

  // Main voice flow: receives transcribed text directly (from on-device recognition)
  const processVoiceInput = useCallback(
    async (transcribedText: string, recordingDuration?: number) => {
      try {
        setRecording(false);
        setProcessing(true);
        setLastResponse(null);
        setLastTranscription(transcribedText);

        // Add user voice message to chat history
        const userMsgId = Date.now().toString();
        useChatStore.getState().addMessage({
          id: userMsgId,
          role: 'user',
          content: transcribedText,
          isVoice: true,
        });

        // Stream agent response with ElevenLabs TTS
        // Processing stays true until first token arrives (handled in handleSSELine)
        await streamAgentResponse(transcribedText, recordingDuration);

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
        if (err.message?.includes('limit')) {
          setLastResponse(err.message);
        }
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
    isPlayingAudioRef.current = false;
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
