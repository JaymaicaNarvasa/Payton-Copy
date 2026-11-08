// app/(personalTabs)/split.tsx
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import type { User } from '@supabase/supabase-js';
import emailjs from 'emailjs-com';
import 'expo-blob';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  DimensionValue,
  Easing,
  Image,
  Keyboard,
  LayoutChangeEvent,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import GradientBackground from '../../components/GradientBackground';
import { theme } from '../../constants/theme';
import { transactionStyles as headerStyles } from '../../constants/ui.styles';

const { colors, space, radius, fontSize, fontFamily } = theme;

/* ────────────────────────────────────────────────────────────────────────────
 * Types
 * ──────────────────────────────────────────────────────────────────────────── */

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

type Friend = {
  id: string;
  full_name: string;
  email?: string | null;
  avatar_url?: string | null;
};

type Category = { id: string; name: string; icon?: string };

type ActiveSplitFriend = {
  id: string;
  split_expense_id: string;
  friend_id: string;
  owed_amount: number;
  status: 'unpaid' | 'paid';
  friends?: { id: string; full_name: string; email?: string | null; avatar_url?: string | null };
};

type ActiveSplit = {
  id: string;
  description: string;
  total_amount: number;
  personal_share: number;
  split_type: 'EQUAL' | 'CUSTOM';
  created_at: string;
  categories?: { name: string; icon?: string } | null;
  split_friends: ActiveSplitFriend[];
};

type Profile = { full_name?: string; avatar_url?: string | null } | null;
type ToastMsg = { id: number; text: string; type: 'success' | 'error' };
type SplitType = 'EQUAL' | 'CUSTOM';

type CreateErrors = {
  amount?: string;
  description?: string;
  friends?: string;
  shares: Record<string, string>;
  sharesTotal?: string;
  form?: string;
};
type FriendErrors = { name?: string; email?: string; photo?: string; form?: string };

type ConfirmCfg = {
  key: string;
  title: string;
  message: string;
  confirmLabel: string;
  icon: IoniconName;
  tone: 'danger' | 'primary';
  /** resolve with an error message to show inline, or null when it worked */
  onConfirm: () => Promise<string | null>;
};

/* ────────────────────────────────────────────────────────────────────────────
 * Constants & helpers
 * ──────────────────────────────────────────────────────────────────────────── */

const EMAILJS = {
  serviceId: 'service_67drjkh',
  templateId: 'template_amd0qms',
  publicKey: 'W4iiQMEllSfk5dSfk',
};

/** wait for a closing sheet to finish its exit animation before opening another one */
const SHEET_SWAP_DELAY = 300;
const afterSheet = (fn: () => void) => setTimeout(fn, SHEET_SWAP_DELAY);

const NO_CREATE_ERRORS: CreateErrors = { shares: {} };

/** keeps the toast clear of the floating tab bar */
const TOAST_BOTTOM = theme.layout.tabBarClearance - 16;

const peso = (n?: number | null) =>
  `₱${(n || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;

/** digits + one dot + max 2 decimals */
const sanitizeAmount = (t: string) =>
  t
    .replace(/[^0-9.]/g, '')
    .replace(/(\..*)\./g, '$1')
    .replace(/^(\d*\.\d{0,2}).*$/, '$1');

const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

const formatDate = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';

/** keeps the last non-null value so a sheet's content survives its exit animation */
function useLatest<T>(value: T | null): T | null {
  const ref = useRef<T | null>(value);
  if (value) ref.current = value;
  return ref.current;
}

/** remembers each field's y-offset so a long form can scroll to the first error */
function useFieldRegistry() {
  const scrollRef = useRef<ScrollView>(null);
  const positions = useRef<Record<string, number>>({});
  const onLayout = (key: string) => (e: LayoutChangeEvent) => {
    positions.current[key] = e.nativeEvent.layout.y;
  };
  const scrollToFirst = (keys: string[]) => {
    const y = keys.map((k) => positions.current[k]).find((v) => v !== undefined);
    if (y !== undefined) scrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: true });
  };
  return { scrollRef, onLayout, scrollToFirst };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Avatar — remote photo, or the built-in default silhouette
 * ──────────────────────────────────────────────────────────────────────────── */

function Avatar({ uri, size = 40 }: { uri?: string | null; size?: number }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [uri]);

  const box = { width: size, height: size, borderRadius: size / 2 };

  if (uri && !failed) {
    return <Image source={{ uri }} style={[box, s.avatarImage]} onError={() => setFailed(true)} />;
  }
  return (
    <View style={[box, s.avatarSilhouette]} accessibilityLabel="Default avatar">
      <Ionicons
        name="person"
        size={Math.round(size * 0.82)}
        color={colors.textMuted}
        style={{ marginBottom: -Math.round(size * 0.07) }}
      />
    </View>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Skeleton loading
 * ──────────────────────────────────────────────────────────────────────────── */

const PulseContext = createContext<Animated.Value | null>(null);

function Bone({ width, height, rounded = radius.sm, style }: { width: DimensionValue; height: number; rounded?: number; style?: object }) {
  const pulse = useContext(PulseContext);
  const opacity = pulse ? pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] }) : 1;
  return <Animated.View style={[{ width, height, borderRadius: rounded, backgroundColor: colors.border, opacity }, style]} />;
}

function SplitSkeleton() {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <PulseContext.Provider value={pulse}>
      <View style={s.scrollContent} accessibilityLabel="Loading splits" accessibilityRole="progressbar">
        {/* summary */}
        <View style={s.summaryRow}>
          <Bone width="58%" height={92} rounded={radius.lg} />
          <Bone width="38%" height={92} rounded={radius.lg} />
        </View>

        {/* friends */}
        <View style={[s.sectionHeader, { marginTop: space[24] }]}>
          <Bone width={96} height={16} />
          <Bone width={56} height={12} />
        </View>
        <View style={s.skeletonFriends}>
          {[0, 1, 2, 3, 4].map((i) => (
            <View key={i} style={{ alignItems: 'center', gap: space[8] }}>
              <Bone width={56} height={56} rounded={28} />
              <Bone width={44} height={10} />
            </View>
          ))}
        </View>

        {/* history */}
        <View style={[s.sectionHeader, { marginTop: space[24] }]}>
          <Bone width={104} height={16} />
          <Bone width={52} height={12} />
        </View>
        {[0, 1].map((i) => (
          <View key={i} style={s.card}>
            <View style={s.cardTop}>
              <Bone width={44} height={44} rounded={radius.md} />
              <View style={{ flex: 1, gap: space[8] }}>
                <Bone width="60%" height={14} />
                <Bone width="36%" height={10} />
              </View>
              <Bone width={64} height={18} />
            </View>
            <Bone width="100%" height={6} rounded={3} style={{ marginTop: space[16] }} />
            {[0, 1].map((j) => (
              <View key={j} style={[s.memberRow, j > 0 && s.memberRowBorder]}>
                <Bone width={36} height={36} rounded={18} />
                <View style={{ flex: 1, gap: space[6] }}>
                  <Bone width="50%" height={12} />
                  <Bone width="30%" height={10} />
                </View>
                <Bone width={56} height={14} />
                <Bone width={60} height={30} rounded={radius.sm} />
              </View>
            ))}
          </View>
        ))}
      </View>
    </PulseContext.Provider>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Form primitives
 * ──────────────────────────────────────────────────────────────────────────── */

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <View style={s.fieldError} accessibilityLiveRegion="polite">
      <Ionicons name="alert-circle" size={14} color={colors.danger} style={{ marginTop: 1 }} />
      <Text style={s.fieldErrorText}>{message}</Text>
    </View>
  );
}

function Field({
  label,
  optional,
  error,
  hint,
  onLayout,
  children,
}: {
  label?: string;
  optional?: boolean;
  error?: string;
  hint?: string;
  onLayout?: (e: LayoutChangeEvent) => void;
  children: React.ReactNode;
}) {
  return (
    <View style={s.field} onLayout={onLayout}>
      {label ? (
        <Text style={s.label}>
          {label}
          {optional ? <Text style={s.labelOptional}> (optional)</Text> : null}
        </Text>
      ) : null}
      {children}
      <FieldError message={error} />
      {!error && hint ? <Text style={s.hint}>{hint}</Text> : null}
    </View>
  );
}

function Input({
  error,
  prefix,
  large,
  style,
  onFocus,
  onBlur,
  ...rest
}: TextInputProps & { error?: boolean; prefix?: string; large?: boolean }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[s.inputWrap, large && s.inputWrapLarge, focused && s.inputFocused, error && s.inputError]}>
      {prefix ? <Text style={[s.inputPrefix, large && s.inputPrefixLarge]}>{prefix}</Text> : null}
      <TextInput
        {...rest}
        style={[s.inputText, large && s.inputTextLarge, style]}
        placeholderTextColor={colors.textSubtle}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
      />
    </View>
  );
}

function Button({
  label,
  onPress,
  loading,
  disabled,
  tone = 'primary',
  icon,
  style,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  tone?: 'primary' | 'danger' | 'ghost';
  icon?: IoniconName;
  style?: object;
}) {
  const bg = tone === 'danger' ? colors.danger : tone === 'ghost' ? colors.surfaceAlt : colors.brand;
  const fg = tone === 'ghost' ? colors.textSecondary : colors.white;
  const inactive = disabled || loading;
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      disabled={inactive}
      style={[s.button, { backgroundColor: bg }, inactive && s.buttonDisabled, style]}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
    >
      {loading ? <ActivityIndicator size="small" color={fg} /> : icon ? <Ionicons name={icon} size={18} color={fg} /> : null}
      <Text style={[s.buttonText, { color: fg }]}>{label}</Text>
    </TouchableOpacity>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * BottomSheet — the one modal used everywhere on this screen
 * ──────────────────────────────────────────────────────────────────────────── */

type SheetProps = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  scrollRef?: React.Ref<ScrollView>;
  dismissable?: boolean;
};

function BottomSheet({ visible, onClose, title, subtitle, children, footer, scrollRef, dismissable = true }: SheetProps) {
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);
  const [kb, setKb] = useState(0);
  const translateY = useRef(new Animated.Value(winH)).current;
  const backdrop = useRef(new Animated.Value(0)).current;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // enter / exit animation
  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.parallel([
        Animated.timing(backdrop, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.spring(translateY, { toValue: 0, damping: 24, stiffness: 240, mass: 0.9, useNativeDriver: true }),
      ]).start();
    } else {
      Keyboard.dismiss();
      Animated.parallel([
        Animated.timing(backdrop, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: winH, duration: 240, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
      ]).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
  }, [visible, winH, backdrop, translateY]);

  // keyboard avoidance (works the same inside a Modal on iOS and Android)
  useEffect(() => {
    if (!visible) return;
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const a = Keyboard.addListener(showEvt, (e) => setKb(e.endCoordinates.height));
    const b = Keyboard.addListener(hideEvt, () => setKb(0));
    return () => {
      a.remove();
      b.remove();
      setKb(0);
    };
  }, [visible]);

  // drag the header down to dismiss
  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => dismissable && g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderMove: (_, g) => {
          if (g.dy > 0) translateY.setValue(g.dy);
        },
        onPanResponderRelease: (_, g) => {
          if (g.dy > 110 || g.vy > 0.9) onCloseRef.current();
          else Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
        },
        onPanResponderTerminate: () => {
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
        },
      }),
    [dismissable, translateY]
  );

  if (!visible && !mounted) return null;

  const bottomPad = kb > 0 ? space[12] : Math.max(insets.bottom, space[16]);

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={dismissable ? onClose : undefined}
      supportedOrientations={['portrait', 'landscape']}
    >
      <View style={s.sheetRoot}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay, opacity: backdrop }]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={dismissable ? onClose : undefined}
            accessibilityRole="button"
            accessibilityLabel="Close"
          />
        </Animated.View>

        <Animated.View
          style={[
            s.sheet,
            { maxHeight: winH - insets.top - space[16] - kb, marginBottom: kb, transform: [{ translateY }] },
          ]}
        >
          <View {...pan.panHandlers}>
            <View style={s.grabber} />
            {title ? (
              <View style={s.sheetHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={s.sheetTitle} numberOfLines={1}>
                    {title}
                  </Text>
                  {subtitle ? <Text style={s.sheetSubtitle}>{subtitle}</Text> : null}
                </View>
                {dismissable ? (
                  <TouchableOpacity
                    style={s.closeButton}
                    onPress={onClose}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Close"
                  >
                    <Ionicons name="close" size={18} color={colors.textMuted} />
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}
          </View>

          <ScrollView
            ref={scrollRef}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bounces={false}
            contentContainerStyle={[s.sheetContent, !footer && { paddingBottom: bottomPad }]}
          >
            {children}
          </ScrollView>

          {footer ? <View style={[s.sheetFooter, { paddingBottom: bottomPad }]}>{footer}</View> : null}
        </Animated.View>
      </View>
    </Modal>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Confirm body / sheet (replaces the old centered alert dialogs)
 * ──────────────────────────────────────────────────────────────────────────── */

function ConfirmBody({ cfg, onCancel, onDone }: { cfg: ConfirmCfg; onCancel: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const danger = cfg.tone === 'danger';

  const run = async () => {
    setBusy(true);
    setError(null);
    const err = await cfg.onConfirm();
    setBusy(false);
    if (err) setError(err);
    else onDone();
  };

  return (
    <View style={s.confirm}>
      <View style={[s.confirmIcon, { backgroundColor: danger ? colors.dangerBg : colors.brandWash }]}>
        <Ionicons name={cfg.icon} size={26} color={danger ? colors.danger : colors.brand} />
      </View>
      <Text style={s.confirmTitle}>{cfg.title}</Text>
      <Text style={s.confirmMessage}>{cfg.message}</Text>
      <FieldError message={error || undefined} />
      <View style={s.confirmActions}>
        <Button
          label="Cancel"
          tone="ghost"
          disabled={busy}
          style={{ flex: 1 }}
          onPress={() => {
            setError(null);
            onCancel();
          }}
        />
        <Button
          label={cfg.confirmLabel}
          tone={danger ? 'danger' : 'primary'}
          loading={busy}
          style={{ flex: 1 }}
          onPress={run}
        />
      </View>
    </View>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Toast — feedback for actions that don't belong to a specific input
 * ──────────────────────────────────────────────────────────────────────────── */

function Toast({ toast, bottom }: { toast: ToastMsg | null; bottom: number }) {
  const anim = useRef(new Animated.Value(0)).current;
  const shown = useLatest(toast);

  useEffect(() => {
    Animated.timing(anim, { toValue: toast ? 1 : 0, duration: toast ? 220 : 180, useNativeDriver: true }).start();
  }, [toast, anim]);

  if (!shown) return null;
  const isError = shown.type === 'error';

  return (
    <Animated.View
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      style={[
        s.toast,
        {
          bottom,
          opacity: anim,
          transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
        },
      ]}
    >
      <Ionicons
        name={isError ? 'alert-circle' : 'checkmark-circle'}
        size={20}
        color={isError ? colors.dangerBright : colors.emeraldLight}
      />
      <Text style={s.toastText}>{shown.text}</Text>
    </Animated.View>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Screen
 * ──────────────────────────────────────────────────────────────────────────── */

export default function SplitScreen() {
  const insets = useSafeAreaInsets();

  // data
  const [user, setUser] = useState<User | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [activeSplits, setActiveSplits] = useState<ActiveSplit[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [myProfile, setMyProfile] = useState<Profile>(null);

  // toast
  const [toast, setToast] = useState<ToastMsg | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const showToast = useCallback((text: string, type: 'success' | 'error' = 'success') => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ id: Date.now(), text, type });
    toastTimer.current = setTimeout(() => setToast(null), 3400);
  }, []);
  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    []
  );

  // create-split sheet
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [splitType, setSplitType] = useState<SplitType>('EQUAL');
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
  const [customShares, setCustomShares] = useState<Record<string, string>>({});
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [createErrors, setCreateErrors] = useState<CreateErrors>(NO_CREATE_ERRORS);
  const createFields = useFieldRegistry();

  // add / edit friend sheet
  const [friendSheetOpen, setFriendSheetOpen] = useState(false);
  const [savingFriend, setSavingFriend] = useState(false);
  const [editingFriend, setEditingFriend] = useState<Friend | null>(null);
  const [newFriendName, setNewFriendName] = useState('');
  const [newFriendEmail, setNewFriendEmail] = useState('');
  const [friendImageUri, setFriendImageUri] = useState<string | null>(null);
  const [friendErrors, setFriendErrors] = useState<FriendErrors>({});

  // manage friend sheet
  const [manageFriend, setManageFriend] = useState<Friend | null>(null);
  const [manageView, setManageView] = useState<'menu' | 'confirm'>('menu');
  const shownManageFriend = useLatest(manageFriend);

  // settle sheet
  const [settleTarget, setSettleTarget] = useState<{ split: ActiveSplit; sf: ActiveSplitFriend } | null>(null);
  const shownSettle = useLatest(settleTarget);
  const [payAmount, setPayAmount] = useState('');
  const [payError, setPayError] = useState<string | undefined>();
  const [settling, setSettling] = useState(false);

  // confirm sheet (delete split)
  const [confirmCfg, setConfirmCfg] = useState<ConfirmCfg | null>(null);
  const shownConfirm = useLatest(confirmCfg);

  // per-row busy flags
  const [remindingId, setRemindingId] = useState<string | null>(null);

  /* ───────────────────────────── data ───────────────────────────── */

  const fetchData = useCallback(async (userId: string) => {
    try {
      const [cats, fr, sp, prof] = await Promise.all([
        supabase.from('categories').select('id, name, icon').order('name', { ascending: true }),
        supabase
          .from('friends')
          .select('id, full_name, email, avatar_url')
          .eq('user_id', userId)
          .order('created_at', { ascending: true }),
        supabase
          .from('split_expenses')
          .select(
            `
            id, user_id, description, total_amount, personal_share, created_at, split_type, category_id,
            categories ( name, icon ),
            split_friends (
              id, split_expense_id, friend_id, owed_amount, status,
              friends ( id, full_name, email, avatar_url )
            )
          `
          )
          .eq('user_id', userId)
          .order('created_at', { ascending: false }),
        supabase.from('profiles').select('full_name, avatar_url').eq('id', userId).maybeSingle(),
      ]);

      if (cats.error) console.error('Categories fetch error:', cats.error.message);
      if (fr.error) console.error('Friends fetch error:', fr.error.message);
      if (sp.error) console.error('Splits fetch error:', sp.error.message);
      if (prof.error) console.error('Profile fetch error:', prof.error.message);

      const catData = (cats.data as Category[]) || [];
      setCategories(catData);
      if (catData.length > 0) setSelectedCategoryId((prev) => prev ?? catData[0].id);
      setFriends((fr.data as Friend[]) || []);
      setActiveSplits((sp.data as unknown as ActiveSplit[]) || []);
      setMyProfile((prof.data as Profile) || null);
    } catch (err) {
      console.error('Split data error:', err);
    }
  }, []);

  const loadAll = useCallback(
    async (mode: 'initial' | 'refresh') => {
      if (mode === 'initial') setInitialLoading(true);
      else setRefreshing(true);
      try {
        const {
          data: { user: currentUser },
        } = await supabase.auth.getUser();
        if (currentUser) {
          setUser(currentUser);
          await fetchData(currentUser.id);
        }
      } finally {
        if (mode === 'initial') setInitialLoading(false);
        else setRefreshing(false);
      }
    },
    [fetchData]
  );

  useEffect(() => {
    loadAll('initial');
  }, [loadAll]);

  /* ───────────────────────── derived values ───────────────────────── */

  const friendsNewestFirst = useMemo(() => [...friends].reverse(), [friends]);

  const { toCollect, openSplits } = useMemo(() => {
    let total = 0;
    let open = 0;
    for (const sp of activeSplits) {
      const unpaid = (sp.split_friends || []).filter((f) => !(f.status === 'paid' && f.owed_amount <= 0));
      if (unpaid.length > 0) open += 1;
      total += unpaid.reduce((sum, f) => sum + (f.owed_amount || 0), 0);
    }
    return { toCollect: total, openSplits: open };
  }, [activeSplits]);

  const preview = useMemo(() => {
    const total = parseFloat(amount) || 0;
    const count = selectedFriends.length;
    if (total <= 0 || count === 0) return null;
    if (splitType === 'EQUAL') {
      const each = total / (count + 1);
      return { owner: each, each, over: 0 };
    }
    const sum = selectedFriends.reduce((acc, id) => acc + (parseFloat(customShares[id] || '') || 0), 0);
    return { owner: Math.max(0, total - sum), each: null as number | null, over: Math.max(0, sum - total) };
  }, [amount, selectedFriends, splitType, customShares]);

  /* ───────────────────────── friends: add / edit ───────────────────────── */

  const openAddFriend = () => {
    setEditingFriend(null);
    setNewFriendName('');
    setNewFriendEmail('');
    setFriendImageUri(null);
    setFriendErrors({});
    setFriendSheetOpen(true);
  };

  const openEditFriend = (friend: Friend) => {
    setEditingFriend(friend);
    setNewFriendName(friend.full_name);
    setNewFriendEmail(friend.email || '');
    setFriendImageUri(friend.avatar_url || null);
    setFriendErrors({});
    setFriendSheetOpen(true);
  };

  const pickImage = async (useCamera: boolean) => {
    setFriendErrors((p) => ({ ...p, photo: undefined }));
    const permission = useCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      setFriendErrors((p) => ({
        ...p,
        photo: `Allow access to your ${useCamera ? 'camera' : 'photo library'} in Settings to add a photo.`,
      }));
      return;
    }

    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
      base64: false,
    };
    const result = useCamera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);

    if (!result.canceled && result.assets?.length > 0) setFriendImageUri(result.assets[0].uri);
  };

  const uploadAvatarToSupabase = async (uri: string): Promise<string | null> => {
    try {
      if (!user) throw new Error('No user logged in');
      const filePath = `${user.id}/${Date.now()}.jpg`;

      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, bytes, { contentType: 'image/jpeg', upsert: true });
      if (uploadError) throw uploadError;

      return supabase.storage.from('avatars').getPublicUrl(filePath).data.publicUrl;
    } catch (err: any) {
      console.error('Upload error:', err.message);
      return null;
    }
  };

  const handleSaveFriend = async () => {
    if (savingFriend) return;
    const name = newFriendName.trim();
    const email = newFriendEmail.trim().toLowerCase();

    const errs: FriendErrors = {};
    if (!name) errs.name = "Enter your friend's name.";
    if (email && !isValidEmail(email)) errs.email = 'Enter a valid email address, or leave it blank.';
    if (!user) errs.form = 'Your session has expired. Please log in again.';
    if (errs.name || errs.email || errs.form) {
      setFriendErrors(errs);
      return;
    }

    setSavingFriend(true);
    setFriendErrors({});
    try {
      let avatarUrl = editingFriend?.avatar_url || null;

      if (friendImageUri && !friendImageUri.startsWith('http')) {
        const uploaded = await uploadAvatarToSupabase(friendImageUri);
        if (!uploaded) {
          setFriendErrors({ photo: "We couldn't upload that photo. Check your connection and try again." });
          return;
        }
        avatarUrl = uploaded;
      } else if (!friendImageUri) {
        avatarUrl = null; // photo was removed
      }

      const payload = { user_id: user!.id, full_name: name, email: email || null, avatar_url: avatarUrl };

      if (editingFriend) {
        const { data, error } = await supabase.from('friends').update(payload).eq('id', editingFriend.id).select().single();
        if (error) throw error;
        if (data) setFriends((prev) => prev.map((f) => (f.id === editingFriend.id ? data : f)));
        await supabase.from('logs').insert({ user_id: user!.id, details: `updated friend "${name}".` });
      } else {
        const { data, error } = await supabase.from('friends').insert([payload]).select().single();
        if (error) throw error;
        if (data) setFriends((prev) => [...prev, data]);
        await supabase.from('logs').insert({ user_id: user!.id, details: `added friend "${name}".` });
      }

      setFriendSheetOpen(false);
      showToast(editingFriend ? 'Friend updated' : 'Friend added');
    } catch (err: any) {
      setFriendErrors({ form: err?.message || 'Failed to save friend. Please try again.' });
    } finally {
      setSavingFriend(false);
    }
  };

  /* ───────────────────────── friends: delete ───────────────────────── */

  const deleteFriend = async (friend: Friend): Promise<string | null> => {
    try {
      const { error } = await supabase.from('friends').delete().eq('id', friend.id);
      if (error) throw error;

      if (user) {
        await supabase.from('logs').insert({ user_id: user.id, details: `deleted friend "${friend.full_name || friend.id}".` });
      }
      setFriends((prev) => prev.filter((f) => f.id !== friend.id));
      showToast('Friend deleted');
      return null;
    } catch (err: any) {
      return err?.message || 'Failed to delete friend.';
    }
  };

  /* ───────────────────────── splits: delete ───────────────────────── */

  const deleteSplit = async (split: ActiveSplit): Promise<string | null> => {
    try {
      const { error } = await supabase.from('split_expenses').delete().eq('id', split.id);
      if (error) throw error;

      if (user) {
        await supabase.from('logs').insert({ user_id: user.id, details: `deleted split expense "${split.description || split.id}".` });
      }
      setActiveSplits((prev) => prev.filter((x) => x.id !== split.id));
      showToast('Split deleted');
      return null;
    } catch (err: any) {
      return err?.message || 'Failed to delete split.';
    }
  };

  const requestDeleteSplit = (split: ActiveSplit) =>
    setConfirmCfg({
      key: `split-${split.id}`,
      icon: 'trash-outline',
      tone: 'danger',
      title: 'Delete this split?',
      message: `“${split.description}” and all of its payment records will be permanently removed. This can’t be undone.`,
      confirmLabel: 'Delete split',
      onConfirm: () => deleteSplit(split),
    });

  /* ───────────────────────── splits: create ───────────────────────── */

  const openCreate = () => {
    setDescription('');
    setAmount('');
    setSplitType('EQUAL');
    setSelectedFriends([]);
    setCustomShares({});
    setCreateErrors(NO_CREATE_ERRORS);
    if (categories.length > 0) setSelectedCategoryId(categories[0].id);
    setCreateOpen(true);
  };

  const toggleSelectFriend = (friendId: string) => {
    setCreateErrors((p) => ({ ...p, friends: undefined, sharesTotal: undefined }));
    setSelectedFriends((prev) => {
      if (prev.includes(friendId)) {
        setCustomShares((cs) => {
          const next = { ...cs };
          delete next[friendId];
          return next;
        });
        return prev.filter((id) => id !== friendId);
      }
      return [...prev, friendId];
    });
  };

  const handleCustomShareChange = (friendId: string, val: string) => {
    setCustomShares((prev) => ({ ...prev, [friendId]: sanitizeAmount(val) }));
    setCreateErrors((p) => {
      const shares = { ...p.shares };
      delete shares[friendId];
      return { ...p, shares, sharesTotal: undefined };
    });
  };

  const sendNewSplitEmails = async (
    payload: { friend_id: string; owed_amount: number }[],
    total: number,
    desc: string,
    senderName?: string
  ) => {
    try {
      for (const item of payload) {
        const friend = friends.find((f) => f.id === item.friend_id);
        if (!friend?.email) continue;
        await emailjs.send(
          EMAILJS.serviceId,
          EMAILJS.templateId,
          {
            email: friend.email,
            email_subject: `New Split Expense Added: ${desc}`,
            friend_name: friend.full_name,
            intro_message: 'You have been added to a new split expense.',
            description: desc,
            total_amount: total.toFixed(2),
            amount: (item.owed_amount || 0).toFixed(2),
            call_to_action: 'Please settle your balance accordingly. Thank you!',
            sender_name: senderName,
          },
          EMAILJS.publicKey
        );
      }
    } catch (err) {
      console.error('FAILED sending split emails...', err);
    }
  };

  const handleCreateSplit = async () => {
    if (creating || !user) return;

    const errs: CreateErrors = { shares: {} };
    const numericAmount = parseFloat(amount);
    const amountOk = !isNaN(numericAmount) && numericAmount > 0;

    if (!amountOk) errs.amount = 'Enter an amount greater than 0.';
    if (!description.trim()) errs.description = 'Add a short description, like “Dinner”.';
    if (selectedFriends.length === 0) errs.friends = 'Select at least one friend to split with.';

    let payload: { friend_id: string; owed_amount: number }[] = [];
    let ownerShare = 0;

    if (amountOk && selectedFriends.length > 0) {
      if (splitType === 'EQUAL') {
        const share = parseFloat((numericAmount / (selectedFriends.length + 1)).toFixed(2));
        ownerShare = share;
        payload = selectedFriends.map((id) => ({ friend_id: id, owed_amount: share }));
      } else {
        let sum = 0;
        for (const id of selectedFriends) {
          const v = parseFloat(customShares[id] || '');
          if (isNaN(v) || v <= 0) errs.shares[id] = 'Enter an amount above 0.';
          else {
            sum += v;
            payload.push({ friend_id: id, owed_amount: v });
          }
        }
        if (Object.keys(errs.shares).length === 0 && sum > numericAmount + 0.001) {
          errs.sharesTotal = `Shares add up to ${peso(sum)}, which is more than the ${peso(numericAmount)} total.`;
        }
        ownerShare = parseFloat((numericAmount - sum).toFixed(2));
      }
    }

    const failed = [
      errs.amount && 'amount',
      errs.description && 'description',
      errs.friends && 'friends',
      (Object.keys(errs.shares).length > 0 || errs.sharesTotal) && 'shares',
    ].filter(Boolean) as string[];

    if (failed.length > 0) {
      setCreateErrors(errs);
      createFields.scrollToFirst(failed);
      return;
    }

    setCreating(true);
    setCreateErrors(NO_CREATE_ERRORS);

    try {
      // 1. active income + remaining balance
      const { data: latestIncome, error: incomeErr } = await supabase
        .from('income')
        .select('id, amount')
        .eq('user_id', user.id)
        .eq('is_archived', false)
        .order('received_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (incomeErr) throw incomeErr;

      if (!latestIncome) {
        setCreateErrors({ shares: {}, form: 'No active income found. Add an income before splitting an expense.' });
        return;
      }

      const { data: incomeExpenses, error: expErr } = await supabase
        .from('expenses')
        .select('amount')
        .eq('income_id', latestIncome.id);
      if (expErr) throw expErr;

      const spent = (incomeExpenses || []).reduce((sum, e) => sum + (e.amount || 0), 0);
      const remaining = latestIncome.amount - spent;

      if (numericAmount > remaining) {
        setCreateErrors({
          shares: {},
          amount: `This is more than your remaining income balance of ${peso(remaining)}.`,
        });
        createFields.scrollToFirst(['amount']);
        return;
      }

      // 2. split_expenses
      const { data: splitExp, error: splitErr } = await supabase
        .from('split_expenses')
        .insert([
          {
            user_id: user.id,
            description: description.trim(),
            total_amount: numericAmount,
            personal_share: ownerShare,
            created_at: new Date().toISOString(),
            split_type: splitType,
            category_id: selectedCategoryId,
          },
        ])
        .select()
        .single();
      if (splitErr) throw splitErr;

      const { error: friendsErr } = await supabase.from('split_friends').insert(
        payload.map((f) => ({
          split_expense_id: splitExp.id,
          friend_id: f.friend_id,
          owed_amount: f.owed_amount,
          status: 'unpaid',
          updated_at: new Date().toISOString(),
        }))
      );
      if (friendsErr) throw friendsErr;

      // 3. mirror in the general expenses table
      const { error: expenseErr } = await supabase.from('expenses').insert([
        {
          user_id: user.id,
          amount: numericAmount,
          description: description.trim(),
          category_id: selectedCategoryId,
          income_id: latestIncome.id,
          spent_at: new Date().toISOString(),
        },
      ]);
      if (expenseErr) console.error('Failed to log in expenses table:', expenseErr.message);

      // 4. notify friends (in the background, so the sheet closes right away)
      void sendNewSplitEmails(payload, numericAmount, description.trim(), myProfile?.full_name);

      await supabase.from('logs').insert({
        user_id: user.id,
        details: `created split expense "${description.trim()}" (${numericAmount}).`,
      });

      setCreateOpen(false);
      showToast('Split created and added to your expenses');
      fetchData(user.id);
    } catch (err: any) {
      setCreateErrors({ shares: {}, form: err?.message || 'Failed to create the split. Please try again.' });
    } finally {
      setCreating(false);
    }
  };

  /* ───────────────────────── settle a payment ───────────────────────── */

  const openSettle = (split: ActiveSplit, sf: ActiveSplitFriend) => {
    setSettleTarget({ split, sf });
    setPayAmount((sf.owed_amount || 0).toFixed(2));
    setPayError(undefined);
  };

  const handleConfirmSettle = async () => {
    if (!user || !settleTarget || settling) return;

    const paid = parseFloat(payAmount);
    if (isNaN(paid) || paid <= 0) {
      setPayError('Enter the amount you received.');
      return;
    }

    setSettling(true);
    setPayError(undefined);

    try {
      const { sf, split } = settleTarget;

      const { data: latestIncome, error: incomeErr } = await supabase
        .from('income')
        .select('id, amount')
        .eq('user_id', user.id)
        .eq('is_archived', false)
        .order('received_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (incomeErr) throw incomeErr;
      if (!latestIncome) throw new Error('No active income found. Add an income before settling payments.');

      const friendName = sf.friends?.full_name || 'Friend';
      const newOwed = parseFloat(Math.max(0, (sf.owed_amount || 0) - paid).toFixed(2));
      const fullyPaid = newOwed === 0;

      const { error: updateErr } = await supabase
        .from('split_friends')
        .update({ owed_amount: newOwed, status: fullyPaid ? 'paid' : 'unpaid', updated_at: new Date().toISOString() })
        .eq('id', sf.id);
      if (updateErr) throw updateErr;

      const { error: incomeUpdateErr } = await supabase
        .from('income')
        .update({ amount: (parseFloat(latestIncome.amount) || 0) + paid })
        .eq('id', latestIncome.id);
      if (incomeUpdateErr) throw incomeUpdateErr;

      await supabase.from('logs').insert({
        user_id: user.id,
        details: `settled split payment of ₱${paid.toFixed(2)} from "${friendName}".`,
      });

      // optimistic update, then re-sync
      setActiveSplits((prev) =>
        prev.map((x) =>
          x.id === split.id
            ? {
                ...x,
                split_friends: x.split_friends.map((f) =>
                  f.id === sf.id ? { ...f, owed_amount: newOwed, status: fullyPaid ? 'paid' : 'unpaid' } : f
                ),
              }
            : x
        )
      );

      setSettleTarget(null);
      showToast(
        fullyPaid
          ? `${friendName} is fully settled (${peso(paid)} received)`
          : `${peso(paid)} received from ${friendName}. ${peso(newOwed)} left`
      );
      fetchData(user.id);
    } catch (err: unknown) {
      setPayError(err instanceof Error ? err.message : 'Failed to record payment.');
    } finally {
      setSettling(false);
    }
  };

  /* ───────────────────────── reminders ───────────────────────── */

  const handleSendReminder = async (sf: ActiveSplitFriend, split: ActiveSplit) => {
    if (remindingId || !sf.friends?.email) return;
    setRemindingId(sf.id);
    try {
      await emailjs.send(
        EMAILJS.serviceId,
        EMAILJS.templateId,
        {
          email: sf.friends.email,
          email_subject: `Reminder: Balance for ${split.description}`,
          friend_name: sf.friends.full_name,
          intro_message: 'This is a friendly reminder that you still have a remaining balance for this expense.',
          description: split.description,
          total_amount: (split.total_amount || 0).toFixed(2),
          amount: (sf.owed_amount || 0).toFixed(2),
          call_to_action: 'Please settle this at your earliest convenience. Thank you!',
          sender_name: myProfile?.full_name,
        },
        EMAILJS.publicKey
      );
      showToast(`Reminder sent to ${sf.friends.full_name}`);
    } catch (err: any) {
      console.error('Reminder failed:', err);
      showToast(err?.text || err?.message || 'Could not send the reminder.', 'error');
    } finally {
      setRemindingId(null);
    }
  };

  /* ───────────────────────────── render ───────────────────────────── */

  const friendDeleteCfg: ConfirmCfg | null = shownManageFriend
    ? {
        key: `friend-${shownManageFriend.id}`,
        icon: 'person-remove-outline',
        tone: 'danger',
        title: `Delete ${shownManageFriend.full_name}?`,
        message: 'They will be removed from your friends list. This can’t be undone.',
        confirmLabel: 'Delete friend',
        onConfirm: () => deleteFriend(shownManageFriend),
      }
    : null;

  const closeManage = () => setManageFriend(null);

  return (
    <View style={s.container}>
      <StatusBar style="light" />

      {/* HEADER */}
      <View
        style={[
          headerStyles.topBackgroundHeader,
          { paddingTop: Platform.OS === 'android' ? insets.top + 12 : insets.top + 8 },
        ]}
      >
        <View style={headerStyles.headerGradientFill} pointerEvents="none">
          <GradientBackground id="split-header-gradient" />
        </View>

        <View style={headerStyles.header}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => router.push('/home')}
            style={headerStyles.headerActionButton}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="chevron-back" size={22} color={colors.white} />
          </TouchableOpacity>

          <View style={headerStyles.headerContent}>
            <Text style={headerStyles.headerTitle} numberOfLines={1}>
              Split Expense
            </Text>
          </View>

          <TouchableOpacity
            style={s.newButton}
            onPress={openCreate}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Create a new split"
          >
            <Ionicons name="add" size={18} color={colors.white} />
            <Text style={s.newButtonText}>New</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* CONTENT SHEET */}
      <View style={s.contentSheet}>
        {initialLoading ? (
          <SplitSkeleton />
        ) : (
          <ScrollView
            contentContainerStyle={s.scrollContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => loadAll('refresh')}
                colors={[colors.accent]}
                tintColor={colors.accent}
              />
            }
          >
            {/* SUMMARY */}
            <View style={s.summaryRow}>
              <View style={[s.summaryCard, s.summaryPrimary]}>
                <View style={s.summaryIcon}>
                  <Ionicons name="arrow-down-circle-outline" size={18} color={colors.white} />
                </View>
                <Text style={s.summaryPrimaryLabel}>To collect</Text>
                <Text style={s.summaryPrimaryValue} numberOfLines={1} adjustsFontSizeToFit>
                  {peso(toCollect)}
                </Text>
              </View>
              <View style={[s.summaryCard, s.summarySecondary]}>
                <View style={[s.summaryIcon, { backgroundColor: colors.brandWash }]}>
                  <Ionicons name="time-outline" size={18} color={colors.brand} />
                </View>
                <Text style={s.summarySecondaryLabel}>Open splits</Text>
                <Text style={s.summarySecondaryValue}>{openSplits}</Text>
              </View>
            </View>

            {/* FRIENDS */}
            <View style={[s.sectionHeader, { marginTop: space[24] }]}>
              <Text style={s.sectionTitle}>Friends</Text>
              <Text style={s.sectionCount}>{friends.length} {friends.length === 1 ? 'friend' : 'friends'}</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.friendsStrip}>
              <TouchableOpacity
                style={s.friendTile}
                onPress={openAddFriend}
                accessibilityRole="button"
                accessibilityLabel="Add a friend"
              >
                <View style={s.addCircle}>
                  <Ionicons name="add" size={24} color={colors.brand} />
                </View>
                <Text style={s.friendName}>Add</Text>
              </TouchableOpacity>

              {friendsNewestFirst.map((f) => (
                <TouchableOpacity
                  key={f.id}
                  style={s.friendTile}
                  onPress={() => {
                    setManageView('menu');
                    setManageFriend(f);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Manage ${f.full_name}`}
                >
                  <Avatar uri={f.avatar_url} size={56} />
                  <Text style={s.friendName} numberOfLines={1}>
                    {f.full_name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* HISTORY */}
            <View style={[s.sectionHeader, { marginTop: space[24] }]}>
              <Text style={s.sectionTitle}>Split history</Text>
              <Text style={s.sectionCount}>{activeSplits.length} {activeSplits.length === 1 ? 'split' : 'splits'}</Text>
            </View>

            {activeSplits.length === 0 ? (
              <View style={s.empty}>
                <View style={s.emptyIcon}>
                  <Ionicons name="receipt-outline" size={28} color={colors.brand} />
                </View>
                <Text style={s.emptyTitle}>No splits yet</Text>
                <Text style={s.emptyText}>Split a bill with friends and track who has paid you back.</Text>
                <Button label="Create your first split" icon="add" onPress={openCreate} style={{ marginTop: space[16], alignSelf: 'stretch' }} />
              </View>
            ) : (
              activeSplits.map((item) => {
                const members = item.split_friends || [];
                const isSettled = (f: ActiveSplitFriend) => f.status === 'paid' && f.owed_amount <= 0;
                const settledCount = members.filter(isSettled).length;
                const progress = members.length ? settledCount / members.length : 0;
                const allSettled = members.length > 0 && settledCount === members.length;

                return (
                  <View key={item.id} style={s.card}>
                    <View style={s.cardTop}>
                      <View style={s.categoryIcon}>
                        <Ionicons name={(item.categories?.icon as IoniconName) || 'people-outline'} size={22} color={colors.accent} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.cardTitle} numberOfLines={1}>
                          {item.description}
                        </Text>
                        <Text style={s.cardMeta}>{formatDate(item.created_at)}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={s.cardTotal}>{peso(item.total_amount)}</Text>
                        <Text style={s.cardTotalLabel}>Total</Text>
                      </View>
                      <TouchableOpacity
                        style={s.iconButton}
                        onPress={() => requestDeleteSplit(item)}
                        hitSlop={6}
                        accessibilityRole="button"
                        accessibilityLabel={`Delete ${item.description}`}
                      >
                        <Ionicons name="trash-outline" size={18} color={colors.dangerBright} />
                      </TouchableOpacity>
                    </View>

                    {/* progress */}
                    <View style={s.progressRow}>
                      <Text style={s.progressLabel}>
                        {allSettled ? 'Everyone has paid' : `${settledCount} of ${members.length} settled`}
                      </Text>
                      {allSettled ? <Ionicons name="checkmark-circle" size={16} color={colors.success} /> : null}
                    </View>
                    <View style={s.progressTrack}>
                      <View
                        style={[
                          s.progressFill,
                          { width: `${Math.round(progress * 100)}%`, backgroundColor: allSettled ? colors.success : colors.accent },
                        ]}
                      />
                    </View>

                    {/* me */}
                    <View style={s.memberRow}>
                      <Avatar uri={myProfile?.avatar_url} size={36} />
                      <View style={s.memberInfo}>
                        <Text style={s.memberName}>Me</Text>
                        <Text style={s.memberSub}>My share</Text>
                      </View>
                      <Text style={s.memberAmount}>{peso(item.personal_share)}</Text>
                      <View style={s.payerBadge}>
                        <Text style={s.payerBadgeText}>Payer</Text>
                      </View>
                    </View>

                    {/* friends */}
                    {members.map((sf) => {
                      const paid = isSettled(sf);
                      const name = sf.friends?.full_name || 'Friend';
                      const canRemind = !paid && !!sf.friends?.email;
                      return (
                        <View key={sf.id} style={[s.memberRow, s.memberRowBorder]}>
                          <Avatar uri={sf.friends?.avatar_url} size={36} />
                          <View style={s.memberInfo}>
                            <Text style={s.memberName} numberOfLines={1}>
                              {name}
                            </Text>
                            <Text style={s.memberSub}>{paid ? 'Settled' : 'Owes you'}</Text>
                          </View>
                          <Text style={[s.memberAmount, paid && { color: colors.textSubtle }]}>{peso(sf.owed_amount)}</Text>

                          {paid ? (
                            <View style={s.paidPill}>
                              <Ionicons name="checkmark-circle" size={14} color={colors.success} />
                              <Text style={s.paidPillText}>Paid</Text>
                            </View>
                          ) : (
                            <View style={s.memberActions}>
                              {canRemind ? (
                                <TouchableOpacity
                                  style={s.bellButton}
                                  onPress={() => handleSendReminder(sf, item)}
                                  disabled={remindingId === sf.id}
                                  hitSlop={6}
                                  accessibilityRole="button"
                                  accessibilityLabel={`Send ${name} a reminder`}
                                >
                                  {remindingId === sf.id ? (
                                    <ActivityIndicator size="small" color={colors.textMuted} />
                                  ) : (
                                    <Ionicons name="notifications-outline" size={18} color={colors.textMuted} />
                                  )}
                                </TouchableOpacity>
                              ) : null}
                              <TouchableOpacity
                                style={s.settleButton}
                                onPress={() => openSettle(item, sf)}
                                accessibilityRole="button"
                                accessibilityLabel={`Record a payment from ${name}`}
                              >
                                <Text style={s.settleButtonText}>Settle</Text>
                              </TouchableOpacity>
                            </View>
                          )}
                        </View>
                      );
                    })}
                  </View>
                );
              })
            )}
          </ScrollView>
        )}
      </View>

      <Toast toast={toast} bottom={TOAST_BOTTOM} />

      {/* ───────────── CREATE SPLIT ───────────── */}
      <BottomSheet
        visible={createOpen}
        onClose={() => !creating && setCreateOpen(false)}
        dismissable={!creating}
        title="New split"
        subtitle="Split an expense with your friends"
        scrollRef={createFields.scrollRef}
        footer={
          <>
            <FieldError message={createErrors.form} />
            <Button
              label={creating ? 'Saving…' : 'Create split'}
              icon="checkmark-circle-outline"
              loading={creating}
              onPress={handleCreateSplit}
              style={createErrors.form ? { marginTop: space[10] } : undefined}
            />
          </>
        }
      >
        <Field label="Total amount" error={createErrors.amount} onLayout={createFields.onLayout('amount')}>
          <Input
            large
            prefix="₱"
            placeholder="0.00"
            keyboardType="decimal-pad"
            value={amount}
            error={!!createErrors.amount}
            onChangeText={(t) => {
              setAmount(sanitizeAmount(t));
              if (createErrors.amount) setCreateErrors((p) => ({ ...p, amount: undefined }));
            }}
          />
        </Field>

        <Field label="Description" error={createErrors.description} onLayout={createFields.onLayout('description')}>
          <Input
            placeholder="e.g. Dinner with friends"
            value={description}
            error={!!createErrors.description}
            returnKeyType="done"
            onChangeText={(t) => {
              setDescription(t);
              if (createErrors.description) setCreateErrors((p) => ({ ...p, description: undefined }));
            }}
          />
        </Field>

        {categories.length > 0 ? (
          <Field label="Category">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
              {categories.map((cat) => {
                const on = selectedCategoryId === cat.id;
                return (
                  <TouchableOpacity
                    key={cat.id}
                    style={[s.chip, on && s.chipOn]}
                    onPress={() => setSelectedCategoryId(cat.id)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                  >
                    <Text style={[s.chipText, on && s.chipTextOn]}>{cat.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </Field>
        ) : null}

        <Field label="Split method">
          <View style={s.segment}>
            {(['EQUAL', 'CUSTOM'] as SplitType[]).map((t) => {
              const on = splitType === t;
              return (
                <TouchableOpacity
                  key={t}
                  style={[s.segmentBtn, on && s.segmentBtnOn]}
                  onPress={() => {
                    setSplitType(t);
                    setCreateErrors((p) => ({ ...p, shares: {}, sharesTotal: undefined }));
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                >
                  <Text style={[s.segmentText, on && s.segmentTextOn]}>{t === 'EQUAL' ? 'Split equally' : 'Custom amounts'}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Field>

        <Field label="Split with" error={createErrors.friends} onLayout={createFields.onLayout('friends')}>
          {friends.length === 0 ? (
            <View style={s.noFriends}>
              <Text style={s.noFriendsText}>You haven’t added any friends yet.</Text>
              <TouchableOpacity
                onPress={() => {
                  setCreateOpen(false);
                  afterSheet(openAddFriend);
                }}
                accessibilityRole="button"
              >
                <Text style={s.linkText}>Add a friend</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={s.chipWrap}>
              {friends.map((f) => {
                const on = selectedFriends.includes(f.id);
                return (
                  <TouchableOpacity
                    key={f.id}
                    style={[s.friendChip, on && s.chipOn, createErrors.friends && !on ? s.chipError : null]}
                    onPress={() => toggleSelectFriend(f.id)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                  >
                    <Avatar uri={f.avatar_url} size={24} />
                    <Text style={[s.chipText, on && s.chipTextOn]} numberOfLines={1}>
                      {f.full_name}
                    </Text>
                    {on ? <Ionicons name="checkmark-circle" size={16} color={colors.accent} /> : null}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </Field>

        {splitType === 'CUSTOM' && selectedFriends.length > 0 ? (
          <View style={s.customSection} onLayout={createFields.onLayout('shares')}>
            <Text style={s.customTitle}>How much does each friend owe?</Text>
            {selectedFriends.map((id) => {
              const f = friends.find((x) => x.id === id);
              const err = createErrors.shares[id];
              return (
                <View key={id} style={{ marginBottom: space[10] }}>
                  <View style={s.customRow}>
                    <Avatar uri={f?.avatar_url} size={28} />
                    <Text style={s.customName} numberOfLines={1}>
                      {f?.full_name || 'Friend'}
                    </Text>
                    <View style={{ width: 120 }}>
                      <Input
                        prefix="₱"
                        placeholder="0.00"
                        keyboardType="decimal-pad"
                        value={customShares[id] || ''}
                        error={!!err}
                        onChangeText={(v) => handleCustomShareChange(id, v)}
                        style={{ textAlign: 'right' }}
                      />
                    </View>
                  </View>
                  <FieldError message={err} />
                </View>
              );
            })}
            <FieldError
              message={createErrors.sharesTotal || (preview && preview.over > 0 ? `Shares exceed the total by ${peso(preview.over)}.` : undefined)}
            />
          </View>
        ) : null}

        {preview ? (
          <View style={s.previewCard}>
            <View style={s.previewRow}>
              <Text style={s.previewLabel}>Your share</Text>
              <Text style={s.previewValue}>{peso(preview.owner)}</Text>
            </View>
            {preview.each !== null ? (
              <View style={s.previewRow}>
                <Text style={s.previewLabel}>Each friend pays</Text>
                <Text style={s.previewValue}>{peso(preview.each)}</Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </BottomSheet>

      {/* ───────────── ADD / EDIT FRIEND ───────────── */}
      <BottomSheet
        visible={friendSheetOpen}
        onClose={() => !savingFriend && setFriendSheetOpen(false)}
        dismissable={!savingFriend}
        title={editingFriend ? 'Edit friend' : 'Add a friend'}
        subtitle={editingFriend ? undefined : 'Save someone you split expenses with'}
        footer={
          <>
            <FieldError message={friendErrors.form} />
            <Button
              label={savingFriend ? 'Saving…' : editingFriend ? 'Save changes' : 'Add friend'}
              loading={savingFriend}
              onPress={handleSaveFriend}
              style={friendErrors.form ? { marginTop: space[10] } : undefined}
            />
          </>
        }
      >
        <View style={s.photoBlock}>
          <View>
            <Avatar uri={friendImageUri} size={88} />
            <View style={s.photoBadge}>
              <Ionicons name="camera" size={14} color={colors.white} />
            </View>
          </View>
          <View style={s.photoActions}>
            <TouchableOpacity style={s.smallButton} onPress={() => pickImage(false)} accessibilityRole="button">
              <Ionicons name="images-outline" size={16} color={colors.textSecondary} />
              <Text style={s.smallButtonText}>Gallery</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.smallButton} onPress={() => pickImage(true)} accessibilityRole="button">
              <Ionicons name="camera-outline" size={16} color={colors.textSecondary} />
              <Text style={s.smallButtonText}>Camera</Text>
            </TouchableOpacity>
            {friendImageUri ? (
              <TouchableOpacity style={s.smallButton} onPress={() => setFriendImageUri(null)} accessibilityRole="button">
                <Ionicons name="trash-outline" size={16} color={colors.danger} />
                <Text style={[s.smallButtonText, { color: colors.danger }]}>Remove</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          <FieldError message={friendErrors.photo} />
        </View>

        <Field label="Full name" error={friendErrors.name}>
          <Input
            placeholder="e.g. Maria Santos"
            value={newFriendName}
            error={!!friendErrors.name}
            autoCapitalize="words"
            onChangeText={(t) => {
              setNewFriendName(t);
              if (friendErrors.name) setFriendErrors((p) => ({ ...p, name: undefined }));
            }}
          />
        </Field>

        <Field
          label="Email"
          optional
          error={friendErrors.email}
          hint="Used to send payment reminders and split notifications."
        >
          <Input
            placeholder="name@email.com"
            value={newFriendEmail}
            error={!!friendErrors.email}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            onChangeText={(t) => {
              setNewFriendEmail(t);
              if (friendErrors.email) setFriendErrors((p) => ({ ...p, email: undefined }));
            }}
          />
        </Field>
      </BottomSheet>

      {/* ───────────── MANAGE FRIEND ───────────── */}
      <BottomSheet visible={!!manageFriend} onClose={closeManage} title="Manage friend">
        {shownManageFriend ? (
          manageView === 'menu' ? (
            <>
              <View style={s.profileCard}>
                <Avatar uri={shownManageFriend.avatar_url} size={56} />
                <View style={{ flex: 1 }}>
                  <Text style={s.profileName} numberOfLines={1}>
                    {shownManageFriend.full_name}
                  </Text>
                  <Text style={s.profileEmail} numberOfLines={1}>
                    {shownManageFriend.email || 'No email on file'}
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                style={s.actionRow}
                accessibilityRole="button"
                onPress={() => {
                  const f = shownManageFriend;
                  closeManage();
                  afterSheet(() => openEditFriend(f));
                }}
              >
                <View style={s.actionIcon}>
                  <Ionicons name="pencil-outline" size={18} color={colors.brand} />
                </View>
                <Text style={s.actionText}>Edit details</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} />
              </TouchableOpacity>

              <TouchableOpacity style={s.actionRow} accessibilityRole="button" onPress={() => setManageView('confirm')}>
                <View style={[s.actionIcon, { backgroundColor: colors.dangerBg }]}>
                  <Ionicons name="trash-outline" size={18} color={colors.danger} />
                </View>
                <Text style={[s.actionText, { color: colors.danger }]}>Delete friend</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} />
              </TouchableOpacity>
            </>
          ) : friendDeleteCfg ? (
            <ConfirmBody
              key={friendDeleteCfg.key}
              cfg={friendDeleteCfg}
              onCancel={() => setManageView('menu')}
              onDone={closeManage}
            />
          ) : null
        ) : null}
      </BottomSheet>

      {/* ───────────── RECORD PAYMENT ───────────── */}
      <BottomSheet
        visible={!!settleTarget}
        onClose={() => !settling && setSettleTarget(null)}
        dismissable={!settling}
        title="Record payment"
        subtitle={shownSettle?.split.description}
        footer={
          <Button
            label={settling ? 'Saving…' : 'Confirm payment'}
            icon="checkmark-circle-outline"
            loading={settling}
            onPress={handleConfirmSettle}
          />
        }
      >
        {shownSettle ? (
          <>
            <View style={s.profileCard}>
              <Avatar uri={shownSettle.sf.friends?.avatar_url} size={48} />
              <View style={{ flex: 1 }}>
                <Text style={s.profileEmail}>Received from</Text>
                <Text style={s.profileName} numberOfLines={1}>
                  {shownSettle.sf.friends?.full_name || 'Friend'}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={s.profileEmail}>Balance owed</Text>
                <Text style={s.owedValue}>{peso(shownSettle.sf.owed_amount)}</Text>
              </View>
            </View>

            <Field label="Amount received" error={payError}>
              <Input
                large
                prefix="₱"
                placeholder="0.00"
                keyboardType="decimal-pad"
                value={payAmount}
                error={!!payError}
                onChangeText={(t) => {
                  setPayAmount(sanitizeAmount(t));
                  if (payError) setPayError(undefined);
                }}
              />
            </Field>

            <View style={s.quickRow}>
              <TouchableOpacity
                style={s.chip}
                accessibilityRole="button"
                onPress={() => {
                  setPayAmount((shownSettle.sf.owed_amount || 0).toFixed(2));
                  setPayError(undefined);
                }}
              >
                <Text style={s.chipText}>Full balance</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.chip}
                accessibilityRole="button"
                onPress={() => {
                  setPayAmount(((shownSettle.sf.owed_amount || 0) / 2).toFixed(2));
                  setPayError(undefined);
                }}
              >
                <Text style={s.chipText}>Half</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : null}
      </BottomSheet>

      {/* ───────────── CONFIRM (delete split) ───────────── */}
      <BottomSheet visible={!!confirmCfg} onClose={() => setConfirmCfg(null)}>
        {shownConfirm ? (
          <ConfirmBody key={shownConfirm.key} cfg={shownConfirm} onCancel={() => setConfirmCfg(null)} onDone={() => setConfirmCfg(null)} />
        ) : null}
      </BottomSheet>
    </View>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Styles
 * ──────────────────────────────────────────────────────────────────────────── */

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  // header button
  newButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[4],
    height: 36,
    paddingHorizontal: space[12],
    borderRadius: radius.md,
    backgroundColor: colors.alpha.white[20],
    borderWidth: 1,
    borderColor: colors.alpha.white[30],
  },
  newButtonText: { color: colors.white, fontSize: fontSize.caption, fontFamily: fontFamily.semibold },

  // content sheet that overlaps the gradient header
  contentSheet: {
    flex: 1,
    marginTop: -theme.layout.sheetOverlap,
    borderTopLeftRadius: theme.layout.sheetRadius,
    borderTopRightRadius: theme.layout.sheetRadius,
    overflow: 'hidden',
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingHorizontal: space[20],
    paddingTop: space[24],
    paddingBottom: theme.layout.tabBarClearance,
  },

  // avatar
  avatarImage: { backgroundColor: colors.surfaceAlt },
  avatarSilhouette: {
    backgroundColor: colors.border,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'flex-end',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },

  // summary
  summaryRow: { flexDirection: 'row', gap: space[12] },
  summaryCard: { borderRadius: radius.lg, padding: space[16], minHeight: 92, justifyContent: 'space-between' },
  summaryPrimary: { flex: 1.45, backgroundColor: colors.brand, ...theme.shadow.md },
  summarySecondary: { flex: 1, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  summaryIcon: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    backgroundColor: colors.alpha.white[20],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space[8],
  },
  summaryPrimaryLabel: { fontSize: fontSize.small, fontFamily: fontFamily.semibold, color: colors.alpha.white[82] },
  summaryPrimaryValue: { fontSize: fontSize.display, fontFamily: fontFamily.extrabold, color: colors.white, letterSpacing: -0.5 },
  summarySecondaryLabel: { fontSize: fontSize.small, fontFamily: fontFamily.semibold, color: colors.textMuted },
  summarySecondaryValue: { fontSize: fontSize.display, fontFamily: fontFamily.extrabold, color: colors.textStrong, letterSpacing: -0.5 },

  // sections
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: space[12] },
  sectionTitle: { fontSize: fontSize.subtitle, fontFamily: fontFamily.extrabold, color: colors.textStrong, letterSpacing: -0.2 },
  sectionCount: { fontSize: fontSize.small, fontFamily: fontFamily.medium, color: colors.textMuted },

  // friends strip
  friendsStrip: { gap: space[16], paddingRight: space[8] },
  skeletonFriends: { flexDirection: 'row', gap: space[16] },
  friendTile: { width: 64, alignItems: 'center', gap: space[6] },
  addCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.brandMid,
    backgroundColor: colors.brandWash,
    alignItems: 'center',
    justifyContent: 'center',
  },
  friendName: { fontSize: fontSize.small, fontFamily: fontFamily.medium, color: colors.textStrong, textAlign: 'center', maxWidth: 64 },

  // empty
  empty: {
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: space[32],
    paddingHorizontal: space[24],
  },
  emptyIcon: {
    width: 60,
    height: 60,
    borderRadius: radius.xl,
    backgroundColor: colors.brandWash,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space[12],
  },
  emptyTitle: { fontSize: fontSize.subtitle, fontFamily: fontFamily.bold, color: colors.textStrong },
  emptyText: { fontSize: fontSize.caption, fontFamily: fontFamily.regular, color: colors.textMuted, textAlign: 'center', marginTop: space[4], lineHeight: 19 },

  // history card
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    padding: space[16],
    marginBottom: space[14],
    borderWidth: 1,
    borderColor: colors.border,
    ...theme.shadow.sm,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: space[12] },
  categoryIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.accentTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { fontSize: fontSize.bodyLg, fontFamily: fontFamily.bold, color: colors.textStrong },
  cardMeta: { fontSize: fontSize.tiny, fontFamily: fontFamily.regular, color: colors.textMuted, marginTop: space[2] },
  cardTotal: { fontSize: fontSize.bodyLg, fontFamily: fontFamily.extrabold, color: colors.textStrong },
  cardTotalLabel: { fontSize: fontSize.micro, fontFamily: fontFamily.regular, color: colors.textMuted },
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    backgroundColor: colors.dangerWash,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // progress
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: space[6], marginTop: space[16], marginBottom: space[6] },
  progressLabel: { fontSize: fontSize.small, fontFamily: fontFamily.semibold, color: colors.textSecondary },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: colors.surfaceAlt, overflow: 'hidden', marginBottom: space[6] },
  progressFill: { height: 6, borderRadius: 3 },

  // member rows
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: space[10], paddingVertical: space[10] },
  memberRowBorder: { borderTopWidth: 1, borderTopColor: colors.borderLight },
  memberInfo: { flex: 1, minWidth: 0 },
  memberName: { fontSize: fontSize.body, fontFamily: fontFamily.bold, color: colors.text },
  memberSub: { fontSize: fontSize.tiny, fontFamily: fontFamily.regular, color: colors.textMuted, marginTop: 1 },
  memberAmount: { fontSize: fontSize.body, fontFamily: fontFamily.extrabold, color: colors.textStrong },
  memberActions: { flexDirection: 'row', alignItems: 'center', gap: space[8] },
  bellButton: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  settleButton: { height: 32, paddingHorizontal: space[14], borderRadius: radius.sm, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  settleButtonText: { color: colors.white, fontSize: fontSize.small, fontFamily: fontFamily.bold },
  payerBadge: { height: 28, paddingHorizontal: space[10], borderRadius: radius.sm, backgroundColor: colors.oliveTint, borderWidth: 1, borderColor: colors.limeBorder, justifyContent: 'center' },
  payerBadgeText: { fontSize: fontSize.small, fontFamily: fontFamily.bold, color: colors.oliveDark },
  paidPill: { flexDirection: 'row', alignItems: 'center', gap: space[4], height: 28, paddingHorizontal: space[10], borderRadius: radius.pill, backgroundColor: colors.successBg },
  paidPillText: { fontSize: fontSize.small, fontFamily: fontFamily.bold, color: colors.success },

  // bottom sheet
  sheetRoot: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.xxxl,
    borderTopRightRadius: radius.xxxl,
    overflow: 'hidden',
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 24,
  },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, marginTop: space[10], marginBottom: space[6] },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: space[12], paddingHorizontal: space[20], paddingTop: space[8], paddingBottom: space[12] },
  sheetTitle: { fontSize: fontSize.heading, fontFamily: fontFamily.extrabold, color: colors.textStrong, letterSpacing: -0.3 },
  sheetSubtitle: { fontSize: fontSize.caption, fontFamily: fontFamily.regular, color: colors.textMuted, marginTop: space[2] },
  closeButton: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  sheetContent: { paddingHorizontal: space[20], paddingTop: space[4], paddingBottom: space[16] },
  sheetFooter: { paddingHorizontal: space[20], paddingTop: space[12], borderTopWidth: 1, borderTopColor: colors.borderLight, backgroundColor: colors.white },

  // form
  field: { marginBottom: space[16] },
  label: { fontSize: fontSize.caption, fontFamily: fontFamily.semibold, color: colors.textSecondary, marginBottom: space[6] },
  labelOptional: { fontFamily: fontFamily.regular, color: colors.textSubtle },
  hint: { fontSize: fontSize.small, fontFamily: fontFamily.regular, color: colors.textMuted, marginTop: space[6] },
  fieldError: { flexDirection: 'row', alignItems: 'flex-start', gap: space[6], marginTop: space[6] },
  fieldErrorText: { flex: 1, fontSize: fontSize.small, fontFamily: fontFamily.medium, color: colors.danger, lineHeight: 17 },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 50,
    paddingHorizontal: space[14],
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  inputWrapLarge: { minHeight: 64, borderRadius: radius.lg, backgroundColor: colors.white },
  inputFocused: { borderColor: colors.accent, backgroundColor: colors.white },
  inputError: { borderColor: colors.danger, backgroundColor: colors.dangerWash },
  inputPrefix: { fontSize: fontSize.subtitle, fontFamily: fontFamily.bold, color: colors.textMuted, marginRight: space[6] },
  inputPrefixLarge: { fontSize: fontSize.heading },
  inputText: { flex: 1, paddingVertical: space[12], fontSize: fontSize.bodyLg, fontFamily: fontFamily.regular, color: colors.textStrong },
  inputTextLarge: { fontSize: fontSize.display, fontFamily: fontFamily.extrabold, letterSpacing: -0.5 },

  // buttons
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space[8], height: 52, borderRadius: radius.lg },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { fontSize: fontSize.bodyLg, fontFamily: fontFamily.bold },
  smallButton: { flexDirection: 'row', alignItems: 'center', gap: space[6], height: 36, paddingHorizontal: space[12], borderRadius: radius.pill, backgroundColor: colors.surfaceAlt },
  smallButtonText: { fontSize: fontSize.small, fontFamily: fontFamily.semibold, color: colors.textSecondary },
  linkText: { fontSize: fontSize.caption, fontFamily: fontFamily.bold, color: colors.accent },

  // chips / segmented
  chipRow: { gap: space[8], paddingVertical: space[2] },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space[8] },
  chip: { paddingHorizontal: space[14], height: 36, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  friendChip: { flexDirection: 'row', alignItems: 'center', gap: space[8], paddingLeft: space[6], paddingRight: space[12], height: 38, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.white, maxWidth: '100%' },
  chipOn: { borderColor: colors.accent, backgroundColor: colors.accentTint },
  chipError: { borderColor: colors.dangerBorder },
  chipText: { fontSize: fontSize.caption, fontFamily: fontFamily.medium, color: colors.textSecondary, flexShrink: 1 },
  chipTextOn: { color: colors.brand, fontFamily: fontFamily.bold },
  segment: { flexDirection: 'row', backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: space[4] },
  segmentBtn: { flex: 1, height: 40, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  segmentBtnOn: { backgroundColor: colors.white, ...theme.shadow.sm },
  segmentText: { fontSize: fontSize.caption, fontFamily: fontFamily.semibold, color: colors.textMuted },
  segmentTextOn: { color: colors.brand, fontFamily: fontFamily.bold },
  noFriends: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[12], padding: space[14], borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  noFriendsText: { flex: 1, fontSize: fontSize.caption, fontFamily: fontFamily.regular, color: colors.textMuted },

  // custom shares + preview
  customSection: { marginBottom: space[16], padding: space[14], borderRadius: radius.lg, backgroundColor: colors.oliveWash, borderWidth: 1, borderColor: colors.limeBorder },
  customTitle: { fontSize: fontSize.caption, fontFamily: fontFamily.bold, color: colors.textStrong, marginBottom: space[12] },
  customRow: { flexDirection: 'row', alignItems: 'center', gap: space[10] },
  customName: { flex: 1, fontSize: fontSize.caption, fontFamily: fontFamily.semibold, color: colors.slate700 },
  previewCard: { padding: space[14], borderRadius: radius.lg, backgroundColor: colors.successWash, borderWidth: 1, borderColor: colors.successBorder, gap: space[8] },
  previewRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  previewLabel: { fontSize: fontSize.caption, fontFamily: fontFamily.semibold, color: colors.textSecondary },
  previewValue: { fontSize: fontSize.subtitle, fontFamily: fontFamily.extrabold, color: colors.success },

  // friend form
  photoBlock: { alignItems: 'center', marginBottom: space[20], gap: space[12] },
  photoBadge: { position: 'absolute', right: 0, bottom: 0, width: 28, height: 28, borderRadius: 14, backgroundColor: colors.brand, borderWidth: 2, borderColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  photoActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: space[8] },

  // manage / settle
  profileCard: { flexDirection: 'row', alignItems: 'center', gap: space[12], padding: space[14], borderRadius: radius.lg, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, marginBottom: space[16] },
  profileName: { fontSize: fontSize.subtitle, fontFamily: fontFamily.bold, color: colors.textStrong },
  profileEmail: { fontSize: fontSize.small, fontFamily: fontFamily.regular, color: colors.textMuted },
  owedValue: { fontSize: fontSize.title, fontFamily: fontFamily.extrabold, color: colors.danger },
  quickRow: { flexDirection: 'row', gap: space[8], marginTop: -space[4] },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: space[12], paddingVertical: space[12], borderTopWidth: 1, borderTopColor: colors.borderLight },
  actionIcon: { width: 36, height: 36, borderRadius: radius.md, backgroundColor: colors.brandWash, alignItems: 'center', justifyContent: 'center' },
  actionText: { flex: 1, fontSize: fontSize.bodyLg, fontFamily: fontFamily.semibold, color: colors.textStrong },

  // confirm
  confirm: { alignItems: 'center', paddingTop: space[8] },
  confirmIcon: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', marginBottom: space[12] },
  confirmTitle: { fontSize: fontSize.heading, fontFamily: fontFamily.extrabold, color: colors.textStrong, textAlign: 'center', letterSpacing: -0.3 },
  confirmMessage: { fontSize: fontSize.caption, fontFamily: fontFamily.regular, color: colors.textMuted, textAlign: 'center', lineHeight: 19, marginTop: space[8], marginBottom: space[8], paddingHorizontal: space[8] },
  confirmActions: { flexDirection: 'row', gap: space[12], alignSelf: 'stretch', marginTop: space[16] },

  // toast
  toast: {
    position: 'absolute',
    left: space[20],
    right: space[20],
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[10],
    paddingVertical: space[12],
    paddingHorizontal: space[16],
    borderRadius: radius.lg,
    backgroundColor: colors.textStrong,
    ...theme.shadow.lg,
  },
  toastText: { flex: 1, fontSize: fontSize.caption, fontFamily: fontFamily.semibold, color: colors.white, lineHeight: 18 },
});
