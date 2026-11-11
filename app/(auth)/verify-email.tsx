import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Animated, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const COLORS = {
  ink: '#013237',
  brand: '#4CA771',
  brandSoft: '#EAF9E7',
  brandLine: '#C0E6BA',
  border: '#DCE8E1',
  muted: '#6B7F78',
  surface: '#FFFFFF',
};

export default function VerifyEmailScreen() {
  const router = useRouter();

  // Entrance animation
  const fade = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(16)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 450, useNativeDriver: true }),
      Animated.timing(slide, { toValue: 0, duration: 450, useNativeDriver: true }),
    ]).start();
  }, [fade, slide]);

  return (
    <LinearGradient colors={['#FFFFFF', '#FFFFFF', '#FFFFFF']} style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <Animated.View style={[styles.innerContainer, { opacity: fade, transform: [{ translateY: slide }] }]}>
        <View style={styles.iconRing}>
          <View style={styles.iconTile}>
            <Feather name="mail" size={36} color={COLORS.ink} />
            <View style={styles.badge}>
              <Feather name="check" size={12} color="#FFFFFF" />
            </View>
          </View>
        </View>

        <Text style={styles.title}>Check your email</Text>
        <Text style={styles.subtitle}>
          We sent a verification link to your email address. Open it to secure and activate your account.
        </Text>

        <View style={styles.tipCard}>
          <Feather name="info" size={16} color={COLORS.brand} style={styles.tipIcon} />
          <Text style={styles.tipText}>Can't find it? Check your spam or promotions folder.</Text>
        </View>

        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => router.replace('/login')}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Back to log in"
        >
          <Text style={styles.buttonText}>Back to Log In</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Resend verification email"
        >
          <Text style={styles.secondaryButtonText}>Resend Verification Email</Text>
        </TouchableOpacity>
      </Animated.View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  innerContainer: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconRing: {
    width: 132,
    height: 132,
    borderRadius: 66,
    backgroundColor: 'rgba(76,167,113,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  iconTile: {
    width: 92,
    height: 92,
    borderRadius: 28,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.ink,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 6,
  },
  badge: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: COLORS.brand,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: COLORS.brandSoft,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.ink,
    letterSpacing: -0.5,
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: COLORS.muted,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 8,
    marginBottom: 22,
  },
  tipCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.brandLine,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 32,
    alignSelf: 'stretch',
  },
  tipIcon: {
    marginRight: 10,
  },
  tipText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: COLORS.ink,
  },
  primaryButton: {
    backgroundColor: COLORS.ink,
    borderRadius: 16,
    height: 56,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    shadowColor: COLORS.ink,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 14,
    elevation: 6,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  secondaryButton: {
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  secondaryButtonText: {
    color: COLORS.brand,
    fontWeight: '600',
    fontSize: 15,
  },
});
