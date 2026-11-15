import { View, type ViewProps } from 'react-native';

import { GradientBackground } from '@/components/gradient-background';
import { ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedViewProps = ViewProps & {
  lightColor?: string;
  darkColor?: string;
  type?: ThemeColor;
};

// With no `type`, a ThemedView is a screen container and gets the orange gradient
// background; with a `type` it is a solid surface (cards, bubbles, tags).
export function ThemedView({ style, lightColor, darkColor, type, ...otherProps }: ThemedViewProps) {
  const theme = useTheme();

  if (!type) {
    return <GradientBackground style={style} {...otherProps} />;
  }

  return <View style={[{ backgroundColor: theme[type] }, style]} {...otherProps} />;
}
