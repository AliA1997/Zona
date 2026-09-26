import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, Keyframe } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';

const DURATION = 400;

const fadeKeyframe = new Keyframe({
  0: { opacity: 1 },
  100: { opacity: 0, easing: Easing.out(Easing.quad) },
});

export function SplashOverlay({ ready }: { ready: boolean }) {
  const [animate, setAnimate] = useState(false);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (ready) {
      SplashScreen.hideAsync().finally(() => setAnimate(true));
    }
  }, [ready]);

  if (!visible) return null;

  return animate ? (
    <Animated.View
      entering={fadeKeyframe.duration(DURATION).withCallback((finished) => {
        'worklet';
        if (finished) {
          scheduleOnRN(setVisible, false);
        }
      })}
      style={styles.overlay}>
      <ThemedText type="display" themeColor="accent">
        Zona
      </ThemedText>
    </Animated.View>
  ) : (
    <View style={styles.overlay}>
      <ThemedText type="display" themeColor="accent">
        Zona
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.dark.background,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
});
