import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import { Calendar } from 'react-native-calendars';
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
import { homeCalendarTheme, homeStyles as styles } from '@/constants/ui.styles';
import { GradientBackground } from '../../components/GradientBackground';
import { PaytonAlertDialog } from '../../components/PaytonAlert';
import { supabase } from '../../lib/supabase';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

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

interface DashboardSummary {
  incomeId: string;
  sourceName: string;
  totalIncome: number;
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

interface DueDatesCalendarModalProps {
  visible: boolean;
  selectedDate: string;
  dues: ReminderItem[];
  onClose: () => void;
  onSelectDate: (dateString: string) => void;
}

function DueDatesCalendarModal({
  visible,
  selectedDate,
  dues,
  onClose,
  onSelectDate,
}: DueDatesCalendarModalProps) {
  // Dates that have at least one pending (unpaid) reminder -> dot indicator
  const markedDates = useMemo(() => {
    const marks: Record<string, any> = {};

    dues.forEach((due) => {
      if (due.status === 'pending') {
        marks[due.due_date] = {
          marked: true,
          dotColor: theme.colors.olive,
        };
      }
    });

    marks[selectedDate] = {
      ...(marks[selectedDate] || {}),
      selected: true,
      selectedColor: theme.colors.brand,
      selectedTextColor: theme.colors.white,
      // keep the dot visible on the selected (dark) day
      ...(marks[selectedDate]?.marked ? { dotColor: theme.colors.lime } : {}),
    };

    return marks;
  }, [dues, selectedDate]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalTitle}>Upcoming Dues</Text>
              <Text style={styles.modalSubtitle}>Tap a date to view its reminders</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.modalCloseButton}>
              <Ionicons name="close" size={20} color={theme.colors.textMuted} />
            </TouchableOpacity>
          </View>

          <View style={styles.calendarCard}>
            <Calendar
              current={selectedDate}
              onDayPress={(day) => onSelectDate(day.dateString)}
              markedDates={markedDates}
              enableSwipeMonths
              theme={homeCalendarTheme}
            />
          </View>

          <View style={styles.calendarLegendRow}>
            <View style={styles.calendarLegendDot} />
            <Text style={styles.calendarLegendText}>Has pending dues</Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default function PersonalHomeScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [personalName, setPersonalName] = useState('Guian Sumbi');
  const [personalRole, setPersonalRole] = useState('Member');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [upcomingDues, setUpcomingDues] = useState<ReminderItem[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  
  // Statistics State
  const [dailyTrends, setDailyTrends] = useState<DailyTrendItem[]>([]);
  const [rawExpenses, setRawExpenses] = useState<any[]>([]);

  // "Expense per Category" period filter (Weekly / Monthly / Yearly)
  type StatsPeriod = 'weekly' | 'monthly' | 'yearly';
  const [statsPeriod, setStatsPeriod] = useState<StatsPeriod>('monthly');
  const [periodMenuVisible, setPeriodMenuVisible] = useState(false);
  const periodLabels: Record<StatsPeriod, string> = { weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly' };

  const todayStr = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [modalVisible, setModalVisible] = useState(false);

  // ---- collapsing header (driven by scroll) — same approach as the Spender dashboard ----
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

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [reminderToDelete, setReminderToDelete] = useState<{ id: string; title: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [isCalendarModalVisible, setIsCalendarModalVisible] = useState(false);

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

      if (profileData?.full_name) setPersonalName(profileData.full_name);
      if (profileData?.avatar_url) setAvatarUrl(profileData.avatar_url);
      if (profileData?.role) setPersonalRole(profileData.role);

      const { data: incomeData, error: incomeError } = await supabase
        .from('income')
        .select('id, source_name, amount, received_at')
        .eq('user_id', user.id)
        .eq('is_archived', false) // Only fetch non-archived income records
        .order('received_at', { ascending: false });

      if (incomeError) throw incomeError;

      let totalSpentCounter = 0;
      let combinedTotalIncome = 0;

      if (incomeData && incomeData.length > 0) {
        const incomeIds = incomeData.map((item) => item.id);
        
        combinedTotalIncome = incomeData.reduce(
          (sum, item) => sum + Number(item.amount || 0),
          0
        );

        const { data: expensesData, error: expensesError } = await supabase
          .from('expenses')
          .select(`
            id, 
            amount, 
            income_id,
            category_id,
            spent_at,
            categories ( id, name, icon )
          `)
          .in('income_id', incomeIds);

        if (expensesError) throw expensesError;

        totalSpentCounter = (expensesData || []).reduce(
          (sum: number, exp: any) => sum + Number(exp.amount || 0),
          0
        );

        // Keep the raw rows (with spent_at) so the Weekly / Monthly / Yearly filter can
        // recompute the category breakdown client-side without another round trip.
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
          incomeId: incomeIds[0], 
          sourceName: incomeData.map(a => a.source_name).join(', '),
          totalIncome: combinedTotalIncome,
          totalSpent: totalSpentCounter,
          remaining: combinedTotalIncome - totalSpentCounter,
          unallocated: 0,
        });
      } else {
        setSummary(null);
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
          categories ( name, icon )
        `)
        .eq('user_id', user.id)
        .in('status', ['pending', 'paid'])
        .order('due_date', { ascending: true });

      if (duesError) throw duesError;
      setUpcomingDues((duesData as unknown as ReminderItem[]) || []);

      await fetchCategories();

    } catch (error: unknown) {
      console.error('Personal Dashboard Error:', extractErrorMessage(error));
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
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    setSelectedDate(todayStr);
    fetchDashboardData();
  };

  const resetForm = () => {
    setNewTitle('');
    setNewAmount('');
    setNewDueDate(todayStr);
    setNewCategoryId(null);
    setSubmitting(false);
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  const handleCalendarDateSelect = (dateString: string) => {
    // 1. Remember the picked date (drives filteredDues for the Scheduled Dues modal)
    setSelectedDate(dateString);
    setErrorMessage(null);
    setSuccessMessage(null);

    // 2. Close the calendar modal
    setIsCalendarModalVisible(false);

    // 3. Open the Scheduled Dues modal once the calendar has finished closing.
    //    Presenting two RN Modals at the same moment is unreliable (esp. iOS),
    //    so we wait for the dismiss animation. If the date has no reminders,
    //    the modal shows its "All Clear" empty state.
    setTimeout(() => setModalVisible(true), 350);
  };

  const handleCreateReminder = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!newTitle.trim() || !newAmount.trim()) {
      setErrorMessage('Please fill in both title and amount.');
      return;
    }

    if (!newCategoryId) {
      setErrorMessage('Please choose a category for this reminder.');
      return;
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(newDueDate)) {
      setErrorMessage('Invalid due date. Please use YYYY-MM-DD.');
      return;
    }

    // Validate that it's a real calendar date (e.g., catching "2026-02-31")
    const parsedDate = new Date(newDueDate);
    const timestamp = parsedDate.getTime();

    if (
      isNaN(timestamp) || 
      parsedDate.toISOString().slice(0, 10) !== newDueDate
    ) {
      setErrorMessage('Please enter a valid calendar date (YYYY-MM-DD).');
      return;
    }

    try {
      setSubmitting(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const parsedAmount = parseFloat(newAmount);

      const { error } = await supabase.from('reminders').insert({
        user_id: user.id,
        title: newTitle.trim(),
        amount: parsedAmount,
        due_date: newDueDate,
        status: 'pending',
        income_id: summary?.incomeId || null,
        category_id: newCategoryId,
      });

      if (error) throw error;

      // Log the successful reminder creation matching your logs table schema
      await supabase.from('logs').insert({
        user_id: user.id,
        details: `created reminder "${newTitle.trim()}" (${parsedAmount}).`,
      });

      // Set success message
      setSuccessMessage('Reminder saved successfully!');
      fetchDashboardData();

      // Wait 1 second so the user sees the success banner before closing the modal
      setTimeout(() => {
        resetForm();
        setAddModalVisible(false);
        setSuccessMessage(null);
      }, 1000);

    } catch (error: unknown) {
      console.error('Error adding reminder:', extractErrorMessage(error));
      setErrorMessage('Failed to save reminder. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteReminder = (reminderId: string, reminderTitle: string) => {
    setReminderToDelete({ id: reminderId, title: reminderTitle });
    setDeleteModalVisible(true);
  };

  // Closing is blocked while a delete is in flight (same rule as the old custom modal).
  const closeDeleteDialog = () => {
    if (!isDeleting) setDeleteModalVisible(false);
  };

  const confirmDeleteReminder = async () => {
    // PaytonAlertDialog buttons cannot be disabled, so the in-flight guard lives here.
    if (!reminderToDelete || isDeleting) return;

    try {
      setIsDeleting(true);
      const { error } = await supabase
        .from('reminders')
        .delete()
        .eq('id', reminderToDelete.id);

      if (error) throw error;
      
      // Fetch current user and log the deletion action matching your logs table schema
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('logs').insert({
          user_id: user.id,
          details: `deleted reminder "${reminderToDelete.title || reminderToDelete.id}".`,
        });
      }

      fetchDashboardData();
      
      // 1. Clear any old errors and set your success message
      setErrorMessage(null);
      setSuccessMessage(`Successfully deleted "${reminderToDelete.title || 'reminder'}"`);

      // 2. Close the delete confirmation dialog and clear temporary deletion state
      setDeleteModalVisible(false);
      setReminderToDelete(null);

      // 3. Automatically clear the success banner after 4 seconds
      setTimeout(() => {
        setSuccessMessage(null);
      }, 4000);

    } catch (error: unknown) {
      console.error('Error deleting reminder:', extractErrorMessage(error));
      setSuccessMessage(null); // Clear any old success message on failure
      setErrorMessage('Failed to delete reminder.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSettleReminder = async (reminder: ReminderItem) => {
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // 1. Fetch the user's active (non-archived) income records
      const { data: incomes, error: incomeFetchError } = await supabase
        .from('income')
        .select('amount')
        .eq('user_id', user.id)
        .eq('is_archived', false);

      if (incomeFetchError) throw incomeFetchError;

      if (!incomes || incomes.length === 0) {
        setErrorMessage('Cannot settle reminder: No income records found.');
        return;
      }

      const totalIncome = incomes.reduce((sum, item) => sum + Number(item.amount), 0);

      // 2. Fetch expenses only where the associated income record has is_archived = false
      const { data: expenses, error: expenseFetchError } = await supabase
        .from('expenses')
        .select(`
          amount,
          income!inner (
            is_archived
          )
        `)
        .eq('user_id', user.id)
        .eq('income.is_archived', false);

      if (expenseFetchError) throw expenseFetchError;

      const totalExpenses = expenses ? expenses.reduce((sum, item) => sum + Number(item.amount), 0) : 0;

      // 3. Calculate the actual remaining balance
      const remaining = totalIncome - totalExpenses;

      // 4. Check if the reminder amount exceeds the remaining balance
      if (reminder.amount > remaining) {
        setErrorMessage(`Cannot settle reminder: The amount (${reminder.amount}) exceeds your remaining balance (${remaining}).`);
        return;
      }

      // 5. Update reminder status to 'paid'
      const { error: updateError } = await supabase
        .from('reminders')
        .update({ status: 'paid' })
        .eq('id', reminder.id);

      if (updateError) throw updateError;

      // 6. Insert record into the expenses table
      const { error: expenseError } = await supabase
        .from('expenses')
        .insert({
          user_id: user.id,
          description: reminder.title,
          amount: reminder.amount,
          category_id: reminder.category_id || null,
          income_id: summary?.incomeId || null,
          spent_at: new Date().toISOString(),
        });

      if (expenseError) throw expenseError;

      // Log the successful settlement action matching your logs table schema
      await supabase.from('logs').insert({
        user_id: user.id,
        details: `settled reminder "${reminder.title}" (${reminder.amount}).`,
      });

      setSuccessMessage(`"${reminder.title}" has been settled and recorded.`);
      fetchDashboardData();
    } catch (error: unknown) {
      console.error('Error settling reminder:', extractErrorMessage(error));
      setErrorMessage('Failed to settle reminder.');
    }
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, styles.loadingBackground]}>
        <ExpoStatusBar style="light" />
        <ActivityIndicator size="large" color={theme.colors.brand} />
      </View>
    );
  }

  const remainingPercentage = summary && summary.totalIncome > 0
    ? Math.max(0, Math.min(((summary.totalIncome - summary.totalSpent) / summary.totalIncome) * 100, 100))
    : 0;

  const handleDatePress = (dateStr: string) => {
    setSelectedDate(dateStr);
    setModalVisible(true);
  };

  const filteredDues = upcomingDues.filter(due => due.due_date === selectedDate);
  const selectedDaysInfo = getDaysInfo(selectedDate);

  const pendingDues = upcomingDues
    .filter((due) => due.status === 'pending')
    .sort((x, y) => x.due_date.localeCompare(y.due_date));

  // "Expense per Category" breakdown for the selected Weekly / Monthly / Yearly period.
  const periodTotalExpenses = (() => {
    const now = new Date();
    const cutoff = new Date(now);
    if (statsPeriod === 'weekly') cutoff.setDate(now.getDate() - 7);
    else if (statsPeriod === 'monthly') cutoff.setMonth(now.getMonth() - 1);
    else cutoff.setFullYear(now.getFullYear() - 1);

    const inRange = rawExpenses.filter((exp: any) => exp.spent_at && new Date(exp.spent_at) >= cutoff);
    const total = inRange.reduce((sum: number, exp: any) => sum + Number(exp.amount || 0), 0);

    const map: { [key: string]: { name: string; icon?: string; total: number } } = {};
    inRange.forEach((exp: any) => {
      const catId = exp.category_id || 'uncategorized';
      const catName = exp.categories?.name || 'Uncategorized';
      const catIcon = exp.categories?.icon;
      const amt = Number(exp.amount || 0);
      if (!map[catId]) map[catId] = { name: catName, icon: catIcon, total: 0 };
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
        color: theme.chart.category[index % theme.chart.category.length],
      };
    });

    return { total, stats };
  })();
  const categoryStats = periodTotalExpenses.stats;

  // SVG Donut Chart Calculation variables
  const size = 200;
  const CHART_BOX = 260; // must match circleContainer width/height in ui.styles.ts
  const strokeWidth = 23;
  const center = size / 2;
  const radius = center - strokeWidth;

  // donut segments: arc path + gradient end points for each category
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
        gradient: theme.chart.categoryGradients[index % theme.chart.categoryGradients.length],
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
      <ExpoStatusBar style="light" />

      {/* HEADER (collapses while scrolling) */}
      <Animated.View style={[styles.headerBackground, headerAnimatedStyle]}>
        <View style={styles.headerGradientClip}>
          <GradientBackground />
        </View>

        {/* expanded layer */}
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
                        <Text style={styles.avatarInitial}>{personalName.charAt(0).toUpperCase()}</Text>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>

                <View>
                  <Text style={styles.helloText}>Hello,</Text>
                  <Text style={styles.userNameText} numberOfLines={1}>
                    {personalName}
                  </Text>
                </View>
              </View>

              <View style={styles.roleBadgeContainer}>
                <Text style={styles.roleBadgeText} numberOfLines={1}>
                  {personalRole || ''}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.balanceBlock}>
            <View style={styles.balanceLabelRow}>
              <Text style={styles.balanceLabel}>Total Remaining</Text>
            </View>

            <View style={styles.pillTrackOuter}>
              <View style={styles.pillTrack}>
                <View style={[styles.pillFill, { width: `${remainingPercentage}%` }]} />
              </View>
            </View>

            <View style={styles.balanceAmountRowSplit}>
              <View style={styles.balanceAmountLeft}>
                <Text style={styles.pillAmountText}>
                  ₱{summary ? summary.remaining.toLocaleString('en-US') : '0'}
                </Text>
                <Text style={styles.pillAmountDivider}>/</Text>
                <Text style={styles.pillAmountTotal}>
                  ₱{summary ? summary.totalIncome.toLocaleString('en-US') : '0'}
                </Text>
              </View>

              {/* Income (Personal only) */}
              <TouchableOpacity
                style={styles.headerIconButton}
                onPress={() => router.push('/income')}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Manage income"
              >
                <Ionicons name="create-outline" size={20} color={theme.colors.white} />
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>

        {/* compact layer (shown after scrolling) */}
        <Animated.View style={[styles.headerCompact, { paddingTop: topInset }, compactLayerStyle]}>
          <View style={styles.compactTopRow}>
            <TouchableOpacity style={styles.compactUser} onPress={() => router.push('/profile')} activeOpacity={0.8}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.compactAvatarImage} />
              ) : (
                <View style={styles.compactAvatarFallback}>
                  <Text style={styles.compactAvatarInitial}>{personalName.charAt(0).toUpperCase()}</Text>
                </View>
              )}
              <Text style={styles.compactName} numberOfLines={1}>
                {personalName}
              </Text>
            </TouchableOpacity>

            <View style={styles.compactActions}>
              {/* Income (Personal only) */}
              <TouchableOpacity
                style={styles.headerIconButton}
                onPress={() => router.push('/income')}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Manage income"
              >
                <Ionicons name="create-outline" size={18} color={theme.colors.white} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.headerIconButton} onPress={() => setAddModalVisible(true)} activeOpacity={0.8}>
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
              ₱{summary ? summary.totalIncome.toLocaleString('en-US') : '0'}
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
              {/* Calendar of due dates (Personal). Uncomment to show the calendar button next to "Set Reminders". */}
              {/* <TouchableOpacity style={styles.dueIconButton} onPress={() => setIsCalendarModalVisible(true)} activeOpacity={0.8}>
                <Ionicons name="calendar-outline" size={15} color={theme.colors.mintPillText} />
              </TouchableOpacity> */}
              <TouchableOpacity style={styles.addReminderPill} onPress={() => setAddModalVisible(true)} activeOpacity={0.8}>
                <View style={styles.pillPlusCircle}>
                  <Ionicons name="add" size={12} color={theme.colors.white} />
                </View>
                <Text style={styles.seeAllText}>Set Reminders</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Upcoming due cards */}
          {pendingDues.length === 0 ? (
            <View style={styles.dueEmpty}>
              <Text style={styles.dueEmptyText}>No upcoming dues. Tap “Set Reminders” to add one.</Text>
            </View>
          ) : (
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
          )}

        </View>

        {/* STATISTICS SECTION */}
        <View style={styles.sectionBlock}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Expense per Category</Text>
            <TouchableOpacity
              style={styles.addReminderPill}
              onPress={() => setPeriodMenuVisible(true)}
              activeOpacity={0.8}
            >
              <Text style={styles.seeAllText}>{periodLabels[statsPeriod]}</Text>
              <Ionicons name="chevron-down" size={14} color={theme.colors.mintPillText} />
            </TouchableOpacity>
          </View>

          <Modal
            visible={periodMenuVisible}
            transparent
            animationType="fade"
            onRequestClose={() => setPeriodMenuVisible(false)}
          >
            <TouchableOpacity
              style={styles.periodDropdownOverlay}
              activeOpacity={1}
              onPress={() => setPeriodMenuVisible(false)}
            >
              <View style={styles.periodDropdownMenu}>
                {(['weekly', 'monthly', 'yearly'] as const).map((period) => (
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
            {/* Multi-Segment Donut Chart Display */}
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

                {/* Background Track Circle */}
                <Circle cx={center} cy={center} r={radius} stroke={theme.colors.surfaceAlt} strokeWidth={strokeWidth} fill="none" />

                {/* Gradient category segments */}
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

              {/* Icon + percentage labels around the ring */}
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

            {/* Category Breakdown Legend List */}
            <View style={styles.legendContainer}>
              {categoryStats
                .slice() // shallow copy so the original array is not mutated
                .sort((a, b) => b.total - a.total) // highest to lowest
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

      {/* MODAL FOR PENDING DUES */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderLeft}>
                <View>
                  <Text style={styles.modalTitle}>Scheduled Dues</Text>
                  <Text style={styles.modalSubtitle}>{formatReadableDate(selectedDate)}</Text>
                </View>
                {/* Only show the days remaining/overdue badge if there are pending dues */}
                {filteredDues.length > 0 && filteredDues.some(d => d.status === 'pending') && (
                  <View style={[
                    styles.dueBadgeHome, 
                    selectedDaysInfo.urgent ? styles.dueBadgeUrgent : styles.dueBadgeNormal
                  ]}>
                    <Text style={[
                      styles.dueBadgeTextHome, 
                      selectedDaysInfo.urgent ? styles.dueBadgeTextUrgent : styles.dueBadgeTextNormal
                    ]}>
                      {selectedDaysInfo.text}
                    </Text>
                  </View>
                )}
              </View>

              <TouchableOpacity 
                onPress={() => {
                  setModalVisible(false);
                  setSelectedDate(todayStr);
                  setErrorMessage(null);
                  setSuccessMessage(null);
                }} 
                style={styles.modalCloseButton}
              >
                <Ionicons name="close" size={20} color={theme.colors.textMuted} />
              </TouchableOpacity>
            </View>

            {errorMessage && (
              <View style={styles.inlineErrorContainer}>
                <Ionicons name="alert-circle-outline" size={18} color={theme.colors.danger} />
                <Text style={styles.inlineErrorText}>{errorMessage}</Text>
              </View>
            )}

            {successMessage && (
              <View style={styles.inlineSuccessContainer}>
                <Ionicons name="checkmark-circle-outline" size={18} color={theme.colors.olive} />
                <Text style={styles.inlineSuccessText}>{successMessage}</Text>
              </View>
            )}

            <ScrollView contentContainerStyle={styles.modalBody} showsVerticalScrollIndicator={false}>
              {filteredDues.length > 0 ? (
                filteredDues.map((due, index) => {
                  const cardBgColor = theme.chart.lightCards[index % theme.chart.lightCards.length];
                  const categoryIcon = due.categories?.icon || 'pricetag-outline';
                  const isPaid = due.status === 'paid';

                  return (
                    <View
                      key={due.id}
                      style={[styles.reminderCardHome, isPaid && styles.reminderCardPaid, { backgroundColor: cardBgColor }]}
                    >
                      <View style={styles.calendarBadgeHome}>
                        <Ionicons name={categoryIcon as any} size={22} color={theme.colors.brand} />
                      </View>

                      <View style={styles.cardContentHome}>
                        <Text style={[styles.reminderTitleHome, isPaid && styles.reminderTitlePaid]}>
                          {due.title}
                        </Text>
                        <Text style={styles.reminderSubHome}>
                          ₱{Number(due.amount).toFixed(2)}
                        </Text>
                      </View>

                      {/* Conditional Actions or Paid Badge */}
                      <View style={styles.reminderActionsRow}>
                        {isPaid ? (
                          <View style={styles.paidBadge}>
                            <Text style={styles.paidBadgeText}>Paid</Text>
                          </View>
                        ) : (
                          /* Settle Button (Only shown when not paid) */
                          <TouchableOpacity 
                            style={[styles.deleteButtonHome, styles.settleButtonHome]} 
                            onPress={() => handleSettleReminder(due)}
                            activeOpacity={0.7}
                          >
                            <Ionicons name="checkmark-outline" size={18} color={theme.colors.brand} />
                          </TouchableOpacity>
                        )}

                        {/* Delete Button (Always shown) */}
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
                })
              ) : (
                <View style={styles.emptyStateContainer}>
                  <Ionicons name="checkmark-circle-outline" size={48} color={theme.colors.brand} />
                  <Text style={styles.emptyStateTitle}>All Clear!</Text>
                  <Text style={styles.emptyStateText}>No reminders set for this date.</Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* DELETE CONFIRMATION — shared PaytonAlertDialog (local state, so it does not depend on PaytonAlertProvider) */}
      <PaytonAlertDialog
        visible={deleteModalVisible}
        type="error"
        title="Delete Reminder"
        message={`Are you sure you want to delete "${reminderToDelete?.title ?? ''}"?\nThis action cannot be undone.`}
        buttons={[
          { text: 'Cancel', style: 'cancel', onPress: closeDeleteDialog },
          { text: isDeleting ? 'Deleting...' : 'Delete', style: 'destructive', onPress: confirmDeleteReminder },
        ]}
        onDismiss={closeDeleteDialog}
      />

      {/* MODAL FOR ADDING A NEW REMINDER */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={addModalVisible}
        onRequestClose={() => {
          resetForm();
          setAddModalVisible(false);
          setErrorMessage(null);
          setSuccessMessage(null);
        }}
        onShow={() => fetchCategories()}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Add New Reminder</Text>
                <Text style={styles.modalSubtitle}>Fill in reminder details</Text>
              </View>
              <TouchableOpacity 
                onPress={() => {
                  resetForm();
                  setAddModalVisible(false);
                }} 
                style={styles.modalCloseButton}
              >
                <Ionicons name="close" size={20} color={theme.colors.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Inline Error Banner */}
            {errorMessage && (
              <View style={styles.inlineErrorContainer}>
                <Ionicons name="alert-circle-outline" size={18} color={theme.colors.danger} />
                <Text style={styles.inlineErrorText}>{errorMessage}</Text>
              </View>
            )}

            {/* Inline Success Banner */}
            {successMessage && (
              <View style={styles.inlineSuccessContainer}>
                <Ionicons name="checkmark-circle-outline" size={18} color={theme.colors.green} />
                <Text style={styles.inlineSuccessText}>{successMessage}</Text>
              </View>
            )}

            <ScrollView contentContainerStyle={styles.formContainer} showsVerticalScrollIndicator={false}>
              <Text style={styles.inputLabel}>Title</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g., Electricity Bill"
                placeholderTextColor={theme.colors.textMuted}
                value={newTitle}
                onChangeText={setNewTitle}
              />

              <Text style={styles.inputLabel}>Amount (₱)</Text>
              <TextInput
                style={styles.textInput}
                placeholder="0.00"
                placeholderTextColor={theme.colors.textMuted}
                keyboardType="numeric"
                value={newAmount}
                onChangeText={setNewAmount}
              />

              <Text style={styles.inputLabel}>Category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
                {categories.map((cat) => {
                  const isSelected = newCategoryId === cat.id;
                  return (
                    <TouchableOpacity
                      key={cat.id}
                      onPress={() => setNewCategoryId(cat.id)}
                      style={[styles.categoryChip, isSelected && styles.categoryChipSelected]}
                    >
                      <Text style={[styles.categoryChipText, isSelected && styles.categoryChipTextSelected]}>
                        {cat.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <Text style={styles.inputLabel}>Due Date (YYYY-MM-DD)</Text>
              <TextInput
                style={styles.textInput}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={theme.colors.textMuted}
                value={newDueDate}
                onChangeText={setNewDueDate}
              />

              <TouchableOpacity 
                style={styles.submitButton} 
                onPress={handleCreateReminder}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color={theme.colors.white} />
                ) : (
                  <Text style={styles.submitButtonText}>Save Reminder</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Due Dates Calendar Modal */}
      <DueDatesCalendarModal
        visible={isCalendarModalVisible}
        selectedDate={selectedDate}
        dues={upcomingDues}
        onClose={() => setIsCalendarModalVisible(false)}
        onSelectDate={handleCalendarDateSelect}
      />

    </View>
  );
}