import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
} from 'react-native';
import {useAuthStore, useVoiceStore} from '../lib/store';
import {useVoiceFlow} from '../lib/useVoiceFlow';
import {startSpeechRecognition, stopSpeechRecognition, cancelSpeechRecognition} from '../lib/audio';

const CREDIT_COST = 10;

// Renders text with **bold** markdown support
function FormattedText({children, style}: {children: string; style: any}) {
  const parts = children.split(/(\*\*[^*]+\*\*)/g);
  return (
    <Text style={style}>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return (
            <Text key={i} style={{fontWeight: '700'}}>
              {part.slice(2, -2)}
            </Text>
          );
        }
        return part;
      })}
    </Text>
  );
}

export default function HomeScreen() {
  const {profile} = useAuthStore();
  const {isRecording, isProcessing, isPlaying, lastTranscription, lastResponse} =
    useVoiceStore();
  const setRecording = useVoiceStore(s => s.setRecording);
  const {processVoiceInput, cancel} = useVoiceFlow();

  const hasCredits = (profile?.creditsRemaining ?? 0) >= CREDIT_COST;

  const getStatusText = () => {
    if (isRecording) return 'Listening...';
    if (isProcessing) return 'Thinking...';
    if (isPlaying) return 'Speaking...';
    return 'What can I help with?';
  };

  const getButtonText = () => {
    if (isRecording) return 'RELEASE\nTO SEND';
    if (isProcessing || isPlaying) return 'STOP';
    return 'HOLD\nTO TALK';
  };

  const setLastTranscription = useVoiceStore(s => s.setLastTranscription);

  const handlePressIn = async () => {
    try {
      setLastTranscription(null);
      await startSpeechRecognition((partialText) => {
        // Show live transcription as user speaks
        setLastTranscription(partialText);
      });
      setRecording(true);
    } catch (err) {
      console.error('Failed to start speech recognition:', err);
    }
  };

  const handlePressOut = async () => {
    if (!isRecording) return;
    try {
      const transcribedText = await stopSpeechRecognition();
      setRecording(false);
      if (transcribedText?.trim()) {
        processVoiceInput(transcribedText.trim());
      }
    } catch (err) {
      console.error('Failed to stop speech recognition:', err);
      setRecording(false);
      await cancelSpeechRecognition();
    }
  };

  const handleStopPress = () => {
    cancel();
  };

  return (
    <View style={styles.container}>
      {/* Credits display */}
      <View style={styles.header}>
        <Text style={styles.credits}>
          {profile?.creditsRemaining ?? 0} credits
        </Text>
      </View>

      {/* Agent avatar area */}
      <View style={styles.avatarArea}>
        <View style={styles.avatar}>
          <Text style={styles.avatarEmoji}>
            {isRecording ? '\uD83C\uDFA4' : isProcessing ? '\uD83E\uDD14' : isPlaying ? '\uD83D\uDD0A' : '\uD83E\uDD9E'}
          </Text>
        </View>
        <Text style={styles.agentName}>{profile?.agentName ?? 'HeyClaw'}</Text>
      </View>

      {/* Status text */}
      <Text style={styles.statusText}>{getStatusText()}</Text>

      {/* Response text (scrollable so button stays visible) */}
      {(lastTranscription || lastResponse) && (
        <ScrollView style={styles.responseScroll} contentContainerStyle={styles.responseScrollContent}>
          {lastTranscription && (
            <Text style={styles.transcription}>You: {lastTranscription}</Text>
          )}
          {lastResponse && (
            <FormattedText style={styles.responseText}>{lastResponse}</FormattedText>
          )}
        </ScrollView>
      )}

      {/* Bottom area pinned */}
      <View style={styles.bottomArea}>
        {/* Waveform placeholder */}
        <View style={styles.waveformArea}>
          <Text style={styles.waveformPlaceholder}>
            {isRecording || isPlaying ? '~~~~~~~~~~~~' : ''}
          </Text>
        </View>

        {/* Voice button */}
        {isProcessing || isPlaying ? (
          <Pressable style={styles.stopButton} onPress={handleStopPress}>
            <Text style={styles.voiceButtonText}>STOP</Text>
          </Pressable>
        ) : (
          <Pressable
            style={({pressed}) => [
              styles.voiceButton,
              pressed && styles.voiceButtonPressed,
              isRecording && styles.voiceButtonRecording,
              !hasCredits && styles.voiceButtonDisabled,
            ]}
            disabled={!hasCredits}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}>
            <Text style={styles.voiceButtonText}>
              {isRecording ? 'RELEASE\nTO SEND' : 'HOLD\nTO TALK'}
            </Text>
          </Pressable>
        )}

        {!hasCredits && (
          <Text style={styles.noCredits}>
            Not enough credits. Upgrade your plan.
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    alignItems: 'center',
    paddingTop: 60,
  },
  header: {
    width: '100%',
    paddingHorizontal: 24,
    alignItems: 'flex-end',
  },
  credits: {
    color: '#ff6b35',
    fontSize: 14,
    fontWeight: '600',
  },
  avatarArea: {
    marginTop: 40,
    alignItems: 'center',
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#333',
  },
  avatarEmoji: {
    fontSize: 40,
  },
  agentName: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 12,
  },
  statusText: {
    color: '#999',
    fontSize: 16,
    marginTop: 24,
  },
  responseScroll: {
    flex: 1,
    marginTop: 16,
    width: '100%',
  },
  responseScrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 8,
  },
  transcription: {
    color: '#666',
    fontSize: 13,
    fontStyle: 'italic',
    marginBottom: 8,
  },
  responseText: {
    color: '#ddd',
    fontSize: 15,
    lineHeight: 22,
  },
  bottomArea: {
    alignItems: 'center',
    paddingBottom: 40,
  },
  waveformArea: {
    height: 40,
    justifyContent: 'center',
  },
  waveformPlaceholder: {
    color: '#ff6b35',
    fontSize: 20,
    letterSpacing: 2,
  },
  voiceButton: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#ff6b35',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 32,
  },
  voiceButtonPressed: {
    backgroundColor: '#cc5529',
    transform: [{scale: 0.95}],
  },
  voiceButtonRecording: {
    backgroundColor: '#e63946',
  },
  voiceButtonDisabled: {
    backgroundColor: '#333',
  },
  stopButton: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#e63946',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 32,
  },
  voiceButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  noCredits: {
    color: '#e63946',
    fontSize: 13,
    marginTop: 16,
  },
});
