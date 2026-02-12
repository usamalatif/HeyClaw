import notifee, {AuthorizationStatus} from '@notifee/react-native';
import {AppState, AppStateStatus} from 'react-native';

// Module-level app state tracking (not Zustand — no UI depends on this)
let appState: AppStateStatus = AppState.currentState;

export function startAppStateTracking(): () => void {
  const subscription = AppState.addEventListener('change', (nextState) => {
    appState = nextState;
  });
  return () => subscription.remove();
}

export function isAppInBackground(): boolean {
  return appState !== 'active';
}

export async function requestNotificationPermission(): Promise<boolean> {
  const settings = await notifee.requestPermission();
  return (
    settings.authorizationStatus === AuthorizationStatus.AUTHORIZED ||
    settings.authorizationStatus === AuthorizationStatus.PROVISIONAL
  );
}

export async function notifyResponseReady(agentName?: string): Promise<void> {
  if (!isAppInBackground()) return;

  await notifee.displayNotification({
    title: agentName ?? 'HeyClaw',
    body: 'Your response is ready',
    ios: {
      sound: 'default',
      foregroundPresentationOptions: {
        badge: false,
        sound: false,
        banner: false,
        list: false,
      },
    },
  });
}

export async function notifyAutomationResult(
  jobName: string,
  result: string,
  agentName?: string,
): Promise<void> {
  const title = agentName ?? 'HeyClaw';
  const body = `${jobName}: ${result.length > 100 ? result.slice(0, 100) + '...' : result}`;

  await notifee.displayNotification({
    title,
    body,
    ios: {
      sound: 'default',
      foregroundPresentationOptions: {
        badge: true,
        sound: true,
        banner: true,
        list: true,
      },
    },
  });
}
