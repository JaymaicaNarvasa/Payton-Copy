import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { supabase } from '../../lib/supabase';

type Role = 'Personal' | 'Spender' | 'Sponsor';

export default function RoleSelectionScreen() {
  const router = useRouter();
  
  const [selectedRole, setSelectedRole] = useState<Role | null>('Personal');
  const [isLoading, setIsLoading] = useState(false);

  const buttonOpacity = useRef(new Animated.Value(1)).current;
  const scaleValue = useRef(new Animated.Value(1)).current;

  const personalRoles: { type: Role; description: string; icon: any }[] = [
    { type: 'Personal', description: 'Manage your own personal budgets and daily expenses.', icon: 'user' },
  ];

  const pairedRoles: { type: Role; description: string; icon: any }[] = [
    { type: 'Spender', description: 'Receive allowance from sponsor and log daily expenses.', icon: 'credit-card' },
    { type: 'Sponsor', description: 'Allocate spender allowances and monitor their expenses real-time.', icon: 'shield' },
  ];

  const handleSelect = (role: Role) => {
    setSelectedRole(role);

    Animated.timing(buttonOpacity, { toValue: 1, duration: 400, useNativeDriver: true }).start();

    Animated.sequence([
      Animated.timing(scaleValue, { toValue: 0.97, duration: 100, useNativeDriver: true }),
      Animated.timing(scaleValue, { toValue: 1, duration: 100, useNativeDriver: true }),
    ]).start();
  };

  const handleFinalize = async () => {
    if (!selectedRole) return;
    setIsLoading(true);

    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
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
      Alert.alert("Error", error.message || "Failed to update profile.");
    } finally {
      setIsLoading(false);
    }
  };

  const renderRoleCard = (role: { type: Role; description: string; icon: any }) => {
    const isSelected = selectedRole === role.type;
    return (
      <Animated.View key={role.type} style={{ transform: isSelected ? [{ scale: scaleValue }] : [] }}>
        <TouchableOpacity
          activeOpacity={0.8}
          style={[styles.roleCard, isSelected && styles.selectedCard]}
          onPress={() => handleSelect(role.type)}
        >
          <View style={[styles.iconBox, isSelected && styles.selectedIconBox]}>
            <Feather name={role.icon} size={22} color={isSelected ? '#013237' : '#4CA771'} />
          </View>
          <View style={styles.textContainer}>
            <Text style={[styles.roleName, isSelected && { color: '#013237' }]}>{role.type}</Text>
            <Text style={styles.roleDesc}>{role.description}</Text>
          </View>
          {isSelected && <Feather name="check-circle" size={20} color="#4CA771" style={{ marginLeft: 8 }} />}
        </TouchableOpacity>
      </Animated.View>
    );
  };

  return (
    <LinearGradient colors={['#EAF9E7', '#FFFFFF']} style={styles.container}>
      <View style={styles.innerContainer}>
        <View style={styles.header}>
          <TouchableOpacity 
            style={styles.backButton} 
            onPress={() => router.replace('/(auth)/login')}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Feather name="arrow-left" size={20} color="#013237" />
          </TouchableOpacity>
          <View style={styles.headerTextContainer}>
            <Text style={styles.title}>Account Setup</Text>
            <Text style={styles.subtitle}>How would you like to use Payton?</Text>
          </View>
        </View>

        <View style={styles.sectionsContainer}>
          <View style={styles.sectionGroup}>
            <Text style={styles.sectionLabel}>Individual</Text>
            <View style={styles.roleList}>
              {personalRoles.map(renderRoleCard)}
            </View>
          </View>

          <View style={styles.sectionGroup}>
            <Text style={styles.sectionLabel}>Paired System</Text>
            <View style={styles.roleList}>
              {pairedRoles.map(renderRoleCard)}
            </View>
          </View>
        </View>

        <View style={styles.footerContainer}>
          <Text style={styles.noteText}>
            Note: A Spender role must be linked to a Sponsor role.
          </Text>

          <Animated.View style={{ opacity: buttonOpacity }}>
            <TouchableOpacity
              style={[styles.primaryButton, { opacity: selectedRole ? 1 : 0.5 }]}
              disabled={!selectedRole || isLoading}
              onPress={handleFinalize}
            >
              {isLoading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.buttonText}>Continue Setup</Text>
              )}
            </TouchableOpacity>
          </Animated.View>
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  innerContainer: { flex: 1, padding: 24, justifyContent: 'center' },
  header: { 
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20, 
    position: 'relative',
  },
  backButton: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  headerTextContainer: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  title: { 
    fontSize: 26, 
    fontWeight: '700', 
    color: '#013237', 
    marginBottom: 4, 
    textAlign: 'center', 
  },
  subtitle: { 
    fontSize: 14, 
    color: '#4CA771', 
    lineHeight: 18, 
    textAlign: 'center', 
  },
  sectionsContainer: { gap: 16, marginBottom: 20 },
  sectionGroup: { gap: 6 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: '#4CA771', textTransform: 'uppercase', letterSpacing: 1, marginLeft: 4 },
  roleList: { gap: 10 },
  roleCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF',
    padding: 16, borderRadius: 20, borderWidth: 1.5, borderColor: 'transparent',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 6,
  },
  selectedCard: { 
    borderColor: '#4CA771', backgroundColor: '#FFFFFF',
    shadowColor: '#4CA771', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 10,
  },
  iconBox: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#EAF9E7', justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  selectedIconBox: { backgroundColor: '#C0E6BA' },
  textContainer: { flex: 1 },
  roleName: { fontSize: 16, fontWeight: '700', color: '#013237', marginBottom: 2 },
  roleDesc: { fontSize: 12, color: '#013237', lineHeight: 16, paddingRight: 8 },
  footerContainer: { gap: 12 },
  noteText: { 
    fontSize: 12, 
    color: '#4CA771', 
    textAlign: 'center', 
    fontStyle: 'italic',
  },
  primaryButton: { 
    backgroundColor: '#013237', height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center',
  },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
});