import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
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

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

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
    <LinearGradient colors={['#EAF9E7', '#FFFFFF']} style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
          
          <TouchableOpacity onPress={() => router.push('/login')} style={styles.backButton}>
            <Feather name="arrow-left" size={24} color="#013237" />
          </TouchableOpacity>

          <View style={styles.iconContainer}>
            <View style={styles.iconBackground}>
              <Feather name="key" size={44} color="#013237" />
            </View>
          </View>

          <View style={styles.headerContainer}>
            <Text style={styles.title}>Forgot Password?</Text>
            <Text style={styles.subtitle}>
              No worries! Enter your email address below and we'll send you a link to reset your password.
            </Text>
          </View>

          <View style={styles.form}>
            <View style={[styles.inputWrapper, errorMessage ? styles.inputWrapperError : null]}>
              <Feather name="mail" color="#4CA771" size={20} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Email Address"
                placeholderTextColor="#7A8A85"
                value={email}
                onChangeText={(text) => {
                  setEmail(text);
                  if (errorMessage) setErrorMessage('');
                }}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!loading}
              />
            </View>

            {errorMessage ? (
              <Text style={styles.errorText}>{errorMessage}</Text>
            ) : null}

            {successMessage ? (
              <View style={styles.successContainer}>
                <Text style={styles.successText}>{successMessage}</Text>
                <TouchableOpacity onPress={() => router.back()} style={styles.backLinkButton}>
                  <Text style={styles.backLinkText}>Back to Sign In</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity 
                style={[styles.primaryButton, loading && { opacity: 0.8 }]} 
                onPress={handleResetPassword}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.buttonText}>Send Reset Link</Text>
                )}
              </TouchableOpacity>
            )}
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
  backButton: {
    marginBottom: 10,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  iconBackground: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  headerContainer: { 
    marginBottom: 28,
    alignItems: 'center',
  },
  title: { 
    fontSize: 28, 
    fontWeight: '700', 
    color: '#013237', 
    marginBottom: 8, 
    textAlign: 'center',
  },
  subtitle: { 
    fontSize: 14, 
    color: '#4CA771',
    textAlign: 'center',
    lineHeight: 20,
  },
  form: { 
    width: '100%', 
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 30, 
    paddingHorizontal: 20,
    height: 56,
  },
  inputWrapperError: {
    borderWidth: 1.5,
    borderColor: '#E53E3E',
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: '#013237',
    height: '100%',
  },
  errorText: {
    color: '#E53E3E',
    fontSize: 13,
    marginTop: 8,
    marginLeft: 20,
    marginBottom: 10,
  },
  successContainer: {
    marginTop: 15,
    padding: 18,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    alignItems: 'center',
  },
  successText: {
    color: '#013237',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 12,
    lineHeight: 20,
  },
  backLinkButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: '#013237',
    borderRadius: 20,
  },
  backLinkText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  primaryButton: {
    backgroundColor: '#013237',
    borderRadius: 30,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  buttonText: { 
    color: '#FFFFFF', 
    fontSize: 16, 
    fontWeight: '600',
  },
});