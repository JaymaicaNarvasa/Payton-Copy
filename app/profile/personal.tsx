// app/profile/personal.tsx
// Skeleton while loading, validation under the input, photo / save results shown inline.
// All Supabase (profile fetch/update, avatar upload, logs) logic is unchanged.
import { Ionicons } from '@expo/vector-icons';
import { decode } from 'base64-arraybuffer';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { FormField } from '../../components/profile/FormField';
import InlineMessage, { FormMessage } from '../../components/profile/InlineMessage';
import PrimaryButton from '../../components/profile/PrimaryButton';
import ProfileScreen from '../../components/profile/ProfileScreen';
import { Skeleton, SkeletonButton, SkeletonField, SkeletonGroup } from '../../components/profile/Skeleton';
import { theme } from '../../constants/theme';
import { profileStyles } from '../../constants/ui.styles';
import { supabase } from '../../lib/supabase';

export default function PersonalDetailsScreen() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const [nameError, setNameError] = useState<string | null>(null);
  const [formMessage, setFormMessage] = useState<FormMessage>(null);
  const [photoMessage, setPhotoMessage] = useState<FormMessage>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

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
      setLoadError(null);
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw userError || new Error('No active user session found.');

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
      setLoadError(error.message || 'Unable to retrieve your profile information.');
    } finally {
      setIsLoading(false);
    }
  };

  const pickAndUploadImage = async () => {
    setPhotoMessage(null);
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        setPhotoMessage({ type: 'info', message: 'Gallery access is required to update your profile photo.' });
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.6,
        base64: true, // Crucial: ensures base64 data is returned after cropping
      });

      if (result.canceled || !result.assets || result.assets.length === 0) return;

      const asset = result.assets[0];

      // Verify base64 exists after cropping
      if (!asset.base64) {
        setPhotoMessage({ type: 'error', message: 'Cropped image data was not returned. Please try another photo.' });
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

      // Append a timestamp to the public URL to bust local image caching in React Native
      const cachedBustedUrl = `${publicUrl}?t=${new Date().getTime()}`;

      const { error: dbError } = await supabase
        .from('profiles')
        .update({ avatar_url: cachedBustedUrl })
        .eq('id', user.id);

      if (dbError) throw dbError;

      setAvatarUrl(cachedBustedUrl);

      await logActivity(user.id, `updated profile picture.`);
      setPhotoMessage({ type: 'success', message: 'Profile photo updated successfully.' });
    } catch (error: any) {
      setPhotoMessage({ type: 'error', message: error.message || 'Photo upload failed. Please try again.' });
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleUpdateProfile = async () => {
    setFormMessage(null);

    if (!fullName.trim()) {
      setNameError('Full name cannot be empty.');
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

      setFormMessage({ type: 'success', message: 'Your profile details have been saved.' });
      setTimeout(() => router.back(), 1000); // Slight delay so user sees the success message
    } catch (error: any) {
      setFormMessage({ type: 'error', message: error.message || 'Failed to update profile. Please try again.' });
    } finally {
      setIsUpdating(false);
    }
  };

  /* ---------- Loading: skeleton (header stays) ---------- */
  if (isLoading) {
    return (
      <ProfileScreen title="Personal Details" onBack={() => router.back()} footer={<SkeletonButton />}>
        <SkeletonGroup>
          <View style={profileStyles.modernHeroBlock}>
            <Skeleton width={96} height={96} radius={48} />
          </View>
          <View style={profileStyles.modernCardGroup}>
            <SkeletonField labelWidth={80} />
            <SkeletonField labelWidth={60} />
          </View>
        </SkeletonGroup>
      </ProfileScreen>
    );
  }

  return (
    <ProfileScreen
      title="Personal Details"
      onBack={() => router.back()}
      keyboardAware
      footer={<PrimaryButton label="SAVE" onPress={handleUpdateProfile} loading={isUpdating} />}
    >
      {loadError ? (
        <View style={profileStyles.modernCardGroup}>
          <InlineMessage type="error" message={loadError} actionLabel="Retry" onAction={fetchProfileData} />
        </View>
      ) : null}

      {/* Avatar + camera badge */}
      <View style={profileStyles.modernHeroBlock}>
        <View>
          <TouchableOpacity
            onPress={pickAndUploadImage}
            disabled={isUploadingImage}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Change profile photo"
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
            accessibilityRole="button"
            accessibilityLabel="Choose a new photo"
            style={styles.cameraBadge}
          >
            <Ionicons name="camera-outline" size={18} color={theme.colors.brandDark} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={profileStyles.modernCardGroup}>
        {photoMessage ? (
          <InlineMessage type={photoMessage.type} message={photoMessage.message} onDismiss={() => setPhotoMessage(null)} />
        ) : null}

        <FormField
          label="Full Name"
          icon="person-outline"
          placeholder="Enter full name"
          value={fullName}
          onChangeText={(t) => {
            setFullName(t);
            if (nameError) setNameError(null);
            if (formMessage) setFormMessage(null);
          }}
          error={nameError}
          autoCapitalize="words"
          autoComplete="name"
          textContentType="name"
          returnKeyType="done"
          onSubmitEditing={handleUpdateProfile}
          editable={!isUpdating}
        />

        <FormField
          label="E-Mail"
          icon="mail-outline"
          value={email}
          editable={false}
          hint="Contact an administrator to change your email."
        />

        {formMessage ? <InlineMessage type={formMessage.type} message={formMessage.message} /> : null}
      </View>
    </ProfileScreen>
  );
}

const styles = StyleSheet.create({
  cameraBadge: {
    position: 'absolute',
    bottom: 0,
    right: -4,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.white,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
});
