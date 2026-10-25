import { Feather } from '@expo/vector-icons';
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
    <View style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
          
          <TouchableOpacity onPress={() => router.push('/login')} style={styles.backButton}>
            <Feather name="arrow-left" size={24} color="#085334" />
          </TouchableOpacity>

          {/* Large Icon / Graphic Header */}
          <View style={styles.iconContainer}>
            <View style={styles.iconBackground}>
              <Feather name="key" size={48} color="#085334" />
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
              <Feather name="mail" color="#085334" size={20} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Email Address"
                placeholderTextColor="#A0AEC0"
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1,
    backgroundColor: '#FFFFFF',
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
    backgroundColor: '#e6f5ef',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerContainer: { 
    marginBottom: 30,
    alignItems: 'center',
  },
  title: { 
    fontSize: 28, 
    fontWeight: 'bold', 
    color: '#000000', 
    marginBottom: 10, 
    textAlign: 'center',
  },
  subtitle: { 
    fontSize: 14, 
    color: '#0e9b59',
    textAlign: 'center',
    lineHeight: 20,
  },
  form: { 
    width: '100%', 
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e6f5ef',
    borderRadius: 30, 
    paddingHorizontal: 20,
    height: 58,
    borderWidth: 1,
    borderColor: 'transparent',
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
    color: '#1A202C',
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
    padding: 16,
    backgroundColor: '#e6f5ef',
    borderRadius: 16,
    alignItems: 'center',
  },
  successText: {
    color: '#085334',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 12,
    lineHeight: 20,
  },
  backLinkButton: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    backgroundColor: '#204d3a',
    borderRadius: 20,
  },
  backLinkText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  primaryButton: {
    backgroundColor: '#204d3a',
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