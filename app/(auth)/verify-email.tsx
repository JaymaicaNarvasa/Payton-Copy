import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function VerifyEmailScreen() {
  const router = useRouter();

  return (
    <LinearGradient colors={['#EAF9E7', '#FFFFFF']} style={styles.container}>
      <View style={styles.innerContainer}>
        <View style={styles.iconPlaceholder}>
          <Text style={styles.iconText}>✉️</Text>
        </View>

        <Text style={styles.title}>Check your email</Text>
        <Text style={styles.subtitle}>
          We sent a verification link to your email address. Please click the link to secure your account.
        </Text>

        <TouchableOpacity style={styles.primaryButton} onPress={() => router.replace('/login')}>
          <Text style={styles.buttonText}>Back to Log In</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>Resend Verification Email</Text>
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  innerContainer: { flex: 1, padding: 28, justifyContent: 'center', alignItems: 'center' },
  iconPlaceholder: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  iconText: { fontSize: 40 },
  title: { fontSize: 28, fontWeight: '700', color: '#013237', marginBottom: 12 },
  subtitle: { fontSize: 14, color: '#4CA771', textAlign: 'center', marginBottom: 32, lineHeight: 22 },
  primaryButton: {
    backgroundColor: '#013237',
    borderRadius: 30,
    height: 56,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  secondaryButton: { padding: 12 },
  secondaryButtonText: { color: '#4CA771', fontWeight: '600', fontSize: 15 },
});