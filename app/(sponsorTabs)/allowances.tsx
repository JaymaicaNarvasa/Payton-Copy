// app/(sponsorTabs)/allowances.tsx
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  DimensionValue,
  FlatList,
  Image,
  Modal,
  StatusBar as NativeStatusBar,
  Platform,
  Pressable,
  RefreshControl,
  StyleProp,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';

import { supabase } from '../../lib/supabase';

/* ---------- Types ---------- */
interface AllowanceGroupItem {
  id: string;
  allowance_name: string;
  amount: number;
  spent: number;
  start_date: string;
  end_date: string;
  received_at: string;
}

interface SpenderAllowanceCardData {
  spender_id: string;
  spender_name: string;
  spender_avatar_url: string | null;
  allowances: AllowanceGroupItem[];
  totalAllocated: number;
  totalSpent: number;
  totalRemaining: number;
}

type DialogType = 'archive' | 'delete' | 'error';

interface DialogState {
  visible: boolean;
  type: DialogType;
  title: string;
  message: string;
  onConfirm: () => void;
}

type AllowanceStatus = 'active' | 'upcoming' | 'ended';

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
  track: '#E8EDF3',
  warning: '#F59E0B',
  pendingSoft: '#FEF9C3',
  pendingText: '#A16207',
};

/* ---------- Helpers ---------- */
const formatPeso = (n: number, fixed = true) =>
  `₱${n.toLocaleString('en-US', {
    minimumFractionDigits: fixed ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;

const todayString = () => {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
};

const getAllowanceStatus = (start: string, end: string): AllowanceStatus => {
  const today = todayString();
  if (start && today < start.slice(0, 10)) return 'upcoming';
  if (end && today > end.slice(0, 10)) return 'ended';
  return 'active';
};

const STATUS_STYLES: Record<AllowanceStatus, { label: string; bg: string; color: string }> = {
  active: { label: 'Active', bg: COLORS.primarySoft, color: COLORS.primary },
  upcoming: { label: 'Upcoming', bg: COLORS.pendingSoft, color: COLORS.pendingText },
  ended: { label: 'Ended', bg: '#EEF1F5', color: COLORS.textSubtle },
};

const progressColor = (pct: number) => {
  if (pct > 50) return COLORS.primaryMid;
  if (pct > 20) return COLORS.warning;
  return COLORS.danger;
};

const parseDate = (s: string) => new Date(s.includes('T') ? s : `${s}T00:00:00`);

const formatDateOnly = (dateStr: string) => {
  try {
    if (!dateStr) return '';
    return parseDate(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
};

const formatAllowanceDateRange = (startDate: string, endDate: string, receivedAt: string) => {
  if (startDate && endDate) {
    try {
      const startD = parseDate(startDate);
      const endD = parseDate(endDate);
      const startMonth = startD.toLocaleDateString('en-US', { month: 'short' });
      const endMonth = endD.toLocaleDateString('en-US', { month: 'short' });
      const startDay = startD.getDate();
      const endDay = endD.getDate();
      const startYear = startD.getFullYear();
      const endYear = endD.getFullYear();

      if (startMonth === endMonth && startDay === endDay && startYear === endYear) {
        return `${startMonth} ${startDay}, ${startYear}`;
      }
      if (startMonth === endMonth && startYear === endYear) {
        return `${startMonth} ${startDay} - ${endDay}, ${startYear}`;
      }
      return `${startMonth} ${startDay}, ${startYear} - ${endMonth} ${endDay}, ${endYear}`;
    } catch {
      return `${formatDateOnly(startDate)} - ${formatDateOnly(endDate)}`;
    }
  }
  return formatDateOnly(startDate || receivedAt);
};

/* ---------- Reusable UI ---------- */
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

function AllowancesSkeleton() {
  return (
    <View style={styles.listContent}>
      <Skeleton width="100%" height={168} radius={26} style={{ marginBottom: 24 }} />
      <View style={styles.sectionHeader}>
        <Skeleton width={90} height={16} radius={8} />
        <Skeleton width={28} height={20} radius={10} />
      </View>
      {[0, 1].map((i) => (
        <View key={i} style={styles.card}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Skeleton width={46} height={46} radius={23} />
            <View style={{ marginLeft: 12, flex: 1, gap: 8 }}>
              <Skeleton width="55%" height={14} radius={7} />
              <Skeleton width="35%" height={10} radius={5} />
            </View>
            <Skeleton width={84} height={30} radius={15} />
          </View>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
            {[0, 1, 2].map((j) => (
              <Skeleton key={j} width="31%" height={52} radius={14} />
            ))}
          </View>
          <Skeleton width="100%" height={8} radius={4} style={{ marginTop: 16 }} />
          <Skeleton width="100%" height={72} radius={14} style={{ marginTop: 16 }} />
        </View>
      ))}
    </View>
  );
}

function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <View pointerEvents="none" style={styles.toastWrap}>
      <View style={styles.toast}>
        <Ionicons name="checkmark-circle" size={18} color={COLORS.success} />
        <Text style={styles.toastText}>{message}</Text>
      </View>
    </View>
  );
}

function AlertDialog({
  visible,
  type,
  title,
  message,
  loading,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  type: DialogType;
  title: string;
  message: string;
  loading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const danger = type !== 'archive';
  const iconName = type === 'archive' ? 'archive-outline' : type === 'delete' ? 'trash-outline' : 'alert-circle-outline';
  const confirmLabel = type === 'archive' ? 'Archive' : type === 'delete' ? 'Delete' : 'Okay';

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onCancel} statusBarTranslucent>
      <View style={styles.dialogOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={loading ? undefined : onCancel} />
        <View style={styles.dialog}>
          <View style={[styles.dialogIcon, { backgroundColor: danger ? COLORS.dangerSoft : COLORS.primarySoft }]}>
            <Ionicons name={iconName} size={24} color={danger ? COLORS.danger : COLORS.primaryMid} />
          </View>
          <Text style={styles.dialogTitle}>{title}</Text>
          <Text style={styles.dialogMessage}>{message}</Text>

          <View style={styles.actionsRow}>
            {type !== 'error' && (
              <TouchableOpacity
                style={styles.btnSecondary}
                onPress={onCancel}
                disabled={loading}
                activeOpacity={0.8}
              >
                <Text style={styles.btnSecondaryText}>Cancel</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[
                styles.btnPrimary,
                type === 'delete' && { backgroundColor: COLORS.danger },
                loading && { opacity: 0.6 },
              ]}
              onPress={onConfirm}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator size="small" color={COLORS.white} />
              ) : (
                <Text style={styles.btnPrimaryText}>{confirmLabel}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/* ---------- Screen ---------- */
export default function AllowancesScreen() {
  const router = useRouter();
  const [spenderCards, setSpenderCards] = useState<SpenderAllowanceCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [actionLoading, setActionLoading] = useState(false);
  const [dialog, setDialog] = useState<DialogState>({
    visible: false,
    type: 'archive',
    title: '',
    message: '',
    onConfirm: () => {},
  });

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  };

  const closeDialog = () => {
    if (actionLoading) return;
    setDialog((p) => ({ ...p, visible: false }));
  };

  /* ---------- Data ---------- */
  const fetchAllowancesData = async (isRefreshing = false) => {
    try {
      if (!isRefreshing) setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: allowancesData, error: allowancesError } = await supabase
        .from('allowances')
        .select(`
          id,
          allowance_name,
          amount,
          spender_id,
          start_date,
          end_date,
          received_at,
          profiles!allowances_spender_id_fkey (id, full_name, avatar_url),
          expenses!expenses_allowance_id_fkey (amount)
        `)
        .eq('sponsor_id', user.id)
        .eq('is_archived', false)
        .order('received_at', { ascending: false });

      if (allowancesError) throw allowancesError;

      const spenderCardMap = new Map<string, SpenderAllowanceCardData>();

      (allowancesData || []).forEach((item: any) => {
        const allowanceAmount = Number(item.amount);
        const spentForAllowance = (item.expenses || []).reduce(
          (sum: number, exp: { amount: number }) => sum + Number(exp.amount),
          0,
        );

        const spenderId = item.spender_id;
        if (!spenderCardMap.has(spenderId)) {
          spenderCardMap.set(spenderId, {
            spender_id: spenderId,
            spender_name: item.profiles?.full_name || 'Unknown',
            spender_avatar_url: item.profiles?.avatar_url || null,
            allowances: [],
            totalAllocated: 0,
            totalSpent: 0,
            totalRemaining: 0,
          });
        }

        const cardData = spenderCardMap.get(spenderId)!;
        cardData.totalAllocated += allowanceAmount;
        cardData.totalSpent += spentForAllowance;
        cardData.allowances.push({
          id: item.id,
          allowance_name: item.allowance_name,
          amount: allowanceAmount,
          spent: spentForAllowance,
          start_date: item.start_date,
          end_date: item.end_date,
          received_at: item.received_at,
        });
      });

      spenderCardMap.forEach((card) => {
        card.totalRemaining = Math.max(0, card.totalAllocated - card.totalSpent);
      });

      setSpenderCards(Array.from(spenderCardMap.values()));
    } catch (e: any) {
      console.error('Error fetching allowances:', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { fetchAllowancesData(); }, []));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchAllowancesData(true);
  }, []);

  const totals = useMemo(
    () =>
      spenderCards.reduce(
        (acc, c) => ({
          allocated: acc.allocated + c.totalAllocated,
          spent: acc.spent + c.totalSpent,
          remaining: acc.remaining + c.totalRemaining,
        }),
        { allocated: 0, spent: 0, remaining: 0 },
      ),
    [spenderCards],
  );

  /* ---------- Actions ---------- */
  const logAction = async (details: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) await supabase.from('logs').insert({ user_id: user.id, details });
  };

  const showActionError = (message: string) => {
    setDialog({
      visible: true,
      type: 'error',
      title: 'Action Failed',
      message,
      onConfirm: () => setDialog((p) => ({ ...p, visible: false })),
    });
  };

  const performArchive = async (item: AllowanceGroupItem) => {
    setActionLoading(true);
    try {
      const { error } = await supabase.from('allowances').update({ is_archived: true }).eq('id', item.id);
      if (error) throw error;
      await logAction(`archived allowance record ("${item.allowance_name}").`);
      setDialog((p) => ({ ...p, visible: false }));
      await fetchAllowancesData(true);
      showToast(`"${item.allowance_name}" archived successfully.`);
    } catch {
      showActionError('Unable to archive the allowance right now. Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  const performDelete = async (item: AllowanceGroupItem) => {
    setActionLoading(true);
    try {
      const { error } = await supabase.from('allowances').delete().eq('id', item.id);
      if (error) throw error;
      await logAction(`deleted allowance record ("${item.allowance_name}").`);
      setDialog((p) => ({ ...p, visible: false }));
      await fetchAllowancesData(true);
      showToast(`"${item.allowance_name}" permanently deleted.`);
    } catch {
      showActionError('Unable to delete the allowance right now. Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  const askArchive = (item: AllowanceGroupItem) =>
    setDialog({
      visible: true,
      type: 'archive',
      title: 'Archive Allowance',
      message: `"${item.allowance_name}" will be moved to archives and hidden from active tracking. You can restore it later if needed.`,
      onConfirm: () => performArchive(item),
    });

  const askDelete = (item: AllowanceGroupItem) =>
    setDialog({
      visible: true,
      type: 'delete',
      title: 'Delete Allowance',
      message: `This will permanently delete "${item.allowance_name}" and cannot be undone. Associated tracking records may be affected.`,
      onConfirm: () => performDelete(item),
    });

  const handleCardPress = (spenderId: string) => {
    router.push({ pathname: '/monitoring', params: { spenderId } });
  };

  const toggleCollapsed = (id: string) => setCollapsed((p) => ({ ...p, [id]: !p[id] }));

  const showSkeleton = loading && !refreshing;

  /* ---------- Render ---------- */
  const heroPercent =
    totals.allocated > 0
      ? Math.min(100, Math.max(0, Math.round((totals.remaining / totals.allocated) * 100)))
      : 0;
  const heroBarColor = progressColor(heroPercent);

  const renderHeaderBlock = () => (
    <View>
      <View style={styles.heroCard}>
        <View style={styles.heroLabelRow}>
          <View style={styles.heroLabelLeft}>
            <View style={styles.heroIconChip}>
              <Ionicons name="layers-outline" size={15} color={COLORS.primaryMid} />
            </View>
            <Text style={styles.heroLabel}>Remaining Allowance</Text>
          </View>
          <View style={[styles.heroPercentBadge, { backgroundColor: heroBarColor + '1F' }]}>
            <Text style={[styles.heroPercentText, { color: heroBarColor }]}>{heroPercent}%</Text>
          </View>
        </View>

        <View style={styles.heroAmountRow}>
          <Text style={styles.heroAmount} numberOfLines={1} adjustsFontSizeToFit>
            {formatPeso(totals.remaining)}
          </Text>
          <Text style={styles.heroAmountOf} numberOfLines={1}>
            / {formatPeso(totals.allocated, false)}
          </Text>
        </View>

        <View style={styles.heroTrack}>
          <View
            style={[styles.heroFill, { width: `${heroPercent}%`, backgroundColor: heroBarColor }]}
          />
        </View>

        
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Spenders</Text>
        <View style={styles.countPill}>
          <Text style={styles.countPillText}>{spenderCards.length}</Text>
        </View>
      </View>
    </View>
  );

  const renderSpenderCard = ({ item }: { item: SpenderAllowanceCardData }) => {
    const remainingPercent =
      item.totalAllocated > 0
        ? Math.min(100, Math.round((item.totalRemaining / item.totalAllocated) * 100))
        : 0;
    const barColor = progressColor(remainingPercent);
    const expanded = !collapsed[item.spender_id];

    return (
      <View style={styles.card}>
        {/* Spender header */}
        <TouchableOpacity
          style={styles.cardHeader}
          activeOpacity={0.7}
          onPress={() => handleCardPress(item.spender_id)}
        >
          <Avatar uri={item.spender_avatar_url} size={46} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.cardTitle} numberOfLines={1}>{item.spender_name}</Text>
            <View style={styles.cardSubRow}>
              <Ionicons name="layers-outline" size={12} color={COLORS.textMuted} />
              <Text style={styles.cardSubText}>
                {item.allowances.length} allowance{item.allowances.length === 1 ? '' : 's'}
              </Text>
            </View>
          </View>
          <View style={styles.viewBtn}>
            <Text style={styles.viewBtnText}>Expenses</Text>
            <Ionicons name="chevron-forward" size={13} color={COLORS.primary} />
          </View>
        </TouchableOpacity>

        {/* Totals */}
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statBoxLabel}>Allocated</Text>
            <Text style={styles.statBoxValue} numberOfLines={1} adjustsFontSizeToFit>
              {formatPeso(item.totalAllocated, false)}
            </Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statBoxLabel}>Spent</Text>
            <Text style={[styles.statBoxValue, { color: COLORS.danger }]} numberOfLines={1} adjustsFontSizeToFit>
              {formatPeso(item.totalSpent, false)}
            </Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statBoxLabel}>Remaining</Text>
            <Text style={[styles.statBoxValue, { color: COLORS.primaryMid }]} numberOfLines={1} adjustsFontSizeToFit>
              {formatPeso(item.totalRemaining, false)}
            </Text>
          </View>
        </View>

        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${remainingPercent}%`, backgroundColor: barColor }]} />
        </View>
        <View style={styles.progressCaptionRow}>
          <Text style={styles.progressCaption}>Remaining balance</Text>
          <Text style={[styles.progressPercent, { color: barColor }]}>{remainingPercent}%</Text>
        </View>

        {/* Allowance list */}
        <TouchableOpacity
          style={styles.listToggle}
          activeOpacity={0.7}
          onPress={() => toggleCollapsed(item.spender_id)}
        >
          <Text style={styles.listToggleText}>Allowances</Text>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={COLORS.textSubtle} />
        </TouchableOpacity>

        {expanded &&
          item.allowances.map((a) => {
            const status = STATUS_STYLES[getAllowanceStatus(a.start_date, a.end_date)];

            return (
              <View key={a.id} style={styles.allowanceRow}>
                <View style={styles.allowanceTop}>
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <View style={styles.allowanceNameRow}>
                      <Text style={styles.allowanceName} numberOfLines={1}>{a.allowance_name}</Text>
                      <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
                        <Text style={[styles.statusBadgeText, { color: status.color }]}>{status.label}</Text>
                      </View>
                    </View>
                    <View style={styles.allowanceDateRow}>
                      <Ionicons name="calendar-outline" size={12} color={COLORS.textMuted} />
                      <Text style={styles.allowanceDate}>
                        {formatAllowanceDateRange(a.start_date, a.end_date, a.received_at)}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.allowanceAmount}>{formatPeso(a.amount)}</Text>
                </View>

                <View style={styles.allowanceBottom}>
                  <View style={styles.rowActions}>
                    <TouchableOpacity
                      onPress={() => askArchive(a)}
                      style={styles.iconBtn}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="archive-outline" size={18} color={COLORS.primaryMid} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => askDelete(a)}
                      style={[styles.iconBtn, { backgroundColor: COLORS.dangerSoft }]}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="trash-outline" size={18} color={COLORS.danger} />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            );
          })}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      {/* HEADER */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={20} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Allowances</Text>
          <Text style={styles.headerSubtitle}>Manage and track every allowance</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* BODY */}
      <View style={styles.bodyContent}>
        {showSkeleton ? (
          <AllowancesSkeleton />
        ) : (
          <FlatList
            data={spenderCards}
            keyExtractor={(item) => item.spender_id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={[COLORS.primary]}
                tintColor={COLORS.primary}
              />
            }
            ListHeaderComponent={renderHeaderBlock()}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <View style={styles.emptyIcon}>
                  <Ionicons name="wallet-outline" size={22} color={COLORS.textMuted} />
                </View>
                <Text style={styles.emptyTitle}>No allowances found</Text>
                <Text style={styles.emptySubtitle}>
                  Link a spender and send their first allowance from the Home screen.
                </Text>
              </View>
            }
            renderItem={renderSpenderCard}
          />
        )}
      </View>

      <Toast message={toast} />

      <AlertDialog
        visible={dialog.visible}
        type={dialog.type}
        title={dialog.title}
        message={dialog.message}
        loading={actionLoading}
        onConfirm={dialog.onConfirm}
        onCancel={closeDialog}
      />
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
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.bg,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.white,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: COLORS.textPrimary, letterSpacing: -0.3 },
  headerSubtitle: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },

  bodyContent: { flex: 1 },
  listContent: { paddingHorizontal: 20, paddingBottom: 40 },

  /* Hero card */
  heroCard: {
    backgroundColor: COLORS.white,
    borderRadius: 26,
    padding: 22,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: '#0F3D2E',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 4,
  },
  heroLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroLabelLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heroIconChip: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: COLORS.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroLabel: { color: COLORS.textSubtle, fontSize: 14, fontWeight: '600', letterSpacing: 0.2 },
  heroPercentBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  heroPercentText: { fontSize: 12, fontWeight: '800' },
  heroAmountRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 16 },
  heroAmount: {
    flexShrink: 1,
    color: COLORS.textPrimary,
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: -0.8,
  },
  heroAmountOf: { fontSize: 15, fontWeight: '600', color: COLORS.textMuted },
  heroTrack: {
    height: 18,
    backgroundColor: COLORS.track,
    borderRadius: 9,
    overflow: 'hidden',
    marginTop: 18,
  },
  heroFill: { height: '100%', borderRadius: 9 },
  heroCaptionRow: { marginTop: 10 },
  heroCaption: { fontSize: 12, color: COLORS.textMuted, fontWeight: '500' },

  /* Section header */
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary, letterSpacing: -0.2 },
  countPill: {
    backgroundColor: COLORS.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
  },
  countPillText: { fontSize: 12, fontWeight: '700', color: COLORS.primary },

  /* Spender card */
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary },
  cardSubRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  cardSubText: { fontSize: 12, color: COLORS.textMuted, fontWeight: '500' },
  viewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: COLORS.primarySoft,
    paddingLeft: 12,
    paddingRight: 8,
    paddingVertical: 7,
    borderRadius: 14,
  },
  viewBtnText: { fontSize: 12, fontWeight: '700', color: COLORS.primary },

  statsRow: { flexDirection: 'row', gap: 8, marginTop: 16 },
  statBox: {
    flex: 1,
    backgroundColor: COLORS.bg,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  statBoxLabel: { fontSize: 10, fontWeight: '600', color: COLORS.textMuted, marginBottom: 4 },
  statBoxValue: { fontSize: 14, fontWeight: '800', color: COLORS.textPrimary },

  progressTrack: {
    height: 8,
    backgroundColor: COLORS.track,
    borderRadius: 4,
    overflow: 'hidden',
    marginTop: 14,
  },
  progressFill: { height: '100%', borderRadius: 4 },
  progressCaptionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  progressCaption: { fontSize: 11, color: COLORS.textMuted, fontWeight: '500' },
  progressPercent: { fontSize: 12, fontWeight: '800' },

  listToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingTop: 14,
    paddingBottom: 6,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  listToggleText: { fontSize: 13, fontWeight: '700', color: COLORS.textPrimary },

  /* Allowance rows */
  allowanceRow: {
    backgroundColor: COLORS.bg,
    borderRadius: 16,
    padding: 14,
    marginTop: 10,
  },
  allowanceTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  allowanceNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  allowanceName: { fontSize: 15, fontWeight: '700', color: COLORS.textPrimary, flexShrink: 1 },
  statusBadge: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 8 },
  statusBadgeText: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.3 },
  allowanceDateRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 },
  allowanceDate: { fontSize: 12, color: COLORS.textMuted },
  allowanceAmount: { fontSize: 17, fontWeight: '800', color: COLORS.textPrimary, letterSpacing: -0.3 },
  allowanceBottom: { marginTop: 12 },
  rowActions: { flexDirection: 'row', gap: 10 },
  iconBtn: {
    flex: 1,
    height: 40,
    borderRadius: 12,
    backgroundColor: COLORS.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* Empty */
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
    backgroundColor: COLORS.card,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#EBEFF4',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  emptyTitle: { fontSize: 14, fontWeight: '700', color: COLORS.textPrimary },
  emptySubtitle: {
    fontSize: 12,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 17,
  },

  /* Toast */
  toastWrap: { position: 'absolute', left: 20, right: 20, bottom: 28 },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.successSoft,
    borderWidth: 1,
    borderColor: COLORS.successBorder,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 6,
  },
  toastText: { fontSize: 13, fontWeight: '600', color: COLORS.success, flex: 1 },

  /* Alert dialog */
  dialogOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  dialog: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: COLORS.white,
    borderRadius: 26,
    padding: 24,
    alignItems: 'center',
  },
  dialogIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  dialogTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.textPrimary,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  dialogMessage: {
    fontSize: 13,
    color: COLORS.textSubtle,
    textAlign: 'center',
    lineHeight: 19,
    marginTop: 8,
    marginBottom: 22,
  },
  actionsRow: { flexDirection: 'row', gap: 10, width: '100%' },
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
});
