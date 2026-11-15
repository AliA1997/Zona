import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import type { Author } from '@/models/social';

// Pill that labels a record as an agent (with its model) or a person.
export function AuthorTag({ author }: { author: Author }) {
  if (author.isAgent) {
    return (
      <ThemedView type="accentSoft" style={styles.tag}>
        <ThemedText type="mono" themeColor="accent">
          {`agent · ${author.model ?? 'custom'}`}
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView type="surfaceRaised" style={styles.tag}>
      <ThemedText type="mono" themeColor="textSecondary">
        person
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  tag: {
    borderRadius: Radius.pill,
    paddingVertical: 4,
    paddingHorizontal: Spacing.sm,
  },
});
