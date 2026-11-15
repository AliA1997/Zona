import { Link } from 'expo-router';
import { observer } from 'mobx-react-lite';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthorAvatar } from '@/components/author-avatar';
import { AuthorTag } from '@/components/author-tag';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { ProfileInfoDto, ProfilePostDto } from '@/models/social';
import { useStore } from '@/stores';
import { getProfile, getProfilePosts } from '@/utils/api/social-api-client';
import { formatRelativeTime } from '@/utils/relative-time';
import { toAuthor } from '@/utils/to-feed-post';

type ProfileData = {
  info: ProfileInfoDto;
  posts: ProfilePostDto[];
  replies: ProfilePostDto[];
};

export default observer(function ProfileScreen() {
  const theme = useTheme();
  const { authStore } = useStore();
  const username = authStore.identity?.username;
  const [tab, setTab] = useState<'posts' | 'replies'>('posts');
  const [data, setData] = useState<ProfileData>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    if (!username) return;
    setLoading(true);
    setError(undefined);
    try {
      const [info, posts] = await Promise.all([getProfile(username), getProfilePosts(username)]);
      setData({ info, posts: posts.userPosts ?? [], replies: posts.repliedPosts ?? [] });
    } catch {
      setError("Couldn't load your profile.");
    } finally {
      setLoading(false);
    }
  }, [username]);

  useEffect(() => {
    void load();
  }, [load]);

  const author = toAuthor({
    id: data?.info.userId ?? authStore.identity?.id,
    username: data?.info.username ?? username,
    avatar: data?.info.avatar ?? authStore.identity?.avatar,
    isAgent: data?.info.isAgent,
    model: data?.info.agentModel,
  });
  const list = tab === 'posts' ? (data?.posts ?? []) : (data?.replies ?? []);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={loading && !!data} tintColor={theme.accent} onRefresh={() => void load()} />
          }>
          <View style={[styles.ownerRow, { borderBottomColor: theme.hairline }]}>
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={styles.ownerName}>
              {username ? `Signed in as @${username}` : 'Signed in'}
            </ThemedText>
            <Pressable
              accessibilityRole="button"
              onPress={() => void authStore.resetAuthState()}
              style={StyleSheet.flatten([styles.signOutButton, { borderColor: theme.border }])}>
              <ThemedText type="small" themeColor="text" style={styles.bold}>
                Sign out
              </ThemedText>
            </Pressable>
          </View>

          <View style={styles.header}>
            <AuthorAvatar author={author} size={72} />
            <ThemedText type="h2" style={styles.name}>
              {author.username}
            </ThemedText>
            <View style={styles.handleRow}>
              <ThemedText type="mono" themeColor="textTertiary">
                {author.handle}
              </ThemedText>
              <AuthorTag author={author} />
            </View>
            {data?.info.bio ? (
              <ThemedText type="body" themeColor="textSecondary" style={styles.bio}>
                {data.info.bio}
              </ThemedText>
            ) : null}
            {data ? (
              <ThemedText type="small" themeColor="textSecondary">
                {data.info.followerCount ?? 0} followers · {data.info.followingCount ?? 0} following
              </ThemedText>
            ) : null}

            <Link href="/personalize" asChild>
              <Pressable style={StyleSheet.flatten([styles.pillButton, { borderColor: theme.accentStrong }])}>
                <ThemedText type="small" themeColor="accent" style={styles.bold}>
                  Personalize
                </ThemedText>
              </Pressable>
            </Link>
          </View>

          <View style={[styles.tabBar, { borderBottomColor: theme.hairline }]}>
            {(['posts', 'replies'] as const).map((key) => (
              <Pressable key={key} style={styles.tabButton} onPress={() => setTab(key)}>
                <ThemedText type="small" themeColor={tab === key ? 'text' : 'textTertiary'} style={styles.bold}>
                  {key === 'posts' ? 'Posts' : 'Replies'}
                </ThemedText>
                {tab === key ? <View style={[styles.tabIndicator, { backgroundColor: theme.accent }]} /> : null}
              </Pressable>
            ))}
          </View>

          <View style={styles.tabContent}>
            {loading && !data ? (
              <ActivityIndicator color={theme.accent} style={styles.emptyState} />
            ) : error ? (
              <View style={styles.emptyState}>
                <ThemedText type="body" themeColor="textSecondary">
                  {error}
                </ThemedText>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void load()}
                  style={[styles.pillButton, { borderColor: theme.accentStrong }]}>
                  <ThemedText type="small" themeColor="accent" style={styles.bold}>
                    Try again
                  </ThemedText>
                </Pressable>
              </View>
            ) : list.length ? (
              list.map((post) => (
                <ThemedView key={post.postId} type="surface" style={[styles.postCard, { borderColor: theme.hairline }]}>
                  <ThemedText type="mono" themeColor="textTertiary">
                    {formatRelativeTime(post.postCreatedAt)}
                  </ThemedText>
                  <ThemedText type="body">{post.content}</ThemedText>
                </ThemedView>
              ))
            ) : (
              <ThemedText type="body" themeColor="textTertiary" style={styles.emptyState}>
                {tab === 'posts' ? 'No posts yet.' : 'No replies yet.'}
              </ThemedText>
            )}
          </View>
        </ScrollView>
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
  scrollContent: {
    paddingBottom: Spacing.xxxl,
  },
  ownerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
  },
  ownerName: {
    flexShrink: 1,
  },
  signOutButton: {
    borderWidth: 1,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
  },
  header: {
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
  },
  name: {
    marginTop: Spacing.sm,
  },
  handleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  bio: {
    textAlign: 'center',
    marginTop: Spacing.xs,
  },
  pillButton: {
    marginTop: Spacing.sm2,
    borderWidth: 1.5,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md2,
  },
  bold: {
    fontWeight: '700',
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.sm2,
  },
  tabIndicator: {
    marginTop: Spacing.sm,
    height: 2,
    width: '60%',
    borderRadius: Radius.pill,
  },
  tabContent: {
    padding: Spacing.md,
    gap: Spacing.sm2,
  },
  postCard: {
    borderWidth: 1,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  emptyState: {
    alignItems: 'center',
    gap: Spacing.sm2,
    textAlign: 'center',
    paddingVertical: Spacing.xl,
  },
});
