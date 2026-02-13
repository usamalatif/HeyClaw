import React, {useEffect} from 'react';
import {StatusBar} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {getTokens} from './src/lib/auth';
import {useAuthStore} from './src/lib/store';
import {api} from './src/lib/api';
import {requestNotificationPermission, startAppStateTracking} from './src/lib/notifications';
import {useAutomationPoller} from './src/lib/useAutomationPoller';
import RootNavigator from './src/navigation/RootNavigator';

function App() {
  const setAuthenticated = useAuthStore(s => s.setAuthenticated);
  const setProfile = useAuthStore(s => s.setProfile);
  const setProfileLoading = useAuthStore(s => s.setProfileLoading);
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);

  // Restore session from Keychain on startup
  useEffect(() => {
    const restoreSession = async () => {
      const tokens = await getTokens();
      if (tokens?.accessToken) {
        setAuthenticated(true);
      } else {
        setAuthenticated(false);
        setProfileLoading(false);
      }
    };
    restoreSession();
  }, [setAuthenticated, setProfileLoading]);

  // Request notification permission + track app foreground/background
  useEffect(() => {
    requestNotificationPermission();
    const cleanup = startAppStateTracking();
    return cleanup;
  }, []);

  // Poll for automation/cron results
  useAutomationPoller();

  // Load user profile when authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      setProfile(null);
      setProfileLoading(false);
      return;
    }

    setProfileLoading(true);
    const loadProfile = async () => {
      try {
        const user = await api.getMe();
        setProfile({
          id: user.id,
          email: user.email,
          name: user.name,
          plan: user.plan || 'free',
          agentName: user.agent?.displayName || 'HeyClaw',
          voice: user.agent?.voice || 'alloy',
          dailyMessagesUsed: user.usage?.textMessages || 0,
          dailyMessagesLimit: user.limits?.dailyTextMessages || 50,
          dailyVoiceSeconds: user.usage?.voiceSeconds || 0,
          dailyVoiceLimit: (user.limits?.dailyVoiceInputMinutes || 5) * 60,
        });
      } catch (err) {
        console.error('Failed to load profile:', err);
      } finally {
        setProfileLoading(false);
      }
    };

    loadProfile();
  }, [isAuthenticated, setProfile, setProfileLoading]);

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor="#0a0a0a" />
      <RootNavigator />
    </SafeAreaProvider>
  );
}

export default App;
