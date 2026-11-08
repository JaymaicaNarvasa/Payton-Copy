// components/profile/FormField.tsx
// One consistent input for every profile form: label, optional icon, focus / error / read-only states,
// and the validation message shown directly BELOW the input.
import { Ionicons } from '@expo/vector-icons';
import { ComponentProps, forwardRef, ReactNode, useState } from 'react';
import {
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextStyle,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';

import { theme } from '../../constants/theme';
import { incomeStyles, profileStyles, resetPasswordStyles } from '../../constants/ui.styles';

type IconName = ComponentProps<typeof Ionicons>['name'];

/* ---------- label ---------- */
export function FieldLabel({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[profileStyles.groupContextLabel, { textTransform: 'none' }, style]}>{children}</Text>;
}

/* ---------- error line (also usable under non-text inputs such as option lists) ---------- */
export function FieldError({ message, style }: { message?: string | null; style?: StyleProp<ViewStyle> }) {
  if (!message) return null;
  return (
    <View style={[styles.messageRow, style]} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <Ionicons name="alert-circle" size={14} color={theme.colors.danger} />
      <Text style={[incomeStyles.dateText, styles.errorText]}>{message}</Text>
    </View>
  );
}

/* ---------- field ---------- */
type FormFieldProps = TextInputProps & {
  label: string;
  /** Validation message, rendered below the input. */
  error?: string | null;
  /** Helper text, replaced by `error` when there is one. */
  hint?: string;
  icon?: IconName;
  /** Small right-aligned text under the input, e.g. "12/1000". */
  counter?: string;
  /** Adds the show / hide eye button (for password inputs). */
  passwordToggle?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
};

export const FormField = forwardRef<TextInput, FormFieldProps>(function FormField(
  {
    label,
    error,
    hint,
    icon,
    counter,
    passwordToggle,
    containerStyle,
    multiline,
    editable = true,
    onFocus,
    onBlur,
    style,
    ...inputProps
  },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const hasError = !!error;

  const wrapperState = !editable
    ? { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border }
    : {
        backgroundColor: theme.colors.white,
        borderColor: hasError ? theme.colors.danger : focused ? theme.colors.brand : theme.colors.borderStrong,
      };

  const iconColor = hasError ? theme.colors.danger : focused ? theme.colors.brand : theme.colors.auth.greenDark;

  return (
    <View style={[styles.container, containerStyle]}>
      <FieldLabel>{label}</FieldLabel>

      <View style={[resetPasswordStyles.inputWrapper, multiline && styles.multilineWrapper, wrapperState]}>
        {icon && !multiline ? (
          <Ionicons name={icon} size={20} color={iconColor} style={resetPasswordStyles.inputIcon} />
        ) : null}

        <TextInput
          {...inputProps}
          ref={ref}
          multiline={multiline}
          editable={editable}
          accessibilityLabel={label}
          accessibilityState={{ disabled: !editable }}
          placeholderTextColor={theme.colors.textSubtle}
          secureTextEntry={passwordToggle ? !revealed : inputProps.secureTextEntry}
          style={[
            resetPasswordStyles.input,
            multiline && styles.multilineInput,
            !editable && { color: theme.colors.textMuted },
            style,
          ]}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
        />

        {passwordToggle ? (
          <TouchableOpacity
            onPress={() => setRevealed((v) => !v)}
            style={resetPasswordStyles.eyeIcon}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={revealed ? 'Hide password' : 'Show password'}
          >
            <Ionicons
              name={revealed ? 'eye-outline' : 'eye-off-outline'}
              size={20}
              color={theme.colors.auth.muted}
            />
          </TouchableOpacity>
        ) : null}

        {!editable ? (
          <Ionicons name="lock-closed" size={15} color={theme.colors.textSubtle} style={styles.lockIcon} />
        ) : null}
      </View>

      {error || hint || counter ? (
        <View style={styles.footerRow}>
          <View style={styles.flex}>
            {error ? (
              <FieldError message={error} />
            ) : hint ? (
              <Text style={incomeStyles.dateText}>{hint}</Text>
            ) : null}
          </View>
          {counter ? <Text style={incomeStyles.dateText}>{counter}</Text> : null}
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: { marginBottom: theme.space[16] },
  flex: { flex: 1 },
  messageRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  errorText: { color: theme.colors.danger, flex: 1 },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.space[8],
    marginTop: theme.space[6],
    paddingHorizontal: 4,
  },
  multilineWrapper: {
    height: undefined,
    minHeight: 140,
    borderRadius: 18,
    alignItems: 'flex-start',
  },
  multilineInput: {
    height: undefined,
    minHeight: 130,
    paddingTop: theme.space[14],
    textAlignVertical: 'top',
  },
  lockIcon: { marginRight: theme.space[14] },
});
