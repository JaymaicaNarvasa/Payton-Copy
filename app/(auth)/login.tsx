import { AntDesign, Feather, FontAwesome } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { supabase } from '../../lib/supabase';

WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [generalError, setGeneralError] = useState('');

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
      setGeneralError("Could not fetch user profile details.");
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

    setLoading(true);
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
      setGeneralError(e.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
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
    setLoading(true);
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
      setGeneralError(e.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient colors={['#EAF9E7', '#FFFFFF']} style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
          <View style={styles.headerContainer}>
            <Image 
              source={require('../../assets/images/pin.jpg')} 
              style={styles.logoImage} 
              resizeMode="contain"
            />
            <Text style={styles.title}>
              Welcome to <Text style={styles.brandText}>Payton</Text>
            </Text>
            <Text style={styles.subtitle}>
              Access your account using your email and password.
            </Text>
          </View>

          {generalError ? (
            <View style={styles.generalErrorContainer}>
              <Text style={styles.errorText}>{generalError}</Text>
            </View>
          ) : null}

          <View style={styles.form}>
            {/* Email Input Field */}
            <View style={[styles.inputWrapper, emailError ? styles.inputErrorBorder : null]}>
              <Feather name="mail" color="#4CA771" size={20} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Email Address"
                placeholderTextColor="#7A8A85"
                value={email}
                onChangeText={(text) => {
                  setEmail(text);
                  if (emailError) setEmailError('');
                }}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!loading}
                underlineColorAndroid="transparent"
              />
            </View>
            {emailError ? <Text style={styles.errorText}>{emailError}</Text> : null}

            {/* Password Input Field */}
            <View style={[styles.inputWrapper, passwordError ? styles.inputErrorBorder : null]}>
              <Feather name="lock" color="#4CA771" size={20} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Password"
                placeholderTextColor="#7A8A85"
                value={password}
                onChangeText={(text) => {
                  setPassword(text);
                  if (passwordError) setPasswordError('');
                }}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                editable={!loading}
                underlineColorAndroid="transparent"
              />

              <TouchableOpacity 
                onPress={() => setShowPassword(!showPassword)} 
                style={styles.eyeIcon}
                disabled={loading}
              >
                <Feather name={showPassword ? 'eye-off' : 'eye'} color="#4CA771" size={20} />
              </TouchableOpacity>
            </View>
            {passwordError ? <Text style={styles.errorText}>{passwordError}</Text> : null}

            <TouchableOpacity onPress={handleForgotPassword} disabled={loading}>
              <Text style={styles.forgot}>Forgot Password?</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.primaryButton, loading && { opacity: 0.8 }]} 
              onPress={handleLogin}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.buttonText}>Sign In</Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.dividerContainer}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>Or</Text>
            <View style={styles.dividerLine} />
          </View>

          <View style={styles.socialContainer}>
            <TouchableOpacity 
              style={[styles.socialButton, loading && { opacity: 0.8 }]} 
              onPress={() => performOAuthLogin('google')}
              disabled={loading}
            >
              <AntDesign name="google" size={20} color="#EA4335" style={styles.socialIcon} />
              <Text style={styles.socialButtonText}>Continue with Google</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.socialButton, loading && { opacity: 0.8 }]} 
              onPress={() => performOAuthLogin('facebook')}
              disabled={loading}
            >
              <FontAwesome name="facebook" size={20} color="#1877F2" style={styles.socialIcon} />
              <Text style={styles.socialButtonText}>Continue with Facebook</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Don't have an account? </Text>
            <TouchableOpacity onPress={() => router.push('/register')} disabled={loading}>
              <Text style={styles.linkText}>Sign Up</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1,
  },
  scrollContainer: { 
    flexGrow: 1, 
    paddingHorizontal: 28, 
    justifyContent: 'center',
    paddingVertical: 20,
  },
  headerContainer: { 
    marginBottom: 30,
    alignItems: 'center',
  },
  logoImage: {
    width: 90,
    height: 90,
    borderRadius: 45,
    marginBottom: 16,
  },
  title: { 
    fontSize: 32, 
    fontWeight: '700', 
    color: '#013237', 
    lineHeight: 40,
    marginBottom: 8, 
    textAlign: 'center',
  },
  brandText: {
    color: '#4CA771', 
  },
  subtitle: { 
    fontSize: 14, 
    color: '#4CA771',
    lineHeight: 20,
    textAlign: 'center',
  },
  form: { 
    width: '100%', 
    marginBottom: 16,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 30, 
    paddingHorizontal: 20,
    height: 56,
    marginBottom: 8,
  },
  inputErrorBorder: {
    borderWidth: 1.5,
    borderColor: '#E53E3E',
  },
  errorText: {
    color: '#E53E3E',
    fontSize: 12,
    marginLeft: 20,
    marginBottom: 8,
  },
  generalErrorContainer: {
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: '#013237',
    height: '100%',
    backgroundColor: 'transparent',
  },
  eyeIcon: {
    padding: 4,
  },
  primaryButton: {
    backgroundColor: '#013237',
    borderRadius: 30,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  buttonText: { 
    color: '#FFFFFF', 
    fontSize: 16, 
    fontWeight: '600',
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 18,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#C0E6BA',
  },
  dividerText: {
    color: '#4CA771',
    fontSize: 14,
    marginHorizontal: 12,
  },
  socialContainer: {
    gap: 12,
    marginBottom: 28,
  },
  socialButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 30,
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  socialIcon: {
    marginRight: 10,
  },
  socialButtonText: {
    color: '#013237',
    fontSize: 15,
    fontWeight: '500',
  },
  footer: { 
    flexDirection: 'row', 
    justifyContent: 'center', 
    alignItems: 'center',
  },
  footerText: { 
    color: '#013237', 
    fontSize: 14,
  },
  linkText: { 
    color: '#4CA771',
    fontWeight: '700', 
    fontSize: 14,
  },
  forgot: {
    color: '#4CA771',
    textAlign: 'right',
    marginBottom: 16,
    paddingVertical: 4,
    fontWeight: '500',
  },
});