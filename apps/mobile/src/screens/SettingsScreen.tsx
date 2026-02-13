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
import {api} from '../lib/api';
import PaywallModal from '../components/PaywallModal';
import {openSubscriptionManagement, restorePurchases} from '../lib/iap';

const PLAN_LABELS: Record<string, string> = {
  free: 'Free',
  pro: 'Pro — $24.99/mo',
  premium: 'Premium — $69.99/mo',
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

export default function SettingsScreen() {
  const {profile, setAuthenticated, setProfile} = useAuthStore();
  const [saving, setSaving] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);

  const currentVoice = profile?.voice || 'alloy';

  const updateVoice = async (voice: string) => {
    if (saving) return;
    setSaving(true);
    try {
      await api.updatePersonality({voice});
      setProfile({
        ...profile!,
        voice,
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
          await api.logout();
          setAuthenticated(false);
          setProfile(null);
        },
      },
    ]);
  };

  const handleUpgrade = () => {
    setShowPaywall(true);
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
          <Text style={styles.label}>Messages Today</Text>
          <Text style={styles.valueHighlight}>
            {profile?.dailyMessagesUsed ?? 0} / {profile?.dailyMessagesLimit ?? 50}
          </Text>
        </View>
      </View>

      {(profile?.plan === 'free' || !profile?.plan) && (
        <TouchableOpacity style={styles.upgradeButton} onPress={handleUpgrade}>
          <Text style={styles.upgradeButtonText}>Upgrade Plan</Text>
        </TouchableOpacity>
      )}

      {profile?.plan && profile.plan !== 'free' && (
        <TouchableOpacity style={styles.manageButton} onPress={openSubscriptionManagement}>
          <Text style={styles.manageButtonText}>Manage Subscription</Text>
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
              onPress={() => updateVoice(v.id)}
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

      {/* Restore purchases */}
      <TouchableOpacity style={styles.restoreButton} onPress={() => restorePurchases()}>
        <Text style={styles.restoreText}>Restore Purchases</Text>
      </TouchableOpacity>

      {/* Sign out */}
      <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>

      <View style={styles.footer} />

      <PaywallModal visible={showPaywall} onClose={() => setShowPaywall(false)} />
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
  manageButton: {
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ff6b35',
  },
  manageButtonText: {
    color: '#ff6b35',
    fontSize: 16,
    fontWeight: '600',
  },
  restoreButton: {
    marginHorizontal: 16,
    marginTop: 24,
    padding: 12,
    alignItems: 'center',
  },
  restoreText: {
    color: '#999',
    fontSize: 14,
    fontWeight: '500',
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
