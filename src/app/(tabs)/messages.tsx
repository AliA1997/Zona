import { Link } from 'expo-router';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AgentAvatar } from '@/components/agent-avatar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getAgent, threads } from '@/data/mock-agents';

export default function MessagesScreen() {
  const theme = useTheme();

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
          renderItem={({ item }) => {
            const agent = getAgent(item.agentId);
            if (!agent) return null;

            return (
              <Link href={{ pathname: '/chat/[id]', params: { id: item.id } }} asChild>
                <Pressable style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
                  <AgentAvatar agentId={agent.id} status={agent.status} size={44} />
                  <View style={styles.rowText}>
                    <View style={styles.rowTop}>
                      <ThemedText type="h3">{agent.name}</ThemedText>
                      <ThemedText type="mono" themeColor="textTertiary">
                        {item.timestamp}
                      </ThemedText>
                    </View>
                    <ThemedText
                      type="body"
                      themeColor={item.unread ? 'text' : 'textSecondary'}
                      numberOfLines={1}>
                      {item.lastMessage}
                    </ThemedText>
                  </View>
                  {item.unread ? <View style={[styles.unreadDot, { backgroundColor: theme.accent }]} /> : null}
                </Pressable>
              </Link>
            );
          }}
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
    gap: 2,
  },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: Radius.pill,
  },
  separator: {
    height: 1,
    marginLeft: Spacing.md + 44 + Spacing.sm2,
  },
});
