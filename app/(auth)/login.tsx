import { AntDesign, Feather, FontAwesome } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Image,
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

import { useKeyboardScroll } from '../../lib/useKeyboardScroll';
import { supabase } from '../../lib/supabase';

WebBrowser.maybeCompleteAuthSession();

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

type Field = 'email' | 'password' | null;
type Action = 'email' | 'google' | 'facebook' | null;

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

  return (
    <Animated.View
      style={{ width, height: 10, borderRadius: 5, backgroundColor: color, opacity }}
    />
  );
}

export default function LoginScreen() {
  const router = useRouter();
  const { scrollRef, keyboardHeight, onScroll, trackField } = useKeyboardScroll();
  const emailWrapRef = useRef<View>(null);
  const passwordWrapRef = useRef<View>(null);
  const passwordRef = useRef<TextInput>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [activeAction, setActiveAction] = useState<Action>(null);
  const [focused, setFocused] = useState<Field>(null);

  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [generalError, setGeneralError] = useState('');

  const loading = activeAction !== null;

  // Entrance animation
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 450, useNativeDriver: true }).start();
  }, [fade]);

  const logActivity = async (userId: string | null, details: string) => {
    try {
      if (!userId) return;
      await supabase.from('logs').insert({
        user_id: userId,
        details: details,
      });
    } catch (err) {
      console.error('Failed to write log:', err);
    }
  };

  const navigateBasedOnRole = async (userId: string) => {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle();

    if (profileError || !profile) {
      setGeneralError('Could not fetch user profile details.');
      return;
    }

    const userRole = profile.role;

    switch (userRole) {
      case 'Personal':
        router.replace('/(personalTabs)/home');
        break;
      case 'Spender':
        router.replace('/(spenderTabs)/home');
        break;
      case 'Sponsor':
        router.replace('/(sponsorTabs)/home');
        break;
      default:
        router.replace('/role-selection');
        break;
    }
  };

  const handleLogin = async () => {
    setEmailError('');
    setPasswordError('');
    setGeneralError('');

    const trimmedEmail = email.trim();
    let hasError = false;

    if (!trimmedEmail) {
      setEmailError('Email is a required field.');
      hasError = true;
    }
    if (!password) {
      setPasswordError('Password is a required field.');
      hasError = true;
    }

    if (hasError) return;

    setActiveAction('email');
    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      });

      if (authError) {
        setGeneralError(authError.message);
        return;
      }

      if (authData?.user) {
        await logActivity(authData.user.id, `signed in successfully.`);
        await navigateBasedOnRole(authData.user.id);
      }
    } catch (e: any) {
      setGeneralError(e.message || 'An unexpected error occurred.');
    } finally {
      setActiveAction(null);
    }
  };

  const handleForgotPassword = () => {
    router.push('/forgot-password');
  };

  const createSessionFromUrl = async (url: string) => {
    const parsed = Linking.parse(url);
    let params: Record<string, any> = parsed.queryParams || {};

    if (url.includes('#')) {
      const hashString = url.split('#')[1];
      const hashParams = new URLSearchParams(hashString);

      if (!params.access_token) params.access_token = hashParams.get('access_token');
      if (!params.refresh_token) params.refresh_token = hashParams.get('refresh_token');
      if (!params.code) params.code = hashParams.get('code');
    }

    if (params.code) {
      const { error } = await supabase.auth.exchangeCodeForSession(params.code as string);
      if (error) throw error;
      return;
    }

    if (params.access_token && params.refresh_token) {
      const { error } = await supabase.auth.setSession({
        access_token: params.access_token as string,
        refresh_token: params.refresh_token as string,
      });
      if (error) throw error;
      return;
    }
  };

  const performOAuthLogin = async (provider: 'google' | 'facebook') => {
    setGeneralError('');
    setActiveAction(provider);
    try {
      const redirectTo = Linking.createURL('/login');

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo,
          skipBrowserRedirect: true,
        },
      });

      if (error) throw error;

      if (data?.url) {
        const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

        if (res.type === 'success' && res.url) {
          await createSessionFromUrl(res.url);

          const { data: authUser } = await supabase.auth.getUser();
          if (authUser?.user) {
            await logActivity(authUser.user.id, `signed in via ${provider}.`);
            await navigateBasedOnRole(authUser.user.id);
          }
        }
      }
    } catch (e: any) {
      setGeneralError(e.message || 'An unexpected error occurred.');
    } finally {
      setActiveAction(null);
    }
  };

  return (
    <LinearGradient colors={[COLORS.brandSoft, '#F6FCF5', '#FFFFFF']} style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          ref={scrollRef}
          onScroll={onScroll}
          scrollEventThrottle={16}
          contentContainerStyle={[styles.scrollContainer, { paddingBottom: 32 + keyboardHeight }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View style={{ opacity: fade }}>
            {/* Header */}
            <View style={styles.headerContainer}>
              <View style={styles.logoTile}>
                <Image
                  source={require('../../assets/images/pin.jpg')}
                  style={styles.logoImage}
                  resizeMode="contain"
                />
              </View>
              <Text style={styles.title}>Welcome back</Text>
              <Text style={styles.subtitle}>
                Sign in to continue to <Text style={styles.brandText}>Payton</Text>
              </Text>
            </View>

            {/* General error banner */}
            {generalError ? (
              <View style={styles.banner} accessibilityRole="alert">
                <Feather name="alert-circle" size={18} color={COLORS.error} />
                <Text style={styles.bannerText}>{generalError}</Text>
              </View>
            ) : null}

            {/* Form */}
            <View style={styles.form}>
              <Text style={styles.label}>Email</Text>
              <View
                ref={emailWrapRef}
                collapsable={false}
                style={[
                  styles.inputWrapper,
                  focused === 'email' && styles.inputFocused,
                  !!emailError && styles.inputError,
                ]}
              >
                <Feather
                  name="mail"
                  size={19}
                  color={emailError ? COLORS.error : focused === 'email' ? COLORS.brand : COLORS.muted}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  placeholder="you@example.com"
                  placeholderTextColor={COLORS.placeholder}
                  value={email}
                  onChangeText={(text) => {
                    setEmail(text);
                    if (emailError) setEmailError('');
                  }}
                  onFocus={() => {
                    setFocused('email');
                    trackField(emailWrapRef);
                  }}
                  onBlur={() => setFocused(null)}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  textContentType="emailAddress"
                  returnKeyType="next"
                  blurOnSubmit={false}
                  onSubmitEditing={() => passwordRef.current?.focus()}
                  editable={!loading}
                  underlineColorAndroid="transparent"
                  accessibilityLabel="Email address"
                />
              </View>
              {emailError ? <Text style={styles.fieldError}>{emailError}</Text> : null}

              <Text style={[styles.label, styles.labelSpaced]}>Password</Text>
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
                  ref={passwordRef}
                  style={styles.input}
                  placeholder="Enter your password"
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
                  returnKeyType="done"
                  onSubmitEditing={handleLogin}
                  editable={!loading}
                  underlineColorAndroid="transparent"
                  accessibilityLabel="Password"
                />
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
              </View>
              {passwordError ? <Text style={styles.fieldError}>{passwordError}</Text> : null}

              <TouchableOpacity
                onPress={handleForgotPassword}
                disabled={loading}
                style={styles.forgotWrapper}
                accessibilityRole="link"
              >
                <Text style={styles.forgot}>Forgot password?</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.primaryButton, loading && styles.buttonDisabled]}
                onPress={handleLogin}
                disabled={loading}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Sign in"
              >
                {activeAction === 'email' ? (
                  <SkeletonBar width={110} />
                ) : (
                  <Text style={styles.buttonText}>Sign In</Text>
                )}
              </TouchableOpacity>
            </View>

            {/* Divider */}
            <View style={styles.dividerContainer}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or continue with</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Social */}
            <View style={styles.socialContainer}>
              <TouchableOpacity
                style={[styles.socialButton, loading && styles.buttonDisabled]}
                onPress={() => performOAuthLogin('google')}
                disabled={loading}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Continue with Google"
              >
                {activeAction === 'google' ? (
                  <SkeletonBar width={64} color={COLORS.brandLine} />
                ) : (
                  <>
                    <AntDesign name="google" size={19} color="#EA4335" style={styles.socialIcon} />
                    <Text style={styles.socialButtonText}>Google</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.socialButton, loading && styles.buttonDisabled]}
                onPress={() => performOAuthLogin('facebook')}
                disabled={loading}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Continue with Facebook"
              >
                {activeAction === 'facebook' ? (
                  <SkeletonBar width={64} color={COLORS.brandLine} />
                ) : (
                  <>
                    <FontAwesome name="facebook" size={19} color="#1877F2" style={styles.socialIcon} />
                    <Text style={styles.socialButtonText}>Facebook</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            {/* Footer */}
            <View style={styles.footer}>
              <Text style={styles.footerText}>Don't have an account? </Text>
              <TouchableOpacity
                onPress={() => router.push('/register')}
                disabled={loading}
                hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
                accessibilityRole="link"
              >
                <Text style={styles.linkText}>Sign Up</Text>
              </TouchableOpacity>
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

  // Header
  headerContainer: {
    alignItems: 'center',
    marginBottom: 28,
  },
  logoTile: {
    width: 84,
    height: 84,
    borderRadius: 24,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    shadowColor: COLORS.ink,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 6,
  },
  logoImage: {
    width: 60,
    height: 60,
    borderRadius: 16,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: COLORS.ink,
    letterSpacing: -0.5,
    marginBottom: 6,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: COLORS.muted,
    lineHeight: 22,
    textAlign: 'center',
  },
  brandText: {
    color: COLORS.brand,
    fontWeight: '700',
  },

  // Error banner
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
    backgroundColor: 'transparent',
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
  forgotWrapper: {
    alignSelf: 'flex-end',
    paddingVertical: 10,
    marginBottom: 6,
  },
  forgot: {
    color: COLORS.brand,
    fontSize: 13,
    fontWeight: '600',
  },

  // Buttons
  primaryButton: {
    backgroundColor: COLORS.ink,
    borderRadius: 16,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.ink,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 14,
    elevation: 6,
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

  // Divider
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.brandLine,
  },
  dividerText: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: '500',
    marginHorizontal: 14,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },

  // Social
  socialContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 28,
  },
  socialButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 54,
    borderRadius: 16,
    backgroundColor: COLORS.surface,
    borderWidth: 1.5,
    borderColor: COLORS.border,
  },
  socialIcon: {
    marginRight: 8,
  },
  socialButtonText: {
    color: COLORS.ink,
    fontSize: 15,
    fontWeight: '600',
  },

  // Footer
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  footerText: {
    color: COLORS.muted,
    fontSize: 14,
  },
  linkText: {
    color: COLORS.brand,
    fontWeight: '700',
    fontSize: 14,
  },
});
