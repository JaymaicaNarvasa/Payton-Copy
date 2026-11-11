import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { supabase } from '../../lib/supabase';
import { useKeyboardScroll } from '../../lib/useKeyboardScroll';

const COLORS = {
  ink: '#013237',
  brand: '#4CA771',
  brandSoft: '#EAF9E7',
  brandLine: '#C0E6BA',
  border: '#DCE8E1',
  muted: '#6B7F78',
  placeholder: '#8FA19A',
  surface: '#FFFFFF',
  error: '#D64545',
};

/** Pulsing skeleton bar used in place of a spinner while a request is running. */
function SkeletonBar({ width = 96, color = 'rgba(255,255,255,0.55)' }: { width?: number; color?: string }) {
  const opacity = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.35, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return <Animated.View style={{ width, height: 10, borderRadius: 5, backgroundColor: color, opacity }} />;
}

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { scrollRef, keyboardHeight, onScroll, trackField } = useKeyboardScroll();
  const emailWrapRef = useRef<View>(null);
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);

  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Entrance animation
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 450, useNativeDriver: true }).start();
  }, [fade]);

  const handleResetPassword = async () => {
    setErrorMessage('');
    setSuccessMessage('');

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setErrorMessage('Email is a required field.');
      return;
    }

    setLoading(true);
    const redirectUrl = Linking.createURL('reset-password');

    const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
      redirectTo: redirectUrl,
    });

    setLoading(false);

    if (error) {
      setErrorMessage(error.message);
    } else {
      setSuccessMessage('A password reset link has been sent to your email address.');
    }
  };

  return (
    <LinearGradient colors={['#FFFFFF', '#FFFFFF', '#FFFFFF']} style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          ref={scrollRef}
          onScroll={onScroll}
          scrollEventThrottle={16}
          contentContainerStyle={[
            styles.scrollContainer,
            { paddingTop: insets.top + 72, paddingBottom: 32 + keyboardHeight },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <TouchableOpacity
            onPress={() => router.push('/login')}
            style={[styles.backButton, { top: insets.top + 12 }]}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Back to sign in"
          >
            <Feather name="arrow-left" size={20} color={COLORS.ink} />
          </TouchableOpacity>

          <Animated.View style={{ opacity: fade }}>
            <View style={styles.headerContainer}>
              <View style={styles.iconTile}>
                <Feather name="key" size={34} color={COLORS.ink} />
              </View>
              <Text style={styles.title}>Forgot password?</Text>
              <Text style={styles.subtitle}>
                No worries. Enter your email address and we'll send you a link to reset your password.
              </Text>
            </View>

            <View style={styles.form}>
              <Text style={styles.label}>Email</Text>
              <View
                ref={emailWrapRef}
                collapsable={false}
                style={[
                  styles.inputWrapper,
                  focused && styles.inputFocused,
                  !!errorMessage && styles.inputError,
                  !!successMessage && styles.inputLocked,
                ]}
              >
                <Feather
                  name="mail"
                  size={19}
                  color={errorMessage ? COLORS.error : focused ? COLORS.brand : COLORS.muted}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  placeholder="you@example.com"
                  placeholderTextColor={COLORS.placeholder}
                  value={email}
                  onChangeText={(text) => {
                    setEmail(text);
                    if (errorMessage) setErrorMessage('');
                  }}
                  onFocus={() => {
                    setFocused(true);
                    trackField(emailWrapRef);
                  }}
                  onBlur={() => setFocused(false)}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  textContentType="emailAddress"
                  returnKeyType="send"
                  onSubmitEditing={handleResetPassword}
                  editable={!loading && !successMessage}
                  underlineColorAndroid="transparent"
                  accessibilityLabel="Email address"
                />
              </View>

              {errorMessage ? <Text style={styles.fieldError}>{errorMessage}</Text> : null}

              {successMessage ? (
                <View style={styles.successContainer} accessibilityRole="alert">
                  <View style={styles.successBadge}>
                    <Feather name="check" size={22} color="#FFFFFF" />
                  </View>
                  <Text style={styles.successTitle}>Check your inbox</Text>
                  <Text style={styles.successText}>{successMessage}</Text>
                  <TouchableOpacity
                    onPress={() => router.back()}
                    style={styles.primaryButton}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                  >
                    <Text style={styles.buttonText}>Back to Sign In</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.primaryButton, styles.buttonSpaced, loading && styles.buttonDisabled]}
                  onPress={handleResetPassword}
                  disabled={loading}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel="Send reset link"
                >
                  {loading ? <SkeletonBar width={120} /> : <Text style={styles.buttonText}>Send Reset Link</Text>}
                </TouchableOpacity>
              )}
            </View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    flex: 1,
  },
  scrollContainer: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingVertical: 32,
    justifyContent: 'center',
  },
  backButton: {
    position: 'absolute',
    top: 8,
    left: 20,
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    zIndex: 2,
  },

  // Header
  headerContainer: {
    alignItems: 'center',
    marginBottom: 30,
  },
  iconTile: {
    width: 84,
    height: 84,
    borderRadius: 24,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 22,
    shadowColor: COLORS.ink,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 6,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.ink,
    letterSpacing: -0.5,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: COLORS.muted,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 8,
  },

  // Form
  form: {
    width: '100%',
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.ink,
    marginBottom: 8,
    marginLeft: 4,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    paddingHorizontal: 16,
    height: 56,
  },
  inputFocused: {
    borderColor: COLORS.brand,
  },
  inputError: {
    borderColor: COLORS.error,
  },
  inputLocked: {
    opacity: 0.6,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: COLORS.ink,
    height: '100%',
  },
  fieldError: {
    color: COLORS.error,
    fontSize: 12,
    marginTop: 6,
    marginLeft: 4,
  },

  // Buttons
  primaryButton: {
    backgroundColor: COLORS.ink,
    borderRadius: 16,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    shadowColor: COLORS.ink,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 14,
    elevation: 6,
  },
  buttonSpaced: {
    marginTop: 22,
  },
  buttonDisabled: {
    opacity: 0.75,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },

  // Success
  successContainer: {
    marginTop: 22,
    padding: 22,
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.brandLine,
  },
  successBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.brand,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  successTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.ink,
    marginBottom: 6,
  },
  successText: {
    color: COLORS.muted,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
});
