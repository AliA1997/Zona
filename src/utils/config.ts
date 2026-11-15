// Each variable is read with a literal `process.env.EXPO_PUBLIC_*` access because
// Expo only inlines that exact form at build time — a computed key reads undefined.
const REQUIRED_CONFIG = {
  EXPO_PUBLIC_API_BASE_URL: process.env.EXPO_PUBLIC_API_BASE_URL,
  EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
  EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
};

// Names only, never values: the result is shown on the "app not configured" screen.
export function getMissingConfig(
  config: Record<string, string | undefined> = REQUIRED_CONFIG
): string[] {
  return Object.entries(config)
    .filter(([, value]) => !value)
    .map(([name]) => name);
}
