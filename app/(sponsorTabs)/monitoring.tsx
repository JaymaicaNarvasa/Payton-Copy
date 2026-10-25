// app/monitoring.tsx
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  DimensionValue,
  FlatList,
  Image,
  Modal,
  StatusBar as NativeStatusBar,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';

import { supabase } from '../../lib/supabase';

/* ---------- Types ---------- */
interface ExpenseItem {
  id: string;
  description: string;
  amount: number;
  spent_at: string;
  photo_url?: string | null;
  category_id?: string;
  categories?: {
    name?: string;
    icon?: string;
  };
}

type ExpenseFilter = 'all' | 'today' | 'week' | 'month' | 'year';

const FILTERS: { key: ExpenseFilter; label: string; caption: string }[] = [
  { key: 'all', label: 'All', caption: 'All time' },
  { key: 'today', label: 'Today', caption: 'Today' },
  { key: 'week', label: 'This Week', caption: 'This week' },
  { key: 'month', label: 'This Month', caption: 'This month' },
  { key: 'year', label: 'This Year', caption: 'This year' },
];

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
  border: '#E8ECF1',
  borderLight: '#F0F2F5',
};

/* ---------- Helpers ---------- */
const formatPeso = (n: number, fixed = true) =>
  `₱${n.toLocaleString('en-US', {
    minimumFractionDigits: fixed ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;

/** Start of the selected period in local time, or null for "All". */
const getFilterStart = (filter: ExpenseFilter): Date | null => {
  const n = new Date();
  const y = n.getFullYear();
  const m = n.getMonth();
  const d = n.getDate();

  switch (filter) {
    case 'today':
      return new Date(y, m, d);
    case 'week':
      return new Date(y, m, d - n.getDay());
    case 'month':
      return new Date(y, m, 1);
    case 'year':
      return new Date(y, 0, 1);
    default:
      return null;
  }
};

const formatDateTime = (dateStr: string) => {
  try {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return (
      d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
      ' at ' +
      d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    );
  } catch {
    return dateStr;
  }
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

function MonitoringSkeleton() {
  return (
    <View style={styles.listContent}>
      <Skeleton width="100%" height={190} radius={26} />
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 20 }}>
        {[64, 84, 96, 100, 96].map((w, i) => (
          <Skeleton key={i} width={w} height={38} radius={19} />
        ))}
      </View>
      <Skeleton width="100%" height={48} radius={14} style={{ marginTop: 14, marginBottom: 16 }} />
      <View style={{ gap: 10 }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <View key={i} style={styles.expenseCard}>
            <Skeleton width={42} height={42} radius={14} />
            <View style={{ marginLeft: 12, flex: 1, gap: 8 }}>
              <Skeleton width="60%" height={12} radius={6} />
              <Skeleton width="45%" height={10} radius={5} />
            </View>
            <Skeleton width={64} height={14} radius={7} />
          </View>
        ))}
      </View>
    </View>
  );
}

/* ---------- Screen ---------- */
export default function MonitoringScreen() {
  const router = useRouter();
  const { spenderId } = useLocalSearchParams<{ spenderId: string }>();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [spenderName, setSpenderName] = useState('Spender');
  const [spenderAvatar, setSpenderAvatar] = useState<string | null>(null);
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);

  const [filter, setFilter] = useState<ExpenseFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);

  /* ---------- Data ---------- */
  const fetchMonitoringData = async (isRefreshing = false) => {
    if (!spenderId) return;
    try {
      if (!isRefreshing) setLoading(true);

      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, avatar_url')
        .eq('id', spenderId)
        .single();

      if (profile?.full_name) setSpenderName(profile.full_name);
      setSpenderAvatar(profile?.avatar_url || null);

      const { data: expenseData, error: expenseError } = await supabase
        .from('expenses')
        .select(`
          id, description, amount, spent_at, category_id, photo_url,
          allowances!inner (spender_id, is_archived),
          categories (name, icon)
        `)
        .eq('allowances.spender_id', spenderId)
        .eq('allowances.is_archived', false)
        .order('spent_at', { ascending: false });

      if (expenseError) throw expenseError;

      setExpenses(
        (expenseData || []).map((expense: any) => ({
          ...expense,
          categories: Array.isArray(expense.categories) ? expense.categories[0] : expense.categories,
        })),
      );
    } catch (e: any) {
      console.error('Error loading monitoring data:', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchMonitoringData();
    }, [spenderId]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchMonitoringData(true);
  }, [spenderId]);

  /* ---------- Derived ---------- */
  const filteredExpenses = useMemo(() => {
    const start = getFilterStart(filter);
    const query = searchQuery.trim().toLowerCase();

    return expenses.filter((exp) => {
      if (start && new Date(exp.spent_at) < start) return false;
      if (!query) return true;
      return (
        exp.description?.toLowerCase().includes(query) ||
        exp.categories?.name?.toLowerCase().includes(query)
      );
    });
  }, [expenses, filter, searchQuery]);

  const summary = useMemo(() => {
    const amounts = filteredExpenses.map((e) => Number(e.amount));
    const total = amounts.reduce((s, n) => s + n, 0);
    return {
      total,
      count: amounts.length,
      highest: amounts.length ? Math.max(...amounts) : 0,
      average: amounts.length ? total / amounts.length : 0,
    };
  }, [filteredExpenses]);

  const filterCaption = FILTERS.find((f) => f.key === filter)?.caption ?? 'All time';
  const showSkeleton = loading && !refreshing;

  /* ---------- Render ---------- */
  const renderListHeader = () => (
    <View>
      <LinearGradient
        colors={['#4FA87A', '#1E6244', '#013237']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.heroCard}
      >
        <View style={styles.cardCircleLarge} />
        <View style={styles.cardCircleSmall} />

        <View style={styles.heroLabelRow}>
          <View style={styles.heroLabelLeft}>
            <View style={styles.heroIconChip}>
              <Ionicons name="receipt-outline" size={14} color={COLORS.white} />
            </View>
            <Text style={styles.heroLabel}>Total Spent</Text>
          </View>
          <View style={styles.captionPill}>
            <Text style={styles.captionPillText}>{filterCaption}</Text>
          </View>
        </View>

        <Text style={styles.heroAmount}>{formatPeso(summary.total)}</Text>

        <View style={styles.heroStatsRow}>
          <View style={styles.heroStat}>
            <View style={styles.statLabelRow}>
              <Ionicons name="list" size={13} color="rgba(255,255,255,0.85)" />
              <Text style={styles.statLabel}>Entries</Text>
            </View>
            <Text style={styles.statValue}>{summary.count}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.heroStat}>
            <View style={styles.statLabelRow}>
              <Ionicons name="trending-up" size={13} color="#FCA5A5" />
              <Text style={styles.statLabel}>Highest</Text>
            </View>
            <Text style={styles.statValue}>{formatPeso(summary.highest, false)}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.heroStat}>
            <View style={styles.statLabelRow}>
              <Ionicons name="analytics" size={13} color={COLORS.accentGreen} />
              <Text style={styles.statLabel}>Average</Text>
            </View>
            <Text style={styles.statValue}>{formatPeso(summary.average, false)}</Text>
          </View>
        </View>
      </LinearGradient>

      {/* Filters */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <TouchableOpacity
              key={f.key}
              style={[styles.filterChip, active && styles.filterChipActive]}
              activeOpacity={0.8}
              onPress={() => setFilter(f.key)}
            >
              <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{f.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Search */}
      {expenses.length > 0 && (
        <View style={styles.searchContainer}>
          <Ionicons name="search-outline" size={18} color={COLORS.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by description or category"
            placeholderTextColor={COLORS.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={18} color={COLORS.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );

  const renderExpense = ({ item: exp }: { item: ExpenseItem }) => (
    <View style={styles.expenseCard}>
      <View style={styles.expenseIconBox}>
        <Ionicons
          name={(exp.categories?.icon as any) || 'pricetag-outline'}
          size={19}
          color={COLORS.primaryMid}
        />
      </View>

      <View style={{ flex: 1, marginLeft: 12, marginRight: 8 }}>
        <View style={styles.expenseNameRow}>
          <Text style={styles.expenseName} numberOfLines={1}>{exp.description}</Text>
          {exp.photo_url ? (
            <TouchableOpacity
              style={styles.photoBadge}
              onPress={() => setSelectedImageUri(exp.photo_url!)}
              activeOpacity={0.7}
            >
              <Ionicons name="image" size={11} color={COLORS.primaryMid} />
            </TouchableOpacity>
          ) : null}
        </View>
        <Text style={styles.expenseTime} numberOfLines={1}>
          {exp.categories?.name ? `${exp.categories.name} • ` : ''}
          {formatDateTime(exp.spent_at)}
        </Text>
      </View>

      <Text style={styles.expenseAmount}>-{formatPeso(Number(exp.amount))}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      {/* HEADER */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={20} color={COLORS.textPrimary} />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          {showSkeleton ? (
            <>
              <Skeleton width={120} height={16} radius={8} />
              <Skeleton width={70} height={10} radius={5} style={{ marginTop: 6 }} />
            </>
          ) : (
            <>
              <Text style={styles.headerTitle} numberOfLines={1}>{spenderName}</Text>
              <Text style={styles.headerSubtitle}>Expense log</Text>
            </>
          )}
        </View>

        {showSkeleton ? <Skeleton width={40} height={40} radius={20} /> : <Avatar uri={spenderAvatar} size={40} />}
      </View>

      {/* BODY */}
      <View style={styles.bodyContent}>
        {showSkeleton ? (
          <MonitoringSkeleton />
        ) : (
          <FlatList
            data={filteredExpenses}
            keyExtractor={(item) => item.id}
            renderItem={renderExpense}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.listContent}
            ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={[COLORS.primary]}
                tintColor={COLORS.primary}
              />
            }
            ListHeaderComponent={renderListHeader()}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <View style={styles.emptyIcon}>
                  <Ionicons
                    name={expenses.length === 0 ? 'receipt-outline' : 'search-outline'}
                    size={22}
                    color={COLORS.textMuted}
                  />
                </View>
                <Text style={styles.emptyTitle}>
                  {expenses.length === 0 ? 'No expenses logged yet' : 'No expenses found'}
                </Text>
                <Text style={styles.emptySubtitle}>
                  {expenses.length === 0
                    ? 'Expenses logged by this spender will appear here.'
                    : 'Try a different time period or search.'}
                </Text>
              </View>
            }
          />
        )}
      </View>

      {/* IMAGE VIEWER */}
      <Modal
        visible={!!selectedImageUri}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedImageUri(null)}
        statusBarTranslucent
      >
        <View style={styles.imageOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setSelectedImageUri(null)} />
          <TouchableOpacity
            style={styles.closeImageButton}
            onPress={() => setSelectedImageUri(null)}
            activeOpacity={0.8}
          >
            <Ionicons name="close" size={22} color={COLORS.white} />
          </TouchableOpacity>
          {selectedImageUri ? (
            <Image source={{ uri: selectedImageUri }} style={styles.fullScreenImage} resizeMode="contain" />
          ) : null}
        </View>
      </Modal>
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
  headerCenter: { flex: 1, alignItems: 'center', paddingHorizontal: 12 },
  headerTitle: { fontSize: 17, fontWeight: '800', color: COLORS.textPrimary, letterSpacing: -0.3 },
  headerSubtitle: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },

  bodyContent: { flex: 1 },
  listContent: { paddingHorizontal: 20, paddingBottom: 40 },

  /* Hero card */
  heroCard: {
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
  heroLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroLabelLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heroIconChip: {
    width: 26,
    height: 26,
    borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroLabel: { color: 'rgba(255,255,255,0.88)', fontSize: 14, fontWeight: '600', letterSpacing: 0.2 },
  captionPill: {
    backgroundColor: 'rgba(255,255,255,0.16)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  captionPillText: { fontSize: 11, fontWeight: '700', color: COLORS.white },
  heroAmount: {
    color: COLORS.white,
    fontSize: 38,
    fontWeight: '800',
    letterSpacing: -0.8,
    marginTop: 14,
    marginBottom: 18,
  },
  heroStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderRadius: 16,
    paddingVertical: 12,
  },
  heroStat: { flex: 1, alignItems: 'center', gap: 4 },
  statLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statLabel: { fontSize: 11, color: 'rgba(255,255,255,0.75)', fontWeight: '500' },
  statValue: { fontSize: 14, fontWeight: '700', color: COLORS.white },
  statDivider: { width: 1, height: 28, backgroundColor: 'rgba(255,255,255,0.18)' },

  /* Filters */
  filterRow: { gap: 8, paddingVertical: 20, paddingRight: 8 },
  filterChip: {
    paddingHorizontal: 16,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  filterChipText: { fontSize: 12, fontWeight: '600', color: COLORS.textSubtle },
  filterChipTextActive: { color: COLORS.white, fontWeight: '700' },

  /* Search */
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 48,
    backgroundColor: COLORS.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    marginBottom: 16,
  },
  searchInput: { flex: 1, fontSize: 14, color: COLORS.textPrimary, paddingVertical: 0 },

  /* Expenses */
  expenseCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  expenseIconBox: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: COLORS.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  expenseNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  expenseName: { fontSize: 14, fontWeight: '700', color: COLORS.textPrimary, flexShrink: 1 },
  expenseTime: { fontSize: 11, color: COLORS.textMuted, marginTop: 3 },
  expenseAmount: { fontSize: 14, fontWeight: '700', color: COLORS.danger },
  photoBadge: {
    width: 22,
    height: 22,
    borderRadius: 7,
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

  /* Image viewer */
  imageOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.92)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullScreenImage: { width: '92%', height: '80%', borderRadius: 16 },
  closeImageButton: {
    position: 'absolute',
    top: (Platform.OS === 'android' ? NativeStatusBar.currentHeight || 24 : 44) + 12,
    right: 20,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
