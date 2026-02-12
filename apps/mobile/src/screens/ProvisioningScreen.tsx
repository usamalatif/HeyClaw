import React, {useEffect, useState, useRef} from 'react';
import {View, Text, StyleSheet, Animated, Easing, TouchableOpacity} from 'react-native';
import {api} from '../lib/api';
import {useAuthStore} from '../lib/store';
import {supabase} from '../lib/supabase';

const STEPS = [
  {label: 'Connecting to server', duration: 800},
  {label: 'Creating AI agent', duration: 0}, // waits for API
  {label: 'Loading intelligence model', duration: 0}, // waits for polling
  {label: 'Setting up memory & tools', duration: 1200},
  {label: 'Running final checks', duration: 0}, // waits for health
  {label: 'Ready to go!', duration: 600},
];

function SpinnerIcon() {
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 800,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    ).start();
  }, [spin]);

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <Animated.View style={{transform: [{rotate}]}}>
      <View style={styles.spinnerDot} />
    </Animated.View>
  );
}

export default function ProvisioningScreen() {
  const [currentStep, setCurrentStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const setProvisioned = useAuthStore(s => s.setProvisioned);
  const setProfile = useAuthStore(s => s.setProfile);
  const progressAnim = useRef(new Animated.Value(0)).current;

  // Animate progress bar
  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: (currentStep + 1) / STEPS.length,
      duration: 400,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [currentStep, progressAnim]);

  useEffect(() => {
    let cancelled = false;

    const advanceStep = (step: number) => {
      if (!cancelled) setCurrentStep(step);
    };

    const wait = (ms: number) =>
      new Promise<void>(r => setTimeout(r, ms));

    const provision = async () => {
      try {
        // Step 0: Connecting
        advanceStep(0);
        await wait(STEPS[0].duration);
        if (cancelled) return;

        // Step 1: Creating agent (API call)
        advanceStep(1);
        const result = await api.provisionAgent();
        if (cancelled) return;

        const alreadyRunning =
          result.agentStatus === 'running' || result.agentStatus === 'sleeping';

        // Step 2: Loading model (poll until container is up)
        advanceStep(2);
        if (!alreadyRunning) {
          let ready = false;
          for (let i = 0; i < 60 && !cancelled; i++) {
            try {
              const status = await api.getAgentStatus();
              if (status.agentStatus === 'running' || status.agentStatus === 'sleeping') {
                ready = true;
                break;
              }
            } catch {
              // Not ready yet
            }
            await wait(2000);
          }
          if (cancelled) return;
          if (!ready) throw new Error('Agent took too long to start');
        } else {
          await wait(800);
        }
        if (cancelled) return;

        // Step 3: Setting up memory & tools
        advanceStep(3);
        await wait(STEPS[3].duration);
        if (cancelled) return;

        // Step 4: Final checks — wait for OpenClaw gateway to actually respond to HTTP
        advanceStep(4);
        let healthOk = false;
        for (let i = 0; i < 90 && !cancelled; i++) {
          try {
            const health = await api.getAgentHealth();
            if (health.healthy) {
              healthOk = true;
              break;
            }
          } catch {
            // API or container not ready yet
          }
          await wait(2000);
        }
        if (cancelled) return;
        if (!healthOk) throw new Error('Agent is starting up — please try again in a moment');

        // Step 5: Ready!
        advanceStep(5);

        // Reload profile
        try {
          const user = await api.getMe();
          setProfile({
            id: user.id,
            email: user.email,
            name: user.name,
            plan: user.plan,
            creditsRemaining: user.credits_remaining,
            creditsMonthlyLimit: user.credits_monthly_limit,
            agentStatus: user.agent_status,
            agentName: user.agent_name,
            ttsVoice: user.tts_voice,
            ttsSpeed: user.tts_speed,
          });
        } catch {
          // Proceed anyway
        }

        await wait(STEPS[5].duration);
        if (!cancelled) setProvisioned(true);
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || 'Failed to set up your agent');
        }
      }
    };

    provision();
    return () => {
      cancelled = true;
    };
  }, [setProvisioned, setProfile]);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>HeyClaw</Text>
      <Text style={styles.title}>Setting up your agent</Text>
      <Text style={styles.subtitle}>This only takes a moment</Text>

      <View style={styles.progressBar}>
        <Animated.View style={[styles.progressFill, {width: progressWidth}]} />
      </View>

      <View style={styles.stepsContainer}>
        {STEPS.map((step, i) => {
          const isComplete = i < currentStep;
          const isActive = i === currentStep && !error;
          const isPending = i > currentStep;

          return (
            <View key={i} style={styles.stepRow}>
              <View style={styles.stepIconContainer}>
                {isComplete ? (
                  <Text style={styles.checkmark}>{'\u2713'}</Text>
                ) : isActive ? (
                  <SpinnerIcon />
                ) : (
                  <View style={styles.pendingDot} />
                )}
              </View>
              <Text
                style={[
                  styles.stepText,
                  isComplete && styles.stepComplete,
                  isActive && styles.stepActive,
                  isPending && styles.stepPending,
                ]}>
                {step.label}
              </Text>
            </View>
          );
        })}
      </View>

      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={() => {
              setError(null);
              setCurrentStep(0);
            }}>
            <Text style={styles.retryText}>Try Again</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.signOutBtn}
            onPress={() => supabase.auth.signOut()}>
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
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
    fontSize: 28,
    fontWeight: '800',
    color: '#ff6b35',
    marginBottom: 12,
    letterSpacing: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 32,
  },
  progressBar: {
    width: '100%',
    height: 4,
    backgroundColor: '#1a1a1a',
    borderRadius: 2,
    marginBottom: 32,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#ff6b35',
    borderRadius: 2,
  },
  stepsContainer: {
    width: '100%',
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    height: 24,
  },
  stepIconContainer: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  checkmark: {
    color: '#22c55e',
    fontSize: 16,
    fontWeight: '700',
  },
  spinnerDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#ff6b35',
    borderTopColor: 'transparent',
  },
  pendingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#333',
  },
  stepText: {
    fontSize: 15,
    color: '#666',
  },
  stepComplete: {
    color: '#22c55e',
  },
  stepActive: {
    color: '#fff',
    fontWeight: '600',
  },
  stepPending: {
    color: '#444',
  },
  errorContainer: {
    marginTop: 32,
    alignItems: 'center',
  },
  errorText: {
    color: '#e63946',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
  },
  retryBtn: {
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 8,
    backgroundColor: '#ff6b35',
    marginBottom: 12,
  },
  retryText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  signOutBtn: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333',
  },
  signOutText: {
    color: '#999',
    fontSize: 14,
  },
});
