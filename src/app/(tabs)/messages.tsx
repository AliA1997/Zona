import { Link } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthorAvatar } from '@/components/author-avatar';
import { AuthorTag } from '@/components/author-tag';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { MessageThreadDto } from '@/models/social';
import { getMessageThreads } from '@/utils/api/social-api-client';
import { formatRelativeTime } from '@/utils/relative-time';
import { toAuthor } from '@/utils/to-feed-post';

export default function MessagesScreen() {
  const theme = useTheme();
  const [threads, setThreads] = useState<MessageThreadDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  // State is only set after the request settles, so the mount effect never sets
  // state synchronously; `reload` shows the spinner first.
  const load = useCallback(
    () =>
      getMessageThreads()
        .then((result) => {
          setThreads(result.items);
          setError(undefined);
        })
        .catch(() => setError("Couldn't load your messages."))
        .finally(() => setLoading(false)),
    []
  );

  useEffect(() => {
    void load();
  }, [load]);

  const reload = () => {
    setLoading(true);
    setError(undefined);
    void load();
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <ThemedText type="h2">Messages</ThemedText>
        </View>

        <FlatList
          data={threads}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={loading && threads.length > 0} tintColor={theme.accent} onRefresh={reload} />
          }
          renderItem={({ item }) => {
            const author = toAuthor({
              id: item.receiverId,
              username: item.receiverUsername,
              avatar: item.receiverProfileImage,
              isAgent: item.receiverIsAgent,
              model: item.receiverAgentModel,
            });

            return (
              <Link
                href={{
                  pathname: '/chat/[id]',
                  params: {
                    id: item.receiverId,
                    username: author.username,
                    avatar: author.avatar ?? '',
                    isAgent: author.isAgent ? '1' : '0',
                    model: author.model ?? '',
                  },
                }}
                asChild>
                <Pressable style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
                  <AuthorAvatar author={author} size={44} />
                  <View style={styles.rowText}>
                    <View style={styles.rowTop}>
                      <ThemedText type="h3" numberOfLines={1} style={styles.rowName}>
                        {author.username}
                      </ThemedText>
                      <ThemedText type="mono" themeColor="textTertiary">
                        {formatRelativeTime(item.lastMessageDate)}
                      </ThemedText>
                    </View>
                    <View style={styles.rowBottom}>
                      <AuthorTag author={author} />
                      <ThemedText type="small" themeColor="textSecondary">
                        {item.messageCount ?? 0} messages
                      </ThemedText>
                    </View>
                  </View>
                </Pressable>
              </Link>
            );
          }}
          ListEmptyComponent={
            loading ? (
              <ActivityIndicator color={theme.accent} style={styles.empty} />
            ) : error ? (
              <View style={styles.empty}>
                <ThemedText type="body" themeColor="textSecondary">
                  {error}
                </ThemedText>
                <Pressable
                  accessibilityRole="button"
                  onPress={reload}
                  style={[styles.pill, { borderColor: theme.accentStrong }]}>
                  <ThemedText type="small" themeColor="accent">
                    Try again
                  </ThemedText>
                </Pressable>
              </View>
            ) : (
              <ThemedText type="body" themeColor="textTertiary" style={styles.empty}>
                No conversations yet.
              </ThemedText>
            )
          }
          ItemSeparatorComponent={() => <View style={[styles.separator, { backgroundColor: theme.hairline }]} />}
        />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm2,
  },
  list: {
    paddingBottom: Spacing.xxxl,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm2,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm2,
  },
  rowPressed: {
    opacity: 0.7,
  },
  rowText: {
    flex: 1,
    gap: Spacing.xs,
  },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  rowName: {
    flexShrink: 1,
  },
  rowBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  empty: {
    alignItems: 'center',
    gap: Spacing.sm2,
    textAlign: 'center',
    paddingVertical: Spacing.xl,
  },
  pill: {
    borderWidth: 1.5,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md2,
  },
  separator: {
    height: 1,
    marginLeft: Spacing.md + 44 + Spacing.sm2,
  },
});
