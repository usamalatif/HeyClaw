// Token manager — stores JWT + refresh token in Keychain
import * as Keychain from 'react-native-keychain';

const ACCESS_TOKEN_KEY = 'heyclaw_access_token';
const REFRESH_TOKEN_KEY = 'heyclaw_refresh_token';

interface Tokens {
  accessToken: string;
  refreshToken: string;
}

export async function saveTokens(tokens: Tokens): Promise<void> {
  await Keychain.setGenericPassword(ACCESS_TOKEN_KEY, tokens.accessToken, {
    service: ACCESS_TOKEN_KEY,
  });
  await Keychain.setGenericPassword(REFRESH_TOKEN_KEY, tokens.refreshToken, {
    service: REFRESH_TOKEN_KEY,
  });
}

export async function getTokens(): Promise<Tokens | null> {
  try {
    const access = await Keychain.getGenericPassword({service: ACCESS_TOKEN_KEY});
    const refresh = await Keychain.getGenericPassword({service: REFRESH_TOKEN_KEY});
    if (!access || !refresh) return null;
    return {accessToken: access.password, refreshToken: refresh.password};
  } catch {
    return null;
  }
}

export async function getAccessToken(): Promise<string | null> {
  try {
    const cred = await Keychain.getGenericPassword({service: ACCESS_TOKEN_KEY});
    return cred ? cred.password : null;
  } catch {
    return null;
  }
}

export async function clearTokens(): Promise<void> {
  await Keychain.resetGenericPassword({service: ACCESS_TOKEN_KEY});
  await Keychain.resetGenericPassword({service: REFRESH_TOKEN_KEY});
}
