// components/profile/PrimaryButton.tsx
// The brand primary button (resetPasswordStyles.primaryButton) with loading / disabled / icon built in.
import { Ionicons } from '@expo/vector-icons';
import { ComponentProps } from 'react';
import { ActivityIndicator, StyleProp, Text, TouchableOpacity, View, ViewStyle } from 'react-native';

import { theme } from '../../constants/theme';
import { incomeStyles, resetPasswordStyles } from '../../constants/ui.styles';

type IconName = ComponentProps<typeof Ionicons>['name'];

type Props = {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
};

export default function PrimaryButton({ label, onPress, loading = false, disabled = false, icon, style }: Props) {
  const inactive = loading || disabled;

  return (
    <TouchableOpacity
      style={[resetPasswordStyles.primaryButton, inactive && incomeStyles.buttonDisabled, style]}
      onPress={onPress}
      disabled={inactive}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy: loading }}
    >
      {loading ? (
        <ActivityIndicator color={theme.colors.white} />
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {icon ? <Ionicons name={icon} size={18} color={theme.colors.white} style={{ marginRight: theme.space[8] }} /> : null}
          <Text style={resetPasswordStyles.buttonText}>{label}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}
