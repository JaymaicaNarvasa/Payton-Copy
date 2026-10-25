// app/(sponsorTabs)/home.tsx
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  DimensionValue,
  Image,
  KeyboardAvoidingView,
  Modal,
  StatusBar as NativeStatusBar,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleProp,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';

import { supabase } from '../../lib/supabase';

/* ---------- Types ---------- */
interface ConnectedSpender {
  id: string;
  full_name: string;
  avatar_url: string | null;
}

interface WalletTransaction {
  id: string;
  amount: number;
  type: 'add' | 'deduct';
  description: string | null;
  created_at: string;
}

interface SpenderMember {
  id: string;
  spender_id: string;
  name: string;
  email: string;
  status: string;
  avatarUrl?: string | null;
}

interface SelectedSpender {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
}

type Msg = { type: 'error' | 'success'; text: string } | null;
type PeriodKey = 'today' | 'week' | 'nextWeek' | 'month' | 'nextMonth';
type TxFilter = 'all' | 'add' | 'deduct';
type IconName = keyof typeof Ionicons.glyphMap;

type AllowanceErrors = {
  spender?: string;
  name?: string;
  amount?: string;
  period?: string;
  budget?: string;
};

interface BudgetCategory {
  id: string;
  name: string;
  icon: string | null;
}

/* ---------- Design Tokens ---------- */
const COLORS = {
  bg: '#F5F7FA',
  card: '#FFFFFF',
  white: '#FFFFFF',
  primary: '#0F3D2E',
  primarySoft: '#E6F3EB',
  primaryMid: '#2F7D5B',
  accentGreen: '#C1F038',
  textPrimary: '#111827',
  textMuted: '#8E9BAE',
  textSubtle: '#6B7280',
  danger: '#E53E3E',
  dangerSoft: '#FEF2F2',
  dangerBorder: '#FECACA',
  success: '#2E7D32',
  successSoft: '#F0FDF4',
  successBorder: '#BBF7D0',
  border: '#E8ECF1',
  borderLight: '#F0F2F5',
  pendingSoft: '#FEF9C3',
  pendingText: '#A16207',
};

const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This Week' },
  { key: 'nextWeek', label: 'Next Week' },
  { key: 'month', label: 'This Month' },
  { key: 'nextMonth', label: 'Next Month' },
];

const TX_FILTERS: { key: TxFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'add', label: 'Added' },
  { key: 'deduct', label: 'Deducted' },
];

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const AMOUNT_REGEX = /^\d+(\.\d{1,2})?$/;

/** Converts an amount string to integer cents (0 when empty/invalid) to avoid float drift. */
const toCents = (value: string) => {
  const t = (value || '').trim();
  return AMOUNT_REGEX.test(t) ? Math.round(parseFloat(t) * 100) : 0;
};

/* ---------- Helpers ---------- */
const formatPeso = (n: number, fixed = false) =>
  `₱${n.toLocaleString('en-US', {
    minimumFractionDigits: fixed ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;

const getLocalDateString = (year: number, monthIndex: number, day: number) => {
  const d = new Date(year, monthIndex, day);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const date = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${date}`;
};

const formatDisplayDate = (dateStr: string) => {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'long', day: '2-digit', year: 'numeric' });
};

const formatDisplayDateRange = (startStr: string, endStr: string) => {
  if (!startStr) return '';
  if (startStr === endStr) return formatDisplayDate(startStr);

  const [startYear, startMonth, startDay] = startStr.split('-').map(Number);
  const [endYear, endMonth, endDay] = endStr.split('-').map(Number);

  const startDate = new Date(startYear, startMonth - 1, startDay);
  const endDate = new Date(endYear, endMonth - 1, endDay);

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    return `${startStr} - ${endStr}`;
  }

  if (startYear === endYear && startMonth === endMonth) {
    const monthName = startDate.toLocaleDateString('en-US', { month: 'long' });
    return `${monthName} ${String(startDay).padStart(2, '0')} - ${String(endDay).padStart(2, '0')}, ${startYear}`;
  }

  return `${formatDisplayDate(startStr)} - ${formatDisplayDate(endStr)}`;
};

const getPeriodDates = (period: PeriodKey) => {
  const d = new Date();
  const year = d.getFullYear();
  const month = d.getMonth();
  const day = d.getDate();
  const dow = d.getDay();

  if (period === 'today') {
    const todayStr = getLocalDateString(year, month, day);
    return { start: todayStr, end: todayStr };
  }

  if (period === 'week') {
    return {
      start: getLocalDateString(year, month, day - dow),
      end: getLocalDateString(year, month, day + (6 - dow)),
    };
  }

  if (period === 'nextWeek') {
    return {
      start: getLocalDateString(year, month, day + (7 - dow)),
      end: getLocalDateString(year, month, day + (13 - dow)),
    };
  }

  if (period === 'month') {
    return {
      start: getLocalDateString(year, month, 1),
      end: getLocalDateString(year, month + 1, 0),
    };
  }

  return {
    start: getLocalDateString(year, month + 1, 1),
    end: getLocalDateString(year, month + 2, 0),
  };
};

const getFirstName = (fullName: string) => fullName.trim().split(' ')[0] || fullName;

/* ---------- Reusable UI ---------- */

/** Avatar with a built-in default silhouette when there is no photo (or it fails to load). */
function Avatar({ uri, size = 42 }: { uri?: string | null; size?: number }) {
  const [failed, setFailed] = useState(false);

  if (uri && !failed) {
    return (
      <Image
        source={{ uri }}
        onError={() => setFailed(true)}
        style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#E2E8F0' }}
      />
    );
  }

  const head = size * 0.32;
  const body = size * 0.74;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: '#DDF0E5',
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          position: 'absolute',
          width: head,
          height: head,
          borderRadius: head / 2,
          backgroundColor: '#86C4A2',
          top: size * 0.2,
          left: (size - head) / 2,
        }}
      />
      <View
        style={{
          position: 'absolute',
          width: body,
          height: body,
          borderRadius: body / 2,
          backgroundColor: '#86C4A2',
          top: size * 0.6,
          left: (size - body) / 2,
        }}
      />
    </View>
  );
}

/** Pulsing placeholder block used while data is loading. */
function Skeleton({
  width,
  height,
  radius = 10,
  style,
}: {
  width: DimensionValue;
  height: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const opacity = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 750, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.45, duration: 750, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[{ width, height, borderRadius: radius, backgroundColor: '#DFE5EC', opacity }, style]}
    />
  );
}

/** Skeleton version of the whole dashboard body. */
function HomeSkeleton() {
  return (
    <View style={styles.listScrollContent}>
      {/* Wallet card */}
      <Skeleton width="100%" height={214} radius={26} />

      {/* Quick actions */}
      <Skeleton width={110} height={16} radius={8} style={{ marginTop: 24, marginBottom: 12 }} />
      <View style={styles.quickActionsRow}>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} width="31.5%" height={88} radius={18} />
        ))}
      </View>

      {/* Spenders */}
      <View style={[styles.sectionHeader, { marginTop: 24 }]}>
        <Skeleton width={80} height={16} radius={8} />
        <Skeleton width={28} height={20} radius={10} />
      </View>
      <View style={{ flexDirection: 'row', gap: 18 }}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={{ alignItems: 'center' }}>
            <Skeleton width={52} height={52} radius={26} />
            <Skeleton width={36} height={9} radius={5} style={{ marginTop: 8 }} />
          </View>
        ))}
      </View>

      {/* Transactions */}
      <View style={[styles.sectionHeader, { marginTop: 24 }]}>
        <Skeleton width={150} height={16} radius={8} />
        <Skeleton width={60} height={12} radius={6} />
      </View>
      <Skeleton width="100%" height={44} radius={14} style={{ marginBottom: 14 }} />
      <View style={styles.transactionsListContainer}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={styles.txCardItem}>
            <Skeleton width={40} height={40} radius={14} />
            <View style={{ marginLeft: 12, flex: 1, gap: 8 }}>
              <Skeleton width="60%" height={12} radius={6} />
              <Skeleton width="40%" height={10} radius={5} />
            </View>
            <Skeleton width={64} height={14} radius={7} />
          </View>
        ))}
      </View>
    </View>
  );
}

function Banner({ message }: { message: Msg }) {
  if (!message) return null;
  const ok = message.type === 'success';
  return (
    <View style={[styles.banner, ok ? styles.bannerSuccess : styles.bannerError]}>
      <Ionicons
        name={ok ? 'checkmark-circle' : 'alert-circle'}
        size={16}
        color={ok ? COLORS.success : COLORS.danger}
      />
      <Text style={[styles.bannerText, { color: ok ? COLORS.success : COLORS.danger }]}>
        {message.text}
      </Text>
    </View>
  );
}

function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
      {error ? (
        <View style={styles.fieldErrorRow}>
          <Ionicons name="alert-circle" size={13} color={COLORS.danger} />
          <Text style={styles.fieldErrorText}>{error}</Text>
        </View>
      ) : hint ? (
        <Text style={styles.fieldHint}>{hint}</Text>
      ) : null}
    </View>
  );
}

/** One bottom sheet used by every modal so they all look and behave the same. */
function Sheet({
  visible,
  title,
  subtitle,
  onClose,
  children,
  footer,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Modal
      animationType="slide"
      transparent
      visible={visible}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.overlay}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sheetTitle}>{title}</Text>
              {subtitle ? <Text style={styles.sheetSubtitle}>{subtitle}</Text> : null}
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={styles.sheetClose}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close" size={18} color={COLORS.textSubtle} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.sheetBody}
            contentContainerStyle={{ paddingBottom: 6 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>

          {footer ? <View style={styles.sheetFooter}>{footer}</View> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function SheetActions({
  onCancel,
  onSubmit,
  submitLabel,
  cancelLabel = 'Cancel',
  loading = false,
  disabled = false,
  danger = false,
}: {
  onCancel: () => void;
  onSubmit: () => void;
  submitLabel: string;
  cancelLabel?: string;
  loading?: boolean;
  disabled?: boolean;
  danger?: boolean;
}) {
  const submitDisabled = loading || disabled;
  return (
    <View style={styles.actionsRow}>
      <TouchableOpacity
        style={styles.btnSecondary}
        onPress={onCancel}
        disabled={loading}
        activeOpacity={0.8}
      >
        <Text style={styles.btnSecondaryText}>{cancelLabel}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[
          styles.btnPrimary,
          danger && { backgroundColor: COLORS.danger },
          submitDisabled && { opacity: 0.5 },
        ]}
        onPress={onSubmit}
        disabled={submitDisabled}
        activeOpacity={0.85}
      >
        {loading ? (
          <ActivityIndicator size="small" color={COLORS.white} />
        ) : (
          <Text style={styles.btnPrimaryText}>{submitLabel}</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

/* ---------- Screen ---------- */
export default function HomeScreen() {
  const router = useRouter();
  const [connectedSpenders, setConnectedSpenders] = useState<ConnectedSpender[]>([]);
  const [walletTransactions, setWalletTransactions] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sponsorWalletBalance, setSponsorWalletBalance] = useState(0);
  const [balanceHidden, setBalanceHidden] = useState(false);
  const [sponsorProfile, setSponsorProfile] = useState<{
    full_name: string;
    avatar_url: string | null;
    role: string | null;
  } | null>(null);

  // Transaction filter
  const [txFilter, setTxFilter] = useState<TxFilter>('all');

  // Add Spender modal
  const [isAddModalVisible, setIsAddModalVisible] = useState(false);
  const [spenderEmail, setSpenderEmail] = useState('');
  const [spenderEmailError, setSpenderEmailError] = useState<string | undefined>();
  const [submittingSpender, setSubmittingSpender] = useState(false);
  const [addBanner, setAddBanner] = useState<Msg>(null);

  // Add Wallet Balance modal
  const [isWalletModalVisible, setIsWalletModalVisible] = useState(false);
  const [walletAmountInput, setWalletAmountInput] = useState('');
  const [walletAmountError, setWalletAmountError] = useState<string | undefined>();
  const [submittingWallet, setSubmittingWallet] = useState(false);
  const [walletBanner, setWalletBanner] = useState<Msg>(null);

  // Delete Spender modal
  const [isDeleteModalVisible, setIsDeleteModalVisible] = useState(false);
  const [spenderToDelete, setSpenderToDelete] = useState<ConnectedSpender | null>(null);
  const [deletingSpender, setDeletingSpender] = useState(false);
  const [deleteBanner, setDeleteBanner] = useState<Msg>(null);

  // Send Allowance modal
  const [isAllowanceModalVisible, setIsAllowanceModalVisible] = useState(false);
  const [selectedAllowanceSpender, setSelectedAllowanceSpender] = useState<SelectedSpender | null>(null);
  const [allowanceName, setAllowanceName] = useState('');
  const [allowanceAmount, setAllowanceAmount] = useState('');
  const [allowanceErrors, setAllowanceErrors] = useState<AllowanceErrors>({});
  const [submittingAllowance, setSubmittingAllowance] = useState(false);
  const [allowanceBanner, setAllowanceBanner] = useState<Msg>(null);
  const [allowanceCompleted, setAllowanceCompleted] = useState(false);

  // Optional budget allocation
  const [budgetEnabled, setBudgetEnabled] = useState(false);
  const [budgetSheetVisible, setBudgetSheetVisible] = useState(false);
  const [budgetCategories, setBudgetCategories] = useState<BudgetCategory[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [budgetDraft, setBudgetDraft] = useState<Record<string, string>>({});
  const [budgetSaved, setBudgetSaved] = useState<Record<string, string>>({});
  const [budgetRowErrors, setBudgetRowErrors] = useState<Record<string, string | undefined>>({});
  const [budgetListError, setBudgetListError] = useState<string | undefined>();
  const [budgetBanner, setBudgetBanner] = useState<Msg>(null);

  const allowanceAmountCents = toCents(allowanceAmount);
  const budgetSavedCents = Object.values(budgetSaved).reduce((s, v) => s + toCents(v), 0);
  const budgetDraftCents = Object.values(budgetDraft).reduce((s, v) => s + toCents(v), 0);
  const budgetRemainingCents = allowanceAmountCents - budgetDraftCents;
  const budgetMismatch =
    budgetEnabled && budgetSavedCents > 0 && budgetSavedCents !== allowanceAmountCents;

  const resetBudget = () => {
    setBudgetEnabled(false);
    setBudgetSheetVisible(false);
    setBudgetCategories([]);
    setBudgetDraft({});
    setBudgetSaved({});
    setBudgetRowErrors({});
    setBudgetListError(undefined);
    setBudgetBanner(null);
  };

  // A different member means a different set of categories, so start the budget over.
  useEffect(() => {
    resetBudget();
  }, [selectedAllowanceSpender?.id]);

  // Member picker
  const [memberPickerVisible, setMemberPickerVisible] = useState(false);
  const [connectedMembersList, setConnectedMembersList] = useState<SpenderMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

  // Coverage period
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodKey | 'custom'>('today');
  const defaultPeriodDates = getPeriodDates('today');
  const [startDate, setStartDate] = useState(defaultPeriodDates.start);
  const [endDate, setEndDate] = useState(defaultPeriodDates.end);

  // Custom calendar
  const [customCalendarVisible, setCustomCalendarVisible] = useState(false);
  const [currentCalendarDate, setCurrentCalendarDate] = useState(new Date());
  const [tempStartDate, setTempStartDate] = useState<string | null>(null);
  const [tempEndDate, setTempEndDate] = useState<string | null>(null);

  /* ---------- Data ---------- */
  const fetchDashboardData = async (isRefreshing = false) => {
    try {
      if (!isRefreshing) setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, avatar_url, role')
        .eq('id', user.id)
        .single();
      setSponsorProfile(profile);

      const { data: walletData, error: walletError } = await supabase
        .from('sponsor_wallets')
        .select('balance')
        .eq('sponsor_id', user.id)
        .maybeSingle();

      if (walletError && walletError.code !== 'PGRST116') {
        console.error('Wallet error:', walletError.message);
      }
      setSponsorWalletBalance(walletData ? Number(walletData.balance) : 0);

      const { data: txData, error: txError } = await supabase
        .from('sponsor_wallet_transactions')
        .select('*')
        .eq('sponsor_id', user.id)
        .order('created_at', { ascending: false });

      if (txError) {
        console.error('Transactions error:', txError.message);
      } else {
        setWalletTransactions(txData || []);
      }

      const { data: connectedData, error: connectedError } = await supabase
        .from('sponsor_spenders')
        .select(`
          spender_id,
          status,
          profiles!sponsor_spenders_spender_id_fkey (id, full_name, avatar_url)
        `)
        .eq('sponsor_id', user.id)
        .eq('status', 'accepted');

      if (connectedError) throw connectedError;

      const spendersMap = new Map<string, ConnectedSpender>();
      (connectedData || []).forEach((item: any) => {
        if (item.profiles) {
          spendersMap.set(item.profiles.id, {
            id: item.profiles.id,
            full_name: item.profiles.full_name || 'Spender',
            avatar_url: item.profiles.avatar_url || null,
          });
        }
      });

      setConnectedSpenders(Array.from(spendersMap.values()));
    } catch (e: any) {
      console.error('Error:', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { fetchDashboardData(); }, []));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchDashboardData(true);
  }, []);

  /* ---------- Derived ---------- */
  const monthStats = useMemo(() => {
    const now = new Date();
    let added = 0;
    let sent = 0;
    walletTransactions.forEach((t) => {
      const d = new Date(t.created_at);
      if (d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()) {
        if (t.type === 'add') added += Number(t.amount);
        else sent += Number(t.amount);
      }
    });
    return { added, sent };
  }, [walletTransactions]);

  const filteredTransactions = useMemo(
    () => (txFilter === 'all' ? walletTransactions : walletTransactions.filter((t) => t.type === txFilter)),
    [walletTransactions, txFilter],
  );

  /* ---------- Close / reset handlers ---------- */
  const closeWalletModal = () => {
    if (submittingWallet) return;
    setIsWalletModalVisible(false);
    setWalletAmountInput('');
    setWalletAmountError(undefined);
    setWalletBanner(null);
  };

  const closeAddModal = () => {
    if (submittingSpender) return;
    setIsAddModalVisible(false);
    setSpenderEmail('');
    setSpenderEmailError(undefined);
    setAddBanner(null);
  };

  const closeDeleteModal = () => {
    if (deletingSpender) return;
    setIsDeleteModalVisible(false);
    setSpenderToDelete(null);
    setDeleteBanner(null);
  };

  const closeAllowanceModal = () => {
    if (submittingAllowance) return;
    setIsAllowanceModalVisible(false);
  };

  /* ---------- Add money ---------- */
  const handleWalletSubmit = async () => {
    setWalletBanner(null);
    setWalletAmountError(undefined);

    const trimmed = walletAmountInput.trim();
    if (!trimmed) {
      setWalletAmountError('Enter the amount you want to add.');
      return;
    }
    if (!AMOUNT_REGEX.test(trimmed)) {
      setWalletAmountError('Enter a valid amount, up to 2 decimal places.');
      return;
    }
    const amountNum = parseFloat(trimmed);
    if (amountNum <= 0) {
      setWalletAmountError('Amount must be greater than zero.');
      return;
    }

    try {
      setSubmittingWallet(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const newBalance = sponsorWalletBalance + amountNum;

      const { error: upsertError } = await supabase
        .from('sponsor_wallets')
        .upsert(
          { sponsor_id: user.id, balance: newBalance, updated_at: new Date().toISOString() },
          { onConflict: 'sponsor_id' },
        );
      if (upsertError) throw upsertError;

      const { error: txError } = await supabase
        .from('sponsor_wallet_transactions')
        .insert({
          sponsor_id: user.id,
          amount: amountNum,
          type: 'add',
          description: 'Added money to wallet',
        });
      if (txError) throw txError;

      await supabase.from('logs').insert({
        user_id: user.id,
        details: `increased the wallet balance by ₱${amountNum.toLocaleString()}.`,
      });

      setWalletBanner({ type: 'success', text: 'Money added to your wallet.' });
      setTimeout(() => {
        setWalletAmountInput('');
        setWalletBanner(null);
        setIsWalletModalVisible(false);
        fetchDashboardData(true);
      }, 1200);
    } catch (e: any) {
      setWalletBanner({ type: 'error', text: e.message || 'Failed to update wallet.' });
    } finally {
      setSubmittingWallet(false);
    }
  };

  /* ---------- Link spender ---------- */
  const handleAddSpenderSubmit = async () => {
    setAddBanner(null);
    setSpenderEmailError(undefined);

    const email = spenderEmail.trim().toLowerCase();
    if (!email) {
      setSpenderEmailError('Enter the spender’s email address.');
      return;
    }
    if (!EMAIL_REGEX.test(email)) {
      setSpenderEmailError('Enter a valid email address.');
      return;
    }

    try {
      setSubmittingSpender(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: targetProfile, error: profileError } = await supabase
        .from('profiles')
        .select('id, full_name, role')
        .eq('email', email)
        .single();

      if (profileError || !targetProfile) {
        setSpenderEmailError('No user account found with this email address.');
        return;
      }
      if (targetProfile.id === user.id) {
        setSpenderEmailError('You cannot connect your own account as a spender.');
        return;
      }
      if (targetProfile.role !== 'Spender') {
        setSpenderEmailError('This account is not registered as a spender.');
        return;
      }

      const { data: existingConnection, error: checkError } = await supabase
        .from('sponsor_spenders')
        .select('sponsor_id, status')
        .eq('spender_id', targetProfile.id)
        .maybeSingle();
      if (checkError) throw checkError;

      if (existingConnection) {
        setSpenderEmailError(
          existingConnection.sponsor_id === user.id
            ? 'This spender is already connected to your account.'
            : 'This spender is already connected to another sponsor.',
        );
        return;
      }

      const { error: insertError } = await supabase
        .from('sponsor_spenders')
        .insert({ sponsor_id: user.id, spender_id: targetProfile.id, status: 'accepted' });
      if (insertError) throw insertError;

      await supabase.from('logs').insert({
        user_id: user.id,
        details: `connected spender "${targetProfile.full_name || email}".`,
      });

      setAddBanner({ type: 'success', text: 'Spender connected successfully.' });
      setTimeout(() => {
        setSpenderEmail('');
        setAddBanner(null);
        setIsAddModalVisible(false);
        fetchDashboardData(true);
      }, 1200);
    } catch (e: any) {
      setAddBanner({ type: 'error', text: e.message || 'Failed to connect spender.' });
    } finally {
      setSubmittingSpender(false);
    }
  };

  /* ---------- Disconnect spender ---------- */
  const handleDeleteSpenderConfirm = async () => {
    if (!spenderToDelete) return;
    setDeleteBanner(null);

    try {
      setDeletingSpender(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('sponsor_spenders')
        .delete()
        .eq('sponsor_id', user.id)
        .eq('spender_id', spenderToDelete.id);
      if (error) throw error;

      await supabase.from('logs').insert({
        user_id: user.id,
        details: `disconnected spender "${spenderToDelete.full_name}".`,
      });

      setDeleteBanner({ type: 'success', text: `${spenderToDelete.full_name} has been disconnected.` });
      setTimeout(() => {
        setIsDeleteModalVisible(false);
        setSpenderToDelete(null);
        setDeleteBanner(null);
        fetchDashboardData(true);
      }, 1200);
    } catch (e: any) {
      setDeleteBanner({ type: 'error', text: e.message || 'Failed to remove spender.' });
    } finally {
      setDeletingSpender(false);
    }
  };

  /* ---------- Allowance ---------- */
  const fetchConnectedMembersForAllowance = async () => {
    try {
      setLoadingMembers(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('sponsor_spenders')
        .select(`
          id, status, spender_id,
          profiles!spender_id ( full_name, email, avatar_url )
        `)
        .eq('sponsor_id', user.id);
      if (error) throw error;

      setConnectedMembersList(
        (data || []).map((item: any) => ({
          id: item.id,
          spender_id: item.spender_id,
          name: item.profiles?.full_name || 'No Name',
          email: item.profiles?.email || 'No Email',
          avatarUrl: item.profiles?.avatar_url || null,
          status: item.status,
        })),
      );
    } catch (error: any) {
      setAllowanceBanner({ type: 'error', text: error.message || 'Failed to fetch members.' });
    } finally {
      setLoadingMembers(false);
    }
  };

  /* ---------- Budget allocation ---------- */
  const fetchBudgetCategories = async (spenderId: string) => {
    try {
      setLoadingCategories(true);
      setBudgetBanner(null);

      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('name', { ascending: true });
      if (error) throw error;

      // Keep shared categories and the ones that belong to this spender
      const rows = (data || []).filter((c: any) => c.user_id == null || c.user_id === spenderId);
      setBudgetCategories(
        rows.map((c: any) => ({ id: c.id, name: c.name || 'Category', icon: c.icon || null })),
      );
    } catch (e: any) {
      setBudgetBanner({ type: 'error', text: e.message || 'Failed to load categories.' });
    } finally {
      setLoadingCategories(false);
    }
  };

  const openBudgetSheet = (spenderId: string) => {
    setBudgetDraft(budgetSaved);
    setBudgetRowErrors({});
    setBudgetListError(undefined);
    setBudgetBanner(null);
    setBudgetSheetVisible(true);
    if (budgetCategories.length === 0) fetchBudgetCategories(spenderId);
  };

  const handleBudgetToggle = (value: boolean) => {
    setAllowanceErrors((p) => ({ ...p, budget: undefined }));

    if (!value) {
      setBudgetEnabled(false);
      setBudgetSaved({});
      setBudgetDraft({});
      return;
    }

    // The budget needs a member (for categories) and an amount (to split)
    const errors: AllowanceErrors = {};
    if (!selectedAllowanceSpender) errors.spender = 'Select a member before setting a budget.';
    if (allowanceAmountCents <= 0) errors.amount = 'Enter a valid allowance amount before setting a budget.';
    if (Object.keys(errors).length > 0 || !selectedAllowanceSpender) {
      setAllowanceErrors((p) => ({ ...p, ...errors }));
      return;
    }

    setBudgetEnabled(true);
    openBudgetSheet(selectedAllowanceSpender.id);
  };

  const closeBudgetSheet = () => {
    // Closing without a saved budget turns the toggle back off
    if (budgetSavedCents === 0) setBudgetEnabled(false);
    setBudgetSheetVisible(false);
  };

  const setDraftAmount = (categoryId: string, text: string) => {
    setBudgetDraft((p) => ({ ...p, [categoryId]: text }));
    setBudgetRowErrors((p) => ({ ...p, [categoryId]: undefined }));
    setBudgetListError(undefined);
  };

  const splitBudgetEvenly = () => {
    if (budgetCategories.length === 0 || allowanceAmountCents <= 0) return;
    const n = budgetCategories.length;
    const base = Math.floor(allowanceAmountCents / n);
    let extra = allowanceAmountCents - base * n;

    const next: Record<string, string> = {};
    budgetCategories.forEach((c) => {
      const cents = base + (extra > 0 ? 1 : 0);
      if (extra > 0) extra -= 1;
      next[c.id] = (cents / 100).toFixed(2);
    });
    setBudgetDraft(next);
    setBudgetRowErrors({});
    setBudgetListError(undefined);
  };

  const clearBudgetDraft = () => {
    setBudgetDraft({});
    setBudgetRowErrors({});
    setBudgetListError(undefined);
  };

  const handleBudgetConfirm = () => {
    const rowErrors: Record<string, string | undefined> = {};
    budgetCategories.forEach((c) => {
      const v = (budgetDraft[c.id] || '').trim();
      if (v && !AMOUNT_REGEX.test(v)) rowErrors[c.id] = 'Enter a valid amount, up to 2 decimal places.';
    });
    setBudgetRowErrors(rowErrors);
    if (Object.values(rowErrors).some(Boolean)) return;

    if (budgetDraftCents === 0) {
      setBudgetListError('Allocate the amount to at least one category.');
      return;
    }
    if (budgetRemainingCents > 0) {
      setBudgetListError(`${formatPeso(budgetRemainingCents / 100, true)} is still left to allocate.`);
      return;
    }
    if (budgetRemainingCents < 0) {
      setBudgetListError(
        `Over-allocated by ${formatPeso(Math.abs(budgetRemainingCents) / 100, true)}. Reduce some amounts.`,
      );
      return;
    }

    const cleaned: Record<string, string> = {};
    budgetCategories.forEach((c) => {
      const cents = toCents(budgetDraft[c.id] || '');
      if (cents > 0) cleaned[c.id] = (cents / 100).toFixed(2);
    });
    setBudgetSaved(cleaned);
    setBudgetSheetVisible(false);
    setAllowanceErrors((p) => ({ ...p, budget: undefined }));
  };

  const handleOpenAllowanceModal = () => {
    setSelectedAllowanceSpender(null);
    setAllowanceName('');
    setAllowanceAmount('');
    setAllowanceErrors({});
    setAllowanceCompleted(false);
    resetBudget();
    setSelectedPeriod('today');
    const defaultDates = getPeriodDates('today');
    setStartDate(defaultDates.start);
    setEndDate(defaultDates.end);
    setAllowanceBanner(null);
    setIsAllowanceModalVisible(true);
  };

  const handleSaveAllowanceSubmit = async () => {
    setAllowanceBanner(null);
    const errors: AllowanceErrors = {};

    if (!selectedAllowanceSpender) errors.spender = 'Select a member to receive this allowance.';

    if (!allowanceName.trim()) errors.name = 'Enter a name for this allowance.';

    const amountTrimmed = allowanceAmount.trim();
    const parsedAmount = parseFloat(amountTrimmed);
    if (!amountTrimmed) {
      errors.amount = 'Enter the allowance amount.';
    } else if (!AMOUNT_REGEX.test(amountTrimmed)) {
      errors.amount = 'Enter a valid amount, up to 2 decimal places.';
    } else if (parsedAmount <= 0) {
      errors.amount = 'Amount must be greater than zero.';
    } else if (parsedAmount > sponsorWalletBalance) {
      errors.amount = `Exceeds your wallet balance (${formatPeso(sponsorWalletBalance)}).`;
    }

    if (!startDate.trim() || !endDate.trim()) errors.period = 'Choose a coverage period.';

    if (budgetEnabled) {
      if (budgetSavedCents === 0) {
        errors.budget = 'Set up the budget or turn this option off.';
      } else if (budgetSavedCents !== allowanceAmountCents) {
        errors.budget = 'The budget total must equal the allowance amount. Tap Edit to update it.';
      }
    }

    setAllowanceErrors(errors);
    if (Object.keys(errors).length > 0 || !selectedAllowanceSpender) return;

    try {
      setSubmittingAllowance(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Re-check the live balance before deducting
      const { data: walletData, error: walletError } = await supabase
        .from('sponsor_wallets')
        .select('balance')
        .eq('sponsor_id', user.id)
        .maybeSingle();
      if (walletError && walletError.code !== 'PGRST116') throw walletError;

      const currentBalance = walletData ? Number(walletData.balance) : 0;
      if (parsedAmount > currentBalance) {
        setAllowanceErrors({ amount: `Exceeds your wallet balance (${formatPeso(currentBalance)}).` });
        return;
      }

      const { error: updateWalletError } = await supabase
        .from('sponsor_wallets')
        .update({ balance: currentBalance - parsedAmount, updated_at: new Date().toISOString() })
        .eq('sponsor_id', user.id);
      if (updateWalletError) throw updateWalletError;

      const { error: txError } = await supabase
        .from('sponsor_wallet_transactions')
        .insert({
          sponsor_id: user.id,
          amount: parsedAmount,
          type: 'deduct',
          description: `Allowance: ${allowanceName.trim()}`,
        });
      if (txError) throw txError;

      const { data: newAllowance, error: allowanceError } = await supabase
        .from('allowances')
        .insert([
          {
            sponsor_id: user.id,
            spender_id: selectedAllowanceSpender.id,
            allowance_name: allowanceName.trim(),
            amount: parsedAmount,
            start_date: startDate,
            end_date: endDate,
          },
        ])
        .select('id')
        .single();
      if (allowanceError) throw allowanceError;

      // The allowance exists now, so block a second submit
      setAllowanceCompleted(true);

      // Optional: save the category budget linked to this allowance
      let budgetFailure: string | null = null;
      if (budgetEnabled) {
        const budgetRows = Object.entries(budgetSaved)
          .map(([categoryId, value]) => ({ categoryId, cents: toCents(value) }))
          .filter((r) => r.cents > 0)
          .map((r) => ({
            user_id: selectedAllowanceSpender.id,
            category_id: r.categoryId,
            allocated_amount: r.cents / 100,
            allowance_id: newAllowance.id,
          }));

        const { error: budgetError } = await supabase.from('budgets').insert(budgetRows);
        if (budgetError) budgetFailure = budgetError.message;
      }

      await supabase.from('logs').insert({
        user_id: user.id,
        details: `allocated allowance "${allowanceName.trim()}" (${parsedAmount}) for spender "${selectedAllowanceSpender.name}"${
          budgetEnabled && !budgetFailure ? ' with a category budget' : ''
        }.`,
      });

      if (budgetFailure) {
        setAllowanceBanner({
          type: 'error',
          text: `Allowance sent, but the budget could not be saved: ${budgetFailure}`,
        });
        setTimeout(() => {
          setIsAllowanceModalVisible(false);
          setAllowanceBanner(null);
          fetchDashboardData(true);
        }, 3200);
      } else {
        setAllowanceBanner({
          type: 'success',
          text: budgetEnabled ? 'Allowance and budget saved successfully.' : 'Allowance sent successfully.',
        });
        setTimeout(() => {
          setIsAllowanceModalVisible(false);
          setAllowanceBanner(null);
          fetchDashboardData(true);
        }, 1200);
      }
    } catch (e: any) {
      setAllowanceBanner({ type: 'error', text: e.message || 'Something went wrong.' });
    } finally {
      setSubmittingAllowance(false);
    }
  };

  /* ---------- Render ---------- */
  const renderCalendarCells = () => {
    const year = currentCalendarDate.getFullYear();
    const month = currentCalendarDate.getMonth();
    const firstDayIndex = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    const now = new Date();
    const todayStr = getLocalDateString(now.getFullYear(), now.getMonth(), now.getDate());

    const cells: ReactNode[] = [];
    for (let i = 0; i < firstDayIndex; i++) {
      cells.push(<View key={`empty-${i}`} style={styles.dayCellEmpty} />);
    }

    for (let day = 1; day <= totalDays; day++) {
      const dateStr = getLocalDateString(year, month, day);
      const isToday = dateStr === todayStr;
      const isStart = tempStartDate === dateStr;
      const isEnd = tempEndDate === dateStr;
      const isInRange = !!(tempStartDate && tempEndDate && dateStr > tempStartDate && dateStr < tempEndDate);

      cells.push(
        <TouchableOpacity
          key={dateStr}
          activeOpacity={0.7}
          style={[
            styles.dayCell,
            isToday && styles.dayCellToday,
            isInRange && styles.dayCellInRange,
            (isStart || isEnd) && styles.dayCellSelected,
          ]}
          onPress={() => {
            if (!tempStartDate || (tempStartDate && tempEndDate)) {
              setTempStartDate(dateStr);
              setTempEndDate(null);
            } else if (dateStr < tempStartDate) {
              setTempStartDate(dateStr);
            } else {
              setTempEndDate(dateStr);
            }
          }}
        >
          <Text
            style={[
              styles.dayCellText,
              isToday && styles.dayCellTextToday,
              (isStart || isEnd) && styles.dayCellTextSelected,
            ]}
          >
            {day}
          </Text>
        </TouchableOpacity>,
      );
    }
    return cells;
  };

  const showSkeleton = loading && !refreshing;

  const quickActions: { key: string; label: string; icon: IconName; onPress: () => void }[] = [
    { key: 'add', label: 'Add Money', icon: 'add-circle-outline', onPress: () => setIsWalletModalVisible(true) },
    { key: 'link', label: 'Link Spender', icon: 'person-add-outline', onPress: () => setIsAddModalVisible(true) },
    { key: 'send', label: 'Send Allowance', icon: 'paper-plane-outline', onPress: handleOpenAllowanceModal },
  ];

  const emptyTxCopy: Record<TxFilter, string> = {
    all: 'No transaction records yet.',
    add: 'No added funds yet.',
    deduct: 'No deductions yet.',
  };

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      {/* HEADER */}
      <View style={styles.topBar}>
        <View style={styles.headerLeft}>
          {showSkeleton ? (
            <>
              <Skeleton width={44} height={44} radius={22} />
              <View style={styles.headerTextGroup}>
                <Skeleton width={80} height={10} radius={5} />
                <Skeleton width={140} height={16} radius={8} style={{ marginTop: 8 }} />
              </View>
            </>
          ) : (
            <>
              <TouchableOpacity activeOpacity={0.7} onPress={() => router.push('/profile')}>
                <Avatar uri={sponsorProfile?.avatar_url} size={44} />
              </TouchableOpacity>
              <View style={styles.headerTextGroup}>
                <Text style={styles.welcomeText}>Welcome back,</Text>
                <Text style={styles.userName} numberOfLines={1}>
                  {sponsorProfile?.full_name || 'User'}
                </Text>
              </View>
            </>
          )}
        </View>

        {showSkeleton ? (
          <Skeleton width={78} height={28} radius={14} />
        ) : (
          <View style={styles.roleBadge}>
            <Ionicons name="shield-checkmark" size={12} color={COLORS.primary} />
            <Text style={styles.roleBadgeText}>{sponsorProfile?.role || 'Sponsor'}</Text>
          </View>
        )}
      </View>

      {/* BODY */}
      <View style={styles.bodyContent}>
        {showSkeleton ? (
          <HomeSkeleton />
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listScrollContent}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={[COLORS.primary]}
                tintColor={COLORS.primary}
              />
            }
          >
            {/* WALLET CARD */}
            <LinearGradient
              colors={['#4FA87A', '#1E6244', '#013237']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.walletCard}
            >
              <View style={styles.cardCircleLarge} />
              <View style={styles.cardCircleSmall} />

              <View style={styles.walletTopRow}>
                <View style={styles.walletLabelRow}>
                  <View style={styles.walletIconChip}>
                    <Ionicons name="wallet-outline" size={14} color={COLORS.white} />
                  </View>
                  <Text style={styles.heroLabel}>Wallet Balance</Text>
                </View>
                <TouchableOpacity
                  onPress={() => setBalanceHidden((v) => !v)}
                  activeOpacity={0.7}
                  style={styles.eyeBtn}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons
                    name={balanceHidden ? 'eye-off-outline' : 'eye-outline'}
                    size={18}
                    color="rgba(255,255,255,0.9)"
                  />
                </TouchableOpacity>
              </View>

              <Text style={styles.heroAmount}>
                {balanceHidden ? '₱ ••••••' : formatPeso(sponsorWalletBalance)}
              </Text>

              <View style={styles.walletStatsRow}>
                <View style={styles.walletStat}>
                  <View style={styles.statLabelRow}>
                    <Ionicons name="arrow-down-circle" size={13} color={COLORS.accentGreen} />
                    <Text style={styles.statLabel}>Added</Text>
                  </View>
                  <Text style={styles.statValue}>
                    {balanceHidden ? '••••' : formatPeso(monthStats.added)}
                  </Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.walletStat}>
                  <View style={styles.statLabelRow}>
                    <Ionicons name="arrow-up-circle" size={13} color="#FCA5A5" />
                    <Text style={styles.statLabel}>Sent</Text>
                  </View>
                  <Text style={styles.statValue}>
                    {balanceHidden ? '••••' : formatPeso(monthStats.sent)}
                  </Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.walletStat}>
                  <View style={styles.statLabelRow}>
                    <Ionicons name="people" size={13} color="rgba(255,255,255,0.85)" />
                    <Text style={styles.statLabel}>Spenders</Text>
                  </View>
                  <Text style={styles.statValue}>{connectedSpenders.length}</Text>
                </View>
              </View>
              <Text style={styles.statCaption}>Added and sent figures are for this month</Text>
            </LinearGradient>

            {/* QUICK ACTIONS */}
            <Text style={[styles.sectionTitle, { marginTop: 24, marginBottom: 12 }]}>Quick Actions</Text>
            <View style={styles.quickActionsRow}>
              {quickActions.map((a) => (
                <TouchableOpacity
                  key={a.key}
                  style={styles.quickActionTile}
                  activeOpacity={0.8}
                  onPress={a.onPress}
                >
                  <View style={styles.quickActionIconCircle}>
                    <Ionicons name={a.icon} size={20} color={COLORS.primary} />
                  </View>
                  <Text style={styles.quickActionLabel}>{a.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* SPENDERS */}
            <View style={[styles.sectionHeader, { marginTop: 24 }]}>
              <Text style={styles.sectionTitle}>Spenders</Text>
              <View style={styles.countPill}>
                <Text style={styles.countPillText}>{connectedSpenders.length}</Text>
              </View>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalSpendersContainer}
            >
              {connectedSpenders.map((spender) => (
                <TouchableOpacity
                  key={spender.id}
                  style={styles.spenderItem}
                  activeOpacity={0.7}
                  onLongPress={() => {
                    setSpenderToDelete(spender);
                    setDeleteBanner(null);
                    setIsDeleteModalVisible(true);
                  }}
                >
                  <Avatar uri={spender.avatar_url} size={52} />
                  <Text style={styles.spenderName} numberOfLines={1}>
                    {getFirstName(spender.full_name)}
                  </Text>
                </TouchableOpacity>
              ))}

              <TouchableOpacity
                style={styles.spenderItem}
                activeOpacity={0.7}
                onPress={() => setIsAddModalVisible(true)}
              >
                <View style={styles.addSpenderCircle}>
                  <Ionicons name="add" size={22} color={COLORS.primaryMid} />
                </View>
                <Text style={styles.spenderName}>Add</Text>
              </TouchableOpacity>
            </ScrollView>
            {connectedSpenders.length > 0 && (
              <Text style={styles.listHint}>Press and hold a spender to disconnect them.</Text>
            )}

            {/* TRANSACTIONS */}
            <View style={[styles.sectionHeader, { marginTop: 24 }]}>
              <Text style={styles.sectionTitle}>Wallet Transactions</Text>
              <Text style={styles.seeAllText}>
                {filteredTransactions.length} {filteredTransactions.length === 1 ? 'record' : 'records'}
              </Text>
            </View>

            <View style={styles.filterRow}>
              {TX_FILTERS.map((f) => {
                const active = txFilter === f.key;
                return (
                  <TouchableOpacity
                    key={f.key}
                    style={[styles.filterChip, active && styles.filterChipActive]}
                    activeOpacity={0.8}
                    onPress={() => setTxFilter(f.key)}
                  >
                    <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                      {f.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.transactionsListContainer}>
              {filteredTransactions.length === 0 ? (
                <View style={styles.emptyState}>
                  <View style={styles.emptyIcon}>
                    <Ionicons name="receipt-outline" size={22} color={COLORS.textMuted} />
                  </View>
                  <Text style={styles.emptyTitle}>{emptyTxCopy[txFilter]}</Text>
                </View>
              ) : (
                filteredTransactions.map((item) => {
                  const isAdd = item.type === 'add';
                  const formattedDate = new Date(item.created_at).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  });

                  return (
                    <View key={item.id} style={styles.txCardItem}>
                      <View style={[styles.txIconBox, { backgroundColor: isAdd ? COLORS.primarySoft : COLORS.dangerSoft }]}>
                        <Ionicons
                          name={isAdd ? 'arrow-down' : 'arrow-up'}
                          size={18}
                          color={isAdd ? COLORS.success : COLORS.danger}
                        />
                      </View>
                      <View style={{ marginLeft: 12, flex: 1 }}>
                        <Text style={styles.txDescText} numberOfLines={1}>
                          {item.description || (isAdd ? 'Added Balance' : 'Deducted')}
                        </Text>
                        <Text style={styles.txDateText}>{formattedDate}</Text>
                      </View>
                      <Text style={[styles.txAmountText, { color: isAdd ? COLORS.success : COLORS.danger }]}>
                        {isAdd ? '+' : '-'}{formatPeso(Number(item.amount), true)}
                      </Text>
                    </View>
                  );
                })
              )}
            </View>
          </ScrollView>
        )}
      </View>

      {/* ADD WALLET BALANCE */}
      <Sheet
        visible={isWalletModalVisible}
        title="Add Wallet Balance"
        subtitle="Top up your wallet to fund allowances."
        onClose={closeWalletModal}
        footer={
          <SheetActions
            onCancel={closeWalletModal}
            onSubmit={handleWalletSubmit}
            submitLabel="Add Balance"
            loading={submittingWallet}
          />
        }
      >
        <Banner message={walletBanner} />
        <Field label="Amount (PHP)" error={walletAmountError}>
          <View style={styles.amountWrapper}>
            <Text style={styles.currencyPrefix}>₱</Text>
            <TextInput
              style={[styles.input, styles.amountInput, !!walletAmountError && styles.inputError]}
              placeholder="0.00"
              placeholderTextColor={COLORS.textMuted}
              keyboardType="decimal-pad"
              value={walletAmountInput}
              onChangeText={(t) => {
                setWalletAmountInput(t);
                if (walletAmountError) setWalletAmountError(undefined);
              }}
            />
          </View>
        </Field>
      </Sheet>

      {/* LINK SPENDER */}
      <Sheet
        visible={isAddModalVisible}
        title="Connect New Spender"
        subtitle="Enter your spender’s registered email address."
        onClose={closeAddModal}
        footer={
          <SheetActions
            onCancel={closeAddModal}
            onSubmit={handleAddSpenderSubmit}
            submitLabel="Connect"
            loading={submittingSpender}
          />
        }
      >
        <Banner message={addBanner} />
        <Field label="Email Address" error={spenderEmailError}>
          <TextInput
            style={[styles.input, !!spenderEmailError && styles.inputError]}
            placeholder="spender@email.com"
            placeholderTextColor={COLORS.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            value={spenderEmail}
            onChangeText={(t) => {
              setSpenderEmail(t);
              if (spenderEmailError) setSpenderEmailError(undefined);
            }}
          />
        </Field>
      </Sheet>

      {/* DISCONNECT SPENDER */}
      <Sheet
        visible={isDeleteModalVisible}
        title="Disconnect Spender"
        onClose={closeDeleteModal}
        footer={
          <SheetActions
            onCancel={closeDeleteModal}
            onSubmit={handleDeleteSpenderConfirm}
            submitLabel="Disconnect"
            loading={deletingSpender}
            disabled={deleteBanner?.type === 'success'}
            danger
          />
        }
      >
        <Banner message={deleteBanner} />
        {spenderToDelete && (
          <View style={styles.selectedCard}>
            <Avatar uri={spenderToDelete.avatar_url} size={40} />
            <View style={{ flex: 1 }}>
              <Text style={styles.selectedName}>{spenderToDelete.full_name}</Text>
              <Text style={styles.selectedSub}>Connected spender</Text>
            </View>
          </View>
        )}
        <Text style={styles.bodyText}>
          Are you sure you want to disconnect this spender? They will no longer be linked to your account.
        </Text>
      </Sheet>

      {/* SEND ALLOWANCE */}
      <Sheet
        visible={isAllowanceModalVisible}
        title="Send Allowance"
        subtitle="Choose a member and set the allowance details."
        onClose={closeAllowanceModal}
        footer={
          <SheetActions
            onCancel={closeAllowanceModal}
            onSubmit={handleSaveAllowanceSubmit}
            submitLabel="Confirm Allowance"
            loading={submittingAllowance}
            disabled={allowanceCompleted}
          />
        }
      >
        <Banner message={allowanceBanner} />

        <Field label="Member" error={allowanceErrors.spender}>
          {selectedAllowanceSpender ? (
            <View style={styles.selectedCard}>
              <Avatar uri={selectedAllowanceSpender.avatarUrl} size={40} />
              <View style={{ flex: 1 }}>
                <Text style={styles.selectedName}>{selectedAllowanceSpender.name}</Text>
                <Text style={styles.selectedSub} numberOfLines={1}>
                  {selectedAllowanceSpender.email || 'Beneficiary'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setSelectedAllowanceSpender(null)}
                style={styles.removeButton}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={16} color={COLORS.danger} />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.selectMemberButton, !!allowanceErrors.spender && styles.inputError]}
              activeOpacity={0.7}
              onPress={() => {
                setAllowanceErrors((p) => ({ ...p, spender: undefined }));
                fetchConnectedMembersForAllowance();
                setMemberPickerVisible(true);
              }}
            >
              <Ionicons name="person-add-outline" size={18} color={COLORS.primaryMid} />
              <Text style={styles.selectMemberText}>Select a member</Text>
              <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
            </TouchableOpacity>
          )}
        </Field>

        <Field label="Allowance Name" error={allowanceErrors.name}>
          <TextInput
            style={[styles.input, !!allowanceErrors.name && styles.inputError]}
            value={allowanceName}
            onChangeText={(t) => {
              setAllowanceName(t);
              if (allowanceErrors.name) setAllowanceErrors((p) => ({ ...p, name: undefined }));
            }}
            placeholder="e.g. Weekly Allowance"
            placeholderTextColor={COLORS.textMuted}
          />
        </Field>

        <Field
          label="Amount (PHP)"
          error={allowanceErrors.amount}
          hint={`Available balance: ${formatPeso(sponsorWalletBalance, true)}`}
        >
          <View style={styles.amountWrapper}>
            <Text style={styles.currencyPrefix}>₱</Text>
            <TextInput
              style={[styles.input, styles.amountInput, !!allowanceErrors.amount && styles.inputError]}
              keyboardType="decimal-pad"
              value={allowanceAmount}
              onChangeText={(t) => {
                setAllowanceAmount(t);
                if (allowanceErrors.amount) setAllowanceErrors((p) => ({ ...p, amount: undefined }));
              }}
              placeholder="0.00"
              placeholderTextColor={COLORS.textMuted}
            />
          </View>
        </Field>

        <Field label="Coverage Period" error={allowanceErrors.period}>
          <View style={styles.periodSelectorContainer}>
            {PERIODS.map((item) => {
              const isActive = selectedPeriod === item.key;
              return (
                <TouchableOpacity
                  key={item.key}
                  style={[styles.periodPill, isActive && styles.periodPillActive]}
                  activeOpacity={0.8}
                  onPress={() => {
                    setSelectedPeriod(item.key);
                    const dates = getPeriodDates(item.key);
                    setStartDate(dates.start);
                    setEndDate(dates.end);
                    setAllowanceErrors((p) => ({ ...p, period: undefined }));
                  }}
                >
                  <Text style={[styles.periodPillText, isActive && styles.periodPillTextActive]}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              style={[styles.periodPill, selectedPeriod === 'custom' && styles.periodPillActive]}
              activeOpacity={0.8}
              onPress={() => {
                setTempStartDate(null);
                setTempEndDate(null);
                setCurrentCalendarDate(new Date());
                setCustomCalendarVisible(true);
              }}
            >
              <Text style={[styles.periodPillText, selectedPeriod === 'custom' && styles.periodPillTextActive]}>
                Custom
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.dateRangeIndicator}>
            <Ionicons name="calendar-outline" size={14} color={COLORS.textSubtle} />
            <Text style={styles.dateRangeIndicatorText}>{formatDisplayDateRange(startDate, endDate)}</Text>
          </View>
        </Field>

        {/* Optional budget allocation */}
        <View style={styles.field}>
          <View style={[styles.budgetCard, !!allowanceErrors.budget && styles.budgetCardError]}>
            <View style={styles.budgetRow}>
              <View style={styles.budgetIcon}>
                <Ionicons name="pie-chart-outline" size={18} color={COLORS.primaryMid} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.budgetTitleRow}>
                  <Text style={styles.budgetTitle}>Budget allocation</Text>
                  <View style={styles.optionalTag}>
                    <Text style={styles.optionalTagText}>Optional</Text>
                  </View>
                </View>
                <Text style={styles.budgetSubtitle}>
                  Split this allowance across spending categories.
                </Text>
              </View>
              <Switch
                value={budgetEnabled}
                onValueChange={handleBudgetToggle}
                disabled={submittingAllowance || allowanceCompleted}
                trackColor={{ false: '#D9DEE5', true: COLORS.primaryMid }}
                thumbColor={COLORS.white}
                ios_backgroundColor="#D9DEE5"
              />
            </View>

            {budgetEnabled && budgetSavedCents > 0 && (
              <View style={styles.budgetSummary}>
                <Ionicons
                  name={budgetMismatch ? 'alert-circle' : 'checkmark-circle'}
                  size={16}
                  color={budgetMismatch ? COLORS.danger : COLORS.success}
                />
                <Text
                  style={[
                    styles.budgetSummaryText,
                    { color: budgetMismatch ? COLORS.danger : COLORS.success },
                  ]}
                >
                  {budgetMismatch
                    ? `Budget total ${formatPeso(budgetSavedCents / 100, true)} doesn’t match the amount.`
                    : `${Object.keys(budgetSaved).length} ${
                        Object.keys(budgetSaved).length === 1 ? 'category' : 'categories'
                      } · ${formatPeso(budgetSavedCents / 100, true)} allocated`}
                </Text>
                <TouchableOpacity
                  style={styles.budgetEditBtn}
                  activeOpacity={0.7}
                  onPress={() => selectedAllowanceSpender && openBudgetSheet(selectedAllowanceSpender.id)}
                >
                  <Text style={styles.budgetEditText}>Edit</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {allowanceErrors.budget ? (
            <View style={styles.fieldErrorRow}>
              <Ionicons name="alert-circle" size={13} color={COLORS.danger} />
              <Text style={styles.fieldErrorText}>{allowanceErrors.budget}</Text>
            </View>
          ) : null}
        </View>
      </Sheet>

      {/* BUDGET ALLOCATION */}
      <Sheet
        visible={budgetSheetVisible}
        title="Budget Allocation"
        subtitle="Distribute the allowance across categories until nothing is left."
        onClose={closeBudgetSheet}
        footer={
          <SheetActions
            onCancel={closeBudgetSheet}
            onSubmit={handleBudgetConfirm}
            submitLabel="Save Budget"
          />
        }
      >
        <Banner message={budgetBanner} />

        <View style={styles.budgetHero}>
          <View style={styles.budgetHeroTop}>
            <View>
              <Text style={styles.budgetHeroLabel}>Left to allocate</Text>
              <Text
                style={[
                  styles.budgetHeroAmount,
                  budgetRemainingCents === 0 && { color: COLORS.success },
                  budgetRemainingCents < 0 && { color: COLORS.danger },
                ]}
              >
                {budgetRemainingCents < 0 ? '-' : ''}
                {formatPeso(Math.abs(budgetRemainingCents) / 100, true)}
              </Text>
            </View>
            <View style={styles.budgetHeroBadge}>
              <Text
                style={[
                  styles.budgetHeroBadgeText,
                  {
                    color:
                      budgetRemainingCents === 0
                        ? COLORS.success
                        : budgetRemainingCents < 0
                          ? COLORS.danger
                          : COLORS.primary,
                  },
                ]}
              >
                {budgetRemainingCents === 0
                  ? 'Fully allocated'
                  : budgetRemainingCents < 0
                    ? 'Over budget'
                    : `of ${formatPeso(allowanceAmountCents / 100, true)}`}
              </Text>
            </View>
          </View>
          <View style={styles.budgetTrack}>
            <View
              style={[
                styles.budgetFill,
                {
                  width: `${
                    allowanceAmountCents > 0
                      ? Math.min(100, (budgetDraftCents / allowanceAmountCents) * 100)
                      : 0
                  }%`,
                  backgroundColor: budgetRemainingCents < 0 ? COLORS.danger : COLORS.primaryMid,
                },
              ]}
            />
          </View>
        </View>

        <View style={styles.budgetToolsRow}>
          <Text style={styles.budgetToolsLabel}>Categories</Text>
          <View style={styles.budgetToolsActions}>
            <TouchableOpacity style={styles.toolBtn} activeOpacity={0.7} onPress={splitBudgetEvenly}>
              <Text style={styles.toolBtnText}>Split evenly</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.toolBtn} activeOpacity={0.7} onPress={clearBudgetDraft}>
              <Text style={styles.toolBtnText}>Clear</Text>
            </TouchableOpacity>
          </View>
        </View>

        {loadingCategories ? (
          <View style={{ gap: 10 }}>
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} width="100%" height={58} radius={14} />
            ))}
          </View>
        ) : budgetCategories.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Ionicons name="pricetags-outline" size={22} color={COLORS.textMuted} />
            </View>
            <Text style={styles.emptyTitle}>No categories available</Text>
            <Text style={styles.emptySubtitle}>
              This spender has no budget categories yet.
            </Text>
          </View>
        ) : (
          budgetCategories.map((c) => {
            const rowError = budgetRowErrors[c.id];
            return (
              <View key={c.id} style={{ marginBottom: 10 }}>
                <View style={styles.budgetItem}>
                  <View style={styles.budgetItemIcon}>
                    <Ionicons
                      name={(c.icon as any) || 'pricetag-outline'}
                      size={18}
                      color={COLORS.primaryMid}
                    />
                  </View>
                  <Text style={styles.budgetItemName} numberOfLines={1}>{c.name}</Text>
                  <View style={styles.budgetInputWrap}>
                    <Text style={styles.budgetPrefix}>₱</Text>
                    <TextInput
                      style={[styles.budgetInput, !!rowError && styles.inputError]}
                      placeholder="0.00"
                      placeholderTextColor={COLORS.textMuted}
                      keyboardType="decimal-pad"
                      value={budgetDraft[c.id] || ''}
                      onChangeText={(t) => setDraftAmount(c.id, t)}
                    />
                  </View>
                </View>
                {rowError ? (
                  <View style={styles.fieldErrorRow}>
                    <Ionicons name="alert-circle" size={13} color={COLORS.danger} />
                    <Text style={styles.fieldErrorText}>{rowError}</Text>
                  </View>
                ) : null}
              </View>
            );
          })
        )}

        {budgetListError ? (
          <View style={styles.fieldErrorRow}>
            <Ionicons name="alert-circle" size={13} color={COLORS.danger} />
            <Text style={styles.fieldErrorText}>{budgetListError}</Text>
          </View>
        ) : null}
      </Sheet>

      {/* MEMBER PICKER */}
      <Sheet
        visible={memberPickerVisible}
        title="Select Member"
        subtitle="Pick who will receive this allowance."
        onClose={() => setMemberPickerVisible(false)}
      >
        {loadingMembers ? (
          <ActivityIndicator size="large" color={COLORS.primary} style={{ marginVertical: 40 }} />
        ) : connectedMembersList.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Ionicons name="people-outline" size={22} color={COLORS.textMuted} />
            </View>
            <Text style={styles.emptyTitle}>No connected members</Text>
            <Text style={styles.emptySubtitle}>Link a spender first using the Link Spender action.</Text>
          </View>
        ) : (
          connectedMembersList.map((item) => {
            const isPending = item.status === 'pending';
            return (
              <TouchableOpacity
                key={item.id}
                style={[styles.memberRow, isPending && { opacity: 0.6 }]}
                activeOpacity={0.8}
                disabled={isPending}
                onPress={() => {
                  setSelectedAllowanceSpender({
                    id: item.spender_id,
                    name: item.name,
                    email: item.email,
                    avatarUrl: item.avatarUrl,
                  });
                  setAllowanceErrors((p) => ({ ...p, spender: undefined }));
                  setMemberPickerVisible(false);
                }}
              >
                <Avatar uri={item.avatarUrl} size={40} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.selectedName} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.selectedSub} numberOfLines={1}>{item.email}</Text>
                </View>
                {isPending ? (
                  <View style={styles.statusBadge}>
                    <Text style={styles.statusText}>Pending</Text>
                  </View>
                ) : (
                  <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
                )}
              </TouchableOpacity>
            );
          })
        )}
      </Sheet>

      {/* CUSTOM DATE RANGE */}
      <Sheet
        visible={customCalendarVisible}
        title="Select Date Range"
        subtitle="Tap a start date, then an end date."
        onClose={() => setCustomCalendarVisible(false)}
        footer={
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={[styles.btnSecondary, !tempStartDate && { opacity: 0.5 }]}
              disabled={!tempStartDate}
              activeOpacity={0.8}
              onPress={() => {
                setTempStartDate(null);
                setTempEndDate(null);
              }}
            >
              <Text style={styles.btnSecondaryText}>Reset</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btnPrimary, (!tempStartDate || !tempEndDate) && { opacity: 0.5 }]}
              disabled={!tempStartDate || !tempEndDate}
              activeOpacity={0.85}
              onPress={() => {
                if (tempStartDate && tempEndDate) {
                  setStartDate(tempStartDate);
                  setEndDate(tempEndDate);
                  setSelectedPeriod('custom');
                  setAllowanceErrors((p) => ({ ...p, period: undefined }));
                  setCustomCalendarVisible(false);
                }
              }}
            >
              <Text style={styles.btnPrimaryText}>Apply Range</Text>
            </TouchableOpacity>
          </View>
        }
      >
        <View style={styles.calendarNavRow}>
          <Text style={styles.calendarMonthTitle}>
            {currentCalendarDate.toLocaleString('en-US', { month: 'long', year: 'numeric' })}
          </Text>
          <View style={styles.calendarArrowsContainer}>
            <TouchableOpacity
              style={styles.calendarArrowBtn}
              onPress={() => {
                const prev = new Date(currentCalendarDate);
                prev.setMonth(prev.getMonth() - 1);
                setCurrentCalendarDate(prev);
              }}
            >
              <Ionicons name="chevron-back" size={18} color={COLORS.textPrimary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.calendarArrowBtn}
              onPress={() => {
                const next = new Date(currentCalendarDate);
                next.setMonth(next.getMonth() + 1);
                setCurrentCalendarDate(next);
              }}
            >
              <Ionicons name="chevron-forward" size={18} color={COLORS.textPrimary} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.weekDaysRow}>
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <Text key={d} style={styles.weekDayText}>{d}</Text>
          ))}
        </View>
        <View style={styles.daysGrid}>{renderCalendarCells()}</View>
      </Sheet>
    </View>
  );
}

/* ---------- Styles ---------- */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },

  /* Header */
  topBar: {
    paddingTop: (Platform.OS === 'android' ? NativeStatusBar.currentHeight || 24 : 44) + 12,
    paddingHorizontal: 20,
    paddingBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.bg,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 12 },
  headerTextGroup: { marginLeft: 12, justifyContent: 'center', flex: 1 },
  welcomeText: { fontSize: 12, color: COLORS.textSubtle, fontWeight: '400' },
  userName: { fontSize: 18, fontWeight: '800', color: COLORS.textPrimary, letterSpacing: -0.3 },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
  },
  roleBadgeText: { fontSize: 11, fontWeight: '700', color: COLORS.primary },

  /* Body */
  bodyContent: { flex: 1 },
  listScrollContent: { paddingHorizontal: 20, paddingBottom: 40 },

  /* Wallet card */
  walletCard: {
    borderRadius: 26,
    padding: 22,
    overflow: 'hidden',
    shadowColor: '#0F3D2E',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 16,
    elevation: 8,
  },
  cardCircleLarge: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(255,255,255,0.07)',
    top: -80,
    right: -60,
  },
  cardCircleSmall: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(193,240,56,0.08)',
    bottom: -50,
    left: -30,
  },
  walletTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  walletLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  walletIconChip: {
    width: 26,
    height: 26,
    borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroLabel: { color: 'rgba(255,255,255,0.88)', fontSize: 14, fontWeight: '600', letterSpacing: 0.2 },
  eyeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroAmount: {
    color: COLORS.white,
    fontSize: 40,
    fontWeight: '800',
    letterSpacing: -0.8,
    marginTop: 14,
    marginBottom: 18,
  },
  walletStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderRadius: 16,
    paddingVertical: 12,
  },
  walletStat: { flex: 1, alignItems: 'center', gap: 4 },
  statLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statLabel: { fontSize: 11, color: 'rgba(255,255,255,0.75)', fontWeight: '500' },
  statValue: { fontSize: 14, fontWeight: '700', color: COLORS.white },
  statDivider: { width: 1, height: 28, backgroundColor: 'rgba(255,255,255,0.18)' },
  statCaption: {
    marginTop: 10,
    fontSize: 10,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
  },

  /* Section headers */
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary, letterSpacing: -0.2 },
  seeAllText: { fontSize: 12, color: COLORS.textMuted, fontWeight: '500' },
  countPill: {
    backgroundColor: COLORS.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
  },
  countPillText: { fontSize: 12, fontWeight: '700', color: COLORS.primary },

  /* Quick actions */
  quickActionsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  quickActionTile: {
    width: '31.5%',
    backgroundColor: COLORS.white,
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  quickActionIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  quickActionLabel: { fontSize: 11, fontWeight: '600', color: COLORS.textPrimary },

  /* Spenders */
  horizontalSpendersContainer: { gap: 18, paddingVertical: 4, paddingRight: 8 },
  spenderItem: { alignItems: 'center', width: 58 },
  spenderName: {
    fontSize: 11,
    fontWeight: '500',
    color: COLORS.textSubtle,
    marginTop: 6,
    textAlign: 'center',
  },
  addSpenderCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: COLORS.primaryMid,
    backgroundColor: COLORS.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listHint: { fontSize: 11, color: COLORS.textMuted, marginTop: 8 },

  /* Transactions */
  filterRow: {
    flexDirection: 'row',
    backgroundColor: '#EBEFF4',
    borderRadius: 14,
    padding: 4,
    marginBottom: 14,
  },
  filterChip: { flex: 1, paddingVertical: 8, borderRadius: 11, alignItems: 'center' },
  filterChipActive: {
    backgroundColor: COLORS.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  filterChipText: { fontSize: 12, fontWeight: '600', color: COLORS.textSubtle },
  filterChipTextActive: { color: COLORS.primary, fontWeight: '700' },
  transactionsListContainer: { gap: 10 },
  txCardItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  txIconBox: { width: 40, height: 40, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  txDescText: { fontSize: 14, fontWeight: '700', color: COLORS.textPrimary },
  txDateText: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  txAmountText: { fontSize: 14, fontWeight: '700', marginLeft: 8 },

  /* Empty state */
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 28 },
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#EBEFF4',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  emptyTitle: { fontSize: 13, fontWeight: '600', color: COLORS.textSubtle },
  emptySubtitle: { fontSize: 12, color: COLORS.textMuted, textAlign: 'center', marginTop: 4 },

  /* Sheet (shared modal) */
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    width: '100%',
    maxHeight: '88%',
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 22,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 34 : 22,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D9DEE5',
    marginBottom: 14,
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 16, gap: 12 },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: COLORS.textPrimary, letterSpacing: -0.3 },
  sheetSubtitle: { fontSize: 12, color: COLORS.textMuted, marginTop: 3, lineHeight: 17 },
  sheetClose: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetBody: { flexGrow: 0 },
  sheetFooter: { marginTop: 16 },
  actionsRow: { flexDirection: 'row', gap: 10 },
  btnSecondary: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSecondaryText: { fontSize: 14, fontWeight: '600', color: COLORS.textSubtle },
  btnPrimary: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimaryText: { fontSize: 14, fontWeight: '700', color: COLORS.white },
  bodyText: { fontSize: 13, color: COLORS.textSubtle, lineHeight: 19 },

  /* Banner */
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    marginBottom: 14,
    borderWidth: 1,
  },
  bannerError: { backgroundColor: COLORS.dangerSoft, borderColor: COLORS.dangerBorder },
  bannerSuccess: { backgroundColor: COLORS.successSoft, borderColor: COLORS.successBorder },
  bannerText: { fontSize: 12, fontWeight: '600', flex: 1 },

  /* Form fields */
  field: { marginBottom: 16 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 6 },
  fieldErrorRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  fieldErrorText: { fontSize: 12, color: COLORS.danger, fontWeight: '500', flex: 1 },
  fieldHint: { fontSize: 11, color: COLORS.textMuted, marginTop: 6 },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    fontSize: 14,
    color: COLORS.textPrimary,
    backgroundColor: COLORS.bg,
  },
  inputError: { borderColor: COLORS.danger, backgroundColor: COLORS.dangerSoft },
  amountWrapper: { justifyContent: 'center' },
  currencyPrefix: {
    position: 'absolute',
    left: 14,
    zIndex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  amountInput: { paddingLeft: 30 },

  /* Member selection */
  selectMemberButton: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    backgroundColor: COLORS.bg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  selectMemberText: { flex: 1, color: COLORS.textSubtle, fontWeight: '600', fontSize: 14 },
  selectedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    backgroundColor: COLORS.bg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 14,
  },
  selectedName: { fontSize: 14, fontWeight: '700', color: COLORS.textPrimary },
  selectedSub: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  removeButton: { padding: 7, backgroundColor: COLORS.dangerSoft, borderRadius: 10 },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    backgroundColor: COLORS.bg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 10,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: COLORS.pendingSoft,
  },
  statusText: { fontSize: 9, fontWeight: '700', textTransform: 'uppercase', color: COLORS.pendingText },

  /* Period selector */
  periodSelectorContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  periodPill: {
    flexBasis: '31%',
    flexGrow: 1,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  periodPillActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  periodPillText: { fontSize: 12, fontWeight: '600', color: COLORS.textSubtle },
  periodPillTextActive: { color: COLORS.white },
  dateRangeIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingHorizontal: 2,
  },
  dateRangeIndicatorText: { fontSize: 12, color: COLORS.textSubtle, fontWeight: '500' },

  /* Calendar */
  calendarNavRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  calendarMonthTitle: { fontSize: 15, fontWeight: '700', color: COLORS.textPrimary },
  calendarArrowsContainer: {
    flexDirection: 'row',
    backgroundColor: COLORS.bg,
    borderRadius: 12,
    padding: 2,
    gap: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  calendarArrowBtn: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.white,
  },
  weekDaysRow: { flexDirection: 'row', marginBottom: 6 },
  weekDayText: {
    width: '14.28%',
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textMuted,
    textAlign: 'center',
  },
  daysGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCellEmpty: { width: '14.28%', height: 40 },
  dayCell: { width: '14.28%', height: 40, alignItems: 'center', justifyContent: 'center' },
  dayCellSelected: { backgroundColor: COLORS.primary, borderRadius: 20 },
  dayCellInRange: { backgroundColor: COLORS.primarySoft },
  dayCellText: { fontSize: 13, fontWeight: '600', color: COLORS.textPrimary },
  dayCellToday: { borderWidth: 1.5, borderColor: COLORS.primaryMid, borderRadius: 20 },
  dayCellTextToday: { color: COLORS.primaryMid, fontWeight: '800' },
  dayCellTextSelected: { color: COLORS.white },

  /* Budget allocation */
  budgetCard: {
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
    borderRadius: 16,
    padding: 12,
  },
  budgetCardError: { borderColor: COLORS.danger, backgroundColor: COLORS.dangerSoft },
  budgetRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  budgetIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: COLORS.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  budgetTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  budgetTitle: { fontSize: 14, fontWeight: '700', color: COLORS.textPrimary },
  optionalTag: {
    backgroundColor: '#EBEFF4',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 7,
  },
  optionalTagText: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.textSubtle,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  budgetSubtitle: { fontSize: 11, color: COLORS.textMuted, marginTop: 3, lineHeight: 15 },
  budgetSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  budgetSummaryText: { flex: 1, fontSize: 12, fontWeight: '600' },
  budgetEditBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: COLORS.primarySoft,
  },
  budgetEditText: { fontSize: 12, fontWeight: '700', color: COLORS.primary },

  budgetHero: {
    backgroundColor: COLORS.primarySoft,
    borderRadius: 18,
    padding: 16,
    marginBottom: 16,
  },
  budgetHeroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  budgetHeroLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.primaryMid,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  budgetHeroAmount: {
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.primary,
    letterSpacing: -0.5,
    marginTop: 4,
  },
  budgetHeroBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: COLORS.white,
  },
  budgetHeroBadgeText: { fontSize: 11, fontWeight: '700' },
  budgetTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(15,61,46,0.12)',
    overflow: 'hidden',
    marginTop: 14,
  },
  budgetFill: { height: '100%', borderRadius: 4 },
  budgetToolsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  budgetToolsLabel: { fontSize: 12, fontWeight: '700', color: COLORS.textPrimary },
  budgetToolsActions: { flexDirection: 'row', gap: 8 },
  toolBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  toolBtnText: { fontSize: 11, fontWeight: '700', color: COLORS.textSubtle },
  budgetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: COLORS.bg,
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  budgetItemIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: COLORS.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  budgetItemName: { flex: 1, fontSize: 13, fontWeight: '600', color: COLORS.textPrimary },
  budgetInputWrap: { width: 118, justifyContent: 'center' },
  budgetPrefix: {
    position: 'absolute',
    left: 10,
    zIndex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  budgetInput: {
    height: 40,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingLeft: 24,
    paddingRight: 10,
    fontSize: 13,
    color: COLORS.textPrimary,
    backgroundColor: COLORS.white,
    textAlign: 'right',
  },
});
