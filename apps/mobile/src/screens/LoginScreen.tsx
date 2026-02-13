import React, {useState} from 'react';
import {
  View,
  Text,
  Image,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';

const clawIcon = require('../assets/icon.png');
import {api} from '../lib/api';
import {saveTokens} from '../lib/auth';
import {useAuthStore} from '../lib/store';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const setAuthenticated = useAuthStore(s => s.setAuthenticated);

  const signInWithPassword = async () => {
    if (!email.trim() || !password.trim()) return;
    setLoading(true);
    try {
      const data = await api.login(email.trim(), password.trim());
      await saveTokens({
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
      });
      setAuthenticated(true);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
    }
  };

  const signUp = async () => {
    if (!email.trim() || !password.trim()) return;
    if (password.trim().length < 8) {
      Alert.alert('Error', 'Password must be at least 8 characters');
      return;
    }
    setLoading(true);
    try {
      const data = await api.signup(email.trim(), password.trim());
      await saveTokens({
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
      });
      setAuthenticated(true);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Image source={clawIcon} style={styles.logoIcon} />
      <Text style={styles.logo}>HeyClaw</Text>

      <TextInput
        style={styles.input}
        placeholder="your@email.com"
        placeholderTextColor="#666"
        keyboardType="email-address"
        autoCapitalize="none"
        value={email}
        onChangeText={setEmail}
      />

      <TextInput
        style={styles.input}
        placeholder="Password"
        placeholderTextColor="#666"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      <TouchableOpacity
        style={styles.primaryButton}
        onPress={isSignUp ? signUp : signInWithPassword}
        disabled={loading}>
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.primaryButtonText}>
            {isSignUp ? 'Create Account' : 'Sign In'}
          </Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity onPress={() => setIsSignUp(!isSignUp)}>
        <Text style={styles.toggleText}>
          {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
        </Text>
      </TouchableOpacity>

      <Text style={styles.terms}>
        By continuing, you agree to our Terms & Privacy Policy
      </Text>
    </View>
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
    width: 150,
    height: 150,
    resizeMode: 'contain',
    alignSelf: 'center',
    marginBottom: 12,
  },
  logo: {
    fontSize: 36,
    fontWeight: '800',
    color: '#ff6b35',
    textAlign: 'center',
    marginBottom: 48,
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
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  toggleText: {
    color: '#ff6b35',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 12,
  },
  terms: {
    color: '#666',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 24,
  },
});
