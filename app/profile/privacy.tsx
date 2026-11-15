// app/profile/privacy.tsx
// Privacy Policy screen. Text lives in constants/privacyPolicy.ts.
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Linking, Text, TouchableOpacity, View } from 'react-native';

import ProfileScreen from '../../components/profile/ProfileScreen';
import { theme } from '../../constants/theme';
import { LAST_UPDATED, PRIVACY_SECTIONS, PRIVACY_URL, SUPPORT_EMAIL } from '../../constants/privacyPolicy';
import { incomeStyles, profileStyles } from '../../constants/ui.styles';

export default function PrivacyScreen() {
  const router = useRouter();

  return (
    <ProfileScreen title="Privacy Policy" onBack={() => router.back()}>
      <View style={profileStyles.modernCardGroup}>
        {/* Last updated pill */}
        <View style={[incomeStyles.countBadge, { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', marginBottom: theme.space[16] }]}>
          <Ionicons name="calendar-outline" size={12} color={theme.colors.brand} style={{ marginRight: 6 }} />
          <Text style={incomeStyles.countBadgeText}>Last updated: {LAST_UPDATED}</Text>
        </View>

        <TouchableOpacity
          onPress={() => Linking.openURL(PRIVACY_URL)}
          style={{ flexDirection: 'row', alignItems: 'center', marginBottom: theme.space[16] }}
        >
          <Ionicons name="open-outline" size={14} color={theme.colors.brand} style={{ marginRight: 6 }} />
          <Text style={{ color: theme.colors.brand }}>View online</Text>
        </TouchableOpacity>

        {PRIVACY_SECTIONS.map((section, index) => (
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

            {section.blocks.map((block, i) => {
              if (block.kind === 'note') {
                return (
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
                );
              }

              if (block.kind === 'li') {
                return (
                  <View key={i} style={{ marginBottom: theme.space[10] }}>
                    {block.items.map((item) => (
                      <View key={item} style={{ flexDirection: 'row', marginTop: theme.space[6] }}>
                        <Text style={[incomeStyles.toggleSubtext, { lineHeight: 21, marginRight: theme.space[8] }]}>{'•'}</Text>
                        <Text style={[incomeStyles.toggleSubtext, { flex: 1, lineHeight: 21 }]}>{item}</Text>
                      </View>
                    ))}
                  </View>
                );
              }

              // Make the support email tappable
              if (block.text.includes(SUPPORT_EMAIL)) {
                const [before, after] = block.text.split(SUPPORT_EMAIL);
                return (
                  <Text key={i} style={[incomeStyles.toggleSubtext, { lineHeight: 21, marginBottom: theme.space[10] }]}>
                    {before}
                    <Text
                      style={{ color: theme.colors.brand }}
                      onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}
                    >
                      {SUPPORT_EMAIL}
                    </Text>
                    {after}
                  </Text>
                );
              }

              return (
                <Text key={i} style={[incomeStyles.toggleSubtext, { lineHeight: 21, marginBottom: theme.space[10] }]}>
                  {block.text}
                </Text>
              );
            })}
          </View>
        ))}
      </View>
    </ProfileScreen>
  );
}
