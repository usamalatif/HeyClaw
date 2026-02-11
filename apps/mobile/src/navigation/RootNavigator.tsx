import React from 'react';
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

export default function RootNavigator() {
  const {session, isProvisioned} = useAuthStore();

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
