import React, {useEffect} from 'react';
import {StatusBar} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {supabase} from './src/lib/supabase';
import {useAuthStore} from './src/lib/store';
import {api} from './src/lib/api';
import {requestNotificationPermission, startAppStateTracking} from './src/lib/notifications';
import {useAutomationPoller} from './src/lib/useAutomationPoller';
import RootNavigator from './src/navigation/RootNavigator';

function App() {
  const setSession = useAuthStore(s => s.setSession);
  const setProfile = useAuthStore(s => s.setProfile);
  const setProvisioned = useAuthStore(s => s.setProvisioned);
  const setProfileLoading = useAuthStore(s => s.setProfileLoading);
  const session = useAuthStore(s => s.session);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({data: {session: s}}) => {
      setSession(s);
    });

    // Listen for auth changes
    const {
      data: {subscription},
    } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });

    return () => subscription.unsubscribe();
  }, [setSession]);

  // Request notification permission + track app foreground/background
  useEffect(() => {
    requestNotificationPermission();
    const cleanup = startAppStateTracking();
    return cleanup;
  }, []);

  // Poll for automation/cron results
  useAutomationPoller();

  // Load user profile when session changes
  useEffect(() => {
    if (!session) {
      setProfile(null);
      setProvisioned(false);
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
          plan: user.plan,
          creditsRemaining: user.credits_remaining,
          creditsMonthlyLimit: user.credits_monthly_limit,
          agentStatus: user.agent_status,
          agentName: user.agent_name,
          ttsVoice: user.tts_voice,
          ttsSpeed: user.tts_speed,
        });

        // Skip provisioning if agent is already running or sleeping
        if (
          user.agent_status === 'running' ||
          user.agent_status === 'sleeping'
        ) {
          setProvisioned(true);
        }
      } catch (err) {
        console.error('Failed to load profile:', err);
      } finally {
        setProfileLoading(false);
      }
    };

    loadProfile();
  }, [session, setProfile, setProvisioned, setProfileLoading]);

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor="#0a0a0a" />
      <RootNavigator />
    </SafeAreaProvider>
  );
}

export default App;
