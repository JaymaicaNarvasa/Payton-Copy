// components/PaytonAlert.tsx
import { Ionicons } from '@expo/vector-icons';
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  Text,
  View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { theme } from '../constants/theme';
import { paytonAlertStyles as styles } from '../constants/ui.styles';

export type AlertType = 'success' | 'error' | 'warning' | 'info';

export type AlertButton = {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
};

export type AlertConfig = {
  visible: boolean;
  title: string;
  message?: string;
  type?: AlertType;
  buttons?: AlertButton[];
  /** true while an action is running: locks the dialog and shows a spinner on the filled button */
  busy?: boolean;
};

const TYPE_THEME: Record<
  AlertType,
  { icon: keyof typeof Ionicons.glyphMap; color: string; tint: string; ring: string }
> = {
  success: { icon: 'checkmark-circle', color: theme.colors.success, tint: theme.colors.successBg, ring: theme.colors.successWash },
  error:   { icon: 'alert-circle',     color: theme.colors.danger,   tint: theme.colors.dangerBg,   ring: theme.colors.dangerWash },
  warning: { icon: 'warning',          color: theme.colors.warning,  tint: theme.colors.warningBg,  ring: theme.colors.warningWash },
  info:    { icon: 'information-circle', color: theme.colors.accent, tint: theme.colors.accentTint, ring: theme.colors.accentWash },
};

/* ---------- Presentational dialog (use directly if you prefer local state) ---------- */
export function PaytonAlertDialog({
  visible,
  title,
  message,
  type = 'info',
  buttons,
  busy = false,
  onDismiss,
}: AlertConfig & { onDismiss?: () => void }) {
  const tone = TYPE_THEME[type];
  const actions: AlertButton[] = buttons?.length ? buttons : [{ text: 'Got it' }];

  const scale = useSharedValue(0.9);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      opacity.value = withTiming(1, { duration: 160 });
      scale.value = withSpring(1, { damping: 18, stiffness: 180 });
    } else {
      opacity.value = withTiming(0, { duration: 120 });
      scale.value = 0.9;
    }
  }, [visible, opacity, scale]);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  const stacked = actions.length > 2;

  return (
    <Modal transparent visible={visible} animationType="fade" statusBarTranslucent onRequestClose={busy ? () => {} : onDismiss}>
      <View style={styles.overlay}>
        <Animated.View style={[styles.card, cardStyle]}>
          {/* accent strip in the type colour */}
          <View style={[styles.accent, { backgroundColor: tone.color }]} />

          <View style={[styles.iconRing, { backgroundColor: tone.ring, borderColor: tone.tint }]}>
            <View style={[styles.iconCore, { backgroundColor: tone.tint }]}>
              <Ionicons name={tone.icon} size={28} color={tone.color} />
            </View>
          </View>

          <Text style={styles.title}>{title}</Text>
          {!!message && <Text style={styles.message}>{message}</Text>}

          <View style={[styles.actions, stacked && styles.actionsStacked]}>
            {actions.map((btn, i) => {
              const isCancel = btn.style === 'cancel';
              const isDestructive = btn.style === 'destructive';
              const filledColor = isDestructive
                ? theme.colors.danger
                : type === 'success'
                ? theme.colors.success
                : theme.colors.brand;

              return (
                <Pressable
                  key={`${btn.text}-${i}`}
                  onPress={btn.onPress ?? onDismiss}
                  disabled={busy}
                  android_ripple={{ color: theme.colors.alpha.white[15] }}
                  style={({ pressed }) => [
                    styles.button,
                    !stacked && { flex: 1 },
                    isCancel
                      ? styles.buttonGhost
                      : { backgroundColor: filledColor },
                    busy && isCancel && { opacity: 0.5 },
                    pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
                  ]}
                >
                  {busy && !isCancel ? (
                    <ActivityIndicator size="small" color={theme.colors.white} />
                  ) : (
                    <Text style={[styles.buttonText, isCancel ? styles.buttonGhostText : { color: theme.colors.white }]}>
                      {btn.text}
                    </Text>
                  )}
                </Pressable>
              );
            })}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

/* ---------- Global provider + hook ---------- */
type ShowAlertInput = Omit<AlertConfig, 'visible'>;

const AlertContext = createContext<{ showAlert: (c: ShowAlertInput) => void; hideAlert: () => void } | null>(null);

export function PaytonAlertProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AlertConfig>({ visible: false, title: '' });

  const hideAlert = useCallback(() => setConfig((p) => ({ ...p, visible: false })), []);

  const showAlert = useCallback(
    (c: ShowAlertInput) => {
      // every button closes the dialog first, then runs the caller's handler
      const buttons = (c.buttons?.length ? c.buttons : [{ text: 'Got it' }]).map((b) => ({
        ...b,
        onPress: () => {
          hideAlert();
          b.onPress?.();
        },
      }));
      setConfig({ ...c, buttons, visible: true });
    },
    [hideAlert]
  );

  const value = useMemo(() => ({ showAlert, hideAlert }), [showAlert, hideAlert]);

  return (
    <AlertContext.Provider value={value}>
      {children}
      <PaytonAlertDialog {...config} onDismiss={hideAlert} />
    </AlertContext.Provider>
  );
}

export function useAlert() {
  const ctx = useContext(AlertContext);
  if (!ctx) throw new Error('useAlert must be used inside <PaytonAlertProvider>');
  return ctx;
}