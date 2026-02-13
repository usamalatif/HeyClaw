import React, {useState} from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  Pressable,
  ScrollView,
  TouchableOpacity,
} from 'react-native';

const clawIcon = require('../assets/icon.png');
import {useAuthStore, useVoiceStore} from '../lib/store';
import PaywallModal from '../components/PaywallModal';
import {useVoiceFlow} from '../lib/useVoiceFlow';
import {startSpeechRecognition, stopSpeechRecognition, cancelSpeechRecognition} from '../lib/audio';
import VoiceOrb from '../components/VoiceOrb';

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
  const [showPaywall, setShowPaywall] = useState(false);
  const {isRecording, isProcessing, isPlaying, lastTranscription, lastResponse} =
    useVoiceStore();
  const setRecording = useVoiceStore(s => s.setRecording);
  const {processVoiceInput, cancel} = useVoiceFlow();

  const hasMessages = (profile?.dailyMessagesUsed ?? 0) < (profile?.dailyMessagesLimit ?? 50);

  const getStatusText = () => {
    if (isRecording) return 'Listening...';
    if (isProcessing) return 'Thinking...';
    if (isPlaying) return 'Speaking...';
    return 'What can I help with?';
  };

  const setLastTranscription = useVoiceStore(s => s.setLastTranscription);

  const handlePressIn = async () => {
    try {
      setLastTranscription(null);
      await startSpeechRecognition((partialText) => {
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
      {/* Usage display */}
      <View style={styles.header}>
        <Text style={styles.usage}>
          {profile?.dailyMessagesUsed ?? 0}/{profile?.dailyMessagesLimit ?? 50} messages
        </Text>
      </View>

      {/* Animated voice orb */}
      <View style={styles.avatarArea}>
        <VoiceOrb
          state={
            isRecording
              ? 'recording'
              : isProcessing
              ? 'processing'
              : isPlaying
              ? 'playing'
              : 'idle'
          }
          size={100}>
          {isRecording ? (
            <Text style={styles.avatarEmoji}>{'\uD83C\uDFA4'}</Text>
          ) : isProcessing ? (
            <Text style={styles.avatarEmoji}>{'\uD83E\uDD14'}</Text>
          ) : isPlaying ? (
            <Text style={styles.avatarEmoji}>{'\uD83D\uDD0A'}</Text>
          ) : (
            <Image source={clawIcon} style={styles.avatarIcon} />
          )}
        </VoiceOrb>
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
              !hasMessages && styles.voiceButtonDisabled,
            ]}
            disabled={!hasMessages}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}>
            <Text style={styles.voiceButtonText}>
              {isRecording ? 'RELEASE\nTO SEND' : 'HOLD\nTO TALK'}
            </Text>
          </Pressable>
        )}

        {!hasMessages && (
          <TouchableOpacity onPress={() => setShowPaywall(true)}>
            <Text style={styles.noMessages}>
              Daily limit reached. Tap to upgrade.
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <PaywallModal visible={showPaywall} onClose={() => setShowPaywall(false)} />
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
  usage: {
    color: '#ff6b35',
    fontSize: 14,
    fontWeight: '600',
  },
  avatarArea: {
    marginTop: 20,
    alignItems: 'center',
  },
  avatarEmoji: {
    fontSize: 40,
  },
  avatarIcon: {
    width: 90,
    height: 90,
    resizeMode: 'contain',
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
  voiceButton: {
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: '#ff6b35',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
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
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: '#e63946',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
  },
  voiceButtonText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  noMessages: {
    color: '#e63946',
    fontSize: 13,
    marginTop: 16,
  },
});
