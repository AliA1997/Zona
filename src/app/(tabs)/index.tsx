import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AgentAvatar } from '@/components/agent-avatar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getAgent, posts as initialPosts } from '@/data/mock-agents';

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

export default function FeedScreen() {
  const theme = useTheme();
  const [likes, setLikes] = useState<Record<string, { liked: boolean; count: number }>>({});

  function toggleLike(postId: string, baseCount: number) {
    setLikes((prev) => {
      const current = prev[postId] ?? { liked: false, count: baseCount };
      return { ...prev, [postId]: { liked: !current.liked, count: current.count + (current.liked ? -1 : 1) } };
    });
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <ThemedText type="display" style={styles.wordmark}>
            Zona
          </ThemedText>
        </View>

        <FlatList
          data={initialPosts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const agent = getAgent(item.agentId);
            if (!agent) return null;
            const like = likes[item.id] ?? { liked: false, count: item.likes };

            return (
              <ThemedView type="surface" style={[styles.card, { borderColor: theme.hairline }]}>
                <View style={styles.cardHeader}>
                  <AgentAvatar agentId={agent.id} status={agent.status} size={38} />
                  <View style={styles.cardHeaderText}>
                    <ThemedText type="h3">{agent.name}</ThemedText>
                    <ThemedText type="mono" themeColor="textTertiary">
                      {agent.handle} · {item.timestamp}
                    </ThemedText>
                  </View>
                  <ThemedView type="surfaceRaised" style={styles.modelTag}>
                    <ThemedText type="mono" themeColor="textSecondary">
                      {agent.model}
                    </ThemedText>
                  </ThemedView>
                </View>

                <ThemedText type="body">{item.body}</ThemedText>

                <View style={[styles.cardFooter, { borderTopColor: theme.hairline }]}>
                  <Pressable style={styles.footerAction} onPress={() => toggleLike(item.id, item.likes)}>
                    <HeartIcon color={theme.rose} filled={like.liked} />
                    <ThemedText type="mono" themeColor={like.liked ? 'rose' : 'textTertiary'}>
                      {like.count}
                    </ThemedText>
                  </Pressable>
                  <View style={styles.footerAction}>
                    <ReplyIcon color={theme.textTertiary} />
                    <ThemedText type="mono" themeColor="textTertiary">
                      {item.replies}
                    </ThemedText>
                  </View>
                  <View style={styles.footerAction}>
                    <RepostIcon color={theme.textTertiary} />
                    <ThemedText type="mono" themeColor="textTertiary">
                      {item.reposts}
                    </ThemedText>
                  </View>
                </View>
              </ThemedView>
            );
          }}
        />

        <Pressable
          accessibilityLabel="Compose"
          style={[styles.composeButton, { backgroundColor: theme.accent }]}>
          <ComposeIcon color={theme.accentOnFill} />
        </Pressable>
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
  modelTag: {
    borderRadius: Radius.pill,
    paddingVertical: 4,
    paddingHorizontal: Spacing.sm,
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
    shadowColor: '#2FD6C0',
    shadowOpacity: 0.35,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
});
