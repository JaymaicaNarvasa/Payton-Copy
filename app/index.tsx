import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { supabase } from '../lib/supabase';


export default function WelcomeScreen() {
  const router = useRouter();
  
  // 1. Create animated values for both opacity and scale
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // 2. Run both animations at the same time
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1, // Grow to full size (100%)
        duration: 500,
        useNativeDriver: true,
      })
    ]).start();

    let cancelled = false;

    // Where should this user go? Checked while the logo animation plays.
    const resolveDestination = async (): Promise<string> => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return '/login';

        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', session.user.id)
          .maybeSingle();

        switch (profile?.role) {
          case 'Personal':
            return '/(personalTabs)/home';
          case 'Spender':
            return '/(spenderTabs)/home';
          case 'Sponsor':
            return '/(sponsorTabs)/home';
          default:
            return '/role-selection';
        }
      } catch {
        return '/login';
      }
    };

    // Keep the splash visible for at least 2 seconds, then go.
    const minDelay = new Promise<void>((resolve) => setTimeout(resolve, 2000));

    Promise.all([resolveDestination(), minDelay]).then(([destination]) => {
      if (!cancelled) router.replace(destination as any);
    });

    return () => {
      cancelled = true;
    };
  }, [fadeAnim, scaleAnim, router]);

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.contentContainer}>
        {/* 3. Apply both opacity and transform scale */}
        <Animated.Image 
          source={require('../assets/images/logo-light1.png')} 
          style={[
            styles.logo, 
            { 
              opacity: fadeAnim,
              transform: [{ scale: scaleAnim }]
            }
          ]}
          resizeMode="contain"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff', justifyContent: 'space-between' },
  contentContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  logo: { width: 200, height: 200 },
});