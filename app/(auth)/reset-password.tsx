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
  errorSoft: '#FDECEC',
};

type Field = 'password' | 'confirm' | null;

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

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { scrollRef, keyboardHeight, onScroll, trackField } = useKeyboardScroll();
  const passwordWrapRef = useRef<View>(null);
  const confirmWrapRef = useRef<View>(null);
  const insets = useSafeAreaInsets();
  const confirmRef = useRef<TextInput>(null);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [focused, setFocused] = useState<Field>(null);

  const [passwordError, setPasswordError] = useState('');
  const [confirmError, setConfirmError] = useState('');
  const [generalError, setGeneralError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Entrance animation
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 450, useNativeDriver: true }).start();
  }, [fade]);

  // Turn the link from the reset email into a session so updateUser works.
  const url = Linking.useURL();
  const handledUrl = useRef<string | null>(null);

  useEffect(() => {
    if (!url || handledUrl.current === url) return;
    handledUrl.current = url;

    (async () => {
      try {
        const parsed = Linking.parse(url);
        const params: Record<string, any> = { ...(parsed.queryParams || {}) };

        if (url.includes('#')) {
          const hash = new URLSearchParams(url.split('#')[1]);
          if (!params.access_token) params.access_token = hash.get('access_token');
          if (!params.refresh_token) params.refresh_token = hash.get('refresh_token');
          if (!params.code) params.code = hash.get('code');
          if (!params.error_description) params.error_description = hash.get('error_description');
        }

        if (params.error_description) {
          throw new Error(String(params.error_description).replace(/\+/g, ' '));
        }

        if (params.code) {
          const { error } = await supabase.auth.exchangeCodeForSession(params.code as string);
          if (error) throw error;
        } else if (params.access_token && params.refresh_token) {
          const { error } = await supabase.auth.setSession({
            access_token: params.access_token as string,
            refresh_token: params.refresh_token as string,
          });
          if (error) throw error;
        }
      } catch (e: any) {
        setGeneralError(e.message || 'This reset link is invalid or has expired.');
      }
    })();
  }, [url]);

  const handleUpdatePassword = async () => {
    setPasswordError('');
    setConfirmError('');
    setGeneralError('');
    setSuccessMessage('');

    let hasError = false;

    if (!password) {
      setPasswordError('Password is a required field.');
      hasError = true;
    } else if (password.length < 8) {
      setPasswordError('Password must be at least 8 characters');
      hasError = true;
    }

    if (!confirmPassword) {
      setConfirmError('Please confirm your password');
      hasError = true;
    } else if (password !== confirmPassword) {
      setConfirmError('Passwords do not match');
      hasError = true;
    }

    if (hasError) return;

    setLoading(true);

    const { data: updateData, error } = await supabase.auth.updateUser({
      password: password,
    });

    setLoading(false);

    if (error) {
      setGeneralError(error.message);
    } else {
      const userId = updateData?.user?.id;
      if (userId) {
        await supabase.from('logs').insert({
          user_id: userId,
          details: 'updated account password.',
        });
      }

      setSuccessMessage('Your password has been updated successfully!');
    }
  };

  const renderEye = () => (
    <TouchableOpacity
      onPress={() => setShowPassword((v) => !v)}
      style={styles.eyeIcon}
      disabled={loading}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      accessibilityRole="button"
      accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
    >
      <Feather name={showPassword ? 'eye-off' : 'eye'} color={COLORS.muted} size={19} />
    </TouchableOpacity>
  );

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
            style={[styles.backButton, { top: insets.top + 12 }]}
            onPress={() => router.replace('/login')}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Back to sign in"
          >
            <Feather name="arrow-left" size={20} color={COLORS.ink} />
          </TouchableOpacity>

          <Animated.View style={{ opacity: fade }}>
            <View style={styles.headerContainer}>
              <View style={styles.iconTile}>
                <Feather name="lock" size={34} color={COLORS.ink} />
              </View>
              <Text style={styles.title}>Reset password</Text>
              <Text style={styles.subtitle}>
                Enter your new password below to regain access to your account.
              </Text>
            </View>

            <View style={styles.form}>
              {generalError ? (
                <View style={styles.banner} accessibilityRole="alert">
                  <Feather name="alert-circle" size={18} color={COLORS.error} />
                  <Text style={styles.bannerText}>{generalError}</Text>
                </View>
              ) : null}

              {successMessage ? (
                <View style={styles.successContainer} accessibilityRole="alert">
                  <View style={styles.successBadge}>
                    <Feather name="check" size={22} color="#FFFFFF" />
                  </View>
                  <Text style={styles.successTitle}>All set</Text>
                  <Text style={styles.successText}>{successMessage}</Text>
                  <TouchableOpacity
                    onPress={() => router.replace('/login')}
                    style={styles.primaryButton}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                  >
                    <Text style={styles.buttonText}>Sign In with New Password</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <Text style={styles.label}>New password</Text>
                  <View
                    ref={passwordWrapRef}
                    collapsable={false}
                    style={[
                      styles.inputWrapper,
                      focused === 'password' && styles.inputFocused,
                      !!passwordError && styles.inputError,
                    ]}
                  >
                    <Feather
                      name="lock"
                      size={19}
                      color={passwordError ? COLORS.error : focused === 'password' ? COLORS.brand : COLORS.muted}
                      style={styles.inputIcon}
                    />
                    <TextInput
                      style={styles.input}
                      placeholder="At least 8 characters"
                      placeholderTextColor={COLORS.placeholder}
                      value={password}
                      onChangeText={(text) => {
                        setPassword(text);
                        if (passwordError) setPasswordError('');
                      }}
                      onFocus={() => {
                        setFocused('password');
                        trackField(passwordWrapRef);
                      }}
                      onBlur={() => setFocused(null)}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      returnKeyType="next"
                      blurOnSubmit={false}
                      onSubmitEditing={() => confirmRef.current?.focus()}
                      editable={!loading}
                      underlineColorAndroid="transparent"
                      accessibilityLabel="New password"
                    />
                    {renderEye()}
                  </View>
                  {passwordError ? <Text style={styles.fieldError}>{passwordError}</Text> : null}

                  <Text style={[styles.label, styles.labelSpaced]}>Confirm new password</Text>
                  <View
                    ref={confirmWrapRef}
                    collapsable={false}
                    style={[
                      styles.inputWrapper,
                      focused === 'confirm' && styles.inputFocused,
                      !!confirmError && styles.inputError,
                    ]}
                  >
                    <Feather
                      name="shield"
                      size={19}
                      color={confirmError ? COLORS.error : focused === 'confirm' ? COLORS.brand : COLORS.muted}
                      style={styles.inputIcon}
                    />
                    <TextInput
                      ref={confirmRef}
                      style={styles.input}
                      placeholder="Re-enter your password"
                      placeholderTextColor={COLORS.placeholder}
                      value={confirmPassword}
                      onChangeText={(text) => {
                        setConfirmPassword(text);
                        if (confirmError) setConfirmError('');
                      }}
                      onFocus={() => {
                        setFocused('confirm');
                        trackField(confirmWrapRef);
                      }}
                      onBlur={() => setFocused(null)}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      returnKeyType="done"
                      onSubmitEditing={handleUpdatePassword}
                      editable={!loading}
                      underlineColorAndroid="transparent"
                      accessibilityLabel="Confirm new password"
                    />
                    {renderEye()}
                  </View>
                  {confirmError ? <Text style={styles.fieldError}>{confirmError}</Text> : null}

                  <TouchableOpacity
                    style={[styles.primaryButton, styles.buttonSpaced, loading && styles.buttonDisabled]}
                    onPress={handleUpdatePassword}
                    disabled={loading}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel="Update password"
                  >
                    {loading ? <SkeletonBar width={120} /> : <Text style={styles.buttonText}>Update Password</Text>}
                  </TouchableOpacity>
                </>
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

  // Banner
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.errorSoft,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#F6C9C9',
  },
  bannerText: {
    flex: 1,
    color: COLORS.error,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
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
  labelSpaced: {
    marginTop: 16,
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
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: COLORS.ink,
    height: '100%',
  },
  eyeIcon: {
    padding: 4,
    marginLeft: 8,
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
    marginTop: 24,
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
