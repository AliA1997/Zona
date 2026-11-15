import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, type ViewProps } from 'react-native';

import { Gradients } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

// The app's screen background: an orange gradient, top to bottom.
export function GradientBackground({ style, children, ...rest }: ViewProps) {
  const scheme = useColorScheme();
  const colors = scheme === 'light' ? Gradients.light : Gradients.dark;

  return (
    <LinearGradient colors={colors} locations={[0, 0.45, 1]} style={[styles.fill, style]} {...rest}>
      {children}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
});
