/**
 * Design tokens for Zona — sourced from `.claude/references/design-system.md`
 * (condensed from the Zona design artifact). Dark is the primary, designed-for
 * palette; light is a supported host-OS fallback, not the hero surface.
 */

import { Platform } from 'react-native';

export const Colors = {
  dark: {
    background: '#0B0F10',
    surface: '#141B1D',
    surfaceRaised: '#1B2426',
    surfaceSunken: '#080B0C',
    hairline: '#232E2D',
    border: '#34403F',
    text: '#F4F7F6',
    textSecondary: '#9FB0AE',
    textTertiary: '#64726F',
    accent: '#2FD6C0',
    accentStrong: '#22B8A4',
    accentSoft: '#12302C',
    accentOnFill: '#08211D',
    secondary: '#8C7CFF',
    secondarySoft: '#211C3D',
    rose: '#FF3D78',
    amber: '#FFB33E',
    green: '#33D17A',
    red: '#FF5C5C',
    // Back-compat aliases for the default create-expo-app scaffold components.
    backgroundElement: '#141B1D',
    backgroundSelected: '#1B2426',
  },
  light: {
    background: '#F5F7F7',
    surface: '#FFFFFF',
    surfaceRaised: '#FFFFFF',
    surfaceSunken: '#EEF1F1',
    hairline: '#E4E9E8',
    border: '#D7DEDD',
    text: '#101717',
    textSecondary: '#55635F',
    textTertiary: '#55635F',
    accent: '#159C8C',
    accentStrong: '#0F7A6E',
    accentSoft: '#DFF3F0',
    accentOnFill: '#FFFFFF',
    secondary: '#6C56E8',
    secondarySoft: '#EDE9FE',
    rose: '#E23366',
    amber: '#B8790A',
    green: '#1E9A57',
    red: '#D6394A',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#EEF1F1',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

// Space Grotesk (display), Manrope (body), JetBrains Mono (handles/telemetry) —
// loaded via useFonts in src/app/_layout.tsx (expo-font registers these family
// names the same way on web as on native, so no separate web mapping is needed).
export const Fonts = {
  display: 'SpaceGrotesk_700Bold',
  displaySemiBold: 'SpaceGrotesk_600SemiBold',
  body: 'Manrope_400Regular',
  bodySemiBold: 'Manrope_600SemiBold',
  bodyBold: 'Manrope_700Bold',
  mono: 'JetBrainsMono_500Medium',
} as const;

// 4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48 / 64 — actions are always pill,
// content surfaces use radius.md–radius.xl. Nothing is sharp-cornered.
export const Spacing = {
  xs: 4,
  sm: 8,
  sm2: 12,
  md: 16,
  md2: 20,
  lg: 24,
  xl: 32,
  xl2: 40,
  xxl: 48,
  xxxl: 64,
  // Back-compat aliases for the default create-expo-app scaffold components.
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
