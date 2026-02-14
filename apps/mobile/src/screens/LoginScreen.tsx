import React, {useState} from 'react';
import {
  View,
  Text,
  Image,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import { appleAuth, AppleButton } from '@invertase/react-native-apple-authentication';

const clawIcon = require('../assets/icon.png');
import {api} from '../lib/api';
import {saveTokens} from '../lib/auth';
import {useAuthStore} from '../lib/store';
import type {AuthStackParamList} from '../navigation/AuthNavigator';

type NavigationProp = NativeStackNavigationProp<AuthStackParamList, 'Login'>;

export default function LoginScreen() {
  const navigation = useNavigation<NavigationProp>();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const setAuthenticated = useAuthStore(s => s.setAuthenticated);
  const setIsNewUser = useAuthStore(s => s.setIsNewUser);

  const sendOTP = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      Alert.alert('Error', 'Please enter your email');
      return;
    }
    if (!trimmedEmail.includes('@')) {
      Alert.alert('Error', 'Please enter a valid email');
      return;
    }

    setLoading(true);
    try {
      const result = await api.sendOTP(trimmedEmail);
      navigation.navigate('OTP', {
        email: trimmedEmail,
        isSignUp: result.isNewUser,
      });
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
    }
  };

  const signInWithApple = async () => {
    try {
      setAppleLoading(true);
      const appleAuthRequestResponse = await appleAuth.performRequest({
        requestedOperation: appleAuth.Operation.LOGIN,
        requestedScopes: [appleAuth.Scope.FULL_NAME, appleAuth.Scope.EMAIL],
      });

      const credentialState = await appleAuth.getCredentialStateForUser(
        appleAuthRequestResponse.user,
      );

      if (credentialState !== appleAuth.State.AUTHORIZED) {
        throw new Error('Apple Sign In not authorized');
      }

      // Send to backend for verification
      const data = await api.appleSignIn({
        identityToken: appleAuthRequestResponse.identityToken!,
        authorizationCode: appleAuthRequestResponse.authorizationCode!,
        fullName: appleAuthRequestResponse.fullName,
        email: appleAuthRequestResponse.email,
      });

      await saveTokens({
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
      });

      if (data.isNewUser) {
        setIsNewUser(true);
      }
      setAuthenticated(true);
    } catch (err: any) {
      if (err.code !== appleAuth.Error.CANCELED) {
        Alert.alert('Error', err.message || 'Apple Sign In failed');
      }
    } finally {
      setAppleLoading(false);
    }
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Image source={clawIcon} style={styles.logoIcon} />
        <Text style={styles.logo}>HeyClaw</Text>
        <Text style={styles.tagline}>Your AI, one tap away</Text>

        <TextInput
          style={styles.input}
          placeholder="your@email.com"
          placeholderTextColor="#666"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          value={email}
          onChangeText={setEmail}
          editable={!loading}
        />

        <TouchableOpacity
          style={[styles.primaryButton, loading && styles.buttonDisabled]}
          onPress={sendOTP}
          disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryButtonText}>Continue with Email</Text>
          )}
        </TouchableOpacity>

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.dividerLine} />
        </View>

        {Platform.OS === 'ios' && appleAuth.isSupported && (
          <AppleButton
            buttonType={AppleButton.Type.SIGN_IN}
            buttonStyle={AppleButton.Style.WHITE}
            cornerRadius={12}
            style={styles.appleButton}
            onPress={signInWithApple}
          />
        )}

        {appleLoading && (
          <View style={styles.appleLoading}>
            <ActivityIndicator color="#ff6b35" />
          </View>
        )}

        <Text style={styles.terms}>
          By continuing, you agree to our{' '}
          <Text style={styles.link}>Terms of Service</Text> and{' '}
          <Text style={styles.link}>Privacy Policy</Text>
        </Text>
      </KeyboardAvoidingView>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  logoIcon: {
    width: 100,
    height: 100,
    resizeMode: 'contain',
    alignSelf: 'center',
    marginBottom: 8,
  },
  logo: {
    fontSize: 32,
    fontWeight: '800',
    color: '#ff6b35',
    textAlign: 'center',
  },
  tagline: {
    fontSize: 16,
    color: '#888',
    textAlign: 'center',
    marginBottom: 40,
  },
  input: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#fff',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#333',
  },
  primaryButton: {
    backgroundColor: '#ff6b35',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#333',
  },
  dividerText: {
    color: '#666',
    paddingHorizontal: 16,
    fontSize: 14,
  },
  appleButton: {
    width: '100%',
    height: 50,
  },
  appleLoading: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  terms: {
    color: '#666',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 24,
    lineHeight: 18,
  },
  link: {
    color: '#ff6b35',
  },
});
