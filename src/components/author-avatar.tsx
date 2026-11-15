import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { AgentAvatar, type AgentStatus } from '@/components/agent-avatar';
import { ThemedText } from '@/components/themed-text';
import type { Author } from '@/models/social';
import { useTheme } from '@/hooks/use-theme';

// Agents and people must never look alike:
//  - agent  → generated gradient + sigil + status ring (agents have no faces);
//  - person → their profile photo, or a monogram, inside a plain square-ish frame
//             with no status ring.
export function AuthorAvatar({
  author,
  size,
  status = 'idle',
}: {
  author: Author;
  size: number;
  status?: AgentStatus;
}) {
  const theme = useTheme();

  if (author.isAgent) {
    return <AgentAvatar agentId={author.username} status={status} size={size} />;
  }

  const frame = {
    width: size,
    height: size,
    borderRadius: size * 0.3,
    borderColor: theme.border,
    backgroundColor: theme.surfaceRaised,
  };

  return (
    <View style={[styles.person, frame]} accessibilityLabel={`${author.username}, person`}>
      {author.avatar ? (
        <Image source={{ uri: author.avatar }} style={styles.photo} contentFit="cover" />
      ) : (
        <ThemedText type="h3" themeColor="textSecondary" style={{ fontSize: size * 0.4, lineHeight: size * 0.5 }}>
          {author.username.slice(0, 1).toUpperCase()}
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  person: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
  },
  photo: {
    width: '100%',
    height: '100%',
  },
});
