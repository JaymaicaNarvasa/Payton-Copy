// app/about.tsx
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Image, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../(spenderTabs)/profile'; // Adjust ang import path depende kung asa gikan ang imong colors

export default function AboutScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      
      {/* Modern Curved Header */}
      <View style={styles.modernHeader}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtnTouchable}>
          <Ionicons name="arrow-back" size={20} color="#ffffff" />
        </TouchableOpacity>
        <Text style={styles.headerTitleCentered}>App Version</Text>
        <View style={{ width: 20 }} />
      </View>

      <View style={styles.content}>
        <View style={styles.logoBox}>
          <Image 
            source={require('../../assets/images/logo-light1.png')} 
            style={styles.logoImage} 
            resizeMode="contain"
          />
        </View>

        <Text style={styles.appName}>Payton Mobile Edition</Text>
        <Text style={styles.versionNumber}>v1.0.0 (BETA)</Text>
        
        <View style={styles.infoGroup}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Database</Text>
            <Text style={styles.infoValue}>Supabase v2.75</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Framework</Text>
            <Text style={styles.infoValue}>React Native v0.87</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>App Simulation</Text>
            <Text style={styles.infoValue}>Expo v57.0.9</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>AI Model</Text>
            <Text style={styles.infoValue}>Gemini 3.5 Flash Lite</Text>
          </View>
          <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
            <Text style={styles.infoLabel}>System Status</Text>
            <Text style={styles.statusValue}>Operational</Text>
          </View>
        </View>

        <Text style={styles.copyright}>© 2026 Payton. All rights reserved.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#f5fcfa',
  },
  modernHeader: { 
    flexDirection: 'row', 
    justifyContent: 'center', 
    alignItems: 'center', 
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'android' ? 44 : 20,
    paddingBottom: 20,
    backgroundColor: colors.headerDark,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },
  backBtnTouchable: { width: 20 },
  headerTitleCentered: { 
    flex: 1, 
    textAlign: 'center', 
    fontSize: 20, 
    fontWeight: '800', 
    color: '#ffffff', 
    letterSpacing: -0.5 
  },
  content: { 
    flex: 1, 
    alignItems: 'center', 
    paddingTop: 32, 
    paddingHorizontal: 24 
  },
  logoBox: { 
    width: 80, 
    height: 80, 
    borderRadius: 24, 
    backgroundColor: '#173D45', 
    justifyContent: 'center', 
    alignItems: 'center', 
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
    overflow: 'hidden',
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  appName: { 
    fontSize: 18, 
    fontWeight: '700', 
    color: '#1E293B', 
    marginBottom: 4 
  },
  versionNumber: { 
    fontSize: 13, 
    color: '#94A3B8', 
    fontWeight: '500', 
    marginBottom: 24 
  },
  infoGroup: { 
    width: '100%', 
    backgroundColor: '#FFFFFF', 
    borderRadius: 24, 
    borderWidth: 1, 
    borderColor: '#E2E8F0', 
    paddingVertical: 8, 
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 4,
  },
  infoRow: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    paddingVertical: 12, 
    borderBottomWidth: 1, 
    borderBottomColor: '#F1F5F9' 
  },
  infoLabel: { 
    fontSize: 14, 
    color: '#64748B', 
    fontWeight: '500' 
  },
  infoValue: { 
    fontSize: 14, 
    color: '#1E293B', 
    fontWeight: '600' 
  },
  statusValue: { 
    fontSize: 14, 
    color: '#10B981', 
    fontWeight: '700' 
  },
  copyright: { 
    position: 'absolute', 
    bottom: 36, 
    fontSize: 12, 
    color: '#94A3B8',
    fontWeight: '500' 
  }
});