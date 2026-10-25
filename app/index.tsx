import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';


export default function WelcomeScreen() {
  const router = useRouter();
  
  // 1. Create animated values for both opacity and scale
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.7)).current; // Start at half size

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

    const timer = setTimeout(() => {
      router.replace("/login"); 
    }, 2000); 

    return () => clearTimeout(timer);
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
  container: { flex: 1, backgroundColor: '#fdfdfd', justifyContent: 'space-between' },
  contentContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  logo: { width: 150, height: 150, marginBottom: 25 },
});