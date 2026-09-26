import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { Colors } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type AgentStatus = 'online' | 'thinking' | 'idle' | 'dreaming' | 'offline';

// Agents have no faces — identity is a generated two-color gradient plus an
// abstract sigil, unique per agent. See .claude/references/design-system.md.
const GRADIENTS: [string, string][] = [
  ['#2FD6C0', '#2A6DF0'],
  ['#8C7CFF', '#FF6BCB'],
  ['#FFB33E', '#FF3D78'],
  ['#33D17A', '#2FD6C0'],
  ['#64726F', '#232E2D'],
];

const STATUS_COLOR: Record<AgentStatus, ThemeColorKey> = {
  online: 'green',
  thinking: 'amber',
  idle: 'textTertiary',
  dreaming: 'secondary',
  offline: 'textTertiary',
};

type ThemeColorKey = keyof typeof Colors.dark;

function hashString(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function Sigil({ index, size }: { index: number; size: number }) {
  const s = size * 0.4;
  const stroke = 'rgba(255,255,255,0.9)';
  const shapes = [
    <Path key="triangle" d="M12 3 20 19H4Z" fill="none" stroke={stroke} strokeWidth={1.6} strokeLinejoin="round" />,
    <Path key="plus" d="M12 2v6M12 16v6M2 12h6M16 12h6" stroke={stroke} strokeWidth={1.6} strokeLinecap="round" />,
    <Circle key="circle" cx={12} cy={12} r={6} fill="none" stroke={stroke} strokeWidth={1.6} />,
    <Path
      key="spark"
      d="M12 3v18M3 12h18"
      stroke={stroke}
      strokeWidth={1.6}
      strokeLinecap="round"
      transform="rotate(45 12 12)"
    />,
    <Rect key="square" x={6} y={6} width={12} height={12} rx={2} fill="none" stroke={stroke} strokeWidth={1.6} />,
  ];
  return (
    <Svg width={s} height={s} viewBox="0 0 24 24">
      {shapes[index % shapes.length]}
    </Svg>
  );
}

export function AgentAvatar({
  agentId,
  status,
  size = 44,
}: {
  agentId: string;
  status?: AgentStatus;
  size?: number;
}) {
  const theme = useTheme();
  const hash = hashString(agentId);
  const [start, end] = GRADIENTS[hash % GRADIENTS.length];
  const sigilIndex = Math.floor(hash / GRADIENTS.length);
  const ringSize = Math.max(12, Math.round(size * 0.24));
  const ringBorder = Math.max(2, Math.round(size * 0.04));

  return (
    <View style={{ width: size, height: size }}>
      <LinearGradient
        colors={[start, end]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.circle, { width: size, height: size, borderRadius: size / 2 }]}>
        <Sigil index={sigilIndex} size={size} />
      </LinearGradient>
      {status ? (
        <View
          style={[
            styles.statusRing,
            {
              width: ringSize,
              height: ringSize,
              borderRadius: ringSize / 2,
              borderWidth: ringBorder,
              borderColor: theme.background,
              backgroundColor: status === 'offline' ? theme.background : theme[STATUS_COLOR[status]],
            },
            status === 'offline' && { borderColor: theme.textTertiary, borderWidth: 1.5 },
          ]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  statusRing: {
    position: 'absolute',
    right: 0,
    bottom: 0,
  },
});
