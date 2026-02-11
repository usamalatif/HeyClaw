import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  ScrollView,
} from 'react-native';
import {useAuthStore, useVoiceStore} from '../lib/store';
import {useVoiceFlow} from '../lib/useVoiceFlow';
import {startRecording, stopRecording, cancelRecording} from '../lib/audio';

const MODEL_CREDITS = {standard: 10, power: 30, best: 100} as const;

export default function HomeScreen() {
  const {profile, selectedModel, setSelectedModel} = useAuthStore();
  const {isRecording, isProcessing, isPlaying, lastTranscription, lastResponse} =
    useVoiceStore();
  const setRecording = useVoiceStore(s => s.setRecording);
  const {processVoiceInput, cancel} = useVoiceFlow();

  const creditsPerMsg = MODEL_CREDITS[selectedModel];
  const hasCredits = (profile?.creditsRemaining ?? 0) >= creditsPerMsg;

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

  const handlePressIn = async () => {
    try {
      await startRecording();
      setRecording(true);
    } catch (err) {
      console.error('Failed to start recording:', err);
    }
  };

  const handlePressOut = async () => {
    if (!isRecording) return;
    try {
      const filePath = await stopRecording();
      setRecording(false);
      if (filePath) {
        processVoiceInput(filePath);
      }
    } catch (err) {
      console.error('Failed to stop recording:', err);
      setRecording(false);
      await cancelRecording();
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

      {/* Model selector */}
      <View style={styles.modelSelector}>
        {(['standard', 'power', 'best'] as const).map(tier => (
          <TouchableOpacity
            key={tier}
            style={[
              styles.modelChip,
              selectedModel === tier && styles.modelChipActive,
            ]}
            onPress={() => setSelectedModel(tier)}>
            <Text
              style={[
                styles.modelChipText,
                selectedModel === tier && styles.modelChipTextActive,
              ]}>
              {tier.charAt(0).toUpperCase() + tier.slice(1)}
            </Text>
            <Text style={styles.modelCredits}>{MODEL_CREDITS[tier]} cr</Text>
          </TouchableOpacity>
        ))}
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
            <Text style={styles.responseText}>{lastResponse}</Text>
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
  modelSelector: {
    flexDirection: 'row',
    marginTop: 16,
    gap: 8,
  },
  modelChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
    alignItems: 'center',
  },
  modelChipActive: {
    backgroundColor: '#ff6b35',
    borderColor: '#ff6b35',
  },
  modelChipText: {
    color: '#999',
    fontSize: 13,
    fontWeight: '600',
  },
  modelChipTextActive: {
    color: '#fff',
  },
  modelCredits: {
    color: '#666',
    fontSize: 10,
    marginTop: 2,
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
