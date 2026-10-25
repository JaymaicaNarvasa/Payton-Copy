import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
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

export default function ResetPasswordScreen() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [passwordError, setPasswordError] = useState('');
  const [confirmError, setConfirmError] = useState('');
  const [generalError, setGeneralError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

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

  return (
    <LinearGradient colors={['#EAF9E7', '#FFFFFF']} style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
          
          <TouchableOpacity 
            style={styles.backButton} 
            onPress={() => router.replace('/login')}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Feather name="arrow-left" size={24} color="#013237" />
          </TouchableOpacity>

          <View style={styles.iconContainer}>
            <View style={styles.iconBackground}>
              <Feather name="lock" size={44} color="#013237" />
            </View>
          </View>

          <View style={styles.headerContainer}>
            <Text style={styles.title}>Reset Password</Text>
            <Text style={styles.subtitle}>Enter your new password below to regain access to your account.</Text>
          </View>

          <View style={styles.form}>
            {generalError ? (
              <Text style={styles.generalErrorText}>{generalError}</Text>
            ) : null}

            {successMessage ? (
              <View style={styles.successContainer}>
                <Text style={styles.successText}>{successMessage}</Text>
                <TouchableOpacity onPress={() => router.replace('/login')} style={styles.backLinkButton}>
                  <Text style={styles.backLinkText}>Sign In with New Password</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <View style={[styles.inputWrapper, passwordError ? styles.inputWrapperError : null]}>
                  <Feather name="lock" color="#4CA771" size={20} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="New Password"
                    placeholderTextColor="#7A8A85"
                    value={password}
                    onChangeText={(text) => {
                      setPassword(text);
                      if (passwordError) setPasswordError('');
                    }}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    editable={!loading}
                  />
                  <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeIcon}>
                    <Feather name={showPassword ? 'eye-off' : 'eye'} color="#4CA771" size={20} />
                  </TouchableOpacity>
                </View>
                {passwordError ? <Text style={styles.errorText}>{passwordError}</Text> : null}

                <View style={[styles.inputWrapper, confirmError ? styles.inputWrapperError : null]}>
                  <Feather name="lock" color="#4CA771" size={20} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Confirm New Password"
                    placeholderTextColor="#7A8A85"
                    value={confirmPassword}
                    onChangeText={(text) => {
                      setConfirmPassword(text);
                      if (confirmError) setConfirmError('');
                    }}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    editable={!loading}
                  />
                  <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeIcon}>
                    <Feather name={showPassword ? 'eye-off' : 'eye'} color="#4CA771" size={20} />
                  </TouchableOpacity>
                </View>
                {confirmError ? <Text style={styles.errorText}>{confirmError}</Text> : null}

                <TouchableOpacity 
                  style={[styles.primaryButton, loading && { opacity: 0.8 }]} 
                  onPress={handleUpdatePassword}
                  disabled={loading}
                >
                  {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>Update Password</Text>}
                </TouchableOpacity>
              </>
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
    alignSelf: 'flex-start',
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
    marginTop: 10,
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
  eyeIcon: { 
    padding: 4, 
  },
  errorText: {
    color: '#E53E3E',
    fontSize: 12,
    marginTop: 4,
    marginLeft: 20,
  },
  generalErrorText: {
    color: '#E53E3E',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 15,
  },
  successContainer: {
    marginTop: 15,
    padding: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    alignItems: 'center',
  },
  successText: {
    color: '#013237',
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 22,
    fontWeight: '500',
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
    marginTop: 24,
  },
  buttonText: { 
    color: '#FFFFFF', 
    fontSize: 16, 
    fontWeight: '600', 
  },
});