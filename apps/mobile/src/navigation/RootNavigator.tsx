import React, {useCallback, useState} from 'react';
import {ActivityIndicator, View, StyleSheet} from 'react-native';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {useAuthStore} from '../lib/store';
import AuthNavigator from './AuthNavigator';
import MainNavigator from './MainNavigator';
import SetupScreen from '../screens/SetupScreen';

export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

function LoadingScreen() {
  return (
    <View style={styles.loading}>
      <ActivityIndicator size="large" color="#ff6b35" />
    </View>
  );
}

export default function RootNavigator() {
  const {isAuthenticated, profileLoading, isNewUser} = useAuthStore();
  const setIsNewUser = useAuthStore(s => s.setIsNewUser);
  const [setupDone, setSetupDone] = useState(false);

  const handleSetupReady = useCallback(() => {
    setSetupDone(true);
    setIsNewUser(false);
  }, [setIsNewUser]);

  // New user signup — show animated setup screen
  if (isAuthenticated && isNewUser && !setupDone) {
    return (
      <NavigationContainer>
        <SetupScreen
          onReady={handleSetupReady}
          profileLoaded={!profileLoading}
        />
      </NavigationContainer>
    );
  }

  // Returning user — wait for profile with simple spinner
  if (isAuthenticated && profileLoading) {
    return (
      <NavigationContainer>
        <LoadingScreen />
      </NavigationContainer>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{headerShown: false}}>
        {!isAuthenticated ? (
          <Stack.Screen name="Auth" component={AuthNavigator} />
        ) : (
          <Stack.Screen name="Main" component={MainNavigator} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0a0a0a',
  },
});
