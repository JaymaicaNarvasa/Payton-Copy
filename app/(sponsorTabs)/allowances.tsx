// app/(sponsorTabs)/allowances.tsx
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  DimensionValue,
  FlatList,
  Image,
  RefreshControl,
  StyleProp,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';

import { theme } from '@/constants/theme';
import { GradientBackground } from '../../components/GradientBackground';
import { PaytonAlertDialog } from '../../components/PaytonAlert';
import * as uiStyles from '../../constants/ui.styles';
import { supabase } from '../../lib/supabase';

// Support the exported singular/plural style name used across app revisions.
const styles = (uiStyles as any).sponsorAllowancesStyles ?? (uiStyles as any).sponsorAllowanceStyles;

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
type Health = 'good' | 'low' | 'critical';

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

// Visual variants (colours live in ui.styles.ts)
const STATUS_VARIANTS: Record<AllowanceStatus, { label: string; badge: StyleProp<ViewStyle>; text: StyleProp<any> }> = {
  active: { label: 'Active', badge: styles.rowBadgeActive, text: styles.rowBadgeTextActive },
  upcoming: { label: 'Upcoming', badge: styles.rowBadgeUpcoming, text: styles.rowBadgeTextUpcoming },
  ended: { label: 'Ended', badge: styles.rowBadgeEnded, text: styles.rowBadgeTextEnded },
};

// Same thresholds as before (>50 healthy, >20 warning, otherwise critical)
const getHealth = (pct: number): Health => {
  if (pct > 50) return 'good';
  if (pct > 20) return 'low';
  return 'critical';
};

const HEALTH_VARIANTS: Record<Health, { label: string; pill: StyleProp<ViewStyle>; text: StyleProp<any> }> = {
  good: { label: 'On Track', pill: styles.healthGood, text: styles.healthTextGood },
  low: { label: 'Running Low', pill: styles.healthLow, text: styles.healthTextLow },
  critical: { label: 'Almost Out', pill: styles.healthCritical, text: styles.healthTextCritical },
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
function Avatar({ uri, size = 46 }: { uri?: string | null; size?: number }) {
  const [failed, setFailed] = useState(false);

  if (uri && !failed) {
    return (
      <Image
        source={{ uri }}
        onError={() => setFailed(true)}
        style={[styles.avatarImageBg, { width: size, height: size, borderRadius: size / 2 }]}
      />
    );
  }

  const head = size * 0.32;
  const body = size * 0.74;
  return (
    <View style={[styles.avatarFallbackBg, { width: size, height: size, borderRadius: size / 2 }]}>
      <View
        style={[
          styles.avatarSilhouette,
          {
            width: head,
            height: head,
            borderRadius: head / 2,
            top: size * 0.2,
            left: (size - head) / 2,
          },
        ]}
      />
      <View
        style={[
          styles.avatarSilhouette,
          {
            width: body,
            height: body,
            borderRadius: body / 2,
            top: size * 0.6,
            left: (size - body) / 2,
          },
        ]}
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
    <Animated.View style={[styles.skeleton, { width, height, borderRadius: radius, opacity }, style]} />
  );
}

function AllowancesSkeleton() {
  return (
    <View style={styles.listContent}>
      <Skeleton width="100%" height={150} radius={24} style={styles.skeletonSummary} />
      <View style={styles.sectionHeader}>
        <Skeleton width={150} height={18} radius={9} />
        <Skeleton width={120} height={30} radius={15} />
      </View>
      {[0, 1].map((i) => (
        <View key={i} style={styles.card}>
          <View style={styles.skeletonHeaderRow}>
            <Skeleton width={46} height={46} radius={23} />
            <View style={styles.skeletonHeaderText}>
              <Skeleton width="55%" height={14} radius={7} />
              <Skeleton width="35%" height={11} radius={5} />
            </View>
            <Skeleton width={84} height={26} radius={13} />
          </View>
          <Skeleton width="100%" height={64} radius={16} style={styles.skeletonGapTop} />
          <Skeleton width="45%" height={14} radius={7} style={styles.skeletonGapTop} />
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
        <Ionicons name="checkmark-circle" size={18} color={theme.colors.success} />
        <Text style={styles.toastText}>{message}</Text>
      </View>
    </View>
  );
}

/* ---------- Screen ---------- */
export default function AllowancesScreen() {
  const router = useRouter();
  const [spenderCards, setSpenderCards] = useState<SpenderAllowanceCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // cards start collapsed (like the design); tap the footer row to show the allowance list
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

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

  const toggleExpanded = (id: string) => setExpanded((p) => ({ ...p, [id]: !p[id] }));

  // "+ Add Allowance" opens the Sponsor Home, where allowances are created (no creation logic lives here)
  const handleAddAllowance = () => {
    router.navigate('/(sponsorTabs)/home' as never);
  };

  const showSkeleton = loading && !refreshing;

  /* ---------- Render ---------- */
  const renderHeaderBlock = () => (
    <View>
      {/* Total allocated */}
      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>Total Allocated</Text>
        <Text style={styles.summaryAmount} numberOfLines={1} adjustsFontSizeToFit>
          {formatPeso(totals.allocated)}
        </Text>

        <View style={styles.summaryInner}>
          <View style={styles.summaryCol}>
            <Text style={styles.summaryLabel}>Spent so far</Text>
            <Text style={styles.summaryValue} numberOfLines={1} adjustsFontSizeToFit>
              {formatPeso(totals.spent)}
            </Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryCol}>
            <Text style={styles.summaryLabel}>Left to spend</Text>
            <Text style={styles.summaryValue} numberOfLines={1} adjustsFontSizeToFit>
              {formatPeso(totals.remaining)}
            </Text>
          </View>
        </View>
      </View>

      {/* Section header */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Active Allowances</Text>
        <TouchableOpacity style={styles.addPill} onPress={handleAddAllowance} activeOpacity={0.8}>
          <Ionicons name="add" size={14} color={theme.colors.gradientEnd} />
          <Text style={styles.addPillText}>Add Allowance</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderSpenderCard = ({ item }: { item: SpenderAllowanceCardData }) => {
    const remainingPercent =
      item.totalAllocated > 0
        ? Math.min(100, Math.round((item.totalRemaining / item.totalAllocated) * 100))
        : 0;
    const health = HEALTH_VARIANTS[getHealth(remainingPercent)];
    const isOpen = !!expanded[item.spender_id];
    const count = item.allowances.length;
    const primary = item.allowances[0];

    return (
      <View style={styles.card}>
        {/* Spender + totals: tap to open the spender's monitoring screen */}
        <TouchableOpacity activeOpacity={0.8} onPress={() => handleCardPress(item.spender_id)}>
          <View style={styles.cardHeader}>
            <Avatar uri={item.spender_avatar_url} size={46} />
            <View style={styles.cardTitleBlock}>
              <Text style={styles.cardTitle} numberOfLines={1}>{primary?.allowance_name ?? 'Allowance'}</Text>
              <Text style={styles.cardSubtitle} numberOfLines={1}>{item.spender_name}</Text>
            </View>
            <View style={[styles.healthPill, health.pill]}>
              <Text style={[styles.healthPillText, health.text]}>{health.label}</Text>
            </View>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statCol}>
              <Text style={styles.statLabel}>Allocated</Text>
              <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
                {formatPeso(item.totalAllocated, false)}
              </Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statCol}>
              <Text style={styles.statLabel}>Spent</Text>
              <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
                {formatPeso(item.totalSpent, false)}
              </Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statCol}>
              <Text style={styles.statLabel}>Remaining</Text>
              <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
                {formatPeso(item.totalRemaining, false)}
              </Text>
            </View>
          </View>
        </TouchableOpacity>

        {/* Footer: count + expand / collapse the allowance list */}
        <TouchableOpacity
          style={styles.cardFooter}
          activeOpacity={0.7}
          onPress={() => toggleExpanded(item.spender_id)}
        >
          <View style={styles.footerLeft}>
            <View style={styles.footerIconCircle}>
              <Ionicons name="wallet" size={14} color={theme.colors.gradientEnd} />
            </View>
            <Text style={styles.footerText}>
              {count} Active Allowance{count === 1 ? '' : 's'}
            </Text>
          </View>
          <Ionicons name={isOpen ? 'chevron-up' : 'chevron-forward'} size={18} color={theme.colors.textGray} />
        </TouchableOpacity>

        {isOpen &&
          item.allowances.map((a) => {
            const status = STATUS_VARIANTS[getAllowanceStatus(a.start_date, a.end_date)];

            return (
              <View key={a.id} style={styles.allowanceRow}>
                <View style={styles.allowanceTop}>
                  <View style={styles.allowanceInfo}>
                    <View style={styles.allowanceNameRow}>
                      <Text style={styles.allowanceName} numberOfLines={1}>{a.allowance_name}</Text>
                      <View style={[styles.rowBadge, status.badge]}>
                        <Text style={[styles.rowBadgeText, status.text]}>{status.label}</Text>
                      </View>
                    </View>
                    <View style={styles.allowanceDateRow}>
                      <Ionicons name="calendar-outline" size={12} color={theme.colors.textMuted} />
                      <Text style={styles.allowanceDate}>
                        {formatAllowanceDateRange(a.start_date, a.end_date, a.received_at)}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.allowanceAmount}>{formatPeso(a.amount)}</Text>
                </View>

                <View style={styles.rowActions}>
                  <TouchableOpacity onPress={() => askArchive(a)} style={styles.iconBtn} activeOpacity={0.7}>
                    <Ionicons name="archive-outline" size={18} color={theme.colors.dueGreen} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => askDelete(a)} style={[styles.iconBtn, styles.iconBtnDanger]} activeOpacity={0.7}>
                    <Ionicons name="trash-outline" size={18} color={theme.colors.danger} />
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* HEADER */}
      <View style={styles.header}>
        <View style={styles.headerGradient}>
          <GradientBackground />
        </View>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={20} color={theme.colors.gradientEnd} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Allowances</Text>
        </View>
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
                colors={[theme.colors.brand]}
                tintColor={theme.colors.brand}
              />
            }
            ListHeaderComponent={renderHeaderBlock()}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <View style={styles.emptyIcon}>
                  <Ionicons name="wallet-outline" size={22} color={theme.colors.textMuted} />
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

      {/* Confirmation / error dialog (shared Payton alert, driven by local state) */}
      <PaytonAlertDialog
        visible={dialog.visible}
        type={dialog.type === 'archive' ? 'info' : 'error'}
        title={dialog.title}
        message={dialog.message}
        busy={actionLoading}
        buttons={
          dialog.type === 'error'
            ? [{ text: 'Okay', onPress: dialog.onConfirm }]
            : [
                { text: 'Cancel', style: 'cancel', onPress: closeDialog },
                {
                  text: dialog.type === 'archive' ? 'Archive' : 'Delete',
                  style: dialog.type === 'delete' ? 'destructive' : 'default',
                  onPress: dialog.onConfirm,
                },
              ]
        }
        onDismiss={closeDialog}
      />
    </View>
  );
}