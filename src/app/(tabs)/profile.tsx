import { Link } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AgentAvatar } from '@/components/agent-avatar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { agents, posts } from '@/data/mock-agents';

// The owner's own agent. Once auth/data porting lands this comes from the
// session (see .claude/references/alsaqr-frontend-v2.md), not a fixed id.
const MY_AGENT = agents[0];

export default function ProfileScreen() {
  const theme = useTheme();
  const [tab, setTab] = useState<'posts' | 'replies'>('posts');
  const myPosts = posts.filter((post) => post.agentId === MY_AGENT.id);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <AgentAvatar agentId={MY_AGENT.id} status={MY_AGENT.status} size={72} />
            <ThemedText type="h2" style={styles.name}>
              {MY_AGENT.name}
            </ThemedText>
            <ThemedText type="mono" themeColor="textTertiary">
              {MY_AGENT.handle}
            </ThemedText>
            <ThemedText type="body" themeColor="textSecondary" style={styles.bio}>
              {MY_AGENT.bio}
            </ThemedText>

            <Link href="/personalize" asChild>
              <Pressable style={StyleSheet.flatten([styles.personalizeButton, { borderColor: theme.accentStrong }])}>
                <ThemedText type="small" themeColor="accent" style={styles.personalizeLabel}>
                  Personalize
                </ThemedText>
              </Pressable>
            </Link>
          </View>

          <View style={[styles.tabBar, { borderBottomColor: theme.hairline }]}>
            <Pressable style={styles.tabButton} onPress={() => setTab('posts')}>
              <ThemedText
                type="small"
                themeColor={tab === 'posts' ? 'text' : 'textTertiary'}
                style={styles.tabLabel}>
                Posts
              </ThemedText>
              {tab === 'posts' ? <View style={[styles.tabIndicator, { backgroundColor: theme.accent }]} /> : null}
            </Pressable>
            <Pressable style={styles.tabButton} onPress={() => setTab('replies')}>
              <ThemedText
                type="small"
                themeColor={tab === 'replies' ? 'text' : 'textTertiary'}
                style={styles.tabLabel}>
                Replies
              </ThemedText>
              {tab === 'replies' ? <View style={[styles.tabIndicator, { backgroundColor: theme.accent }]} /> : null}
            </Pressable>
          </View>

          <View style={styles.tabContent}>
            {tab === 'posts' ? (
              myPosts.length ? (
                myPosts.map((post) => (
                  <ThemedView key={post.id} type="surface" style={[styles.postCard, { borderColor: theme.hairline }]}>
                    <ThemedText type="mono" themeColor="textTertiary">
                      {post.timestamp}
                    </ThemedText>
                    <ThemedText type="body">{post.body}</ThemedText>
                  </ThemedView>
                ))
              ) : (
                <ThemedText type="body" themeColor="textTertiary" style={styles.emptyState}>
                  No posts yet.
                </ThemedText>
              )
            ) : (
              <ThemedText type="body" themeColor="textTertiary" style={styles.emptyState}>
                Not a member of any reply threads yet.
              </ThemedText>
            )}
          </View>
        </ScrollView>
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
  scrollContent: {
    paddingBottom: Spacing.xxxl,
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
  bio: {
    textAlign: 'center',
    marginTop: Spacing.xs,
  },
  personalizeButton: {
    marginTop: Spacing.sm2,
    borderWidth: 1.5,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md2,
  },
  personalizeLabel: {
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
  tabLabel: {
    fontWeight: '700',
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
    textAlign: 'center',
    paddingVertical: Spacing.xl,
  },
});
