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
type MonitoringTab = 'all' | 'categories';

interface CategoryGroup {
  key: string;
  name: string;
  icon: string;
  total: number;
  count: number;
}

type CategoryGridItem = CategoryGroup | { key: string; placeholder: true };

const TABS: { key: MonitoringTab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'all', label: 'All Expenses', icon: 'list-outline' },
  { key: 'categories', label: 'Categories', icon: 'grid-outline' },
];

const UNCATEGORIZED_KEY = '__uncategorized__';
const getCategoryKey = (exp: ExpenseItem) =>
  exp.category_id || exp.categories?.name || UNCATEGORIZED_KEY;

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

const isInPeriod = (dateStr: string, filter: ExpenseFilter) => {
  const start = getFilterStart(filter);
  return !start || new Date(dateStr) >= start;
};

/* ---------- Reusable UI ---------- */
function FilterChips({
  value,
  onChange,
}: {
  value: ExpenseFilter;
  onChange: (f: ExpenseFilter) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.filterScroll}
      contentContainerStyle={styles.filterRow}
      keyboardShouldPersistTaps="handled"
    >
      {FILTERS.map((f) => {
        const active = value === f.key;
        return (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterChip, active && styles.filterChipActive]}
            activeOpacity={0.8}
            onPress={() => onChange(f.key)}
          >
            <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

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
      <Skeleton width="100%" height={46} radius={16} />
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

  const [activeTab, setActiveTab] = useState<MonitoringTab>('all');
  // Each tab keeps its own period filter
  const [allFilter, setAllFilter] = useState<ExpenseFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<ExpenseFilter>('all');
  const [selectedCategory, setSelectedCategory] = useState<CategoryGroup | null>(null);
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
  const matchesSearch = useCallback((exp: ExpenseItem, query: string) => {
    if (!query) return true;
    return (
      exp.description?.toLowerCase().includes(query) ||
      exp.categories?.name?.toLowerCase().includes(query)
    );
  }, []);

  // Tab 1: all expenses
  const allTabExpenses = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return expenses.filter((exp) => isInPeriod(exp.spent_at, allFilter) && matchesSearch(exp, query));
  }, [expenses, allFilter, searchQuery, matchesSearch]);

  // Tab 2: category cards (respect the category tab's period filter)
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

  const categoryGridData = useMemo<CategoryGridItem[]>(
    () =>
      categoryGroups.length % 2 === 1
        ? [...categoryGroups, { key: '__placeholder__', placeholder: true }]
        : categoryGroups,
    [categoryGroups],
  );

  // Tab 2 drill-down: expenses for the tapped category
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

  const categoryCaption = FILTERS.find((f) => f.key === categoryFilter)?.caption ?? 'All time';
  const showSkeleton = loading && !refreshing;
  const inCategoryDetail = activeTab === 'categories' && !!selectedCategory;

  const handleTabPress = (tab: MonitoringTab) => {
    setSearchQuery('');
    setSelectedCategory(null);
    setActiveTab(tab);
  };

  const openCategory = (category: CategoryGroup) => {
    setSearchQuery('');
    setSelectedCategory(category);
  };

  const closeCategory = () => {
    setSearchQuery('');
    setSelectedCategory(null);
  };

  /* ---------- Render ---------- */
  const renderTabs = () => (
    <View style={styles.tabBar}>
      {TABS.map((tab) => {
        const active = activeTab === tab.key;
        return (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tabButton, active && styles.tabButtonActive]}
            activeOpacity={0.85}
            onPress={() => handleTabPress(tab.key)}
          >
            <Ionicons
              name={tab.icon}
              size={16}
              color={active ? COLORS.white : COLORS.textSubtle}
            />
            <Text style={[styles.tabText, active && styles.tabTextActive]}>{tab.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const renderSearch = () =>
    expenses.length > 0 ? (
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
    ) : null;

  const renderCategoryDetailHeader = () => (
    <View>
      <View style={styles.detailHeader}>
        <TouchableOpacity
          style={styles.detailBack}
          onPress={closeCategory}
          activeOpacity={0.7}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <Ionicons name="chevron-back" size={18} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <View style={styles.categoryIconBox}>
          <Ionicons
            name={(selectedCategory?.icon as any) || 'pricetag-outline'}
            size={19}
            color={COLORS.primaryMid}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.detailTitle} numberOfLines={1}>{selectedCategory?.name}</Text>
          <Text style={styles.detailSubtitle}>
            {categoryExpenses.length} {categoryExpenses.length === 1 ? 'entry' : 'entries'} • {categoryCaption}
          </Text>
        </View>
        <Text style={styles.detailTotal}>{formatPeso(categoryDetailTotal)}</Text>
      </View>
      {renderSearch()}
    </View>
  );

  const renderCategoryCard = ({ item }: { item: CategoryGridItem }) => {
    if ('placeholder' in item) return <View style={styles.categoryCardSpacer} />;
    return (
      <TouchableOpacity
        style={styles.categoryCard}
        activeOpacity={0.8}
        onPress={() => openCategory(item)}
      >
        <View style={styles.categoryCardTop}>
          <View style={styles.categoryIconBox}>
            <Ionicons name={(item.icon as any) || 'pricetag-outline'} size={19} color={COLORS.primaryMid} />
          </View>
          <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
        </View>
        <Text style={styles.categoryName} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.categoryTotal} numberOfLines={1} adjustsFontSizeToFit>
          {formatPeso(item.total)}
        </Text>
        <Text style={styles.categoryCount}>
          {item.count} {item.count === 1 ? 'entry' : 'entries'}
        </Text>
      </TouchableOpacity>
    );
  };

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

  const refreshControl = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      colors={[COLORS.primary]}
      tintColor={COLORS.primary}
    />
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
          <>
            {/* Tabs + period filter (fixed above the list) */}
            <View style={styles.controls}>
              {renderTabs()}
              <FilterChips
                value={activeTab === 'all' ? allFilter : categoryFilter}
                onChange={activeTab === 'all' ? setAllFilter : setCategoryFilter}
              />
            </View>

            {activeTab === 'categories' && !selectedCategory ? (
              <FlatList
                key="category-grid"
                data={categoryGridData}
                keyExtractor={(item) => item.key}
                renderItem={renderCategoryCard}
                numColumns={2}
                columnWrapperStyle={styles.categoryRow}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.listContent}
                refreshControl={refreshControl}
                ListEmptyComponent={
                  <View style={styles.emptyState}>
                    <View style={styles.emptyIcon}>
                      <Ionicons
                        name={expenses.length === 0 ? 'receipt-outline' : 'grid-outline'}
                        size={22}
                        color={COLORS.textMuted}
                      />
                    </View>
                    <Text style={styles.emptyTitle}>
                      {expenses.length === 0 ? 'No expenses logged yet' : 'No categories found'}
                    </Text>
                    <Text style={styles.emptySubtitle}>
                      {expenses.length === 0
                        ? 'Expenses logged by this spender will appear here.'
                        : 'No expenses in this time period. Try a different filter.'}
                    </Text>
                  </View>
                }
              />
            ) : (
              <FlatList
                key="expense-list"
                data={inCategoryDetail ? categoryExpenses : allTabExpenses}
                keyExtractor={(item) => item.id}
                renderItem={renderExpense}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.listContent}
                ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
                refreshControl={refreshControl}
                ListHeaderComponent={inCategoryDetail ? renderCategoryDetailHeader() : renderSearch()}
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
          </>
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

  /* Controls (tabs + filters) */
  controls: { paddingHorizontal: 20 },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 4,
  },
  tabButton: {
    flex: 1,
    height: 40,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  tabButtonActive: { backgroundColor: COLORS.primary },
  tabText: { fontSize: 13, fontWeight: '600', color: COLORS.textSubtle },
  tabTextActive: { color: COLORS.white, fontWeight: '700' },

  /* Filters */
  filterScroll: { flexGrow: 0 },
  filterRow: { gap: 8, paddingTop: 16, paddingBottom: 16, paddingRight: 8 },
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

  /* Category cards */
  categoryRow: { gap: 12, marginBottom: 12 },
  categoryCard: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  categoryCardSpacer: { flex: 1 },
  categoryCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  categoryIconBox: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: COLORS.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryName: { fontSize: 13, fontWeight: '600', color: COLORS.textSubtle },
  categoryTotal: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.textPrimary,
    letterSpacing: -0.4,
    marginTop: 4,
  },
  categoryCount: { fontSize: 11, color: COLORS.textMuted, marginTop: 4 },

  /* Category detail */
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 12,
    marginBottom: 12,
  },
  detailBack: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailTitle: { fontSize: 15, fontWeight: '800', color: COLORS.textPrimary },
  detailSubtitle: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  detailTotal: { fontSize: 15, fontWeight: '800', color: COLORS.danger },

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
