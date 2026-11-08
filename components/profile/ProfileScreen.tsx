// components/profile/ProfileScreen.tsx
// Shared shell for every profile sub-screen.
// The gradient header below is the SAME markup that every screen used before (unchanged),
// now defined once so all screens stay identical.
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { ReactElement, ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  RefreshControlProps,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { theme } from '../../constants/theme';
import { profileStyles } from '../../constants/ui.styles';
import GradientBackground from '../GradientBackground';

type Props = {
  title: string;
  onBack: () => void;
  children: ReactNode;
  /** Wrap children in a ScrollView (default). Pass false when children bring their own FlatList. */
  scroll?: boolean;
  /** Sticky area under the content (primary action button). */
  footer?: ReactNode;
  /** Lift content + footer above the keyboard (forms). */
  keyboardAware?: boolean;
  refreshControl?: ReactElement<RefreshControlProps>;
};

export default function ProfileScreen({
  title,
  onBack,
  children,
  scroll = true,
  footer,
  keyboardAware = false,
  refreshControl,
}: Props) {
  const body = (
    <>
      {scroll ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={refreshControl}
          contentContainerStyle={[profileStyles.scrollContent, { paddingBottom: theme.space[24] }]}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={styles.flex}>{children}</View>
      )}
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </>
  );

  return (
    <View style={profileStyles.container}>
      <StatusBar style="light" />

      {/* Gradient header: gradient fill + "<" + title (unchanged) */}
      <View style={profileStyles.modernHeader}>
        <View style={profileStyles.headerGradientFill} pointerEvents="none">
          <GradientBackground />
        </View>
        <TouchableOpacity
          onPress={onBack}
          style={profileStyles.backBtnTouchable}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={22} color={theme.colors.white} />
        </TouchableOpacity>
        <Text style={profileStyles.headerTitleCentered} numberOfLines={1}>
          {title}
        </Text>
        <View style={profileStyles.backBtnTouchable} />
      </View>

      {/* Mint sheet sliding over the gradient */}
      <View style={profileStyles.sheet}>
        {keyboardAware ? (
          <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            {body}
          </KeyboardAvoidingView>
        ) : (
          body
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  footer: {
    paddingHorizontal: theme.space[20],
    paddingTop: theme.space[8],
    paddingBottom: theme.space[24],
  },
});
