import analytics from '@react-native-firebase/analytics';

// Initialize analytics
export const Analytics = {
  // Screen tracking
  async logScreenView(screenName: string) {
    try {
      await analytics().logScreenView({
        screen_name: screenName,
        screen_class: screenName,
      });
    } catch (err) {
      console.log('[Analytics] Screen view error:', err);
    }
  },

  // User events
  async logSignUp(method: string) {
    try {
      await analytics().logSignUp({ method });
    } catch (err) {
      console.log('[Analytics] Sign up error:', err);
    }
  },

  async logLogin(method: string) {
    try {
      await analytics().logLogin({ method });
    } catch (err) {
      console.log('[Analytics] Login error:', err);
    }
  },

  // Voice events
  async logVoiceMessage(durationSeconds: number) {
    try {
      await analytics().logEvent('voice_message', {
        duration_seconds: durationSeconds,
      });
    } catch (err) {
      console.log('[Analytics] Voice message error:', err);
    }
  },

  async logVoiceResponse(durationSeconds: number, wordCount: number) {
    try {
      await analytics().logEvent('voice_response', {
        duration_seconds: durationSeconds,
        word_count: wordCount,
      });
    } catch (err) {
      console.log('[Analytics] Voice response error:', err);
    }
  },

  // Subscription events
  async logSubscriptionView(plan: string) {
    try {
      await analytics().logEvent('subscription_view', {
        plan,
      });
    } catch (err) {
      console.log('[Analytics] Subscription view error:', err);
    }
  },

  async logSubscriptionStart(plan: string, price: number) {
    try {
      await analytics().logEvent('subscription_start', {
        plan,
        price,
        currency: 'USD',
      });
    } catch (err) {
      console.log('[Analytics] Subscription start error:', err);
    }
  },

  // Settings events
  async logVoiceChange(voice: string) {
    try {
      await analytics().logEvent('voice_change', {
        voice,
      });
    } catch (err) {
      console.log('[Analytics] Voice change error:', err);
    }
  },

  // Custom events
  async logEvent(eventName: string, params?: Record<string, any>) {
    try {
      await analytics().logEvent(eventName, params);
    } catch (err) {
      console.log('[Analytics] Event error:', err);
    }
  },

  // Set user properties
  async setUserId(userId: string) {
    try {
      await analytics().setUserId(userId);
    } catch (err) {
      console.log('[Analytics] Set user ID error:', err);
    }
  },

  async setUserProperty(name: string, value: string) {
    try {
      await analytics().setUserProperty(name, value);
    } catch (err) {
      console.log('[Analytics] Set user property error:', err);
    }
  },
};

export default Analytics;
