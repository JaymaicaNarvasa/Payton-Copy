import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  Image,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  Path,
  Polyline,
  Stop,
  LinearGradient as SvgLinearGradient,
  Text as SvgText,
} from 'react-native-svg';

import { theme } from '@/constants/theme';
import { sponsorHomeStyles as sheetStyles, homeStyles as styles } from '@/constants/ui.styles';
import { GradientBackground } from '../../components/GradientBackground';
import { useAlert } from '../../components/PaytonAlert';
import {
  AMOUNT_REGEX,
  Banner,
  DateButton,
  DatePickerSheet,
  Field,
  MODAL_SWAP_DELAY,
  Msg,
  Sheet,
  SheetActions,
  toDateString,
} from '../../components/Sheet';
import { Skeleton } from '../../components/Skeleton';
import { supabase } from '../../lib/supabase';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return 'Unknown error occurred';
}

function getDaysInfo(dueDateStr: string): { text: string; urgent: boolean } {
  const dueDate = new Date(dueDateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  dueDate.setHours(0, 0, 0, 0);

  const diffTime = dueDate.getTime() - today.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    const absDays = Math.abs(diffDays);
    return { 
      text: absDays === 1 ? '1 day overdue' : `${absDays} days overdue`, 
      urgent: true 
    };
  }
  if (diffDays === 0) {
    return { text: 'Due today', urgent: true };
  }
  if (diffDays === 1) {
    return { text: '1 day left', urgent: true };
  }
  if (diffDays <= 3) {
    return { text: `${diffDays} days left`, urgent: true };
  }
  return { text: `${diffDays} days left`, urgent: false };
}

function formatReadableDate(dateStr: string): string {
  try {
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function generateDateRange() {
  const dates = [];
  const today = new Date();
  
  for (let i = -7; i <= 7; i++) {
    const d = new Date();
    d.setDate(today.getDate() + i);
    dates.push({
      dateString: d.toISOString().split('T')[0],
      dayName: d.toLocaleString('en-US', { weekday: 'short' }).toUpperCase(),
      dayNumber: d.getDate(),
      monthStr: d.toLocaleString('en-US', { month: 'short' }).toUpperCase(),
      isToday: i === 0,
    });
  }
  return dates;
}

interface DashboardSummary {
  allowanceId: string;
  allowanceName: string;
  totalAllowance: number;
  totalSpent: number;
  remaining: number;
  unallocated: number;
}

interface ReminderItem {
  id: string;
  title: string;
  amount: number;
  due_date: string;
  status: string;
  category_id?: string | null;
  categories?: {
    name?: string;
    icon?: string;
    color?: string;
  } | null;
}

interface CategoryItem {
  id: string;
  name: string;
  icon?: string;
  color?: string;
}

interface CategoryStat {
  categoryId: string;
  categoryName: string;
  icon?: string;
  total: number;
  percentage: number;
  color: string;
}

interface DailyTrendItem {
  dateStr: string;
  displayDay: string;
  amount: number;
}

/** Skeleton version of the whole spender dashboard (header + sections), shown while loading. */
function SpenderHomeSkeleton({ topInset, headerHeight }: { topInset: number; headerHeight: number }) {
  const onDark = theme.colors.alpha.white[30];
  return (
    <View style={styles.mainContainer}>
      <StatusBar barStyle="light-content" translucent />

      {/* Header */}
      <View style={[styles.headerBackground, { height: headerHeight }]}>
        <View style={styles.headerGradientClip}>
          <GradientBackground />
        </View>
        <View style={[styles.headerExpanded, { paddingTop: topInset }]}>
          <View style={styles.topRowContainer}>
            <View style={styles.topRow}>
              <View style={styles.userProfileGroup}>
                <Skeleton width={56} height={56} radius={28} color={onDark} />
                <View>
                  <Skeleton width={70} height={18} radius={9} color={onDark} />
                  <Skeleton width={130} height={13} radius={7} color={onDark} style={{ marginTop: theme.space[8] }} />
                </View>
              </View>
              <Skeleton width={78} height={28} radius={14} color={onDark} />
            </View>
          </View>

          <View style={styles.balanceBlock}>
            <Skeleton width={120} height={13} radius={7} color={onDark} style={{ marginBottom: theme.space[10] }} />
            <Skeleton width="100%" height={26} radius={13} color={onDark} />
            <Skeleton width={170} height={32} radius={10} color={onDark} style={{ marginTop: theme.space[14] }} />
          </View>
        </View>
      </View>

      {/* Body */}
      <View style={{ paddingTop: headerHeight + theme.space[8] }}>
        {/* Upcoming dues */}
        <View style={styles.sectionBlock}>
          <View style={styles.sectionHeaderRow}>
            <Skeleton width={130} height={18} radius={9} />
            <Skeleton width={120} height={30} radius={15} />
          </View>
          <View style={{ flexDirection: 'row', gap: theme.space[12] }}>
            <Skeleton width={170} height={74} radius={theme.radius.lg} />
            <Skeleton width={170} height={74} radius={theme.radius.lg} />
          </View>
        </View>

        {/* Expense per category */}
        <View style={styles.sectionBlock}>
          <View style={styles.sectionHeaderRow}>
            <Skeleton width={160} height={18} radius={9} />
            <Skeleton width={84} height={30} radius={15} />
          </View>
          <View style={[styles.statsCard, { gap: theme.space[16] }]}>
            <Skeleton width={170} height={170} radius={85} />
            {[0, 1].map((i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', width: '100%' }}>
                <Skeleton width={40} height={40} radius={20} />
                <View style={{ flex: 1, marginLeft: theme.space[12], gap: theme.space[6] }}>
                  <Skeleton width="50%" height={13} radius={7} />
                  <Skeleton width="30%" height={10} radius={5} />
                </View>
                <Skeleton width={70} height={14} radius={7} />
              </View>
            ))}
          </View>
        </View>

        {/* Daily trend */}
        <View style={styles.sectionBlock}>
          <View style={styles.sectionHeaderRow}>
            <Skeleton width={150} height={18} radius={9} />
          </View>
          <View style={styles.trendCard}>
            <Skeleton width="70%" height={11} radius={6} style={{ marginBottom: theme.space[12] }} />
            <Skeleton width="100%" height={150} radius={theme.radius.lg} />
          </View>
        </View>
      </View>
    </View>
  );
}

export default function SpenderHomeScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [spenderName, setSpenderName] = useState('Guian Sumbi');
  const [spenderRole, setSpenderRole] = useState('Member');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [upcomingDues, setUpcomingDues] = useState<ReminderItem[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  
  // Statistics State
  const [overallTotalExpenses, setOverallTotalExpenses] = useState<number>(0);
  const [dailyTrends, setDailyTrends] = useState<DailyTrendItem[]>([]);
  const [rawExpenses, setRawExpenses] = useState<any[]>([]);

  // "Expense per Category" period filter (All time / Today / This Week / This Month / This Year)
  type StatsPeriod = 'all' | 'today' | 'weekly' | 'monthly' | 'yearly';
  const [statsPeriod, setStatsPeriod] = useState<StatsPeriod>('all');
  const [periodMenuVisible, setPeriodMenuVisible] = useState(false);
  // Dropdown is anchored under the pill: measure where the pill sits, then drop the menu right below it.
  const periodPillRef = useRef<View>(null);
  const [periodAnchor, setPeriodAnchor] = useState({ top: 0, right: 0 });
  const openPeriodMenu = () => {
    periodPillRef.current?.measureInWindow((x, y, w, h) => {
      setPeriodAnchor({ top: y + h + theme.space[6], right: SCREEN_WIDTH - (x + w) });
      setPeriodMenuVisible(true);
    });
  };
  const periodLabels: Record<StatsPeriod, string> = {
    all: 'All time',
    today: 'Today',
    weekly: 'This Week',
    monthly: 'This Month',
    yearly: 'This Year',
  };

  const dateList = generateDateRange();
  const todayStr = toDateString(new Date());
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [modalVisible, setModalVisible] = useState(false);
  const horizontalScrollRef = useRef<ScrollView>(null);

  // ---- collapsing header (driven by scroll) ----
  const topInset = (Platform.OS === 'android' ? StatusBar.currentHeight || 24 : 50) + theme.space[8];
  const HEADER_EXPANDED = topInset + theme.layout.headerExpanded;
  const HEADER_COLLAPSED = topInset + theme.layout.headerCollapsed;
  const COLLAPSE_RANGE = HEADER_EXPANDED - HEADER_COLLAPSED;
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });
  const headerAnimatedStyle = useAnimatedStyle(() => ({
    height: interpolate(scrollY.value, [0, COLLAPSE_RANGE], [HEADER_EXPANDED, HEADER_COLLAPSED], Extrapolation.CLAMP),
  }));
  const expandedLayerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, COLLAPSE_RANGE * 0.55], [1, 0], Extrapolation.CLAMP),
    pointerEvents: scrollY.value > COLLAPSE_RANGE * 0.5 ? 'none' : 'auto',
  }));
  const compactLayerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [COLLAPSE_RANGE * 0.45, COLLAPSE_RANGE], [0, 1], Extrapolation.CLAMP),
    pointerEvents: scrollY.value < COLLAPSE_RANGE * 0.5 ? 'none' : 'auto',
  }));

  const [addModalVisible, setAddModalVisible] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [newDueDate, setNewDueDate] = useState(todayStr);
  const [newCategoryId, setNewCategoryId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { showAlert } = useAlert();
  /** Sheets and the alert are both Modals: close the sheet first, then show the alert once it is gone. */
  const notify = (config: Parameters<typeof showAlert>[0]) => {
    setTimeout(() => showAlert(config), MODAL_SWAP_DELAY);
  };

  // Field-level errors show right under each input; submit/server messages go to a banner inside the sheet.
  type ReminderErrors = { title?: string; amount?: string; category?: string; date?: string };
  const [reminderErrors, setReminderErrors] = useState<ReminderErrors>({});
  const [addBanner, setAddBanner] = useState<Msg>(null);
  const [duesBanner, setDuesBanner] = useState<Msg>(null);
  const [deleteBanner, setDeleteBanner] = useState<Msg>(null);
  const [datePickerVisible, setDatePickerVisible] = useState(false);

  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [reminderToDelete, setReminderToDelete] = useState<{ id: string; title: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const centerToday = (animated = false) => {
    const todayIndex = dateList.findIndex(item => item.isToday);
    const dateBoxWidth = 54; 
    const dateBoxGap = 8;         
    const containerPadding = 24; 

    const totalItemWidth = dateBoxWidth + dateBoxGap;
    const computedX = (todayIndex * totalItemWidth) - (SCREEN_WIDTH / 2 - containerPadding - (dateBoxWidth / 2));

    horizontalScrollRef.current?.scrollTo({
      x: Math.max(0, computedX),
      animated: animated,
    });
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      centerToday(false);
    }, 150);

    return () => clearTimeout(timer);
  }, []);

  const fetchCategories = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      let query = supabase.from('categories').select('id, name, icon, color');
      
      if (user) {
        query = query.or(`user_id.eq.${user.id},user_id.is.null`);
      } else {
        query = query.is('user_id', null);
      }

      const { data, error } = await query;

      if (error) throw error;
      setCategories(data || []);
    } catch (error: unknown) {
      console.error('Error fetching categories:', extractErrorMessage(error));
    }
  };

  const fetchDashboardData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profileData } = await supabase
        .from('profiles')
        .select('full_name, avatar_url, role')
        .eq('id', user.id)
        .single();

      if (profileData?.full_name) setSpenderName(profileData.full_name);
      if (profileData?.avatar_url) setAvatarUrl(profileData.avatar_url);
      if (profileData?.role) setSpenderRole(profileData.role);

      const { data: allowanceData, error: allowanceError } = await supabase
        .from('allowances')
        .select('id, allowance_name, amount, received_at')
        .eq('spender_id', user.id)
        .eq('is_archived', false)
        .order('received_at', { ascending: false });

      if (allowanceError) throw allowanceError;

      let totalSpentCounter = 0;
      let combinedTotalAllowance = 0;

      if (allowanceData && allowanceData.length > 0) {
        const allowanceIds = allowanceData.map((item) => item.id);
        
        combinedTotalAllowance = allowanceData.reduce(
          (sum, item) => sum + Number(item.amount || 0),
          0
        );

        const { data: expensesData, error: expensesError } = await supabase
          .from('expenses')
          .select(`
            id, 
            amount, 
            allowance_id,
            category_id,
            spent_at,
            categories ( id, name, icon, color )
          `)
          .in('allowance_id', allowanceIds);

        if (expensesError) throw expensesError;

        totalSpentCounter = (expensesData || []).reduce(
          (sum: number, exp: any) => sum + Number(exp.amount || 0),
          0
        );

        setOverallTotalExpenses(totalSpentCounter);
        setRawExpenses(expensesData || []);

        // Compute past 7 days trend data for the Line Graph
        const todayObj = new Date();
        const trendData: DailyTrendItem[] = [];
        
        for (let i = 6; i >= 0; i--) {
          const d = new Date();
          d.setDate(todayObj.getDate() - i);
          const yyyyMmDd = d.toISOString().split('T')[0];
          const displayLabel = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

          const dayExpenses = (expensesData || []).filter((exp: any) => exp.spent_at?.startsWith(yyyyMmDd));
          const dayTotal = dayExpenses.reduce((sum: number, exp: any) => sum + Number(exp.amount || 0), 0);

          trendData.push({
            dateStr: yyyyMmDd,
            displayDay: displayLabel,
            amount: dayTotal,
          });
        }
        setDailyTrends(trendData);

        setSummary({
          allowanceId: allowanceIds[0], 
          allowanceName: allowanceData.map(a => a.allowance_name).join(', '),
          totalAllowance: combinedTotalAllowance,
          totalSpent: totalSpentCounter,
          remaining: combinedTotalAllowance - totalSpentCounter,
          unallocated: 0,
        });
      } else {
        setSummary(null);
        setOverallTotalExpenses(0);
        setRawExpenses([]);
        setDailyTrends([]);
      }

      const { data: duesData, error: duesError } = await supabase
        .from('reminders')
        .select(`
          id,
          title,
          amount,
          due_date,
          status,
          category_id,
          categories ( name, icon, color )
        `)
        .eq('user_id', user.id)
        .in('status', ['pending', 'paid'])
        .order('due_date', { ascending: true });

      if (duesError) throw duesError;
      setUpcomingDues((duesData as unknown as ReminderItem[]) || []);

      await fetchCategories();

    } catch (error: unknown) {
      console.error('Spender Dashboard Error:', extractErrorMessage(error));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchDashboardData();
      setSelectedDate(todayStr);
      centerToday(true);
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    setSelectedDate(todayStr);
    fetchDashboardData().then(() => {
      setTimeout(() => centerToday(true), 100);
    });
  };

  const resetForm = () => {
    setNewTitle('');
    setNewAmount('');
    setNewDueDate(todayStr);
    setNewCategoryId(null);
    setSubmitting(false);
    setReminderErrors({});
    setAddBanner(null);
  };

  const openAddModal = () => {
    resetForm();
    fetchCategories();
    setAddModalVisible(true);
  };

  const closeAddModal = () => {
    if (submitting) return;
    resetForm();
    setAddModalVisible(false);
  };

  const clearReminderError = (key: keyof ReminderErrors) =>
    setReminderErrors((p) => (p[key] ? { ...p, [key]: undefined } : p));

  const handleCreateReminder = async () => {
    setAddBanner(null);

    const errors: ReminderErrors = {};
    const title = newTitle.trim();
    const amountTrimmed = newAmount.trim();

    if (!title) errors.title = 'Enter a title for this reminder.';

    if (!amountTrimmed) {
      errors.amount = 'Enter the reminder amount.';
    } else if (!AMOUNT_REGEX.test(amountTrimmed)) {
      errors.amount = 'Enter a valid amount, up to 2 decimal places.';
    } else if (parseFloat(amountTrimmed) <= 0) {
      errors.amount = 'Amount must be greater than zero.';
    }

    if (!newCategoryId) errors.category = 'Choose a category for this reminder.';
    if (!newDueDate) errors.date = 'Choose a due date.';

    setReminderErrors(errors);
    if (Object.keys(errors).length > 0) return;

    try {
      setSubmitting(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const parsedAmount = parseFloat(amountTrimmed);

      const { error } = await supabase.from('reminders').insert({
        user_id: user.id,
        title,
        amount: parsedAmount,
        due_date: newDueDate,
        status: 'pending',
        allowance_id: summary?.allowanceId || null,
        category_id: newCategoryId,
      });
      if (error) throw error;

      await supabase.from('logs').insert({
        user_id: user.id,
        details: `created reminder "${title}" (${parsedAmount}).`,
      });

      resetForm();
      setAddModalVisible(false);
      fetchDashboardData();
      notify({
        type: 'success',
        title: 'Reminder saved',
        message: `"${title}" was added to your upcoming dues.`,
      });
    } catch (error: unknown) {
      console.error('Error adding reminder:', extractErrorMessage(error));
      setAddBanner({ type: 'error', text: 'Failed to save reminder. Please try again.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteReminder = (reminderId: string, reminderTitle: string) => {
    setDeleteBanner(null);
    setReminderToDelete({ id: reminderId, title: reminderTitle });
    setDeleteModalVisible(true);
  };

  const closeDeleteModal = () => {
    if (isDeleting) return;
    setDeleteModalVisible(false);
    setDeleteBanner(null);
  };

  const confirmDeleteReminder = async () => {
    if (!reminderToDelete) return;

    try {
      setIsDeleting(true);
      const { error } = await supabase
        .from('reminders')
        .delete()
        .eq('id', reminderToDelete.id);
      if (error) throw error;

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('logs').insert({
          user_id: user.id,
          details: `deleted reminder "${reminderToDelete.title || reminderToDelete.id}".`,
        });
      }

      const deletedTitle = reminderToDelete.title || 'reminder';
      setDeleteModalVisible(false);
      setDeleteBanner(null);
      setReminderToDelete(null);
      setDuesBanner({ type: 'success', text: `Deleted "${deletedTitle}".` });
      fetchDashboardData();
    } catch (error: unknown) {
      console.error('Error deleting reminder:', extractErrorMessage(error));
      setDeleteBanner({ type: 'error', text: 'Failed to delete reminder.' });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSettleReminder = async (reminder: ReminderItem) => {
    setDuesBanner(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: allowances, error: allowanceFetchError } = await supabase
        .from('allowances')
        .select('amount')
        .eq('spender_id', user.id)
        .eq('is_archived', false);
      if (allowanceFetchError) throw allowanceFetchError;

      if (!allowances || allowances.length === 0) {
        setDuesBanner({ type: 'error', text: 'Cannot settle reminder: no allowance records found.' });
        return;
      }

      const totalAllowance = allowances.reduce((sum, item) => sum + Number(item.amount), 0);

      const { data: expenses, error: expenseFetchError } = await supabase
        .from('expenses')
        .select(`
          amount,
          allowances!inner (
            is_archived
          )
        `)
        .eq('user_id', user.id)
        .eq('allowances.is_archived', false);
      if (expenseFetchError) throw expenseFetchError;

      const totalExpenses = expenses ? expenses.reduce((sum, item) => sum + Number(item.amount), 0) : 0;

      const remaining = totalAllowance - totalExpenses;
      if (reminder.amount > remaining) {
        setDuesBanner({
          type: 'error',
          text: `The amount (₱${Number(reminder.amount).toLocaleString('en-US')}) exceeds your remaining allowance (₱${remaining.toLocaleString('en-US')}).`,
        });
        return;
      }

      const { error: updateError } = await supabase
        .from('reminders')
        .update({ status: 'paid' })
        .eq('id', reminder.id);
      if (updateError) throw updateError;

      const { error: expenseError } = await supabase
        .from('expenses')
        .insert({
          user_id: user.id,
          description: reminder.title,
          amount: reminder.amount,
          category_id: reminder.category_id || null,
          allowance_id: summary?.allowanceId || null,
          spent_at: new Date().toISOString(),
        });
      if (expenseError) throw expenseError;

      await supabase.from('logs').insert({
        user_id: user.id,
        details: `settled reminder "${reminder.title}" (${reminder.amount}).`,
      });

      setDuesBanner({ type: 'success', text: `"${reminder.title}" has been settled and recorded.` });
      fetchDashboardData();
    } catch (error: unknown) {
      console.error('Error settling reminder:', extractErrorMessage(error));
      setDuesBanner({ type: 'error', text: 'Failed to settle reminder.' });
    }
  };

  if (loading) {
    return <SpenderHomeSkeleton topInset={topInset} headerHeight={HEADER_EXPANDED} />;
  }

  const remainingPercentage = summary && summary.totalAllowance > 0
    ? Math.max(0, Math.min(((summary.totalAllowance - summary.totalSpent) / summary.totalAllowance) * 100, 100))
    : 0;

  const hasPendingOnDate = (dateStr: string) => {
    return upcomingDues.some(due => due.due_date === dateStr && due.status === 'pending');
  };

  const closeDuesModal = () => {
    setModalVisible(false);
    setSelectedDate(todayStr);
    setDuesBanner(null);
  };

  const handleDatePress = (dateStr: string) => {
    setDuesBanner(null);
    setSelectedDate(dateStr);
    setModalVisible(true);
  };

  const filteredDues = upcomingDues.filter(due => due.due_date === selectedDate);
  const selectedDaysInfo = getDaysInfo(selectedDate);

  const size = 200;
  const CHART_BOX = 260;
  const strokeWidth = 23;
  const center = size / 2;
  const radius = center - strokeWidth;
  const circumference = 2 * Math.PI * radius;

  const openSoonestDue = () => {
    const next = upcomingDues
      .filter((due) => due.status === 'pending')
      .sort((x, y) => x.due_date.localeCompare(y.due_date))[0];
    if (next) handleDatePress(next.due_date);
    else openAddModal();
  };

  // "Expense per Category" breakdown for All time, Today, This Week, This Month, This Year
  const periodTotalExpenses = (() => {
    const now = new Date();
    const todayStrOnly = now.toISOString().split('T')[0];

    let filteredExpenses = rawExpenses;

    if (statsPeriod === 'today') {
      filteredExpenses = rawExpenses.filter((exp: any) => exp.spent_at?.startsWith(todayStrOnly));
    } else if (statsPeriod === 'weekly') {
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay());
      startOfWeek.setHours(0, 0, 0, 0);

      filteredExpenses = rawExpenses.filter((exp: any) => {
        if (!exp.spent_at) return false;
        const expDate = new Date(exp.spent_at);
        return expDate >= startOfWeek;
      });
    } else if (statsPeriod === 'monthly') {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      filteredExpenses = rawExpenses.filter((exp: any) => {
        if (!exp.spent_at) return false;
        const expDate = new Date(exp.spent_at);
        return expDate >= startOfMonth;
      });
    } else if (statsPeriod === 'yearly') {
      const startOfYear = new Date(now.getFullYear(), 0, 1);
      filteredExpenses = rawExpenses.filter((exp: any) => {
        if (!exp.spent_at) return false;
        const expDate = new Date(exp.spent_at);
        return expDate >= startOfYear;
      });
    }
    // 'all' includes all items

    const total = filteredExpenses.reduce((sum: number, exp: any) => sum + Number(exp.amount || 0), 0);

    const map: { [key: string]: { name: string; icon?: string; color?: string; total: number } } = {};
    filteredExpenses.forEach((exp: any) => {
      const catId = exp.category_id || 'uncategorized';
      const catName = exp.categories?.name || 'Uncategorized';
      const catIcon = exp.categories?.icon;
      const catColor = exp.categories?.color;
      const amt = Number(exp.amount || 0);
      if (!map[catId]) map[catId] = { name: catName, icon: catIcon, color: catColor, total: 0 };
      map[catId].total += amt;
    });

    const stats: CategoryStat[] = Object.keys(map).map((catId, index) => {
      const item = map[catId];
      const percentage = total > 0 ? (item.total / total) * 100 : 0;
      return {
        categoryId: catId,
        categoryName: item.name,
        icon: item.icon,
        total: item.total,
        percentage,
        color: item.color || theme.chart.category[index % theme.chart.category.length],
      };
    });

    return { total, stats };
  })();
  const categoryStats = periodTotalExpenses.stats;

  const donutSegments = (() => {
    let acc = 0;
    return categoryStats.map((stat, index) => {
      const startAngle = (acc / 100) * 2 * Math.PI - Math.PI / 2;
      const endAngle = ((acc + stat.percentage) / 100) * 2 * Math.PI - Math.PI / 2;
      acc += stat.percentage;
      const pt = (angle: number) => ({ x: center + radius * Math.cos(angle), y: center + radius * Math.sin(angle) });
      const start = pt(startAngle);
      const end = pt(endAngle);
      const full = stat.percentage >= 99.9;
      return {
        stat,
        index,
        midAngle: (startAngle + endAngle) / 2,
        full,
        gradient: { from: stat.color, to: stat.color },
        gx1: full ? center : start.x,
        gy1: full ? 0 : start.y,
        gx2: full ? center : end.x,
        gy2: full ? size : end.y,
        path: `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${stat.percentage > 50 ? 1 : 0} 1 ${end.x} ${end.y}`,
      };
    });
  })();

  return (
    <View style={styles.mainContainer}>
      <StatusBar barStyle="light-content" translucent />

      {/* HEADER */}
      <Animated.View style={[styles.headerBackground, headerAnimatedStyle]}>
        <View style={styles.headerGradientClip}>
          <GradientBackground />
        </View>

        <Animated.View style={[styles.headerExpanded, { paddingTop: topInset }, expandedLayerStyle]}>
          <View style={styles.topRowContainer}>
            <View style={styles.topRow}>
              <View style={styles.userProfileGroup}>
                <TouchableOpacity onPress={() => router.push('/profile')}>
                  <View>
                    {avatarUrl ? (
                      <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
                    ) : (
                      <View style={styles.avatarFallback}>
                        <Text style={styles.avatarInitial}>{spenderName.charAt(0).toUpperCase()}</Text>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>

                <View>
                  <Text style={styles.helloText}>Hello,</Text>
                  <Text style={styles.userNameText} numberOfLines={1}>
                    {spenderName}
                  </Text>
                </View>
              </View>

              <View style={styles.roleBadgeContainer}>
                <Text style={styles.roleBadgeText} numberOfLines={1}>
                  {spenderRole || ''}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.balanceBlock}>
            <View style={styles.balanceLabelRow}>
              <Text style={styles.balanceLabel}>Remaining Allowance</Text>
            </View>

            <View style={styles.pillTrackOuter}>
              <View style={styles.pillTrack}>
                <View style={[styles.pillFill, { width: `${remainingPercentage}%` }]} />
              </View>
            </View>

            <View style={styles.balanceAmountRow}>
              <Text style={styles.pillAmountText}>
                ₱{summary ? summary.remaining.toLocaleString('en-US') : '0'}
              </Text>
              <Text style={styles.pillAmountDivider}>/</Text>
              <Text style={styles.pillAmountTotal}>
                ₱{summary ? summary.totalAllowance.toLocaleString('en-US') : '0'}
              </Text>
            </View>
          </View>
        </Animated.View>

        <Animated.View style={[styles.headerCompact, { paddingTop: topInset }, compactLayerStyle]}>
          <View style={styles.compactTopRow}>
            <TouchableOpacity style={styles.compactUser} onPress={() => router.push('/profile')} activeOpacity={0.8}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.compactAvatarImage} />
              ) : (
                <View style={styles.compactAvatarFallback}>
                  <Text style={styles.compactAvatarInitial}>{spenderName.charAt(0).toUpperCase()}</Text>
                </View>
              )}
              <Text style={styles.compactName} numberOfLines={1}>
                {spenderName}
              </Text>
            </TouchableOpacity>

            <View style={styles.compactActions}>
              <TouchableOpacity style={styles.headerIconButton} onPress={openAddModal} activeOpacity={0.8}>
                <Ionicons name="add" size={20} color={theme.colors.white} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.compactTrack}>
            <View style={[styles.pillFill, { width: `${remainingPercentage}%` }]} />
          </View>

          <View style={styles.compactAmountRow}>
            <Text style={styles.compactAmountText}>
              ₱{summary ? summary.remaining.toLocaleString('en-US') : '0'}
            </Text>
            <Text style={styles.compactAmountDivider}>/</Text>
            <Text style={styles.compactAmountTotal}>
              ₱{summary ? summary.totalAllowance.toLocaleString('en-US') : '0'}
            </Text>
          </View>
        </Animated.View>
      </Animated.View>

      {/* SCROLLABLE CONTENT */}
      <Animated.ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingTop: HEADER_EXPANDED + theme.space[8] }]}
        onScroll={onScroll}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[theme.colors.olive]}
            tintColor={theme.colors.olive}
            progressViewOffset={HEADER_EXPANDED}
          />
        }
        showsVerticalScrollIndicator={false}
        bounces
      >
        <View style={styles.sectionBlock}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Upcoming Dues</Text>
            <View style={styles.duesActions}>
              <TouchableOpacity style={styles.addReminderPill} onPress={openAddModal} activeOpacity={0.8}>
                <View style={styles.pillPlusCircle}>
                  <Ionicons name="add" size={12} color={theme.colors.white} />
                </View>
                <Text style={styles.seeAllText}>Set Reminders</Text>
              </TouchableOpacity>
            </View>
          </View>

          {(() => {
            const pendingDues = upcomingDues
              .filter((due) => due.status === 'pending')
              .sort((x, y) => x.due_date.localeCompare(y.due_date));

            if (pendingDues.length === 0) {
              return (
                <View style={styles.dueEmpty}>
                  <Text style={styles.dueEmptyText}>No upcoming dues. Tap “Set Reminders” to add one.</Text>
                </View>
              );
            }

            return (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.dueStripContainer}
              >
                {pendingDues.map((due, index) => {
                  const [y, m, d] = due.due_date.split('-').map(Number);
                  const monthShort = new Date(y, m - 1, d).toLocaleString('en-US', { month: 'short' });
                  const daysInfo = getDaysInfo(due.due_date);

                  return (
                    <TouchableOpacity
                      key={due.id}
                      activeOpacity={0.85}
                      onPress={() => handleDatePress(due.due_date)}
                      style={styles.dueCard}
                    >
                      <View style={[styles.dueDateBlock, index % 2 === 1 && styles.dueDateBlockAlt]}>
                        <Text style={styles.dueDay}>{d}</Text>
                        <Text style={styles.dueMonth}>{monthShort}</Text>
                      </View>
                      <View style={styles.dueInfo}>
                        <Text style={styles.dueTitle} numberOfLines={1}>{due.title}</Text>
                        <Text style={styles.dueAmount} numberOfLines={1}>
                          ₱{Number(due.amount).toLocaleString('en-US')}
                        </Text>
                        <Text style={[styles.dueMeta, daysInfo.urgent && styles.dueMetaUrgent]} numberOfLines={2}>
                          Due {monthShort} {d} · {daysInfo.text}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={14} color={theme.colors.textSubtle} />
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            );
          })()}
        </View>

        {/* STATISTICS SECTION */}
        <View style={styles.sectionBlock}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Expense per Category</Text>
            <View ref={periodPillRef} collapsable={false}>
              <TouchableOpacity
                style={styles.addReminderPill}
                onPress={openPeriodMenu}
                activeOpacity={0.8}
              >
                <Text style={styles.seeAllText}>{periodLabels[statsPeriod]}</Text>
                <Ionicons
                  name={periodMenuVisible ? 'chevron-up' : 'chevron-down'}
                  size={14}
                  color={theme.colors.mintPillText}
                />
              </TouchableOpacity>
            </View>
          </View>

          <Modal
            visible={periodMenuVisible}
            transparent
            animationType="fade"
            statusBarTranslucent
            onRequestClose={() => setPeriodMenuVisible(false)}
          >
            <TouchableOpacity
              style={styles.periodDropdownOverlay}
              activeOpacity={1}
              onPress={() => setPeriodMenuVisible(false)}
            >
              <View style={[styles.periodDropdownMenu, { top: periodAnchor.top, right: periodAnchor.right }]}>
                {(['all', 'today', 'weekly', 'monthly', 'yearly'] as const).map((period) => (
                  <TouchableOpacity
                    key={period}
                    style={styles.periodDropdownItem}
                    activeOpacity={0.7}
                    onPress={() => {
                      setStatsPeriod(period);
                      setPeriodMenuVisible(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.periodDropdownItemText,
                        statsPeriod === period && styles.periodDropdownItemTextActive,
                      ]}
                    >
                      {periodLabels[period]}
                    </Text>
                    {statsPeriod === period && (
                      <Ionicons name="checkmark" size={16} color={theme.colors.mintPillText} />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </TouchableOpacity>
          </Modal>

          <View style={styles.statsCard}>
            <View style={styles.circleContainer}>
              <Svg width={size} height={size}>
                <Defs>
                  {donutSegments.map((seg) => (
                    <SvgLinearGradient
                      key={`donut-grad-${seg.stat.categoryId}`}
                      id={`donut-${seg.index}`}
                      gradientUnits="userSpaceOnUse"
                      x1={seg.gx1}
                      y1={seg.gy1}
                      x2={seg.gx2}
                      y2={seg.gy2}
                    >
                      <Stop offset="0" stopColor={seg.gradient.from} />
                      <Stop offset="1" stopColor={seg.gradient.to} />
                    </SvgLinearGradient>
                  ))}
                </Defs>

                <Circle cx={center} cy={center} r={radius} stroke={theme.colors.surfaceAlt} strokeWidth={strokeWidth} fill="none" />

                {donutSegments.map((seg) => {
                  if (seg.stat.percentage < 0.4) return null;
                  return seg.full ? (
                    <Circle
                      key={seg.stat.categoryId}
                      cx={center}
                      cy={center}
                      r={radius}
                      stroke={`url(#donut-${seg.index})`}
                      strokeWidth={strokeWidth}
                      fill="none"
                    />
                  ) : (
                    <Path
                      key={seg.stat.categoryId}
                      d={seg.path}
                      stroke={`url(#donut-${seg.index})`}
                      strokeWidth={strokeWidth}
                      strokeLinecap="round"
                      fill="none"
                    />
                  );
                })}
              </Svg>

              {donutSegments.map((seg) => {
                if (seg.stat.percentage < 4) return null;
                const labelRadius = radius + strokeWidth / 2 + 24;
                const lx = CHART_BOX / 2 + labelRadius * Math.cos(seg.midAngle);
                const ly = CHART_BOX / 2 + labelRadius * Math.sin(seg.midAngle);
                return (
                  <View key={`lbl-${seg.stat.categoryId}`} style={[styles.donutLabelWrap, { left: lx - 30, top: ly - 9 }]}>
                    <Ionicons name={(seg.stat.icon || 'pricetag-outline') as any} size={12} color={seg.gradient.to} />
                    <Text style={styles.donutLabelText}>{Math.round(seg.stat.percentage)}%</Text>
                  </View>
                );
              })}

              <View style={styles.innerCircle}>
                <Text style={styles.statsAmount}>
                  ₱{periodTotalExpenses.total.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                </Text>
                <Text style={styles.statsLabel}>Total Expenses</Text>
              </View>
            </View>

            <View style={styles.legendContainer}>
              {categoryStats
                .slice()
                .sort((a, b) => b.total - a.total)
                .map((stat) => (
                  <View key={stat.categoryId} style={styles.legendRow}>
                    <View style={styles.legendLeft}>
                      <View style={[styles.legendIconCircle, { backgroundColor: stat.color }]}>
                        <Ionicons name={(stat.icon || 'pricetag-outline') as any} size={18} color={theme.colors.white} />
                      </View>
                      <View style={styles.legendTextCol}>
                        <Text style={styles.legendCategoryName} numberOfLines={1}>{stat.categoryName}</Text>
                        <Text style={styles.legendSubtitle}>{stat.percentage.toFixed(1)}% of total</Text>
                      </View>
                    </View>
                    <Text style={styles.legendAmountNeg}>
                      -₱{stat.total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </Text>
                  </View>
                ))}
              {categoryStats.length === 0 && (
                <Text style={styles.emptyLegendText}>No expense records found.</Text>
              )}
            </View>
          </View>
        </View>

        {/* DAILY SPENDING TREND LINE GRAPH */}
        <View style={styles.sectionBlock}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Daily Spending Trend</Text>
          </View>

          <View style={styles.trendCard}>
            <Text style={styles.lineGraphSubtitle}>Expenses incurred per day (Past 7 Days)</Text>

            <View style={styles.graphWrapper}>
              {(() => {
                const chartWidth = SCREEN_WIDTH - 92;
                const chartHeight = 190;
                const paddingLeft = 34;
                const paddingRight = 14;
                const paddingTop = 16;
                const paddingBottom = 34;

                const usableWidth = chartWidth - paddingLeft - paddingRight;
                const usableHeight = chartHeight - paddingTop - paddingBottom;
                const baseY = paddingTop + usableHeight;

                const maxAmount = Math.max(...dailyTrends.map((d) => d.amount), 100);

                const points = dailyTrends.map((item, index) => {
                  const x = paddingLeft + (index / (dailyTrends.length - 1 || 1)) * usableWidth;
                  const y = paddingTop + usableHeight - (item.amount / maxAmount) * usableHeight;
                  return { x, y, ...item };
                });

                const polylinePoints = points.map((p) => `${p.x},${p.y}`).join(' ');
                const areaPath =
                  points.length > 0
                    ? `M ${points[0].x} ${baseY} L ${points.map((p) => `${p.x} ${p.y}`).join(' L ')} L ${points[points.length - 1].x} ${baseY} Z`
                    : '';

                return (
                  <Svg width={chartWidth} height={chartHeight}>
                    <Defs>
                      <SvgLinearGradient id="trend-area" x1="0" y1="0" x2="0" y2="1">
                        <Stop offset="0" stopColor={theme.colors.dueGreen} stopOpacity={0.28} />
                        <Stop offset="1" stopColor={theme.colors.dueGreen} stopOpacity={0} />
                      </SvgLinearGradient>
                    </Defs>

                    {[0, 0.5, 1].map((ratio, idx) => {
                      const yPos = paddingTop + usableHeight * ratio;
                      const valLabel = Math.round(maxAmount * (1 - ratio));
                      return (
                        <G key={idx}>
                          <Line
                            x1={paddingLeft}
                            y1={yPos}
                            x2={chartWidth - paddingRight}
                            y2={yPos}
                            stroke={theme.colors.border}
                            strokeDasharray="3,5"
                            strokeWidth="1"
                          />
                          <SvgText
                            x={paddingLeft - 10}
                            y={yPos + 3.5}
                            fontSize="10"
                            fontFamily={theme.fontFamily.regular}
                            fill={theme.colors.textSecondary}
                            textAnchor="end"
                          >
                            {valLabel}
                          </SvgText>
                        </G>
                      );
                    })}

                    {areaPath ? <Path d={areaPath} fill="url(#trend-area)" /> : null}

                    <Polyline
                      points={polylinePoints}
                      fill="none"
                      stroke={theme.colors.dueGreen}
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />

                    {points.map((p, idx) => (
                      <G key={idx}>
                        <Circle
                          cx={p.x}
                          cy={p.y}
                          r={5}
                          fill={theme.colors.white}
                          stroke={theme.colors.dueGreen}
                          strokeWidth="2.5"
                        />
                        <SvgText
                          x={p.x}
                          y={chartHeight - 8}
                          fontSize="9.5"
                          fontFamily={theme.fontFamily.regular}
                          fill={theme.colors.textSecondary}
                          textAnchor="middle"
                        >
                          {p.displayDay}
                        </SvgText>
                      </G>
                    ))}
                  </Svg>
                );
              })()}
            </View>
          </View>
        </View>
      </Animated.ScrollView>

      {/* SCHEDULED DUES */}
      <Sheet
        visible={modalVisible}
        title="Scheduled Dues"
        subtitle={formatReadableDate(selectedDate)}
        onClose={closeDuesModal}
      >
        <Banner message={duesBanner} />

        {filteredDues.some((d) => d.status === 'pending') && (
          <View
            style={[
              sheetStyles.dueDaysBadge,
              { backgroundColor: selectedDaysInfo.urgent ? theme.colors.dangerBg : theme.colors.alpha.brand[10] },
            ]}
          >
            <Text
              style={[
                sheetStyles.dueDaysBadgeText,
                { color: selectedDaysInfo.urgent ? theme.colors.danger : theme.colors.brand },
              ]}
            >
              {selectedDaysInfo.text}
            </Text>
          </View>
        )}

        {filteredDues.length > 0 ? (
          <View style={{ gap: theme.space[10] }}>
            {filteredDues.map((due, index) => {
              const cardBgColor = theme.chart.lightCards[index % theme.chart.lightCards.length];
              const categoryIcon = due.categories?.icon || 'pricetag-outline';
              const isPaid = due.status === 'paid';

              return (
                <View
                  key={due.id}
                  style={[styles.reminderCardHome, { backgroundColor: cardBgColor, opacity: isPaid ? 0.75 : 1 }]}
                >
                  <View style={styles.calendarBadgeHome}>
                    <Ionicons name={categoryIcon as any} size={22} color={theme.colors.brand} />
                  </View>

                  <View style={styles.cardContentHome}>
                    <Text style={[styles.reminderTitleHome, isPaid && { textDecorationLine: 'line-through', color: theme.colors.textMuted }]}>
                      {due.title}
                    </Text>
                    <Text style={styles.reminderSubHome}>₱{Number(due.amount).toFixed(2)}</Text>
                  </View>

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[8] }}>
                    {isPaid ? (
                      <View style={{ paddingHorizontal: theme.space[12], paddingVertical: theme.space[6], backgroundColor: theme.colors.alpha.olive[15], borderRadius: theme.radius.sm, marginRight: theme.space[4] }}>
                        <Text style={{ color: theme.colors.olive, fontFamily: theme.fontFamily.semibold, fontSize: theme.fontSize.caption }}>Paid</Text>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={[styles.deleteButtonHome, { backgroundColor: theme.colors.alpha.brand[10] }]}
                        onPress={() => handleSettleReminder(due)}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="checkmark-outline" size={18} color={theme.colors.brand} />
                      </TouchableOpacity>
                    )}

                    <TouchableOpacity
                      style={styles.deleteButtonHome}
                      onPress={() => handleDeleteReminder(due.id, due.title)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="trash-outline" size={18} color={theme.colors.danger} />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        ) : (
          <View style={sheetStyles.emptyState}>
            <View style={sheetStyles.emptyIcon}>
              <Ionicons name="checkmark-circle-outline" size={22} color={theme.colors.textMuted} />
            </View>
            <Text style={sheetStyles.emptyTitle}>All Clear!</Text>
            <Text style={sheetStyles.emptySubtitle}>No reminders set for this date.</Text>
          </View>
        )}
      </Sheet>

      {/* DELETE REMINDER */}
      <Sheet
        visible={deleteModalVisible}
        title="Delete Reminder"
        subtitle="This action cannot be undone."
        onClose={closeDeleteModal}
        footer={
          <SheetActions
            onCancel={closeDeleteModal}
            onSubmit={confirmDeleteReminder}
            submitLabel="Delete"
            loading={isDeleting}
            danger
          />
        }
      >
        <Banner message={deleteBanner} />
        <Text style={sheetStyles.confirmText}>
          Are you sure you want to delete{' '}
          <Text style={sheetStyles.confirmTextStrong}>"{reminderToDelete?.title}"</Text>?
        </Text>
      </Sheet>

      {/* ADD REMINDER */}
      <Sheet
        visible={addModalVisible}
        title="Add New Reminder"
        subtitle="Fill in reminder details."
        onClose={closeAddModal}
        footer={
          <SheetActions
            onCancel={closeAddModal}
            onSubmit={handleCreateReminder}
            submitLabel="Save Reminder"
            loading={submitting}
          />
        }
      >
        <Banner message={addBanner} />

        <Field label="Title" error={reminderErrors.title}>
          <TextInput
            style={[sheetStyles.input, !!reminderErrors.title && sheetStyles.inputError]}
            placeholder="e.g., Electricity Bill"
            placeholderTextColor={theme.colors.textMuted}
            value={newTitle}
            onChangeText={(t) => {
              setNewTitle(t);
              clearReminderError('title');
            }}
          />
        </Field>

        <Field label="Amount (PHP)" error={reminderErrors.amount}>
          <View style={sheetStyles.amountWrapper}>
            <Text style={sheetStyles.currencyPrefix}>₱</Text>
            <TextInput
              style={[sheetStyles.input, sheetStyles.amountInput, !!reminderErrors.amount && sheetStyles.inputError]}
              placeholder="0.00"
              placeholderTextColor={theme.colors.textMuted}
              keyboardType="decimal-pad"
              value={newAmount}
              onChangeText={(t) => {
                setNewAmount(t);
                clearReminderError('amount');
              }}
            />
          </View>
        </Field>

        <Field label="Category" error={reminderErrors.category}>
          <View style={sheetStyles.chipWrap}>
            {categories.map((cat) => {
              const isSelected = newCategoryId === cat.id;
              const catColor = cat.color || theme.colors.brand;
              return (
                <TouchableOpacity
                  key={cat.id}
                  activeOpacity={0.8}
                  onPress={() => {
                    setNewCategoryId(cat.id);
                    clearReminderError('category');
                  }}
                  style={[sheetStyles.categoryChip, isSelected && sheetStyles.categoryChipActive]}
                >
                  <Ionicons
                    name={(cat.icon || 'receipt-outline') as any}
                    size={15}
                    color={isSelected ? theme.colors.white : catColor}
                  />
                  <Text style={[sheetStyles.categoryChipText, isSelected && sheetStyles.categoryChipTextActive]}>
                    {cat.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Field>

        <Field label="Due Date" error={reminderErrors.date}>
          <DateButton
            value={newDueDate}
            hasError={!!reminderErrors.date}
            onPress={() => setDatePickerVisible(true)}
          />
        </Field>
      </Sheet>

      {/* DUE DATE PICKER */}
      <DatePickerSheet
        visible={datePickerVisible}
        value={newDueDate}
        title="Select Due Date"
        subtitle="Tap the day this reminder is due."
        onClose={() => setDatePickerVisible(false)}
        onConfirm={(dateStr) => {
          setNewDueDate(dateStr);
          clearReminderError('date');
          setDatePickerVisible(false);
        }}
      />
    </View>
  );
}