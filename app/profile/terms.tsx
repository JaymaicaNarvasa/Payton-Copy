// app/terms.tsx
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';

import GradientBackground from '../../components/GradientBackground';
import { theme } from '../../constants/theme';
import { profileStyles, termsStyles as styles } from '../../constants/ui.styles';

export default function TermsScreen() {
  const router = useRouter();

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
        <Text style={profileStyles.headerTitleCentered}>Terms of Use</Text>
        <View style={profileStyles.backBtnTouchable} />
      </View>
      
      <View style={styles.sheet}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <Text style={styles.lastUpdated}>Last updated: September 2026</Text>

          <Text style={styles.heading}>1. Acceptance of Terms</Text>
          <Text style={styles.paragraph}>
            By creating and using a Payton account, you agree to comply with the policies and guidelines governing the use of the system. Payton is designed to support responsible financial management, expense recording, shared financial obligations, and payment monitoring.
          </Text>

          <Text style={styles.heading}>2. Account Security & Privacy</Text>
          <Text style={styles.paragraph}>
            Users must provide accurate information and keep their account credentials confidential. Payton protects personal and financial information through controlled access, secure storage, monitoring, and other security measures. Users must immediately report suspected unauthorized access or suspicious activity.
          </Text>

          <Text style={styles.heading}>3. Financial Data & Payment Responsibility</Text>
          <Text style={styles.paragraph}>Users must record accurate, legitimate, and non-duplicate financial information.</Text>
          <Text style={[styles.paragraph, styles.paragraphEmphasis]}>
            Payton is a Financial Tracking and Monitoring System and does not directly process or transfer actual payments.
          </Text>
          <Text style={styles.paragraph}>
            Users are responsible for settling financial obligations through their preferred payment method and updating the payment status in the system.
          </Text>

          <Text style={styles.heading}>4. Group Expenses & Responsible Use</Text>
          <Text style={styles.paragraph}>
            Users must accurately identify members involved in shared expenses and assign the appropriate payment responsibilities or contributions. Users must use Payton only for authorized purposes and must not enter false, misleading, fraudulent, or duplicate information.
          </Text>

          <Text style={styles.heading}>5. Security Incidents & Data Protection</Text>
          <Text style={styles.paragraph}>
            Users must report unauthorized access, account compromise, fraudulent entries, tampering with shared expenses, or unauthorized disclosure of sensitive information. Payton may investigate incidents through system logs and audit records and may apply corrective security measures when necessary.
          </Text>

          <Text style={styles.heading}>6. Violations & Account Restrictions</Text>
          <Text style={styles.paragraph}>
            Failure to comply with Payton policies may result in warnings, temporary account restrictions, suspension of privileges, or permanent termination of access depending on the severity of the violation. Serious cases involving fraudulent activities or data breaches may be reported to the appropriate authorities.
          </Text>
          </View>
        </ScrollView>
      </View>
    </View>
  );
}