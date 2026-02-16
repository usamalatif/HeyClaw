import React, {useEffect, useRef, useState} from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  Animated,
  Easing,
  TouchableOpacity,
  Platform,
} from 'react-native';
import {requestVoicePermissions} from '../lib/audio';
import {requestNotificationPermission} from '../lib/notifications';
import {check, request, PERMISSIONS, RESULTS} from 'react-native-permissions';

const clawIcon = require('../assets/icon.png');

type SetupPhase = 'loading' | 'permissions' | 'finalizing' | 'ready';

interface SetupScreenProps {
  onReady: () => void;
  profileLoaded: boolean;
}

export default function SetupScreen({onReady, profileLoaded}: SetupScreenProps) {
  const [phase, setPhase] = useState<SetupPhase>('loading');
  const [micGranted, setMicGranted] = useState(false);
  const [speechGranted, setSpeechGranted] = useState(false);
  const [requesting, setRequesting] = useState(false);
  
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const profileLoadedRef = useRef(false);

  // Logo pulse animation
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.08,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [pulseAnim]);

  // Fade in on mount
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  // Initial loading phase - show for 2 seconds then move to permissions
  useEffect(() => {
    const timer = setTimeout(() => {
      setPhase('permissions');
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  // Check initial permission status
  useEffect(() => {
    if (phase === 'permissions') {
      checkPermissions();
    }
  }, [phase]);

  // Track profile loaded
  useEffect(() => {
    if (profileLoaded) {
      profileLoadedRef.current = true;
    }
  }, [profileLoaded]);

  // When both permissions granted, move to finalizing
  useEffect(() => {
    if (micGranted && speechGranted && phase === 'permissions') {
      setPhase('finalizing');
      
      // Request notification permission in background (optional, don't block)
      requestNotificationPermission().catch(() => {});
      
      // Wait a moment then complete
      setTimeout(() => {
        if (profileLoadedRef.current) {
          onReady();
        } else {
          // Wait for profile to load
          setPhase('ready');
        }
      }, 1500);
    }
  }, [micGranted, speechGranted, phase, onReady]);

  // If in ready phase and profile loads, complete
  useEffect(() => {
    if (phase === 'ready' && profileLoaded) {
      onReady();
    }
  }, [phase, profileLoaded, onReady]);

  const checkPermissions = async () => {
    if (Platform.OS === 'ios') {
      const micStatus = await check(PERMISSIONS.IOS.MICROPHONE);
      const speechStatus = await check(PERMISSIONS.IOS.SPEECH_RECOGNITION);
      
      setMicGranted(micStatus === RESULTS.GRANTED);
      setSpeechGranted(speechStatus === RESULTS.GRANTED);
    }
  };

  const handleRequestPermissions = async () => {
    if (requesting) return;
    setRequesting(true);

    try {
      if (Platform.OS === 'ios') {
        // Request microphone first
        if (!micGranted) {
          const micResult = await request(PERMISSIONS.IOS.MICROPHONE);
          setMicGranted(micResult === RESULTS.GRANTED);
        }

        // Then speech recognition
        if (!speechGranted) {
          const speechResult = await request(PERMISSIONS.IOS.SPEECH_RECOGNITION);
          setSpeechGranted(speechResult === RESULTS.GRANTED);
        }

        // Warm up Voice engine after permissions granted
        await requestVoicePermissions();
      }
    } catch (err) {
      console.error('[Setup] Permission request error:', err);
    } finally {
      setRequesting(false);
    }
  };

  const renderContent = () => {
    switch (phase) {
      case 'loading':
        return (
          <>
            <Text style={styles.statusText}>Creating your AI assistant...</Text>
            <View style={styles.progressBar}>
              <Animated.View style={[styles.progressFill, {width: '30%'}]} />
            </View>
          </>
        );

      case 'permissions':
        return (
          <>
            <Text style={styles.permissionTitle}>Enable Voice</Text>
            <Text style={styles.permissionDesc}>
              HeyClaw needs microphone and speech recognition to hear you.
            </Text>

            <View style={styles.permissionList}>
              <View style={styles.permissionItem}>
                <Text style={styles.permissionIcon}>{micGranted ? '✓' : '🎤'}</Text>
                <Text style={[styles.permissionLabel, micGranted && styles.permissionGranted]}>
                  Microphone {micGranted ? '(granted)' : ''}
                </Text>
              </View>
              <View style={styles.permissionItem}>
                <Text style={styles.permissionIcon}>{speechGranted ? '✓' : '🗣️'}</Text>
                <Text style={[styles.permissionLabel, speechGranted && styles.permissionGranted]}>
                  Speech Recognition {speechGranted ? '(granted)' : ''}
                </Text>
              </View>
            </View>

            {(!micGranted || !speechGranted) && (
              <TouchableOpacity
                style={[styles.permissionButton, requesting && styles.permissionButtonDisabled]}
                onPress={handleRequestPermissions}
                disabled={requesting}>
                <Text style={styles.permissionButtonText}>
                  {requesting ? 'Requesting...' : 'Allow Permissions'}
                </Text>
              </TouchableOpacity>
            )}
          </>
        );

      case 'finalizing':
        return (
          <>
            <Text style={styles.statusText}>Setting up voice...</Text>
            <View style={styles.progressBar}>
              <Animated.View style={[styles.progressFill, {width: '80%'}]} />
            </View>
          </>
        );

      case 'ready':
        return (
          <>
            <Text style={styles.statusText}>Almost ready...</Text>
            <View style={styles.progressBar}>
              <Animated.View style={[styles.progressFill, {width: '95%'}]} />
            </View>
          </>
        );
    }
  };

  return (
    <Animated.View style={[styles.container, {opacity: fadeAnim}]}>
      <Animated.View style={{transform: [{scale: pulseAnim}]}}>
        <Image source={clawIcon} style={styles.logo} />
      </Animated.View>

      <Text style={styles.title}>HeyClaw</Text>

      {renderContent()}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  logo: {
    width: 120,
    height: 120,
    resizeMode: 'contain',
    marginBottom: 16,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#ff6b35',
    marginBottom: 48,
  },
  statusText: {
    fontSize: 16,
    color: '#999',
    marginBottom: 24,
  },
  progressBar: {
    width: '100%',
    height: 4,
    backgroundColor: '#1a1a1a',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#ff6b35',
    borderRadius: 2,
  },
  permissionTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 12,
  },
  permissionDesc: {
    fontSize: 15,
    color: '#888',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 22,
  },
  permissionList: {
    width: '100%',
    marginBottom: 32,
  },
  permissionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    marginBottom: 12,
  },
  permissionIcon: {
    fontSize: 24,
    marginRight: 16,
  },
  permissionLabel: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '500',
  },
  permissionGranted: {
    color: '#4ade80',
  },
  permissionButton: {
    backgroundColor: '#ff6b35',
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 30,
  },
  permissionButtonDisabled: {
    opacity: 0.6,
  },
  permissionButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
});
