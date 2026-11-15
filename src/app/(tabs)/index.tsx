import { useRouter } from 'expo-router';
import { observer } from 'mobx-react-lite';
import { useEffect } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthorAvatar } from '@/components/author-avatar';
import { AuthorTag } from '@/components/author-tag';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { FeedPost } from '@/models/social';
import { useStore } from '@/stores';
import { formatRelativeTime } from '@/utils/relative-time';

function HeartIcon({ color, filled }: { color: string; filled: boolean }) {
  return (
    <Svg width={15} height={15} viewBox="0 0 24 24" fill={filled ? color : 'none'} stroke={color} strokeWidth={1.6}>
      <Path d="M12 20s-7-4.4-9.3-9C1.3 7.8 2.7 5 5.7 5c1.9 0 3.3 1.1 4.3 2.6C11 6.1 12.4 5 14.3 5c3 0 4.4 2.8 3 6-2.3 4.6-9.3 9-9.3 9Z" />
    </Svg>
  );
}

function ReplyIcon({ color }: { color: string }) {
  return (
    <Svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.6}>
      <Path d="M4 5.5h16v10a1 1 0 0 1-1 1H9l-4 3.3V16.5H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1Z" />
    </Svg>
  );
}

function RepostIcon({ color }: { color: string }) {
  return (
    <Svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.6}>
      <Path d="M6 7h10a2 2 0 0 1 2 2v3M15 4l3 3-3 3M18 17H8a2 2 0 0 1-2-2v-3M9 20l-3-3 3-3" />
    </Svg>
  );
}

function ComposeIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.1} strokeLinecap="round">
      <Path d="M12 5v14M5 12h14" />
    </Svg>
  );
}

export default observer(function FeedScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { authStore, feedStore } = useStore();
  const viewerId = authStore.identity?.id;

  // Reload whenever the signed-in user changes (the store resets on identity change).
  useEffect(() => {
    if (viewerId) void feedStore.loadFirstPage();
  }, [viewerId, feedStore]);

  const renderItem = ({ item }: { item: FeedPost }) => (
    <ThemedView type="surface" style={[styles.card, { borderColor: theme.hairline }]}>
      <View style={styles.cardHeader}>
        <AuthorAvatar author={item.author} size={38} />
        <View style={styles.cardHeaderText}>
          <ThemedText type="h3" numberOfLines={1}>
            {item.author.username}
          </ThemedText>
          <ThemedText type="mono" themeColor="textTertiary" numberOfLines={1}>
            {item.author.handle} · {formatRelativeTime(item.createdAt)}
          </ThemedText>
        </View>
        <AuthorTag author={item.author} />
      </View>

      <ThemedText type="body">{item.body}</ThemedText>

      <View style={[styles.cardFooter, { borderTopColor: theme.hairline }]}>
        <Pressable
          style={styles.footerAction}
          accessibilityRole="button"
          accessibilityLabel={item.likedByMe ? 'Unlike' : 'Like'}
          onPress={() => void feedStore.toggleLike(item.id)}>
          <HeartIcon color={theme.rose} filled={item.likedByMe} />
          <ThemedText type="mono" themeColor={item.likedByMe ? 'rose' : 'textTertiary'}>
            {item.likeCount}
          </ThemedText>
        </Pressable>
        <View style={styles.footerAction}>
          <ReplyIcon color={theme.textTertiary} />
          <ThemedText type="mono" themeColor="textTertiary">
            {item.replyCount}
          </ThemedText>
        </View>
        <View style={styles.footerAction}>
          <RepostIcon color={theme.textTertiary} />
          <ThemedText type="mono" themeColor="textTertiary">
            {item.repostCount}
          </ThemedText>
        </View>
      </View>
    </ThemedView>
  );

  const posts = feedStore.posts;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <ThemedText type="display" style={styles.wordmark}>
            Zona
          </ThemedText>
        </View>

        {feedStore.error && posts.length > 0 ? (
          <ThemedText type="small" themeColor="red" style={styles.banner}>
            {feedStore.error} Pull to retry.
          </ThemedText>
        ) : null}

        <FlatList
          data={posts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={renderItem}
          onEndReachedThreshold={0.5}
          onEndReached={() => void feedStore.loadNextPage()}
          refreshControl={
            <RefreshControl
              refreshing={feedStore.refreshing}
              tintColor={theme.accent}
              onRefresh={() => void feedStore.loadFirstPage('refresh')}
            />
          }
          ListEmptyComponent={
            feedStore.loading ? (
              <ActivityIndicator color={theme.accent} style={styles.empty} />
            ) : feedStore.error ? (
              <View style={styles.empty}>
                <ThemedText type="body" themeColor="textSecondary">
                  {feedStore.error}
                </ThemedText>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void feedStore.loadFirstPage()}
                  style={[styles.pill, { borderColor: theme.accentStrong }]}>
                  <ThemedText type="small" themeColor="accent">
                    Try again
                  </ThemedText>
                </Pressable>
              </View>
            ) : (
              <ThemedText type="body" themeColor="textTertiary" style={styles.empty}>
                No posts yet. Tap + to write the first one.
              </ThemedText>
            )
          }
          ListFooterComponent={
            feedStore.loadingMore ? (
              <ActivityIndicator color={theme.accent} style={styles.footer} />
            ) : feedStore.nextPageError ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => void feedStore.retryNextPage()}
                style={[styles.pill, styles.footer, { borderColor: theme.accentStrong }]}>
                <ThemedText type="small" themeColor="accent">
                  Try again
                </ThemedText>
              </Pressable>
            ) : undefined
          }
        />

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Compose"
          onPress={() => router.push('/compose')}
          style={({ pressed }) => [
            styles.composeButton,
            { backgroundColor: theme.accent, shadowColor: theme.accent },
            pressed && styles.pressed,
          ]}>
          <ComposeIcon color={theme.accentOnFill} />
        </Pressable>
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
  header: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm2,
  },
  wordmark: {
    fontSize: 24,
    lineHeight: 28,
  },
  list: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.xxxl,
    gap: Spacing.sm2,
  },
  card: {
    borderWidth: 1,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    gap: Spacing.sm2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  cardHeaderText: {
    flex: 1,
    gap: 2,
  },
  banner: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  empty: {
    alignItems: 'center',
    gap: Spacing.sm2,
    textAlign: 'center',
    paddingVertical: Spacing.xl,
  },
  footer: {
    alignSelf: 'center',
    marginVertical: Spacing.md,
  },
  pill: {
    borderWidth: 1.5,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md2,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.96 }],
  },
  cardFooter: {
    flexDirection: 'row',
    gap: Spacing.lg,
    paddingTop: Spacing.xs,
    borderTopWidth: 1,
  },
  footerAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  composeButton: {
    position: 'absolute',
    right: Spacing.md2,
    bottom: Spacing.xl,
    width: 52,
    height: 52,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.35,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
});
