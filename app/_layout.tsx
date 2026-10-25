import * as Linking from 'expo-linking';
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from 'react';
import { supabase } from '../lib/supabase';

export default function RootLayout() {
  const router = useRouter();

  useEffect(() => {
    // 1. Listen gamit ang onAuthStateChange alang sa PASSWORD_RECOVERY event
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        // Naa nay session nga na-inject, pwede na i-redirect
        router.replace('/reset-password');
      }
    });

    // 2. Kani nga bahin mosiguro nga kung ang app gi-open gikan sa link,
    // i-parse ni Supabase ang URL aron makuha ang session.
    const handleDeepLink = async (url: string | null) => {
      if (!url) return;
      
      // I-extract ang part nga naay hash (#) o query (?)
      const parts = url.split('#');
      if (parts.length > 1) {
        const hash = parts[1];
        // Atong i-initialize ang session gamit ang fragment gikan sa URL
        const params = new URLSearchParams(hash);
        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');

        if (accessToken && refreshToken) {
          await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
        }
      }
    };

    // Susiha kung gi-open ba ang app gikan sa patay nga state via link
    Linking.getInitialURL().then((url) => handleDeepLink(url));

    // Paminawa ang link kung nagdagan na ang app sa background
    const listener = Linking.addEventListener('url', (event) => {
      handleDeepLink(event.url);
    });

    return () => {
      subscription.unsubscribe();
      listener.remove();
    };
  }, []);

  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#F7F9F8' } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
      </Stack>
    </>
  );
}