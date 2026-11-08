import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { supabase } from '../../lib/supabase';

type Role = 'Personal' | 'Spender' | 'Sponsor';

const COLORS = {
  ink: '#013237',
  brand: '#4CA771',
  brandSoft: '#EAF9E7',
  brandLine: '#C0E6BA',
  border: '#DCE8E1',
  muted: '#6B7F78',
  surface: '#FFFFFF',
  error: '#D64545',
  errorSoft: '#FDECEC',
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

export default function RoleSelectionScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [selectedRole, setSelectedRole] = useState<Role | null>('Personal');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const buttonOpacity = useRef(new Animated.Value(1)).current;
  const scaleValue = useRef(new Animated.Value(1)).current;

  // Entrance animation
  const fade = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(16)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 450, useNativeDriver: true }),
      Animated.timing(slide, { toValue: 0, duration: 450, useNativeDriver: true }),
    ]).start();
  }, [fade, slide]);

  const personalRoles: { type: Role; description: string; icon: any }[] = [
    { type: 'Personal', description: 'Manage your own personal budgets and daily expenses.', icon: 'user' },
  ];

  const pairedRoles: { type: Role; description: string; icon: any }[] = [
    { type: 'Spender', description: 'Receive allowance from sponsor and log daily expenses.', icon: 'credit-card' },
    { type: 'Sponsor', description: 'Allocate spender allowances and monitor their expenses real-time.', icon: 'shield' },
  ];

  const handleSelect = (role: Role) => {
    setSelectedRole(role);
    setErrorMessage('');

    Animated.timing(buttonOpacity, { toValue: 1, duration: 400, useNativeDriver: true }).start();

    Animated.sequence([
      Animated.timing(scaleValue, { toValue: 0.97, duration: 100, useNativeDriver: true }),
      Animated.timing(scaleValue, { toValue: 1, duration: 100, useNativeDriver: true }),
    ]).start();
  };

  const handleFinalize = async () => {
    if (!selectedRole) return;
    setErrorMessage('');
    setIsLoading(true);

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) {
        router.replace('/(auth)/login');
        return;
      }

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ role: selectedRole })
        .eq('id', user.id);

      if (updateError) throw updateError;

      const routeMap: Record<Role, any> = {
        Personal: '/(personalTabs)/home',
        Spender: '/(spenderTabs)/home',
        Sponsor: '/(sponsorTabs)/home',
      };
      router.replace(routeMap[selectedRole]);
    } catch (error: any) {
      setErrorMessage(error.message || 'Failed to update profile.');
    } finally {
      setIsLoading(false);
    }
  };

  const renderRoleCard = (role: { type: Role; description: string; icon: any }) => {
    const isSelected = selectedRole === role.type;
    return (
      <Animated.View key={role.type} style={{ transform: isSelected ? [{ scale: scaleValue }] : [] }}>
        <TouchableOpacity
          activeOpacity={0.85}
          style={[styles.roleCard, isSelected && styles.selectedCard]}
          onPress={() => handleSelect(role.type)}
          disabled={isLoading}
          accessibilityRole="radio"
          accessibilityState={{ selected: isSelected }}
          accessibilityLabel={`${role.type}. ${role.description}`}
        >
          <View style={[styles.iconBox, isSelected && styles.selectedIconBox]}>
            <Feather name={role.icon} size={22} color={isSelected ? '#FFFFFF' : COLORS.brand} />
          </View>
          <View style={styles.textContainer}>
            <Text style={styles.roleName}>{role.type}</Text>
            <Text style={styles.roleDesc}>{role.description}</Text>
          </View>
          <View style={[styles.radio, isSelected && styles.radioSelected]}>
            {isSelected ? <Feather name="check" size={14} color="#FFFFFF" /> : null}
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  return (
    <LinearGradient colors={[COLORS.brandSoft, '#F6FCF5', '#FFFFFF']} style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <Animated.View
        style={[
          styles.innerContainer,
          {
            paddingTop: insets.top + 16,
            paddingBottom: insets.bottom + 20,
            opacity: fade,
            transform: [{ translateY: slide }],
          },
        ]}
      >
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.replace('/(auth)/login')}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Back to sign in"
          >
            <Feather name="arrow-left" size={20} color={COLORS.ink} />
          </TouchableOpacity>

          <View style={styles.headerTextContainer}>
            <Text style={styles.stepLabel}>Account setup</Text>
            <Text style={styles.title}>How will you use Payton?</Text>
            <Text style={styles.subtitle}>Pick the role that fits you. You can pair accounts later.</Text>
          </View>
        </View>

        <View style={styles.sectionsContainer}>
          <View style={styles.sectionGroup}>
            <Text style={styles.sectionLabel}>Individual</Text>
            <View style={styles.roleList}>{personalRoles.map(renderRoleCard)}</View>
          </View>

          <View style={styles.sectionGroup}>
            <Text style={styles.sectionLabel}>Paired system</Text>
            <View style={styles.roleList}>{pairedRoles.map(renderRoleCard)}</View>
          </View>
        </View>

        <View style={styles.footerContainer}>
          {errorMessage ? (
            <View style={styles.banner} accessibilityRole="alert">
              <Feather name="alert-circle" size={18} color={COLORS.error} />
              <Text style={styles.bannerText}>{errorMessage}</Text>
            </View>
          ) : (
            <View style={styles.note}>
              <Feather name="info" size={14} color={COLORS.brand} />
              <Text style={styles.noteText}>A Spender role must be linked to a Sponsor role.</Text>
            </View>
          )}

          <Animated.View style={{ opacity: buttonOpacity }}>
            <TouchableOpacity
              style={[styles.primaryButton, (!selectedRole || isLoading) && styles.buttonDisabled]}
              disabled={!selectedRole || isLoading}
              onPress={handleFinalize}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Continue setup"
            >
              {isLoading ? <SkeletonBar width={120} /> : <Text style={styles.buttonText}>Continue Setup</Text>}
            </TouchableOpacity>
          </Animated.View>
        </View>
      </Animated.View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  innerContainer: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
  },

  // Header
  header: {
    marginBottom: 26,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 20,
  },
  headerTextContainer: {
    alignItems: 'flex-start',
  },
  stepLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.brand,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.ink,
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 15,
    color: COLORS.muted,
    lineHeight: 22,
  },

  // Sections
  sectionsContainer: { gap: 20, marginBottom: 20 },
  sectionGroup: { gap: 10 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.muted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginLeft: 4,
  },
  roleList: { gap: 12 },

  // Cards
  roleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    padding: 16,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: COLORS.border,
  },
  selectedCard: {
    borderColor: COLORS.brand,
    backgroundColor: '#FBFFFA',
    shadowColor: COLORS.brand,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 14,
    elevation: 4,
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: COLORS.brandSoft,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  selectedIconBox: { backgroundColor: COLORS.brand },
  textContainer: { flex: 1 },
  roleName: { fontSize: 16, fontWeight: '700', color: COLORS.ink, marginBottom: 3 },
  roleDesc: { fontSize: 13, color: COLORS.muted, lineHeight: 18, paddingRight: 8 },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    backgroundColor: COLORS.brand,
    borderColor: COLORS.brand,
  },

  // Footer
  footerContainer: { gap: 14 },
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  noteText: {
    fontSize: 13,
    color: COLORS.muted,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.errorSoft,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
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
  primaryButton: {
    backgroundColor: COLORS.ink,
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: COLORS.ink,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 14,
    elevation: 6,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
