import { Host, Picker, Slider } from '@expo/ui';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AgentAvatar } from '@/components/agent-avatar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { agents } from '@/data/mock-agents';

const MY_AGENT = agents[0];
const MODELS = ['claude', 'gpt-5', 'custom'] as const;

function TraitSlider({
  label,
  value,
  onValueChange,
}: {
  label: string;
  value: number;
  onValueChange: (value: number) => void;
}) {
  return (
    <View style={styles.trait}>
      <View style={styles.traitHeader}>
        <ThemedText type="small" style={styles.traitLabel}>
          {label}
        </ThemedText>
        <ThemedText type="mono" themeColor="textSecondary">
          {Math.round(value)}%
        </ThemedText>
      </View>
      <Host style={styles.sliderHost}>
        <Slider value={value} min={0} max={100} onValueChange={onValueChange} />
      </Host>
    </View>
  );
}

export default function PersonalizeScreen() {
  const theme = useTheme();
  const [curiosity, setCuriosity] = useState(82);
  const [verbosity, setVerbosity] = useState(45);
  const [tone, setTone] = useState(60);
  const [model, setModel] = useState<(typeof MODELS)[number]>(MY_AGENT.model);

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <AgentAvatar agentId={MY_AGENT.id} size={56} />
          <ThemedText type="h2">Personalize {MY_AGENT.name}</ThemedText>
        </View>

        <ThemedView type="surface" style={[styles.section, { borderColor: theme.hairline }]}>
          <TraitSlider label="Curiosity" value={curiosity} onValueChange={setCuriosity} />
          <TraitSlider label="Verbosity" value={verbosity} onValueChange={setVerbosity} />
          <TraitSlider label="Tone (precise → witty)" value={tone} onValueChange={setTone} />
        </ThemedView>

        <View style={styles.modelSection}>
          <ThemedText type="mono" themeColor="textTertiary" style={styles.modelKicker}>
            MODEL
          </ThemedText>
          <ThemedView type="surface" style={[styles.section, { borderColor: theme.hairline }]}>
            <Host matchContents>
              <Picker
                selectedValue={model}
                onValueChange={(value) => setModel(value as (typeof MODELS)[number])}
                appearance="menu">
                {MODELS.map((option) => (
                  <Picker.Item key={option} label={option} value={option} />
                ))}
              </Picker>
            </Host>
          </ThemedView>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: Spacing.md,
    gap: Spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm2,
  },
  section: {
    borderWidth: 1,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    gap: Spacing.md,
  },
  trait: {
    gap: Spacing.xs,
  },
  traitHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  traitLabel: {
    fontWeight: '700',
  },
  sliderHost: {
    height: 32,
  },
  modelSection: {
    gap: Spacing.xs,
  },
  modelKicker: {
    letterSpacing: 1,
  },
});
