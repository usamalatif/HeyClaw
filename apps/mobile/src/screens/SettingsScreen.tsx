import React from 'react';
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

const PLAN_LABELS: Record<string, string> = {
  free: 'Free',
  starter: 'Starter — $24.99/mo',
  pro: 'Pro — $69.99/mo',
  ultra: 'Ultra — $179.99/mo',
};

export default function SettingsScreen() {
  const {profile, setSession, setProfile} = useAuthStore();

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
        <View style={styles.row}>
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

      {/* Agent section */}
      <Text style={styles.sectionHeader}>AGENT</Text>
      <View style={styles.card}>
        <TouchableOpacity style={styles.row}>
          <Text style={styles.label}>Name</Text>
          <Text style={styles.value}>
            {profile?.agentName ?? 'HeyClaw'} {'>'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Voice section */}
      <Text style={styles.sectionHeader}>VOICE</Text>
      <View style={styles.card}>
        <TouchableOpacity style={styles.row}>
          <Text style={styles.label}>Voice</Text>
          <Text style={styles.value}>
            {profile?.ttsVoice ?? 'Default'} {'>'}
          </Text>
        </TouchableOpacity>
        <View style={styles.row}>
          <Text style={styles.label}>Speed</Text>
          <Text style={styles.value}>{profile?.ttsSpeed ?? 1.0}x</Text>
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
