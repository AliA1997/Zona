import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

// Shown instead of the app when required EXPO_PUBLIC_* variables are missing.
// Lists variable names only, never values.
export function ConfigErrorScreen({ missing }: { missing: string[] }) {
  return (
    <ThemedView style={styles.container}>
      <ThemedText type="h2">App not configured</ThemedText>
      <ThemedText type="body" themeColor="textSecondary" style={styles.copy}>
        These environment variables are missing. Copy .env.example to .env.local, fill them in, and
        restart the dev server.
      </ThemedText>
      <View style={styles.list}>
        {missing.map((name) => (
          <ThemedText key={name} type="mono" themeColor="accent">
            {name}
          </ThemedText>
        ))}
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  copy: {
    marginTop: Spacing.xs,
  },
  list: {
    gap: Spacing.xs,
  },
});
