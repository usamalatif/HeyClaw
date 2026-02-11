import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import {useAuthStore} from '../lib/store';
import {supabase} from '../lib/supabase';
import {api} from '../lib/api';

const PLAN_LABELS: Record<string, string> = {
  free: 'Free',
  starter: 'Starter — $24.99/mo',
  pro: 'Pro — $69.99/mo',
  ultra: 'Ultra — $179.99/mo',
};

const VOICES = [
  {id: 'alloy', label: 'Alloy'},
  {id: 'ash', label: 'Ash'},
  {id: 'coral', label: 'Coral'},
  {id: 'echo', label: 'Echo'},
  {id: 'fable', label: 'Fable'},
  {id: 'nova', label: 'Nova'},
  {id: 'onyx', label: 'Onyx'},
  {id: 'sage', label: 'Sage'},
  {id: 'shimmer', label: 'Shimmer'},
];

const SPEEDS = [0.75, 1.0, 1.25, 1.5, 2.0];

export default function SettingsScreen() {
  const {profile, setSession, setProfile} = useAuthStore();
  const [saving, setSaving] = useState(false);

  const currentVoice = profile?.ttsVoice || 'alloy';
  const currentSpeed = profile?.ttsSpeed ?? 1.0;

  const updateSetting = async (field: string, value: any) => {
    if (saving) return;
    setSaving(true);
    try {
      const updated = await api.updateMe({[field]: value});
      setProfile({
        ...profile!,
        ttsVoice: updated.tts_voice ?? profile!.ttsVoice,
        ttsSpeed: updated.tts_speed ?? profile!.ttsSpeed,
      });
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure?', [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await supabase.auth.signOut();
          setSession(null);
          setProfile(null);
        },
      },
    ]);
  };

  const handleUpgrade = () => {
    // TODO: Show IAP upgrade modal
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Settings</Text>

      {/* Account section */}
      <Text style={styles.sectionHeader}>ACCOUNT</Text>
      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.label}>Email</Text>
          <Text style={styles.value}>{profile?.email ?? '—'}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Plan</Text>
          <Text style={styles.value}>
            {PLAN_LABELS[profile?.plan ?? 'free']}
          </Text>
        </View>
        <View style={[styles.row, styles.rowLast]}>
          <Text style={styles.label}>Credits</Text>
          <Text style={styles.valueHighlight}>
            {profile?.creditsRemaining ?? 0} / {profile?.creditsMonthlyLimit ?? 50}
          </Text>
        </View>
      </View>

      {(profile?.plan === 'free' || !profile?.plan) && (
        <TouchableOpacity style={styles.upgradeButton} onPress={handleUpgrade}>
          <Text style={styles.upgradeButtonText}>Upgrade Plan</Text>
        </TouchableOpacity>
      )}

      {/* Voice selection */}
      <Text style={styles.sectionHeader}>VOICE</Text>
      <View style={styles.card}>
        <View style={styles.voiceGrid}>
          {VOICES.map(v => (
            <TouchableOpacity
              key={v.id}
              style={[
                styles.voiceChip,
                currentVoice === v.id && styles.voiceChipActive,
              ]}
              onPress={() => updateSetting('tts_voice', v.id)}
              disabled={saving}>
              <Text
                style={[
                  styles.voiceChipText,
                  currentVoice === v.id && styles.voiceChipTextActive,
                ]}>
                {v.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Speed selection */}
      <Text style={styles.sectionHeader}>SPEED</Text>
      <View style={styles.card}>
        <View style={styles.speedRow}>
          {SPEEDS.map(s => (
            <TouchableOpacity
              key={s}
              style={[
                styles.speedChip,
                currentSpeed === s && styles.speedChipActive,
              ]}
              onPress={() => updateSetting('tts_speed', s)}
              disabled={saving}>
              <Text
                style={[
                  styles.speedChipText,
                  currentSpeed === s && styles.speedChipTextActive,
                ]}>
                {s}x
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Sign out */}
      <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>

      <View style={styles.footer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    paddingTop: 60,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
    paddingHorizontal: 24,
    marginBottom: 24,
  },
  sectionHeader: {
    color: '#666',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
    paddingHorizontal: 24,
    marginTop: 24,
    marginBottom: 8,
  },
  card: {
    backgroundColor: '#1a1a1a',
    marginHorizontal: 16,
    borderRadius: 12,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  label: {
    color: '#fff',
    fontSize: 15,
  },
  value: {
    color: '#999',
    fontSize: 15,
  },
  valueHighlight: {
    color: '#ff6b35',
    fontSize: 15,
    fontWeight: '600',
  },
  upgradeButton: {
    backgroundColor: '#ff6b35',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  upgradeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  voiceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 12,
    gap: 8,
  },
  voiceChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#0a0a0a',
    borderWidth: 1,
    borderColor: '#333',
  },
  voiceChipActive: {
    backgroundColor: '#ff6b35',
    borderColor: '#ff6b35',
  },
  voiceChipText: {
    color: '#999',
    fontSize: 14,
    fontWeight: '500',
  },
  voiceChipTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  speedRow: {
    flexDirection: 'row',
    padding: 12,
    gap: 8,
    justifyContent: 'space-between',
  },
  speedChip: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#0a0a0a',
    borderWidth: 1,
    borderColor: '#333',
    alignItems: 'center',
  },
  speedChipActive: {
    backgroundColor: '#ff6b35',
    borderColor: '#ff6b35',
  },
  speedChipText: {
    color: '#999',
    fontSize: 14,
    fontWeight: '500',
  },
  speedChipTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  signOutButton: {
    marginHorizontal: 16,
    marginTop: 32,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e63946',
    alignItems: 'center',
  },
  signOutText: {
    color: '#e63946',
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    height: 60,
  },
});
