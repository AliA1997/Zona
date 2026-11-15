import { Stack, useLocalSearchParams } from 'expo-router';
import { observer } from 'mobx-react-lite';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthorAvatar } from '@/components/author-avatar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { AgentModel, MessageDto } from '@/models/social';
import { useStore } from '@/stores';
import { getMessages, sendMessage } from '@/utils/api/social-api-client';
import { parseBackendDate } from '@/utils/relative-time';
import { toAuthor } from '@/utils/to-feed-post';

// `id` is the other participant's user id; the rest is passed from the thread row
// so the header and avatars render before the history loads.
export default observer(function ChatScreen() {
  const params = useLocalSearchParams<{
    id: string;
    username?: string;
    avatar?: string;
    isAgent?: string;
    model?: string;
  }>();
  const theme = useTheme();
  const { authStore } = useStore();
  const me = authStore.identity;
  const other = toAuthor({
    id: params.id,
    username: params.username,
    avatar: params.avatar || null,
    isAgent: params.isAgent === '1',
    model: (params.model || null) as AgentModel | null,
  });

  const [messages, setMessages] = useState<MessageDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    if (!params.id) return;
    setError(undefined);
    try {
      const result = await getMessages(params.id);
      const sorted = [...result.items].sort(
        (a, b) => parseBackendDate(a.messageCreatedAt).getTime() - parseBackendDate(b.messageCreatedAt).getTime()
      );
      setMessages(sorted);
    } catch {
      setError("Couldn't load this conversation.");
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function send() {
    const text = draft.trim();
    if (!text || !me || sending) return;
    setSending(true);
    setError(undefined);
    try {
      await sendMessage({
        senderId: me.id,
        senderUsername: me.username,
        recipientId: other.id,
        recipientUsername: other.username,
        text,
      });
      setDraft('');
      await load();
    } catch {
      setError("Couldn't send. Try again.");
    } finally {
      setSending(false);
    }
  }

  const myId = me?.id.toLowerCase();

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: other.isAgent ? `${other.username} · agent` : other.username }} />
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <KeyboardAvoidingView style={styles.safeArea} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {loading ? (
            <ActivityIndicator color={theme.accent} style={styles.loading} />
          ) : (
            <FlatList
              data={messages}
              keyExtractor={(item) => item.messageId}
              contentContainerStyle={styles.list}
              ListEmptyComponent={
                <ThemedText type="body" themeColor="textTertiary" style={styles.loading}>
                  No messages yet. Say hello.
                </ThemedText>
              }
              renderItem={({ item }) =>
                item.senderId.toLowerCase() === myId ? (
                  <View style={styles.ownRow}>
                    <View style={[styles.bubble, styles.ownBubble, { backgroundColor: theme.accent }]}>
                      <ThemedText type="body" themeColor="accentOnFill">
                        {item.messageContent}
                      </ThemedText>
                    </View>
                  </View>
                ) : (
                  <View style={styles.otherRow}>
                    <AuthorAvatar author={other} size={30} />
                    <ThemedView type="surfaceRaised" style={[styles.bubble, styles.otherBubble]}>
                      <ThemedText type="body">{item.messageContent}</ThemedText>
                    </ThemedView>
                  </View>
                )
              }
            />
          )}

          {error ? (
            <ThemedText type="small" themeColor="red" style={styles.error}>
              {error}
            </ThemedText>
          ) : null}

          <View style={[styles.composer, { borderTopColor: theme.hairline }]}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder={`Message ${other.username}`}
              placeholderTextColor={theme.textTertiary}
              multiline
              maxLength={1000}
              style={[styles.input, { color: theme.text, backgroundColor: theme.surface, borderColor: theme.hairline }]}
              accessibilityLabel="Message text"
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Send"
              disabled={!draft.trim() || sending}
              onPress={() => void send()}
              style={[styles.send, { backgroundColor: theme.accent }, (!draft.trim() || sending) && styles.disabled]}>
              <ThemedText type="small" themeColor="accentOnFill" style={styles.sendLabel}>
                Send
              </ThemedText>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
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
  },
  loading: {
    textAlign: 'center',
    paddingVertical: Spacing.xl,
  },
  list: {
    padding: Spacing.md,
    gap: Spacing.sm2,
  },
  otherRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.sm,
  },
  ownRow: {
    alignItems: 'flex-end',
  },
  bubble: {
    maxWidth: '78%',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm2,
  },
  otherBubble: {
    borderRadius: Radius.xl,
    borderBottomLeftRadius: Spacing.xs,
  },
  ownBubble: {
    borderRadius: Radius.xl,
    borderBottomRightRadius: Spacing.xs,
  },
  error: {
    paddingHorizontal: Spacing.md,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.sm,
    padding: Spacing.sm2,
    borderTopWidth: 1,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    borderWidth: 1,
    borderRadius: Radius.xl,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontFamily: Fonts.body,
    fontSize: 15,
  },
  send: {
    borderRadius: Radius.pill,
    paddingVertical: Spacing.sm2,
    paddingHorizontal: Spacing.md,
  },
  sendLabel: {
    fontWeight: '700',
  },
  disabled: {
    opacity: 0.5,
  },
});
