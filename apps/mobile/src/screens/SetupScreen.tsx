import React, {useEffect, useRef, useState} from 'react';
import {View, Text, Image, StyleSheet, Animated, Easing} from 'react-native';

const clawIcon = require('../assets/icon.png');

const SETUP_STEPS = [
  'Creating your AI assistant...',
  'Setting up workspace...',
  'Configuring voice...',
  'Almost ready...',
];

const MIN_DISPLAY_MS = 6000;

interface SetupScreenProps {
  onReady: () => void;
  profileLoaded: boolean;
}

export default function SetupScreen({onReady, profileLoaded}: SetupScreenProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const readyRef = useRef(false);
  const minTimeRef = useRef(false);

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

  // Step through messages
  useEffect(() => {
    const interval = setInterval(() => {
      setStepIndex(prev => {
        if (prev < SETUP_STEPS.length - 1) return prev + 1;
        return prev;
      });
    }, 1800);
    return () => clearInterval(interval);
  }, []);

  // Minimum display time
  useEffect(() => {
    const timer = setTimeout(() => {
      minTimeRef.current = true;
      if (readyRef.current) {
        onReady();
      }
    }, MIN_DISPLAY_MS);
    return () => clearTimeout(timer);
  }, [onReady]);

  // Check if profile loaded + min time passed
  useEffect(() => {
    if (profileLoaded) {
      readyRef.current = true;
      if (minTimeRef.current) {
        onReady();
      }
    }
  }, [profileLoaded, onReady]);

  return (
    <Animated.View style={[styles.container, {opacity: fadeAnim}]}>
      <Animated.View style={{transform: [{scale: pulseAnim}]}}>
        <Image source={clawIcon} style={styles.logo} />
      </Animated.View>

      <Text style={styles.title}>HeyClaw</Text>

      <View style={styles.stepsContainer}>
        {SETUP_STEPS.map((step, i) => (
          <Animated.Text
            key={step}
            style={[
              styles.stepText,
              i < stepIndex && styles.stepDone,
              i === stepIndex && styles.stepActive,
              i > stepIndex && styles.stepPending,
            ]}>
            {i < stepIndex ? '\u2713 ' : i === stepIndex ? '\u25CB ' : '  '}
            {step}
          </Animated.Text>
        ))}
      </View>

      <View style={styles.progressBar}>
        <Animated.View
          style={[
            styles.progressFill,
            {
              width: `${Math.min(((stepIndex + 1) / SETUP_STEPS.length) * 100, 100)}%`,
            },
          ]}
        />
      </View>
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
  stepsContainer: {
    alignSelf: 'stretch',
    marginBottom: 32,
  },
  stepText: {
    fontSize: 16,
    marginBottom: 14,
    fontWeight: '500',
  },
  stepDone: {
    color: '#4ade80',
  },
  stepActive: {
    color: '#fff',
  },
  stepPending: {
    color: '#444',
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
});
