import { JetBrainsMono_400Regular, JetBrainsMono_500Medium, JetBrainsMono_600SemiBold } from '@expo-google-fonts/jetbrains-mono';
import { Manrope_400Regular, Manrope_600SemiBold, Manrope_700Bold } from '@expo-google-fonts/manrope';
import { SpaceGrotesk_600SemiBold, SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk';
import { DarkTheme, DefaultTheme, ThemeProvider, useRouter, useSegments } from 'expo-router';
import { Stack } from 'expo-router/stack';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { observer } from 'mobx-react-lite';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { SplashOverlay } from '@/components/splash-overlay';
import { Colors } from '@/constants/theme';
import { StoreProvider, useStore } from '@/stores';

SplashScreen.preventAutoHideAsync();

// Declarative redirects can't live alongside the Stack's children, so the gate is an
// effect: it runs after every auth-state or route change and corrects the location.
function useSessionRedirect(isAuthenticated: boolean, restoring: boolean) {
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (restoring) return;

    const onSignIn = segments[0] === 'sign-in';

    if (!isAuthenticated && !onSignIn) {
      router.replace('/sign-in');
    } else if (isAuthenticated && onSignIn) {
      router.replace('/');
    }
  }, [isAuthenticated, restoring, segments, router]);
}

const RootNavigator = observer(function RootNavigator({ fontsLoaded }: { fontsLoaded: boolean }) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? Colors.dark : Colors.light;
  const { authStore } = useStore();

  useSessionRedirect(authStore.isAuthenticated, authStore.restoring);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.background },
        }}>
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="chat/[id]"
          options={{
            headerShown: true,
            headerStyle: { backgroundColor: theme.surface },
            headerTintColor: theme.text,
          }}
        />
        <Stack.Screen
          name="personalize"
          options={{
            headerShown: true,
            presentation: 'formSheet',
            sheetGrabberVisible: true,
            headerStyle: { backgroundColor: theme.surface },
            headerTintColor: theme.text,
          }}
        />
      </Stack>
      {/* Holding the splash through `restoring` is what stops a returning user from
          seeing the sign-in screen flash before their session is read. */}
      <SplashOverlay ready={fontsLoaded && !authStore.restoring} />
    </ThemeProvider>
  );
});

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
    Manrope_400Regular,
    Manrope_600SemiBold,
    Manrope_700Bold,
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
    JetBrainsMono_600SemiBold,
  });

  return (
    <StoreProvider>
      <RootNavigator fontsLoaded={fontsLoaded} />
    </StoreProvider>
  );
}
