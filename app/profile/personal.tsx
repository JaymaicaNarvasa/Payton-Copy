// app/profile/personal.tsx
// Built ONLY from existing exports of constants/ui.styles.ts:
//   profileStyles (gradient header + mint sheet + avatar), resetPasswordStyles (pill inputs + primary button),
//   incomeStyles (camera badge circle, disabled state). Messages are shown with the shared PaytonAlertDialog.
// All Supabase (profile fetch/update, avatar upload, logs) logic below is unchanged.
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

import GradientBackground from '../../components/GradientBackground';
import { AlertType, PaytonAlertDialog } from '../../components/PaytonAlert';
import { theme } from '../../constants/theme';
import { incomeStyles, profileStyles, resetPasswordStyles } from '../../constants/ui.styles';
import { supabase } from '../../lib/supabase';

export default function PersonalDetailsScreen() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  // Shared alert dialog (local-state API) - replaces the old toast
  const [alert, setAlert] = useState<{ visible: boolean; type: AlertType; title: string; message: string }>({
    visible: false,
    type: 'info',
    title: '',
    message: '',
  });
  const showAlert = (type: AlertType, title: string, message: string) =>
    setAlert({ visible: true, type, title, message });
  const hideAlert = () => setAlert((prev) => ({ ...prev, visible: false }));

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
      showAlert('error', 'Could Not Load Profile', error.message || 'Unable to retrieve your profile information.');
    } finally {
      setIsLoading(false);
    }
  };

  const pickAndUploadImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        showAlert('info', 'Permission Needed', 'Gallery access is required to update your profile photo.');
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
        showAlert('error', 'Photo Error', 'Failed to process image data. Please try another photo.');
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

      showAlert('success', 'Photo Updated', 'Profile photo updated successfully.');

    } catch (error: any) {
      showAlert('error', 'Upload Failed', error.message || 'Photo upload failed. Please try again.');
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleUpdateProfile = async () => {
    if (!fullName.trim()) {
      showAlert('warning', 'Name Required', 'Full Name cannot be empty.');
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

      showAlert('success', 'Profile Saved', 'Your profile details have been saved.');
      setTimeout(() => router.back(), 1000); // Slight delay so user sees the success message
    } catch (error: any) {
      showAlert('error', 'Update Failed', error.message || 'Failed to update profile. Please try again.');
    } finally {
      setIsUpdating(false);
    }
  };

  if (isLoading) {
    return (
      <View style={[profileStyles.container, profileStyles.centerLoading]}>
        <StatusBar style="light" />
        <ActivityIndicator size="small" color={theme.colors.accent} />
        <PaytonAlertDialog
          visible={alert.visible}
          type={alert.type}
          title={alert.title}
          message={alert.message}
          onDismiss={hideAlert}
        />
      </View>
    );
  }

  return (
    <View style={profileStyles.container}>
      <StatusBar style="light" />

      {/* Gradient header (same as Profile) */}
      <View style={profileStyles.modernHeader}>
        <View style={profileStyles.headerGradientFill} pointerEvents="none">
          <GradientBackground />
        </View>
        <TouchableOpacity onPress={() => router.back()} style={profileStyles.backBtnTouchable} hitSlop={12}>
          <Ionicons name="chevron-back" size={22} color={theme.colors.white} />
        </TouchableOpacity>
        <Text style={profileStyles.headerTitleCentered}>Personal Details</Text>
        <View style={profileStyles.backBtnTouchable} />
      </View>

      {/* Mint sheet over the gradient */}
      <View style={profileStyles.sheet}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[profileStyles.scrollContent, { paddingBottom: theme.space[24] }]}
        >
          {/* Avatar + camera badge */}
          <View style={profileStyles.modernHeroBlock}>
            <View>
              <TouchableOpacity
                onPress={pickAndUploadImage}
                disabled={isUploadingImage}
                activeOpacity={0.85}
                style={[
                  profileStyles.heroAvatarPlaceholder,
                  { borderRadius: theme.radius.pill, overflow: 'hidden', borderWidth: 3, borderColor: theme.colors.white },
                ]}
              >
                {isUploadingImage ? (
                  <ActivityIndicator color={theme.colors.accent} />
                ) : avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} style={{ width: '100%', height: '100%' }} />
                ) : (
                  <Text style={profileStyles.avatarInitials}>{fullName ? fullName.charAt(0).toUpperCase() : 'U'}</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={pickAndUploadImage}
                disabled={isUploadingImage}
                style={[
                  incomeStyles.modalCloseBtn,
                  { position: 'absolute', bottom: 0, right: -4, backgroundColor: theme.colors.white, borderWidth: 1, borderColor: theme.colors.border },
                ]}
              >
                <Ionicons name="camera-outline" size={18} color={theme.colors.brandDark} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={profileStyles.modernCardGroup}>
            {/* Full Name */}
            <View style={{ marginBottom: theme.space[20] }}>
              <Text style={[profileStyles.groupContextLabel, { textTransform: 'none' }]}>Full Name</Text>
              <View style={[resetPasswordStyles.inputWrapper, { backgroundColor: theme.colors.white, borderColor: theme.colors.borderStrong }]}>
                <TextInput
                  style={resetPasswordStyles.input}
                  value={fullName}
                  onChangeText={setFullName}
                  placeholder="Enter full name"
                  placeholderTextColor={theme.colors.textSubtle}
                  autoCapitalize="words"
                />
              </View>
            </View>

            {/* E-Mail (read only) */}
            <View>
              <Text style={[profileStyles.groupContextLabel, { textTransform: 'none' }]}>E-Mail</Text>
              <View style={[resetPasswordStyles.inputWrapper, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border }]}>
                <TextInput
                  style={[resetPasswordStyles.input, { color: theme.colors.textMuted }]}
                  value={email}
                  editable={false}
                />
              </View>
            </View>
          </View>
        </ScrollView>

        {/* Bottom Save button */}
        <View style={{ paddingHorizontal: theme.space[20], paddingBottom: theme.space[24] }}>
          <TouchableOpacity
            style={[resetPasswordStyles.primaryButton, isUpdating && incomeStyles.buttonDisabled]}
            onPress={handleUpdateProfile}
            disabled={isUpdating}
          >
            {isUpdating ? (
              <ActivityIndicator color={theme.colors.white} />
            ) : (
              <Text style={resetPasswordStyles.buttonText}>SAVE</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Shared Payton alert (validation, errors, success) */}
      <PaytonAlertDialog
        visible={alert.visible}
        type={alert.type}
        title={alert.title}
        message={alert.message}
        onDismiss={hideAlert}
      />
    </View>
  );
}