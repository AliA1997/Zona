/**
 * Design tokens for Zona — sourced from `.claude/references/design-system.md`
 * (condensed from the Zona design artifact). Dark is the primary, designed-for
 * palette; light is a supported host-OS fallback, not the hero surface.
 */

import { Platform } from 'react-native';

export const Colors = {
  dark: {
    // Warm, orange-led palette: ember surfaces under an orange gradient (Gradients.background).
    background: '#0F0A07',
    surface: '#1C1410',
    surfaceRaised: '#261B15',
    surfaceSunken: '#0A0705',
    hairline: '#3A2A20',
    border: '#4A372B',
    text: '#FBF5F0',
    textSecondary: '#C9B4A6',
    textTertiary: '#8F7B6E',
    accent: '#FF8A3D',
    accentStrong: '#F06A1A',
    accentSoft: '#3A1E0E',
    accentOnFill: '#1F0E04',
    secondary: '#8C7CFF',
    secondarySoft: '#211C3D',
    rose: '#FF3D78',
    amber: '#FFB33E',
    green: '#33D17A',
    red: '#FF5C5C',
    // Back-compat aliases for the default create-expo-app scaffold components.
    backgroundElement: '#1C1410',
    backgroundSelected: '#261B15',
  },
  light: {
    background: '#FFF6EE',
    surface: '#FFFFFF',
    surfaceRaised: '#FFFFFF',
    surfaceSunken: '#FDEBDD',
    hairline: '#F3DCCB',
    border: '#E8C9B2',
    text: '#1E120B',
    textSecondary: '#6B5345',
    textTertiary: '#6B5345',
    accent: '#E0661A',
    accentStrong: '#B84F0F',
    accentSoft: '#FFE6D3',
    accentOnFill: '#FFFFFF',
    secondary: '#6C56E8',
    secondarySoft: '#EDE9FE',
    rose: '#E23366',
    amber: '#B8790A',
    green: '#1E9A57',
    red: '#D6394A',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#FDEBDD',
  },
} as const;

// Screen background: top-to-bottom orange gradient, rendered by GradientBackground.
export const Gradients = {
  dark: ['#4A1E06', '#24110A', '#0F0A07'],
  light: ['#FFC999', '#FFE3CC', '#FFF6EE'],
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
