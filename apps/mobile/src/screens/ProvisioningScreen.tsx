import React, {useEffect, useState} from 'react';
import {View, Text, StyleSheet, ActivityIndicator, TouchableOpacity} from 'react-native';
import {api} from '../lib/api';
import {useAuthStore} from '../lib/store';
import {supabase} from '../lib/supabase';

const steps = [
  'Creating your AI agent',
  'Configuring personality',
  'Almost ready...',
];

export default function ProvisioningScreen() {
  const [currentStep, setCurrentStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const setProvisioned = useAuthStore(s => s.setProvisioned);
  const setProfile = useAuthStore(s => s.setProfile);

  useEffect(() => {
    let cancelled = false;

    const provision = async () => {
      try {
        // Step 1: Trigger provisioning
        setCurrentStep(0);
        const result = await api.provisionAgent();

        if (cancelled) return;

        if (result.agentStatus === 'running' || result.agentStatus === 'sleeping') {
          // Already done — advance steps visually then proceed
          setCurrentStep(1);
          await new Promise(r => setTimeout(r, 500));
          if (cancelled) return;
          setCurrentStep(2);
          await new Promise(r => setTimeout(r, 500));
          if (cancelled) return;

          // Reload profile with updated agent status
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
            // Profile load failed, proceed anyway
          }

          setProvisioned(true);
          return;
        }

        // Still provisioning — poll until ready
        setCurrentStep(1);
        const poll = async () => {
          if (cancelled) return;
          try {
            const status = await api.getAgentStatus();
            if (
              status.agentStatus === 'running' ||
              status.agentStatus === 'sleeping'
            ) {
              setCurrentStep(2);
              await new Promise(r => setTimeout(r, 500));
              if (!cancelled) setProvisioned(true);
              return;
            }
          } catch {
            // Not ready yet
          }

          if (!cancelled) {
            setCurrentStep(prev => Math.min(prev + 1, steps.length - 1));
            setTimeout(poll, 2000);
          }
        };

        setTimeout(poll, 2000);
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

  const progress = ((currentStep + 1) / steps.length) * 100;

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>HeyClaw</Text>
      <Text style={styles.title}>Setting up your agent...</Text>

      <View style={styles.progressBar}>
        <View style={[styles.progressFill, {width: `${progress}%`}]} />
      </View>
      <Text style={styles.progressText}>{Math.round(progress)}%</Text>

      {steps.map((step, i) => (
        <View key={i} style={styles.stepRow}>
          <Text style={styles.stepIcon}>
            {i < currentStep ? '\u2713' : '\u25E6'}
          </Text>
          <Text
            style={[styles.stepText, i <= currentStep && styles.stepActive]}>
            {step}
          </Text>
        </View>
      ))}

      {error ? (
        <>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            style={styles.signOutBtn}
            onPress={() => supabase.auth.signOut()}>
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <ActivityIndicator
            color="#ff6b35"
            style={styles.spinner}
            size="small"
          />
          <Text style={styles.hint}>This only takes a moment</Text>
        </>
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
    fontSize: 24,
    fontWeight: '700',
    color: '#ff6b35',
    marginBottom: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 24,
  },
  progressBar: {
    width: '100%',
    height: 6,
    backgroundColor: '#1a1a1a',
    borderRadius: 3,
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#ff6b35',
    borderRadius: 3,
  },
  progressText: {
    color: '#999',
    fontSize: 14,
    marginBottom: 24,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    width: '100%',
  },
  stepIcon: {
    color: '#ff6b35',
    fontSize: 16,
    marginRight: 12,
  },
  stepText: {
    color: '#666',
    fontSize: 16,
  },
  stepActive: {
    color: '#fff',
  },
  spinner: {
    marginTop: 32,
  },
  hint: {
    color: '#666',
    fontSize: 14,
    marginTop: 16,
  },
  errorText: {
    color: '#e63946',
    fontSize: 14,
    marginTop: 32,
    textAlign: 'center',
  },
  signOutBtn: {
    marginTop: 20,
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
