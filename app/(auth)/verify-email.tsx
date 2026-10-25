import { useRouter } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';


export default function VerifyEmailScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F9F8' },
  innerContainer: { flex: 1, padding: 24, justifyContent: 'center', alignItems: 'center' },
  iconPlaceholder: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#F0F9F8',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  iconText: { fontSize: 40 },
  title: { fontSize: 26, fontWeight: 'bold', color: '#1B3623', marginBottom: 12 },
  subtitle: { fontSize: 16, color: '#586A61', textAlign: 'center', marginBottom: 32, lineHeight: 24 },
  primaryButton: {
    backgroundColor: '#1B3623',
    borderRadius: 12,
    padding: 16,
    width: '100%',
    alignItems: 'center',
    marginBottom: 16,
  },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },
  secondaryButton: { padding: 12 },
  secondaryButtonText: { color: '#89B443', fontWeight: 'bold', fontSize: 15 },
});