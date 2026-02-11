import React from 'react';
import {ActivityIndicator, View, StyleSheet} from 'react-native';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {useAuthStore} from '../lib/store';
import AuthNavigator from './AuthNavigator';
import MainNavigator from './MainNavigator';
import ProvisioningScreen from '../screens/ProvisioningScreen';

export type RootStackParamList = {
  Auth: undefined;
  Provisioning: undefined;
  Main: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

function LoadingScreen() {
  return (
    <View style={styles.loading}>
      <ActivityIndicator size="large" color="#7c3aed" />
    </View>
  );
}

export default function RootNavigator() {
  const {session, isProvisioned, profileLoading} = useAuthStore();

  // Wait for profile to load before deciding which screen to show
  if (session && profileLoading) {
    return (
      <NavigationContainer>
        <LoadingScreen />
      </NavigationContainer>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{headerShown: false}}>
        {!session ? (
          <Stack.Screen name="Auth" component={AuthNavigator} />
        ) : !isProvisioned ? (
          <Stack.Screen name="Provisioning" component={ProvisioningScreen} />
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
