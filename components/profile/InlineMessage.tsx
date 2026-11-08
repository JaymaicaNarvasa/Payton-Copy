// components/profile/InlineMessage.tsx
// Inline status banner (success / error / warning / info) used for form-level and list-level feedback.
// Built from the same incomeStyles banners + theme tokens the Archive screen already used.
import { Ionicons } from '@expo/vector-icons';
import { ComponentProps } from 'react';
import { StyleProp, StyleSheet, Text, TouchableOpacity, ViewStyle, View } from 'react-native';

import { theme } from '../../constants/theme';
import { incomeStyles } from '../../constants/ui.styles';

export type MessageType = 'success' | 'error' | 'warning' | 'info';
export type FormMessage = { type: MessageType; message: string } | null;

type IconName = ComponentProps<typeof Ionicons>['name'];

function getLook(type: MessageType): { box: StyleProp<ViewStyle>; text: object; color: string; icon: IconName } {
  switch (type) {
    case 'success':
      return {
        box: incomeStyles.bannerSuccess,
        text: incomeStyles.bannerTextSuccess,
        color: theme.colors.green,
        icon: 'checkmark-circle-outline',
      };
    case 'error':
      return {
        box: incomeStyles.bannerError,
        text: incomeStyles.bannerTextError,
        color: theme.colors.danger,
        icon: 'alert-circle-outline',
      };
    case 'warning':
      return {
        box: { backgroundColor: theme.colors.warningBg, borderColor: theme.colors.warningBorder },
        text: { color: theme.colors.warningDeep },
        color: theme.colors.warningMid,
        icon: 'warning-outline',
      };
    default:
      return {
        box: { backgroundColor: theme.colors.accentTint, borderColor: theme.colors.accentSoft },
        text: { color: theme.colors.brand },
        color: theme.colors.accent,
        icon: 'information-circle-outline',
      };
  }
}

type Props = {
  type: MessageType;
  message: string;
  onDismiss?: () => void;
  actionLabel?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
};

export default function InlineMessage({ type, message, onDismiss, actionLabel, onAction, style }: Props) {
  const look = getLook(type);

  return (
    <View
      style={[incomeStyles.inlineBanner, look.box, styles.margin, style]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <Ionicons name={look.icon} size={18} color={look.color} />
      <Text style={[incomeStyles.bannerText, look.text]}>{message}</Text>

      {actionLabel && onAction ? (
        <TouchableOpacity onPress={onAction} hitSlop={8} accessibilityRole="button">
          <Text style={[look.text, styles.action]}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}

      {onDismiss ? (
        <TouchableOpacity onPress={onDismiss} hitSlop={8} accessibilityRole="button" accessibilityLabel="Dismiss message">
          <Ionicons name="close" size={16} color={look.color} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  margin: { marginBottom: theme.space[16] },
  action: { fontFamily: theme.fontFamily.bold, fontSize: 13, textDecorationLine: 'underline' },
});
