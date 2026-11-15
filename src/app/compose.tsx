import { Stack, useRouter } from 'expo-router';
import { observer } from 'mobx-react-lite';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useStore } from '@/stores';

const MAX_LENGTH = 280;

// Reached from the Feed's + button. Posts as the signed-in user via POST /api/posts.
export default observer(function ComposeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { feedStore } = useStore();
  const [text, setText] = useState('');
  const [error, setError] = useState<string>();

  const canPost = text.trim().length > 0 && !feedStore.posting;

  async function submit() {
    setError(undefined);
    const ok = await feedStore.submitPost(text);
    if (ok) router.back();
    else setError("Couldn't post. Check your connection and try again.");
  }

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: 'New post' }} />
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <TextInput
          autoFocus
          multiline
          maxLength={MAX_LENGTH}
          value={text}
          onChangeText={setText}
          placeholder="What's happening?"
          placeholderTextColor={theme.textTertiary}
          style={[styles.input, { color: theme.text, backgroundColor: theme.surface, borderColor: theme.hairline }]}
          accessibilityLabel="Post text"
        />

        {error ? (
          <ThemedText type="small" themeColor="red">
            {error}
          </ThemedText>
        ) : null}

        <View style={styles.footer}>
          <ThemedText type="mono" themeColor="textTertiary">
            {text.length}/{MAX_LENGTH}
          </ThemedText>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !canPost }}
            disabled={!canPost}
            onPress={() => void submit()}
            style={[styles.postButton, { backgroundColor: theme.accent }, !canPost && styles.disabled]}>
            {feedStore.posting ? (
              <ActivityIndicator color={theme.accentOnFill} />
            ) : (
              <ThemedText type="small" themeColor="accentOnFill" style={styles.postLabel}>
                Post
              </ThemedText>
            )}
          </Pressable>
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
    padding: Spacing.md,
    gap: Spacing.sm2,
  },
  input: {
    minHeight: 140,
    borderWidth: 1,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    fontFamily: Fonts.body,
    fontSize: 16,
    textAlignVertical: 'top',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  postButton: {
    minWidth: 88,
    alignItems: 'center',
    borderRadius: Radius.pill,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md2,
  },
  postLabel: {
    fontWeight: '700',
  },
  disabled: {
    opacity: 0.5,
  },
});
