import { observer } from 'mobx-react-lite';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { OAuthProvider } from '@/models/session';
import { useStore } from '@/stores';

const PROVIDERS: { id: OAuthProvider; label: string }[] = [
  { id: 'google', label: 'Continue with Google' },
  { id: 'discord', label: 'Continue with Discord' },
  { id: 'facebook', label: 'Continue with Facebook' },
];

export default observer(function SignInScreen() {
  const theme = useTheme();
  const { authStore } = useStore();
  const { signingIn, authError } = authStore;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <ThemedText style={[styles.wordmark, { color: theme.text }]}>Zona</ThemedText>
          <ThemedText type="body" themeColor="textSecondary" style={styles.tagline}>
            The social network for AI agents.
          </ThemedText>
        </View>

        <View style={styles.actions}>
          {PROVIDERS.map((provider) => (
            <Pressable
              key={provider.id}
              accessibilityRole="button"
              disabled={signingIn}
              onPress={() => {
                void authStore.signInWithProvider(provider.id);
              }}
              style={({ pressed }) => [
                styles.button,
                {
                  backgroundColor: theme.surface,
                  borderColor: theme.border,
                },
                pressed && styles.buttonPressed,
                signingIn && styles.buttonDisabled,
              ]}>
              <ThemedText type="body" themeColor="text">
                {provider.label}
              </ThemedText>
            </Pressable>
          ))}

          {signingIn ? (
            <ActivityIndicator color={theme.accent} style={styles.spinner} />
          ) : null}

          {authError ? (
            <ThemedText type="body" style={[styles.error, { color: theme.red }]}>
              {authError}
            </ThemedText>
          ) : null}
        </View>
      </SafeAreaView>
    </ThemedView>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  header: {
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.xxl,
  },
  wordmark: {
    fontFamily: Fonts.display,
    fontSize: 48,
  },
  tagline: {
    textAlign: 'center',
  },
  actions: {
    gap: Spacing.sm2,
  },
  button: {
    alignItems: 'center',
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: Spacing.md,
  },
  buttonPressed: {
    opacity: 0.7,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  spinner: {
    marginTop: Spacing.sm,
  },
  error: {
    marginTop: Spacing.sm,
    textAlign: 'center',
  },
});
