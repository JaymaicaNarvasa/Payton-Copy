// app/terms.tsx
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../(spenderTabs)/profile'; // Adjust ang import path depende kung asa gikan ang imong colors

export default function TermsScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      
      {/* Modern Curved Header */}
      <View style={styles.modernHeader}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtnTouchable}>
          <Ionicons name="arrow-back" size={20} color="#ffffff" />
        </TouchableOpacity>
        <Text style={styles.headerTitleCentered}>Terms of Use</Text>
        <View style={{ width: 20 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.cardContainer}>
          <Text style={styles.lastUpdated}>Last updated: September 2026</Text>
          
          <Text style={styles.heading}>1. Acceptance of Terms</Text>
          <Text style={styles.paragraph}>By creating and using a Payton account, you agree to comply with the policies and guidelines governing the use of the system. Payton is designed to support responsible financial management, expense recording, shared financial obligations, and payment monitoring.</Text>
          
          <Text style={styles.heading}>2. Account Security & Privacy</Text>
          <Text style={styles.paragraph}>Users must provide accurate information and keep their account credentials confidential. Payton protects personal and financial information through controlled access, secure storage, monitoring, and other security measures. Users must immediately report suspected unauthorized access or suspicious activity.</Text>
          
          <Text style={styles.heading}>3. Financial Data & Payment Responsibility</Text>
          <Text style={styles.paragraph}>Users must record accurate, legitimate, and non-duplicate financial information.

PAYTON IS A FINANCIAL TRACKING AND MONITORING SYSTEM AND DOES NOT DIRECTLY PROCESS OR TRANSFER ACTUAL PAYMENTS.

Users are responsible for settling financial obligations through their preferred payment method and updating the payment status in the system.</Text>
        
          <Text style={styles.heading}>4. Group Expenses & Responsible Use</Text>
          <Text style={styles.paragraph}>Users must accurately identify members involved in shared expenses and assign the appropriate payment responsibilities or contributions. Users must use Payton only for authorized purposes and must not enter false, misleading, fraudulent, or duplicate information.</Text>
        
          <Text style={styles.heading}>5. Security Incidents & Data Protection</Text>
          <Text style={styles.paragraph}>Users must report unauthorized access, account compromise, fraudulent entries, tampering with shared expenses, or unauthorized disclosure of sensitive information. Payton may investigate incidents through system logs and audit records and may apply corrective security measures when necessary.</Text>

          <Text style={styles.heading}>6. Violations & Account Restrictions</Text>
          <Text style={styles.paragraph}>Failure to comply with Payton policies may result in warnings, temporary account restrictions, suspension of privileges, or permanent termination of access depending on the severity of the violation. Serious cases involving fraudulent activities or data breaches may be reported to the appropriate authorities.</Text>

        </View>
      </ScrollView>
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
  scrollContent: { 
    paddingHorizontal: 24, 
    paddingTop: 24, 
    paddingBottom: 40 
  },
  cardContainer: {
    backgroundColor: '#FFFFFF',
    padding: 24,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 4,
  },
  lastUpdated: { 
    fontSize: 12, 
    color: '#94A3B8', 
    marginBottom: 20,
    fontWeight: '500'
  },
  heading: { 
    fontSize: 16, 
    fontWeight: '700', 
    color: '#1E293B', 
    marginTop: 16, 
    marginBottom: 6 
  },
  paragraph: { 
    fontSize: 14, 
    color: '#64748B', 
    lineHeight: 22, 
    marginBottom: 12 
  }
});