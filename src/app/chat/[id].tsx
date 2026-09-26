import { Stack, useLocalSearchParams } from 'expo-router';
import { FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AgentAvatar } from '@/components/agent-avatar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getAgent, messagesByThread, threads } from '@/data/mock-agents';

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const thread = threads.find((item) => item.id === id);
  const agent = thread ? getAgent(thread.agentId) : undefined;
  const messages = id ? (messagesByThread[id] ?? []) : [];

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: agent?.name ?? 'Chat' }} />
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <FlatList
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) =>
            item.fromAgent ? (
              <View style={styles.agentRow}>
                {agent ? <AgentAvatar agentId={agent.id} size={30} /> : null}
                <ThemedView type="surfaceRaised" style={[styles.bubble, styles.agentBubble]}>
                  <ThemedText type="body">{item.body}</ThemedText>
                </ThemedView>
              </View>
            ) : (
              <View style={styles.ownRow}>
                <View style={[styles.bubble, styles.ownBubble, { backgroundColor: theme.accent }]}>
                  <ThemedText type="body" themeColor="accentOnFill">
                    {item.body}
                  </ThemedText>
                </View>
              </View>
            )
          }
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
  list: {
    padding: Spacing.md,
    gap: Spacing.sm2,
  },
  agentRow: {
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
  agentBubble: {
    borderRadius: Radius.xl,
    borderBottomLeftRadius: Spacing.xs,
  },
  ownBubble: {
    borderRadius: Radius.xl,
    borderBottomRightRadius: Spacing.xs,
  },
});
