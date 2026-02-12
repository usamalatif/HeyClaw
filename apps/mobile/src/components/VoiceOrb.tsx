import React, {useEffect, useRef} from 'react';
import {View, Animated, StyleSheet, Easing} from 'react-native';

type VoiceState = 'idle' | 'recording' | 'processing' | 'playing';

interface VoiceOrbProps {
  state: VoiceState;
  size?: number;
  children?: React.ReactNode;
}

const COLORS = {
  idle: '#ff6b35',
  recording: '#e63946',
  processing: '#7c5cfc',
  playing: '#22c55e',
};

// Number of animated ripple rings
const RING_COUNT = 3;
// Number of sound wave bars
const BAR_COUNT = 5;

export default function VoiceOrb({state, size = 120, children}: VoiceOrbProps) {
  // Ripple ring animations
  const ringScales = useRef(
    Array.from({length: RING_COUNT}, () => new Animated.Value(1)),
  ).current;
  const ringOpacities = useRef(
    Array.from({length: RING_COUNT}, () => new Animated.Value(0)),
  ).current;

  // Glow pulse for the main circle
  const glowScale = useRef(new Animated.Value(1)).current;
  const glowOpacity = useRef(new Animated.Value(0)).current;

  // Sound bar heights
  const barHeights = useRef(
    Array.from({length: BAR_COUNT}, () => new Animated.Value(0.2)),
  ).current;

  // Breathing animation for idle
  const breatheScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Stop all
    ringScales.forEach(s => s.stopAnimation());
    ringOpacities.forEach(o => o.stopAnimation());
    barHeights.forEach(h => h.stopAnimation());
    glowScale.stopAnimation();
    glowOpacity.stopAnimation();
    breatheScale.stopAnimation();

    // Reset
    ringScales.forEach(s => s.setValue(1));
    ringOpacities.forEach(o => o.setValue(0));
    barHeights.forEach(h => h.setValue(0.2));
    glowScale.setValue(1);
    glowOpacity.setValue(0);
    breatheScale.setValue(1);

    if (state === 'idle') {
      // Subtle breathing pulse
      Animated.loop(
        Animated.sequence([
          Animated.timing(breatheScale, {
            toValue: 1.04,
            duration: 2000,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(breatheScale, {
            toValue: 1,
            duration: 2000,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      ).start();
    }

    if (state === 'recording') {
      // Pulsing glow ring
      Animated.loop(
        Animated.sequence([
          Animated.parallel([
            Animated.timing(glowScale, {
              toValue: 1.25,
              duration: 800,
              easing: Easing.out(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(glowOpacity, {
              toValue: 0.6,
              duration: 400,
              useNativeDriver: true,
            }),
          ]),
          Animated.parallel([
            Animated.timing(glowScale, {
              toValue: 1.05,
              duration: 800,
              easing: Easing.in(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(glowOpacity, {
              toValue: 0.2,
              duration: 800,
              useNativeDriver: true,
            }),
          ]),
        ]),
      ).start();
    }

    if (state === 'processing') {
      // Staggered ripple rings expanding outward
      ringScales.forEach((scale, i) => {
        const delay = i * 600;
        Animated.loop(
          Animated.sequence([
            Animated.delay(delay),
            Animated.parallel([
              Animated.timing(scale, {
                toValue: 1.8,
                duration: 1800,
                easing: Easing.out(Easing.ease),
                useNativeDriver: true,
              }),
              Animated.sequence([
                Animated.timing(ringOpacities[i], {
                  toValue: 0.5,
                  duration: 300,
                  useNativeDriver: true,
                }),
                Animated.timing(ringOpacities[i], {
                  toValue: 0,
                  duration: 1500,
                  useNativeDriver: true,
                }),
              ]),
            ]),
            // Reset instantly
            Animated.parallel([
              Animated.timing(scale, {
                toValue: 1,
                duration: 0,
                useNativeDriver: true,
              }),
              Animated.timing(ringOpacities[i], {
                toValue: 0,
                duration: 0,
                useNativeDriver: true,
              }),
            ]),
          ]),
        ).start();
      });

      // Gentle pulse on the orb itself
      Animated.loop(
        Animated.sequence([
          Animated.timing(breatheScale, {
            toValue: 1.06,
            duration: 900,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(breatheScale, {
            toValue: 0.97,
            duration: 900,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      ).start();
    }

    if (state === 'playing') {
      // Animated sound bars with staggered bouncing
      barHeights.forEach((h, i) => {
        const speed = 300 + i * 80;
        Animated.loop(
          Animated.sequence([
            Animated.delay(i * 60),
            Animated.timing(h, {
              toValue: 0.6 + Math.random() * 0.4,
              duration: speed,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(h, {
              toValue: 0.15 + Math.random() * 0.15,
              duration: speed,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
          ]),
        ).start();
      });

      // Subtle glow
      Animated.loop(
        Animated.sequence([
          Animated.parallel([
            Animated.timing(glowScale, {
              toValue: 1.15,
              duration: 1200,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(glowOpacity, {
              toValue: 0.35,
              duration: 1200,
              useNativeDriver: true,
            }),
          ]),
          Animated.parallel([
            Animated.timing(glowScale, {
              toValue: 1.05,
              duration: 1200,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(glowOpacity, {
              toValue: 0.1,
              duration: 1200,
              useNativeDriver: true,
            }),
          ]),
        ]),
      ).start();
    }
  }, [state, ringScales, ringOpacities, glowScale, glowOpacity, barHeights, breatheScale]);

  const color = COLORS[state];
  const halfSize = size / 2;

  return (
    <View style={[styles.container, {width: size * 2, height: size * 2}]}>
      {/* Ripple rings (processing state) */}
      {ringScales.map((scale, i) => (
        <Animated.View
          key={`ring-${i}`}
          style={[
            styles.ring,
            {
              width: size,
              height: size,
              borderRadius: halfSize,
              borderColor: color,
              opacity: ringOpacities[i],
              transform: [{scale}],
            },
          ]}
        />
      ))}

      {/* Glow ring (recording + playing states) */}
      <Animated.View
        style={[
          styles.glow,
          {
            width: size,
            height: size,
            borderRadius: halfSize,
            backgroundColor: color,
            opacity: glowOpacity,
            transform: [{scale: glowScale}],
          },
        ]}
      />

      {/* Main orb circle */}
      <Animated.View
        style={[
          styles.orb,
          {
            width: size,
            height: size,
            borderRadius: halfSize,
            borderColor: color,
            transform: [{scale: breatheScale}],
          },
        ]}>
        {children}
      </Animated.View>

      {/* Sound bars (playing state) */}
      {state === 'playing' && (
        <View style={[styles.barsContainer, {top: size + halfSize + 12}]}>
          {barHeights.map((h, i) => (
            <Animated.View
              key={`bar-${i}`}
              style={[
                styles.bar,
                {
                  backgroundColor: color,
                  transform: [{scaleY: h}],
                },
              ]}
            />
          ))}
        </View>
      )}

      {/* Sound bars (recording state — red, fewer bars) */}
      {state === 'recording' && (
        <View style={[styles.barsContainer, {top: size + halfSize + 12}]}>
          {barHeights.map((h, i) => (
            <Animated.View
              key={`rbar-${i}`}
              style={[
                styles.bar,
                {
                  backgroundColor: color,
                  transform: [{scaleY: h}],
                },
              ]}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  ring: {
    position: 'absolute',
    borderWidth: 2,
  },
  glow: {
    position: 'absolute',
  },
  orb: {
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    zIndex: 1,
  },
  barsContainer: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
    height: 30,
    zIndex: 2,
  },
  bar: {
    width: 4,
    height: 30,
    borderRadius: 2,
  },
});
