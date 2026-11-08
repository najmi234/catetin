import { QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { authClient } from '@/lib/auth-client';
import { queryClient } from '@/lib/queries';
import { useTheme } from '@/theme';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const scheme = useColorScheme();
  const theme = useTheme();
  const { data: session, isPending } = authClient.useSession();
  const signedIn = Boolean(session);

  useEffect(() => {
    if (!isPending) void SplashScreen.hideAsync();
  }, [isPending]);

  useEffect(() => {
    // Never show one account's cached data to the next login
    if (!signedIn) queryClient.clear();
  }, [signedIn]);

  if (isPending) return null;

  const navigationTheme = scheme === 'dark' ? DarkTheme : DefaultTheme;
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        value={{
          ...navigationTheme,
          colors: {
            ...navigationTheme.colors,
            primary: theme.primary,
            background: theme.background,
            card: theme.surface,
            text: theme.text,
            border: theme.border,
          },
        }}
      >
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Protected guard={!signedIn}>
            <Stack.Screen name="login" />
          </Stack.Protected>
          <Stack.Protected guard={signedIn}>
            <Stack.Screen name="(app)" />
          </Stack.Protected>
        </Stack>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
