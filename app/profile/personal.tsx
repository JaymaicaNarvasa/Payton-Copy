// app/profile/personal.tsx
import { Ionicons } from '@expo/vector-icons';
import { decode } from 'base64-arraybuffer';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';

import { theme } from '@/constants/theme';
import { personalDetailsStyles as styles } from '@/constants/ui.styles';
import React from 'react';
import { GradientBackground } from '../../components/GradientBackground';
import { supabase } from '../../lib/supabase';

// Type for modern feedback messages
type ToastType = 'success' | 'error' | 'info';

interface ToastMessage {
  type: ToastType;
  message: string;
}

export default function PersonalDetailsScreen() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  // Modern toast state instead of jarring native alerts
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const showToast = (type: ToastType, message: string) => {
    setToast({ type, message });
    setTimeout(() => {
      setToast(null);
    }, 4000); // Auto-dismiss after 4 seconds
  };

  // Helper function to log user actions to the Supabase logs table
  const logActivity = async (userId: string, details: string) => {
    try {
      await supabase.from('logs').insert([
        {
          user_id: userId,
          details,
        },
      ]);
    } catch (err) {
      console.error('Failed to log activity:', err);
    }
  };

  useEffect(() => {
    fetchProfileData();
  }, []);

  const fetchProfileData = async () => {
    try {
      setIsLoading(true);
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw userError || new Error("No active user session found.");

      setEmail(user.email || '');

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('full_name, avatar_url')
        .eq('id', user.id)
        .single();

      if (profileError) throw profileError;

      if (profile) {
        setFullName(profile.full_name || '');
        setAvatarUrl(profile.avatar_url || null);
      }
    } catch (error: any) {
      showToast('error', error.message || 'Unable to retrieve your profile information.');
    } finally {
      setIsLoading(false);
    }
  };

  const pickAndUploadImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        showToast('info', 'Gallery access is required to update your profile photo.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.6,
        base64: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) return;

      const asset = result.assets[0];
      if (!asset.base64) {
        showToast('error', 'Failed to process image data. Please try another photo.');
        return;
      }

      setIsUploadingImage(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const filePath = `${user.id}/avatar.jpg`;
      
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, decode(asset.base64), {
          contentType: 'image/jpeg',
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      const { error: dbError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', user.id);

      if (dbError) throw dbError;

      setAvatarUrl(publicUrl);
      
      // Log avatar update activity
      await logActivity(user.id, `updated profile picture.`);

      showToast('success', 'Profile photo updated successfully.');

    } catch (error: any) {
      showToast('error', error.message || 'Photo upload failed. Please try again.');
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleUpdateProfile = async () => {
    if (!fullName.trim()) {
      showToast('error', 'Full Name cannot be empty.');
      return;
    }

    try {
      setIsUpdating(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('profiles')
        .update({ full_name: fullName })
        .eq('id', user.id);

      if (error) throw error;

      // Log profile details update activity
      await logActivity(user.id, `updated personal details (Full Name: ${fullName}).`);

      showToast('success', 'Your profile details have been saved.');
      setTimeout(() => router.back(), 1000); // Slight delay so user sees success toast
    } catch (error: any) {
      showToast('error', error.message || 'Failed to update profile. Please try again.');
    } finally {
      setIsUpdating(false);
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centerLoading]}>
        <StatusBar style="light" />
        <ActivityIndicator size="small" color={theme.colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.modernHeader}>
        <View style={styles.headerGradientFill}>
          <GradientBackground />
        </View>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtnTouchable}>
          <Ionicons name="arrow-back" size={20} color={theme.colors.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitleCentered}>Personal Details</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.sheet}>

      {/* Modern Inline Toast Notification */}
      {toast && (
        <View style={[
          styles.toastContainer, 
          toast.type === 'success' && styles.toastSuccess,
          toast.type === 'error' && styles.toastError,
          toast.type === 'info' && styles.toastInfo,
        ]}>
          <Ionicons 
            name={toast.type === 'success' ? 'checkmark-circle' : toast.type === 'error' ? 'alert-circle' : 'information-circle'} 
            size={18} 
            color={theme.colors.white} 
          />
          <Text style={styles.toastText}>{toast.message}</Text>
        </View>
      )}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.editScrollContent}>
        <View style={styles.avatarEditContainer}>
          <TouchableOpacity onPress={pickAndUploadImage} style={styles.avatarRing} disabled={isUploadingImage}>
            {isUploadingImage ? (
              <ActivityIndicator color={theme.colors.accent} />
            ) : avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.editAvatarImage} />
            ) : (
              <View style={styles.avatarPlaceholderFallback}>
                <Text style={styles.avatarInitials}>{fullName ? fullName.charAt(0).toUpperCase() : 'U'}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={pickAndUploadImage} style={styles.cameraBadge} disabled={isUploadingImage}>
            <Ionicons name="camera-outline" size={18} color={theme.colors.brandDark} />
          </TouchableOpacity>
        </View>

        <View style={styles.formCardContainer}>
          <View style={styles.pillInputBlock}>
            <Text style={styles.pillInputLabel}>Full Name</Text>
            <TextInput 
              style={styles.pillTextInput} 
              value={fullName} 
              onChangeText={setFullName} 
              placeholder="Enter full name"
              placeholderTextColor={theme.colors.textSubtle}
              autoCapitalize="words"
            />
          </View>

          <View style={styles.pillInputBlock}>
            <Text style={styles.pillInputLabel}>E-Mail</Text>
            <TextInput 
              style={[styles.pillTextInput, styles.pillTextInputDisabled]} 
              value={email} 
              editable={false} 
            />
          </View>
        </View>
      </ScrollView>

      <View style={styles.bottomBtnContainer}>
        <TouchableOpacity 
          style={[styles.pillPrimaryActionBtn, isUpdating && styles.disabledButton]} 
          onPress={handleUpdateProfile} 
          disabled={isUpdating}
        >
          {isUpdating ? <ActivityIndicator color={theme.colors.white} /> : <Text style={styles.pillPrimaryActionBtnText}>SAVE</Text>}
        </TouchableOpacity>
      </View>
      </View>
    </View>
  );
}