// Analytics stub - Firebase removed due to Xcode 26 compatibility issues
// TODO: Re-add Firebase when compatible, or use alternative analytics

export const Analytics = {
  async logScreenView(_screenName: string) {},
  async logSignUp(_method: string) {},
  async logLogin(_method: string) {},
  async logVoiceMessage(_durationSeconds: number) {},
  async logVoiceResponse(_durationSeconds: number, _wordCount: number) {},
  async logSubscriptionView(_plan: string) {},
  async logSubscriptionStart(_plan: string, _price: number) {},
  async logVoiceChange(_voice: string) {},
  async logEvent(_eventName: string, _params?: Record<string, any>) {},
  async setUserId(_userId: string) {},
  async setUserProperty(_name: string, _value: string) {},
};

export default Analytics;
