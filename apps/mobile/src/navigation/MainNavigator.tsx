import React from 'react';
import {View} from 'react-native';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import HomeScreen from '../screens/HomeScreen';
import ChatScreen from '../screens/ChatScreen';
import SettingsScreen from '../screens/SettingsScreen';

const ICON_SIZE = 26;

function MicIcon({color}: {color: string}) {
  const s = ICON_SIZE;
  return (
    <View style={{width: s, height: s, alignItems: 'center', justifyContent: 'center'}}>
      <View
        style={{
          width: s * 0.38,
          height: s * 0.5,
          borderRadius: s * 0.19,
          backgroundColor: color,
        }}
      />
      <View
        style={{
          width: s * 0.58,
          height: s * 0.32,
          borderBottomLeftRadius: s * 0.29,
          borderBottomRightRadius: s * 0.29,
          borderWidth: 2,
          borderTopWidth: 0,
          borderColor: color,
          marginTop: -s * 0.04,
        }}
      />
      <View style={{width: 2, height: s * 0.08, backgroundColor: color}} />
      <View style={{width: s * 0.35, height: 2, borderRadius: 1, backgroundColor: color}} />
    </View>
  );
}

function ChatIcon({color}: {color: string}) {
  const s = ICON_SIZE;
  return (
    <View style={{width: s, height: s, justifyContent: 'center', alignItems: 'center'}}>
      <View
        style={{
          width: s * 0.82,
          height: s * 0.6,
          borderRadius: s * 0.25,
          borderWidth: 2,
          borderColor: color,
        }}
      />
      <View
        style={{
          position: 'absolute',
          bottom: s * 0.08,
          left: s * 0.15,
          width: 0,
          height: 0,
          borderLeftWidth: s * 0.18,
          borderRightWidth: 0,
          borderTopWidth: s * 0.18,
          borderLeftColor: 'transparent',
          borderRightColor: 'transparent',
          borderTopColor: color,
        }}
      />
    </View>
  );
}

function GearIcon({color}: {color: string}) {
  const s = ICON_SIZE;
  return (
    <View style={{width: s, height: s, justifyContent: 'center', alignItems: 'center'}}>
      {[0, 45, 90, 135].map(deg => (
        <View
          key={deg}
          style={{
            position: 'absolute',
            width: s * 0.16,
            height: s * 0.82,
            borderRadius: s * 0.08,
            backgroundColor: color,
            transform: [{rotate: `${deg}deg`}],
          }}
        />
      ))}
      <View
        style={{
          width: s * 0.5,
          height: s * 0.5,
          borderRadius: s * 0.25,
          borderWidth: 2.5,
          borderColor: color,
          backgroundColor: '#0a0a0a',
        }}
      />
    </View>
  );
}

export type MainTabParamList = {
  HomeTab: undefined;
  ChatTab: undefined;
  SettingsTab: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

export default function MainNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#0a0a0a',
          borderTopColor: '#1a1a1a',
        },
        tabBarActiveTintColor: '#ff6b35',
        tabBarInactiveTintColor: '#666',
        tabBarShowLabel: false,
      }}>
      <Tab.Screen
        name="HomeTab"
        component={HomeScreen}
        options={{
          tabBarIcon: ({color}) => <MicIcon color={color} />,
        }}
      />
      <Tab.Screen
        name="ChatTab"
        component={ChatScreen}
        options={{
          tabBarIcon: ({color}) => <ChatIcon color={color} />,
        }}
      />
      <Tab.Screen
        name="SettingsTab"
        component={SettingsScreen}
        options={{
          tabBarIcon: ({color}) => <GearIcon color={color} />,
        }}
      />
    </Tab.Navigator>
  );
}
