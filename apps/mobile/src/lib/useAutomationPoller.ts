import {useEffect, useRef, useCallback} from 'react';
import {AppState, AppStateStatus} from 'react-native';
import {useAuthStore, useChatStore} from './store';
import {api} from './api';
import {notifyAutomationResult, isAppInBackground} from './notifications';

const POLL_INTERVAL_MS = 60_000; // Check every 60 seconds in foreground

/**
 * Polls for new automation/cron results and shows notifications.
 * - Checks immediately when app comes to foreground
 * - Polls every 60s while app is active
 * - Adds results to chat as system messages
 */
export function useAutomationPoller() {
  const session = useAuthStore(s => s.session);
  const isProvisioned = useAuthStore(s => s.isProvisioned);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const checkForResults = useCallback(async () => {
    if (!session || !isProvisioned) return;

    try {
      const {newResults, agentName} = await api.checkAutomation();

      if (newResults && newResults.length > 0) {
        for (const result of newResults) {
          // Show notification (works in both foreground and background)
          await notifyAutomationResult(
            result.job_name || 'Automation',
            result.result || 'Task completed',
            agentName,
          );

          // Add to chat history as assistant message
          useChatStore.getState().addMessage({
            id: `auto-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            role: 'assistant',
            content: `[${result.job_name || 'Automation'}] ${result.result}`,
          });
        }
      }
    } catch {
      // Silently ignore polling errors
    }
  }, [session, isProvisioned]);

  useEffect(() => {
    if (!session || !isProvisioned) return;

    // Check immediately on mount
    checkForResults();

    // Poll periodically while in foreground
    intervalRef.current = setInterval(() => {
      if (!isAppInBackground()) {
        checkForResults();
      }
    }, POLL_INTERVAL_MS);

    // Check when app comes to foreground
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        checkForResults();
      }
    });

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      subscription.remove();
    };
  }, [session, isProvisioned, checkForResults]);
}
