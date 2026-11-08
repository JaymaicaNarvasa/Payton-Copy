// app/profile/terms.tsx
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';

import ProfileScreen from '../../components/profile/ProfileScreen';
import { theme } from '../../constants/theme';
import { incomeStyles, profileStyles } from '../../constants/ui.styles';

type Block = { kind: 'p'; text: string } | { kind: 'note'; text: string };
type Section = { title: string; blocks: Block[] };

const SECTIONS: Section[] = [
  {
    title: 'Acceptance of Terms',
    blocks: [
      {
        kind: 'p',
        text: 'By creating and using a Payton account, you agree to comply with the policies and guidelines governing the use of the system. Payton is designed to support responsible financial management, expense recording, shared financial obligations, and payment monitoring.',
      },
    ],
  },
  {
    title: 'Account Security & Privacy',
    blocks: [
      {
        kind: 'p',
        text: 'Users must provide accurate information and keep their account credentials confidential. Payton protects personal and financial information through controlled access, secure storage, monitoring, and other security measures. Users must immediately report suspected unauthorized access or suspicious activity.',
      },
    ],
  },
  {
    title: 'Financial Data & Payment Responsibility',
    blocks: [
      { kind: 'p', text: 'Users must record accurate, legitimate, and non-duplicate financial information.' },
      {
        kind: 'note',
        text: 'Payton is a Financial Tracking and Monitoring System and does not directly process or transfer actual payments.',
      },
      {
        kind: 'p',
        text: 'Users are responsible for settling financial obligations through their preferred payment method and updating the payment status in the system.',
      },
    ],
  },
  {
    title: 'Group Expenses & Responsible Use',
    blocks: [
      {
        kind: 'p',
        text: 'Users must accurately identify members involved in shared expenses and assign the appropriate payment responsibilities or contributions. Users must use Payton only for authorized purposes and must not enter false, misleading, fraudulent, or duplicate information.',
      },
    ],
  },
  {
    title: 'Security Incidents & Data Protection',
    blocks: [
      {
        kind: 'p',
        text: 'Users must report unauthorized access, account compromise, fraudulent entries, tampering with shared expenses, or unauthorized disclosure of sensitive information. Payton may investigate incidents through system logs and audit records and may apply corrective security measures when necessary.',
      },
    ],
  },
  {
    title: 'Violations & Account Restrictions',
    blocks: [
      {
        kind: 'p',
        text: 'Failure to comply with Payton policies may result in warnings, temporary account restrictions, suspension of privileges, or permanent termination of access depending on the severity of the violation. Serious cases involving fraudulent activities or data breaches may be reported to the appropriate authorities.',
      },
    ],
  },
];

export default function TermsScreen() {
  const router = useRouter();

  return (
    <ProfileScreen title="Terms of Use" onBack={() => router.back()}>
      <View style={profileStyles.modernCardGroup}>
        {/* Last updated pill */}
        <View style={[incomeStyles.countBadge, { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', marginBottom: theme.space[16] }]}>
          <Ionicons name="calendar-outline" size={12} color={theme.colors.brand} style={{ marginRight: 6 }} />
          <Text style={incomeStyles.countBadgeText}>Last updated: September 2026</Text>
        </View>

        {SECTIONS.map((section, index) => (
          <View key={section.title} style={incomeStyles.incomeCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: theme.space[12] }}>
              <View
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: theme.colors.brandWash,
                  marginRight: theme.space[10],
                }}
              >
                <Text style={[incomeStyles.countBadgeText, { color: theme.colors.brand }]}>{index + 1}</Text>
              </View>
              <Text style={[incomeStyles.sourceText, { flex: 1 }]}>{section.title}</Text>
            </View>

            {section.blocks.map((block, i) =>
              block.kind === 'note' ? (
                <View
                  key={i}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'flex-start',
                    backgroundColor: theme.colors.brandWash,
                    borderColor: theme.colors.brand,
                    borderWidth: 1,
                    borderRadius: 12,
                    padding: theme.space[12],
                    marginBottom: theme.space[10],
                  }}
                >
                  <Ionicons
                    name="information-circle-outline"
                    size={18}
                    color={theme.colors.brand}
                    style={{ marginRight: theme.space[8], marginTop: 1 }}
                  />
                  <Text style={[incomeStyles.sourceText, { flex: 1, lineHeight: 21, color: theme.colors.brand }]}>
                    {block.text}
                  </Text>
                </View>
              ) : (
                <Text
                  key={i}
                  style={[incomeStyles.toggleSubtext, { lineHeight: 21, marginBottom: theme.space[10] }]}
                >
                  {block.text}
                </Text>
              ),
            )}
          </View>
        ))}
      </View>
    </ProfileScreen>
  );
}
