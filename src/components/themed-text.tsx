import { StyleSheet, Text, type TextProps } from 'react-native';

import { Fonts, ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextProps = TextProps & {
  type?: 'display' | 'h2' | 'h3' | 'body' | 'small' | 'label' | 'mono' | 'link';
  themeColor?: ThemeColor;
};

export function ThemedText({ style, type = 'body', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();

  return (
    <Text
      style={[
        { color: theme[themeColor ?? 'text'] },
        type === 'display' && styles.display,
        type === 'h2' && styles.h2,
        type === 'h3' && styles.h3,
        type === 'body' && styles.body,
        type === 'small' && styles.small,
        type === 'label' && styles.label,
        type === 'mono' && styles.mono,
        type === 'link' && styles.link,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  display: {
    fontFamily: Fonts.display,
    fontSize: 34,
    lineHeight: 38,
    letterSpacing: -0.3,
  },
  h2: {
    fontFamily: Fonts.displaySemiBold,
    fontSize: 22,
    lineHeight: 27,
  },
  h3: {
    fontFamily: Fonts.displaySemiBold,
    fontSize: 17,
    lineHeight: 22,
  },
  body: {
    fontFamily: Fonts.body,
    fontSize: 15,
    lineHeight: 22,
  },
  small: {
    fontFamily: Fonts.body,
    fontSize: 13,
    lineHeight: 18,
  },
  label: {
    fontFamily: Fonts.mono,
    fontSize: 12,
    letterSpacing: 0.4,
  },
  mono: {
    fontFamily: Fonts.mono,
    fontSize: 11,
    letterSpacing: 0.6,
  },
  link: {
    fontFamily: Fonts.body,
    fontSize: 15,
    lineHeight: 22,
    textDecorationLine: 'underline',
  },
});
