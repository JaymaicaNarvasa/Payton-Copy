// app/monitoring.tsx
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  DimensionValue,
  FlatList,
  Image,
  Modal,
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

import { theme } from '@/constants/theme';
import { monitoringStyles as styles } from '@/constants/ui.styles';
import { GradientBackground } from '../../components/GradientBackground';
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
type ScreenView = 'overview' | 'all' | 'category';

interface CategoryGroup {
  key: string;
  name: string;
  icon: string;
  total: number;
  count: number;
}

interface SpendRow {
  key: string;
  name: string;
  icon: string;
  total: number;
  pct: number;
  color: string;
  group?: CategoryGroup;
}

const UNCATEGORIZED_KEY = '__uncategorized__';
const OTHER_KEY = '__other__';
const getCategoryKey = (exp: ExpenseItem) =>
  exp.category_id || exp.categories?.name || UNCATEGORIZED_KEY;

const FILTERS: { key: ExpenseFilter; label: string; caption: string }[] = [
  { key: 'all', label: 'All', caption: 'All time' },
  { key: 'today', label: 'Today', caption: 'Today' },
  { key: 'week', label: 'This Week', caption: 'This week' },
  { key: 'month', label: 'This Month', caption: 'This month' },
  { key: 'year', label: 'This Year', caption: 'This year' },
];

// rank 1, 2, 3 and "Other" (same order as the reference design)
const RANK_COLORS = ['#F2B84B', '#4C9AE0', '#E0608A', '#8E9BAE'];
const RECENT_LIMIT = 5;

const C = theme.colors;
const F = theme.fontFamily;

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

const isInPeriod = (dateStr: string, filter: ExpenseFilter) => {
  const start = getFilterStart(filter);
  return !start || new Date(dateStr) >= start;
};

const formatTime = (d: Date) =>
  d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase();

/** "Today, 12:40 pm" · "Yesterday" · "Oct 28" */
const formatRelative = (dateStr: string) => {
  try {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startYesterday = new Date(startToday);
    startYesterday.setDate(startYesterday.getDate() - 1);

    if (d >= startToday) return `Today, ${formatTime(d)}`;
    if (d >= startYesterday) return `Yesterday, ${formatTime(d)}`;
    return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${formatTime(d)}`;
  } catch {
    return dateStr;
  }
};

const formatShortDate = (s?: string) => {
  try {
    if (!s) return '';
    const d = new Date(s.includes('T') ? s : `${s}T00:00:00`);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
};

// Same thresholds as the Allowances screen (>50 healthy, >20 warning, otherwise critical)
const getHealth = (pct: number) => {
  if (pct > 50) return { label: 'On Track', bg: C.mintPill, fg: C.mintPillText };
  if (pct > 20) return { label: 'Running Low', bg: '#F8C95C', fg: '#6B4300' };
  return { label: 'Almost Out', bg: '#FECACA', fg: C.dangerDeep };
};

const tint = (hex: string) => `${hex}26`;

/* ---------- Reusable UI ---------- */
function Skeleton({
  width,
  height,
  radius = 10,
  style,
  light = false,
}: {
  width: DimensionValue;
  height: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
  light?: boolean;
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
      style={[
        light ? styles.skeletonBlockLight : styles.skeletonBlock,
        { width, height, borderRadius: radius, opacity },
        style,
      ]}
    />
  );
}

function MonitoringSkeleton() {
  return (
    <View style={styles.listContent}>
      <Skeleton width="100%" height={230} radius={24} />
      <Skeleton width={190} height={18} radius={9} style={styles.skeletonSectionTitle} />
      {[0, 1, 2].map((i) => (
        <View key={i} style={[styles.txRow, styles.txRowLast]}>
          <Skeleton width={44} height={44} radius={14} />
          <View style={styles.skeletonRowBody}>
            <Skeleton width="55%" height={12} radius={6} />
            <Skeleton width="40%" height={10} radius={5} />
          </View>
          <Skeleton width={60} height={14} radius={7} />
        </View>
      ))}
    </View>
  );
}

/* ---------- Screen ---------- */
export default function MonitoringScreen() {
  const router = useRouter();
  // allocated / allowanceName / endDate are optional display params sent by the Allowances screen
  const { spenderId, allocated, allowanceName, endDate } = useLocalSearchParams<{
    spenderId: string;
    allocated?: string;
    allowanceName?: string;
    endDate?: string;
  }>();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [spenderName, setSpenderName] = useState('Spender');
  const [spenderAvatar, setSpenderAvatar] = useState<string | null>(null);
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);

  const [view, setView] = useState<ScreenView>('overview');
  // "All transactions" list keeps its own period filter; Top Spendings uses categoryFilter
  const [allFilter, setAllFilter] = useState<ExpenseFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<ExpenseFilter>('month');
  const [selectedCategory, setSelectedCategory] = useState<CategoryGroup | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);
  const [periodMenuOpen, setPeriodMenuOpen] = useState(false);

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
  const matchesSearch = useCallback((exp: ExpenseItem, query: string) => {
    if (!query) return true;
    return (
      exp.description?.toLowerCase().includes(query) ||
      exp.categories?.name?.toLowerCase().includes(query)
    );
  }, []);

  // Header: remaining allowance (needs the allocated total passed in by the Allowances screen)
  const totalSpentAll = useMemo(
    () => expenses.reduce((sum, e) => sum + Number(e.amount), 0),
    [expenses],
  );
  const allocatedNum = allocated !== undefined && allocated !== '' ? Number(allocated) : NaN;
  const hasBudget = Number.isFinite(allocatedNum) && allocatedNum > 0;
  const remaining = hasBudget ? Math.max(0, allocatedNum - totalSpentAll) : 0;
  const remainingPct = hasBudget ? Math.min(100, Math.round((remaining / allocatedNum) * 100)) : 0;
  const health = getHealth(remainingPct);
  const endLabel = formatShortDate(endDate);

  // Recent transactions (latest first)
  const recentExpenses = useMemo(() => expenses.slice(0, RECENT_LIMIT), [expenses]);

  // Full list ("See All")
  const allTabExpenses = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return expenses.filter((exp) => isInPeriod(exp.spent_at, allFilter) && matchesSearch(exp, query));
  }, [expenses, allFilter, searchQuery, matchesSearch]);

  // Top spendings (respect the period dropdown)
  const categoryGroups = useMemo<CategoryGroup[]>(() => {
    const map = new Map<string, CategoryGroup>();
    expenses.forEach((exp) => {
      if (!isInPeriod(exp.spent_at, categoryFilter)) return;
      const key = getCategoryKey(exp);
      const existing = map.get(key);
      if (existing) {
        existing.total += Number(exp.amount);
        existing.count += 1;
      } else {
        map.set(key, {
          key,
          name: exp.categories?.name || 'Uncategorized',
          icon: exp.categories?.icon || 'pricetag-outline',
          total: Number(exp.amount),
          count: 1,
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [expenses, categoryFilter]);

  // Top 3 + "Other" (or all of them when there are 4 or fewer)
  const spendRows = useMemo<SpendRow[]>(() => {
    const total = categoryGroups.reduce((s, g) => s + g.total, 0);
    const pctOf = (v: number) => (total > 0 ? Math.round((v / total) * 100) : 0);
    const collapse = categoryGroups.length > 4;
    const top = collapse ? categoryGroups.slice(0, 3) : categoryGroups;
    const rest = collapse ? categoryGroups.slice(3) : [];

    const rows: SpendRow[] = top.map((g, i) => ({
      key: g.key,
      name: g.name,
      icon: g.icon,
      total: g.total,
      pct: pctOf(g.total),
      color: RANK_COLORS[i],
      group: g,
    }));

    if (rest.length) {
      const restTotal = rest.reduce((s, g) => s + g.total, 0);
      rows.push({
        key: OTHER_KEY,
        name: 'Other',
        icon: 'ellipsis-horizontal',
        total: restTotal,
        pct: pctOf(restTotal),
        color: RANK_COLORS[3],
      });
    }
    return rows;
  }, [categoryGroups]);

  // Drill-down: expenses for the tapped category
  const categoryExpenses = useMemo(() => {
    if (!selectedCategory) return [];
    const query = searchQuery.trim().toLowerCase();
    return expenses.filter(
      (exp) =>
        getCategoryKey(exp) === selectedCategory.key &&
        isInPeriod(exp.spent_at, categoryFilter) &&
        matchesSearch(exp, query),
    );
  }, [expenses, selectedCategory, categoryFilter, searchQuery, matchesSearch]);

  const categoryDetailTotal = useMemo(
    () => categoryExpenses.reduce((sum, e) => sum + Number(e.amount), 0),
    [categoryExpenses],
  );

  const monthName = new Date().toLocaleDateString('en-US', { month: 'long' });
  const categoryCaption = FILTERS.find((f) => f.key === categoryFilter)?.caption ?? 'All time';
  const periodLabel = categoryFilter === 'month' ? monthName : categoryCaption;
  const showSkeleton = loading && !refreshing;

  const goOverview = () => {
    setSearchQuery('');
    setSelectedCategory(null);
    setView('overview');
  };
  const openAll = () => {
    setSearchQuery('');
    setView('all');
  };
  const openCategory = (category: CategoryGroup) => {
    setSearchQuery('');
    setSelectedCategory(category);
    setView('category');
  };

  /* ---------- Render ---------- */
  const renderHeader = () => (
    <View style={styles.header}>
      <View style={styles.headerGradient}>
        <GradientBackground />
      </View>

      <View style={styles.headerTop}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={20} color={C.gradientEnd} />
        </TouchableOpacity>

        <View style={styles.headerTitleBlock}>
          {showSkeleton ? (
            <>
              <Skeleton light width={140} height={16} radius={8} />
              <Skeleton light width={90} height={12} radius={6} style={styles.skeletonSubtitle} />
            </>
          ) : (
            <>
              <Text style={styles.headerTitle} numberOfLines={1}>
                {allowanceName || 'Allowance'}
              </Text>
              <Text style={styles.headerSubtitle} numberOfLines={1}>{spenderName}</Text>
            </>
          )}
        </View>
      </View>

      {!showSkeleton && (
        <View style={styles.hero}>
          <View style={styles.heroLabelRow}>
            <Text style={styles.heroLabel}>{hasBudget ? 'Remaining Allowance' : 'Total Spent'}</Text>
            {hasBudget && (
              <View style={[styles.healthPill, { backgroundColor: health.bg }]}>
                <Ionicons name="timer-outline" size={12} color={health.fg} />
                <Text style={[styles.healthPillText, { color: health.fg }]}>{health.label}</Text>
              </View>
            )}
          </View>

          <View style={styles.heroAmountRow}>
            <Text style={styles.heroAmount} numberOfLines={1} adjustsFontSizeToFit>
              {formatPeso(hasBudget ? remaining : totalSpentAll)}
            </Text>
            {hasBudget && <Text style={styles.heroPct}>{remainingPct}% left</Text>}
          </View>

          {hasBudget && (
            <View style={styles.heroTrack}>
              <View style={[styles.heroFill, { width: `${remainingPct}%` }]} />
            </View>
          )}

          {!!endLabel && <Text style={styles.heroCaption}>Allowance ends on {endLabel}</Text>}
        </View>
      )}
    </View>
  );

  const renderSearch = () =>
    expenses.length > 0 ? (
      <View style={styles.searchContainer}>
        <Ionicons name="search-outline" size={18} color={C.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by description or category"
          placeholderTextColor={C.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCorrect={false}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={18} color={C.textMuted} />
          </TouchableOpacity>
        )}
      </View>
    ) : null;

  const renderSpendRow = (row: SpendRow, index: number) => {
    const body = (
      <View style={styles.spendRow}>
        <Text style={[styles.spendRank, { color: row.color }]}>{index + 1}</Text>
        <View style={[styles.spendIconBox, { backgroundColor: tint(row.color) }]}>
          <Ionicons name={(row.icon as any) || 'pricetag-outline'} size={18} color={row.color} />
        </View>
        <View style={styles.spendBody}>
          <View style={styles.spendTop}>
            <Text style={styles.spendName} numberOfLines={1}>{row.name}</Text>
            <Text style={styles.spendAmount}>{formatPeso(row.total, false)}</Text>
          </View>
          <View style={styles.spendBarRow}>
            <View style={styles.spendTrack}>
              <View
                style={[
                  styles.spendFill,
                  { width: `${Math.max(row.pct, row.total > 0 ? 3 : 0)}%`, backgroundColor: row.color },
                ]}
              />
            </View>
            <Text style={styles.spendPct}>{row.pct}%</Text>
          </View>
        </View>
      </View>
    );

    if (!row.group) return <View key={row.key}>{body}</View>;
    return (
      <TouchableOpacity key={row.key} activeOpacity={0.7} onPress={() => openCategory(row.group!)}>
        {body}
      </TouchableOpacity>
    );
  };

  const renderOverviewHeader = () => (
    <View>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Top Spendings</Text>
        <TouchableOpacity
          style={styles.periodPill}
          activeOpacity={0.8}
          onPress={() => setPeriodMenuOpen(true)}
        >
          <Text style={styles.periodPillText}>{periodLabel}</Text>
          <Ionicons name="chevron-down" size={13} color={C.mintPillText} />
        </TouchableOpacity>
      </View>

      <View style={styles.spendCard}>
        {spendRows.length === 0 ? (
          <Text style={styles.spendEmpty}>
            {expenses.length === 0 ? 'No expenses logged yet.' : 'No spending in this period.'}
          </Text>
        ) : (
          spendRows.map(renderSpendRow)
        )}
      </View>

      <View style={[styles.sectionHeader, styles.sectionHeaderSpaced]}>
        <Text style={styles.sectionTitle}>Recent Transactions</Text>
        {expenses.length > RECENT_LIMIT && (
          <TouchableOpacity onPress={openAll} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.seeAll}>See All</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  const renderAllHeader = () => (
    <View>
      <View style={styles.subHeader}>
        <TouchableOpacity style={styles.subBack} onPress={goOverview} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={18} color={C.textStrong} />
        </TouchableOpacity>
        <View style={styles.subHeaderText}>
          <Text style={styles.subTitle}>All Transactions</Text>
          <Text style={styles.subSubtitle}>
            {allTabExpenses.length} {allTabExpenses.length === 1 ? 'entry' : 'entries'}
          </Text>
        </View>
      </View>

      {renderSearch()}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={styles.filterRow}
        keyboardShouldPersistTaps="handled"
      >
        {FILTERS.map((f) => {
          const active = allFilter === f.key;
          return (
            <TouchableOpacity
              key={f.key}
              style={[styles.filterChip, active && styles.filterChipActive]}
              activeOpacity={0.8}
              onPress={() => setAllFilter(f.key)}
            >
              <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{f.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );

  const renderCategoryHeader = () => (
    <View>
      <View style={styles.subHeader}>
        <TouchableOpacity style={styles.subBack} onPress={goOverview} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={18} color={C.textStrong} />
        </TouchableOpacity>
        <View style={styles.subHeaderText}>
          <Text style={styles.subTitle} numberOfLines={1}>{selectedCategory?.name}</Text>
          <Text style={styles.subSubtitle}>
            {categoryExpenses.length} {categoryExpenses.length === 1 ? 'entry' : 'entries'} • {categoryCaption}
          </Text>
        </View>
        <Text style={styles.subTotal}>{formatPeso(categoryDetailTotal)}</Text>
      </View>
      {renderSearch()}
    </View>
  );

  const renderTransaction = ({ item: exp, index }: { item: ExpenseItem; index: number }) => {
    // colour the row by the category's rank in Top Spendings (falls back to gray)
    const rank = spendRows.findIndex((r) => r.key === getCategoryKey(exp));
    const color = rank >= 0 ? spendRows[rank].color : RANK_COLORS[3];
    const list = view === 'overview' ? recentExpenses : view === 'all' ? allTabExpenses : categoryExpenses;
    const isLast = index === list.length - 1;

    return (
      <View style={[styles.txRow, isLast && styles.txRowLast]}>
        <View style={[styles.txIconBox, { backgroundColor: tint(color) }]}>
          <Ionicons name={(exp.categories?.icon as any) || 'pricetag-outline'} size={19} color={color} />
        </View>

        <View style={styles.txBody}>
          <View style={styles.txNameRow}>
            <Text style={styles.txName} numberOfLines={1}>{exp.description}</Text>
            {exp.photo_url ? (
              <TouchableOpacity
                style={styles.photoBadge}
                onPress={() => setSelectedImageUri(exp.photo_url!)}
                activeOpacity={0.7}
              >
                <Ionicons name="image" size={11} color={C.mintPillText} />
              </TouchableOpacity>
            ) : null}
          </View>
          <View style={styles.txMetaRow}>
            <View style={[styles.txDot, { backgroundColor: color }]} />
            <Text style={styles.txMeta} numberOfLines={1}>
              {exp.categories?.name ? `${exp.categories.name} · ` : ''}
              {formatRelative(exp.spent_at)}
            </Text>
          </View>
        </View>

        <Text style={styles.txAmount}>-{formatPeso(Number(exp.amount))}</Text>
      </View>
    );
  };

  const refreshControl = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      colors={[C.brand]}
      tintColor={C.brand}
    />
  );

  const listData = view === 'overview' ? recentExpenses : view === 'all' ? allTabExpenses : categoryExpenses;
  const listHeader =
    view === 'overview' ? renderOverviewHeader() : view === 'all' ? renderAllHeader() : renderCategoryHeader();

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {renderHeader()}

      {/* BODY */}
      <View style={styles.bodyContent}>
        {showSkeleton ? (
          <MonitoringSkeleton />
        ) : (
          <FlatList
            key={view}
            data={listData}
            keyExtractor={(item) => item.id}
            renderItem={renderTransaction}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.listContent}
            refreshControl={refreshControl}
            ListHeaderComponent={listHeader}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <View style={styles.emptyIcon}>
                  <Ionicons
                    name={expenses.length === 0 ? 'receipt-outline' : 'search-outline'}
                    size={22}
                    color={C.textMuted}
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

      {/* PERIOD MENU (Top Spendings) */}
      <Modal
        visible={periodMenuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setPeriodMenuOpen(false)}
        statusBarTranslucent
      >
        <Pressable style={styles.menuOverlay} onPress={() => setPeriodMenuOpen(false)}>
          <View style={styles.menuCard}>
            {FILTERS.map((f) => {
              const active = categoryFilter === f.key;
              return (
                <TouchableOpacity
                  key={f.key}
                  style={styles.menuItem}
                  activeOpacity={0.7}
                  onPress={() => {
                    setCategoryFilter(f.key);
                    setPeriodMenuOpen(false);
                  }}
                >
                  <Text style={[styles.menuItemText, active && styles.menuItemTextActive]}>
                    {f.key === 'month' ? monthName : f.caption}
                  </Text>
                  {active && <Ionicons name="checkmark" size={16} color={C.mintPillText} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </Pressable>
      </Modal>

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
            <Ionicons name="close" size={22} color={C.white} />
          </TouchableOpacity>
          {selectedImageUri ? (
            <Image source={{ uri: selectedImageUri }} style={styles.fullScreenImage} resizeMode="contain" />
          ) : null}
        </View>
      </Modal>
    </View>
  );
}