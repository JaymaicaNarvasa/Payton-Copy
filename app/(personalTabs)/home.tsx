import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { Calendar } from 'react-native-calendars';
import Svg, { Circle, G, Line, Polyline, Text as SvgText } from 'react-native-svg';

import { supabase } from '../../lib/supabase';

const COLORS = {
  black: '#000000',
  headerDark: '#1F4F59',   
  headerDarker: '#173D45', 
  deepTeal: '#1F4F59',
  cyan: '#54C9CC',
  cyanLight: '#7EDDE0',
  olive: '#7EA00E',
  yellowGreen: '#DCD964',
  darkOlive: '#213502',
  bg: '#F8FAFC',
  card: '#FFFFFF',
  white: '#FFFFFF',
  textMuted: '#64748B',
  overlay: 'rgba(9, 20, 19, 0.5)',
  modalShadow: '#04201C',
};

const CATEGORY_COLORS = [
  // Original Colors
  '#54C9CC', // Cyan
  '#1F4F59', // Dark Teal
  '#7EA00E', // Olive Green
  '#DCD964', // Light Yellow-Green
  '#213502', // Deep Forest Green

  // New Neighboring Colors
  '#3AA8AC', // Muted Cyan (closer to Dark Teal / Cyan mix)
  '#357380', // Medium Teal (between Cyan and Dark Teal)
  '#9BC915', // Vibrant Olive Green (bright relative to your Olive)
  '#F4F19C', // Soft Pastel Yellow-Green (lighter shade of Light Yellow-Green)
  '#3D6105', // Mid Forest Green (softer transition into Deep Forest Green)
];

const PALETTE_LIGHT_CARDS = [
  '#E6F0F2',
  '#F4F8E8',
  '#FAFAD8',
];

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
  
  // Generate past 7 days (-7 to -1) and today through 6 days in the future (-7 to 6)
  for (let i = -7; i <= 6; i++) {
    const d = new Date();
    d.setDate(today.getDate() + i);
    
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const dateString = `${year}-${month}-${day}`;

    dates.push({
      dateString,
      dayName: d.toLocaleString('en-US', { weekday: 'short' }).toUpperCase(),
      dayNumber: d.getDate(),
      monthStr: d.toLocaleString('en-US', { month: 'short' }).toUpperCase(),
      isToday: i === 0,
      isSeeMore: false,
    });
  }

  // Append the 7th future container as the "See More" calendar trigger
  dates.push({
    isSeeMore: true,
  });

  return dates;
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
  category_id?: string | null; // <--- Add this line
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
          dotColor: COLORS.olive,
        };
      }
    });

    marks[selectedDate] = {
      ...(marks[selectedDate] || {}),
      selected: true,
      selectedColor: COLORS.headerDark,
      selectedTextColor: COLORS.white,
      // keep the dot visible on the selected (dark) day
      ...(marks[selectedDate]?.marked ? { dotColor: COLORS.yellowGreen } : {}),
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
              <Ionicons name="close" size={20} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>

          <View style={styles.calendarCard}>
            <Calendar
              current={selectedDate}
              onDayPress={(day) => onSelectDate(day.dateString)}
              markedDates={markedDates}
              enableSwipeMonths
              theme={{
                backgroundColor: COLORS.card,
                calendarBackground: COLORS.card,
                textSectionTitleColor: COLORS.textMuted,
                selectedDayBackgroundColor: COLORS.headerDark,
                selectedDayTextColor: COLORS.white,
                todayTextColor: COLORS.cyan,
                dayTextColor: COLORS.darkOlive,
                textDisabledColor: '#CBD5E1',
                dotColor: COLORS.olive,
                selectedDotColor: COLORS.yellowGreen,
                arrowColor: COLORS.headerDark,
                monthTextColor: COLORS.darkOlive,
                textDayFontWeight: '600',
                textMonthFontWeight: '700',
                textDayHeaderFontWeight: '700',
                textDayFontSize: 15,
                textMonthFontSize: 17,
                textDayHeaderFontSize: 12,
              }}
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
  const [categoryStats, setCategoryStats] = useState<CategoryStat[]>([]);
  const [overallTotalExpenses, setOverallTotalExpenses] = useState<number>(0);
  const [dailyTrends, setDailyTrends] = useState<DailyTrendItem[]>([]);
  
  const dateList = generateDateRange();
  const todayStr = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [modalVisible, setModalVisible] = useState(false);
  const horizontalScrollRef = useRef<ScrollView>(null);

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

  const [isCalendarModalVisible, setIsCalendarModalVisible] = useState(false);

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

        setOverallTotalExpenses(totalSpentCounter);

        const categoryMap: { [key: string]: { name: string; icon?: string; total: number } } = {};
        (expensesData || []).forEach((exp: any) => {
          const catId = exp.category_id || 'uncategorized';
          const catName = exp.categories?.name || 'Uncategorized';
          const catIcon = exp.categories?.icon;
          const amt = Number(exp.amount || 0);

          if (!categoryMap[catId]) {
            categoryMap[catId] = { name: catName, icon: catIcon, total: 0 };
          }
          categoryMap[catId].total += amt;
        });

        const statsArray: CategoryStat[] = Object.keys(categoryMap).map((catId, index) => {
          const item = categoryMap[catId];
          const percentage = totalSpentCounter > 0 ? (item.total / totalSpentCounter) * 100 : 0;
          return {
            categoryId: catId,
            categoryName: item.name,
            icon: item.icon,
            total: item.total,
            percentage,
            color: CATEGORY_COLORS[index % CATEGORY_COLORS.length],
          };
        });

        setCategoryStats(statsArray);

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
        setOverallTotalExpenses(0);
        setCategoryStats([]);
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
    setErrorMessage(null);    // <-- Add this
    setSuccessMessage(null); // <-- Add this
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

  // 3. Optional: Validate if it's a real calendar date (e.g., catching "2026-02-31")
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

    // Optional: Wait 1 second so the user sees the success banner before closing the modal
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

const confirmDeleteReminder = async () => {
  if (!reminderToDelete) return;

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

    // 2. Close the delete confirmation modal and clear temporary deletion state
    setDeleteModalVisible(false);
    setReminderToDelete(null);

    // 3. Optional: Automatically clear the success banner after 4 seconds
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

    // 1. Fetch the user's active (non-archived) income records[cite: 1]
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

    // 2. Fetch expenses only where the associated allowance has is_archived = false
    // Note: Replace 'allowances' with the exact foreign table name if it differs in your schema
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
      <View style={[styles.loadingContainer, { backgroundColor: COLORS.bg }]}>
        <ExpoStatusBar style="light" />
        <ActivityIndicator size="large" color={COLORS.deepTeal} />
      </View>
    );
  }

  const remainingPercentage = summary && summary.totalIncome > 0
    ? Math.max(0, Math.min(((summary.totalIncome - summary.totalSpent) / summary.totalIncome) * 100, 100))
    : 0;

  const hasPendingOnDate = (dateStr: string) => {
    return upcomingDues.some(due => due.due_date === dateStr && due.status === 'pending');
  };

  const handleDatePress = (dateStr: string) => {
    setSelectedDate(dateStr);
    setModalVisible(true);
  };

  const filteredDues = upcomingDues.filter(due => due.due_date === selectedDate);
  const selectedDaysInfo = getDaysInfo(selectedDate);

  // SVG Donut Chart Calculation variables
  const size = 200;
  const strokeWidth = 23;
  const center = size / 2;
  const radius = center - strokeWidth;
  const circumference = 2 * Math.PI * radius;

  let accumulatedPercent = 0;

  return (
    <View style={styles.mainContainer}>
      <ExpoStatusBar style="light" />

      {/* HEADER */}
      <View style={styles.headerBackground}>
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
                {personalRole ? personalRole.toUpperCase() : ''}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.balanceBlock}>
          <View style={styles.balanceLabelRow}>
            <View style={styles.balanceLabelIconWrap}>
              <Ionicons name="wallet-outline" size={13} color={COLORS.deepTeal} />
            </View>
            <Text style={styles.balanceLabel}>Total Remaining</Text>
          </View>

          <View style={styles.pillTrackOuter}>
            <View style={styles.pillTrack}>
              <View style={[styles.pillFill, { width: `${remainingPercentage}%` }]} />
            </View>
          </View>

          <View style={styles.balanceAmountRow}>
            <View style={styles.balanceAmountLeft}>
              <Text style={styles.pillAmountText}>
                ₱{summary ? summary.remaining.toLocaleString('en-US') : '0'}
              </Text>
              <Text style={styles.pillAmountDivider}>/</Text>
              <Text style={styles.pillAmountTotal}>
                ₱{summary ? summary.totalIncome.toLocaleString('en-US') : '0'}
              </Text>
            </View>

            {/* Income Icon Button */}
            <TouchableOpacity 
              style={styles.incomeIconButton} 
              onPress={() => router.push('/income')}
              activeOpacity={0.7}
            >
              {/* Updated to pencil icon */}
              <Ionicons name="create-outline" size={20} color={COLORS.yellowGreen} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* SCROLLABLE CONTENT */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.olive]} tintColor={COLORS.olive} />
        }
        showsVerticalScrollIndicator={false}
        bounces
      >
        <View style={styles.sectionBlock}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Upcoming Dues</Text>
            <TouchableOpacity onPress={() => setAddModalVisible(true)}>
              <Text style={styles.seeAllText}>+ Set Reminders</Text>
            </TouchableOpacity>
          </View>

          {/* Horizontal Date Strip */}
          <ScrollView 
  horizontal 
  showsHorizontalScrollIndicator={false}
  contentContainerStyle={styles.dateStripContainer}
  ref={horizontalScrollRef}
  onLayout={() => centerToday(false)}
>
  {dateList.map((item) => {
    // Render the "See More" Calendar container on the 7th future slot
    if (item.isSeeMore) {
      return (
        <TouchableOpacity
          key="see-more-calendar"
          activeOpacity={0.8}
          onPress={() => setIsCalendarModalVisible(true)}
          style={[styles.dateBox, styles.seeMoreDateBox]}
        >
          {/* You can use react-native-vector-icons or any icon library you prefer */}
          <Ionicons name="calendar-outline" size={18} color={COLORS.deepTeal} style={{ marginBottom: 4 }} />
          <Text style={styles.seeMoreLabel}>More</Text>
        </TouchableOpacity>
      );
    }

    const dateString = item.dateString;
    if (!dateString) return null;

    const isSelected = selectedDate === dateString;
    const hasPending = hasPendingOnDate(dateString);

    return (
      <TouchableOpacity
        key={dateString}
        activeOpacity={hasPending ? 0.8 : 1}
        onPress={() => handleDatePress(dateString)}
        style={[
          styles.dateBox,
          item.isToday ? styles.dateBoxToday : (isSelected && styles.dateBoxBorderSelected)
        ]}
      >
        <Text style={[
          styles.dateDayName, 
          item.isToday && styles.dateTextToday,
          !item.isToday && isSelected && styles.dateTextBorderSelected
        ]}>
          {item.dayName}
        </Text>
        <Text style={[
          styles.dateDayNumber, 
          item.isToday && styles.dateTextToday,
          !item.isToday && isSelected && styles.dateTextBorderSelected
        ]}>
          {item.dayNumber}
        </Text>
        
        <View style={styles.dotContainer}>
          {hasPending && (
            <View style={[
              styles.pendingDot, 
              item.isToday && styles.pendingDotToday,
              !item.isToday && isSelected && styles.pendingDotBorderSelected
            ]} />
          )}
        </View>
      </TouchableOpacity>
    );
  })}
</ScrollView>
        </View>

        {/* STATISTICS SECTION */}
        <View style={styles.sectionBlock}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Expenses per Category</Text>
          </View>

          <View style={styles.statsCard}>
            {/* Multi-Segment Donut Chart Display */}
            <View style={styles.circleContainer}>
              <Svg width={size} height={size}>
                {/* Background Track Circle */}
                <Circle
                  cx={center}
                  cy={center}
                  r={radius}
                  stroke="#E2E8F0"
                  strokeWidth={strokeWidth}
                  fill="none"
                />
                
                {/* Dynamic Category Segments */}
                {categoryStats.map((stat) => {
                  const strokeDashoffset = circumference - (circumference * stat.percentage) / 100;
                  const currentRotation = (accumulatedPercent / 100) * 360 - 90;
                  accumulatedPercent += stat.percentage;

                  return (
                    <Circle
                      key={stat.categoryId}
                      cx={center}
                      cy={center}
                      r={radius}
                      stroke={stat.color}
                      strokeWidth={strokeWidth}
                      strokeDasharray={circumference}
                      strokeDashoffset={strokeDashoffset}
                      strokeLinecap="round"
                      fill="none"
                      rotation={currentRotation}
                      origin={`${center}, ${center}`}
                    />
                  );
                })}
              </Svg>

              <View style={styles.innerCircle}>
                <Text style={styles.statsLabel}>Total Expenses</Text>
                <Text style={styles.statsAmount}>
                  ₱{overallTotalExpenses.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                </Text>
              </View>
            </View>

            {/* Category Breakdown Legend List */}
<View style={styles.legendContainer}>
  {categoryStats
    .slice() // Creates a shallow copy so you don't mutate the original array
    .sort((a, b) => b.total - a.total) // Sorts from highest to lowest
    .map((stat) => (
      <View key={stat.categoryId} style={styles.legendRow}>
        <View style={styles.legendLeft}>
          <View style={[styles.legendColorDot, { backgroundColor: stat.color }]} />
          <Text style={styles.legendCategoryName} numberOfLines={1}>{stat.categoryName}</Text>
        </View>
        <View style={styles.legendRight}>
          <Text style={styles.legendAmount}>₱{stat.total.toLocaleString('en-US')}</Text>
          <Text style={styles.legendPercentage}>({stat.percentage.toFixed(1)}%)</Text>
        </View>
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

          <View style={styles.statsCard}>
            <Text style={styles.lineGraphSubtitle}>Expenses incurred per day (Past 7 Days)</Text>
            
            <View style={styles.graphWrapper}>
              {(() => {
                const chartWidth = SCREEN_WIDTH - 88;
                const chartHeight = 160;
                const paddingLeft = 35;
                const paddingRight = 15;
                const paddingTop = 20;
                const paddingBottom = 35;

                const usableWidth = chartWidth - paddingLeft - paddingRight;
                const usableHeight = chartHeight - paddingTop - paddingBottom;

                const maxAmount = Math.max(...dailyTrends.map(d => d.amount), 100);

                const points = dailyTrends.map((item, index) => {
                  const x = paddingLeft + (index / (dailyTrends.length - 1 || 1)) * usableWidth;
                  const y = paddingTop + usableHeight - (item.amount / maxAmount) * usableHeight;
                  return { x, y, ...item };
                });

                const polylinePoints = points.map(p => `${p.x},${p.y}`).join(' ');

                return (
                  <Svg width={chartWidth} height={chartHeight}>
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
                            stroke="#E2E8F0"
                            strokeDasharray="4,4"
                            strokeWidth="1"
                          />
                          <SvgText
                            x={paddingLeft - 15}
                            y={yPos + 4}
                            fontSize="9"
                            fill={COLORS.textMuted}
                            textAnchor="end"
                          >
                            {valLabel}
                          </SvgText>
                        </G>
                      );
                    })}

                    <Polyline
                      points={polylinePoints}
                      fill="none"
                      stroke={COLORS.deepTeal}
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />

                    {points.map((p, idx) => (
                      <G key={idx}>
                        <Circle
                          cx={p.x}
                          cy={p.y}
                          r={4.5}
                          fill={COLORS.yellowGreen}
                          stroke={COLORS.deepTeal}
                          strokeWidth="2"
                        />
                        <SvgText
                          x={p.x}
                          y={chartHeight - 6}
                          fontSize="9"
                          fill={COLORS.textMuted}
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
      </ScrollView>

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
                {/* Only show the days remaining/overdue badge if there are pending dues or if not all items are paid */}
                {filteredDues.length > 0 && filteredDues.some(d => d.status === 'pending') && (
                  <View style={[
                    styles.dueBadgeHome, 
                    { backgroundColor: selectedDaysInfo.urgent ? '#FEF2F2' : 'rgba(31, 79, 89, 0.1)' }
                  ]}>
                    <Text style={[
                      styles.dueBadgeTextHome, 
                      { color: selectedDaysInfo.urgent ? '#DC2626' : COLORS.deepTeal }
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
                  setErrorMessage(null);   // <-- Add this
                  setSuccessMessage(null); // <-- Add this
                }} 
                style={styles.modalCloseButton}
              >
                <Ionicons name="close" size={20} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>

            {errorMessage && (
              <View style={styles.inlineErrorContainer}>
                <Ionicons name="alert-circle-outline" size={18} color="#DC2626" />
                <Text style={styles.inlineErrorText}>{errorMessage}</Text>
              </View>
            )}

            {successMessage && (
              <View style={styles.inlineSuccessContainer}>
                <Ionicons name="checkmark-circle-outline" size={18} color={COLORS.olive} />
                <Text style={styles.inlineSuccessText}>{successMessage}</Text>
              </View>
            )}

            <ScrollView contentContainerStyle={styles.modalBody} showsVerticalScrollIndicator={false}>
              {filteredDues.length > 0 ? (
                filteredDues.map((due, index) => {
                  const cardBgColor = PALETTE_LIGHT_CARDS[index % PALETTE_LIGHT_CARDS.length];
                  const categoryIcon = due.categories?.icon || 'pricetag-outline';
                  const isPaid = due.status === 'paid';

                  return (
                    <View
                      key={due.id}
                      style={[styles.reminderCardHome, { backgroundColor: cardBgColor, opacity: isPaid ? 0.75 : 1 }]}
                    >
                      <View style={styles.calendarBadgeHome}>
                        <Ionicons name={categoryIcon as any} size={22} color={COLORS.deepTeal} />
                      </View>

                      <View style={styles.cardContentHome}>
                        <Text style={[styles.reminderTitleHome, isPaid && { textDecorationLine: 'line-through', color: COLORS.textMuted }]}>
                          {due.title}
                        </Text>
                        <Text style={styles.reminderSubHome}>
                          ₱{Number(due.amount).toFixed(2)}
                        </Text>
                      </View>

                      {/* Conditional Actions or Paid Badge */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        {isPaid ? (
                          <View style={{ paddingHorizontal: 12, paddingVertical: 6, backgroundColor: 'rgba(126, 160, 14, 0.15)', borderRadius: 8, marginRight: 4 }}>
                            <Text style={{ color: COLORS.olive, fontWeight: '600', fontSize: 13 }}>Paid</Text>
                          </View>
                        ) : (
                          /* Settle Button (Only shown when not paid) */
                          <TouchableOpacity 
                            style={[styles.deleteButtonHome, { backgroundColor: 'rgba(31, 79, 89, 0.1)' }]} 
                            onPress={() => handleSettleReminder(due)}
                            activeOpacity={0.7}
                          >
                            <Ionicons name="checkmark-outline" size={18} color={COLORS.deepTeal} />
                          </TouchableOpacity>
                        )}

                        {/* Delete Button (Always shown) */}
                        <TouchableOpacity 
                          style={styles.deleteButtonHome} 
                          onPress={() => handleDeleteReminder(due.id, due.title)}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="trash-outline" size={18} color="#DC2626" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })
              ) : (
                <View style={styles.emptyStateContainer}>
                  <Ionicons name="checkmark-circle-outline" size={48} color={COLORS.deepTeal} />
                  <Text style={styles.emptyStateTitle}>All Clear!</Text>
                  <Text style={styles.emptyStateText}>No reminders set for this date.</Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

{/* CUSTOM DELETE CONFIRMATION MODAL */}
<Modal
  animationType="fade"
  transparent={true}
  visible={deleteModalVisible}
  onRequestClose={() => !isDeleting && setDeleteModalVisible(false)}
>
  {/* Ensure modalOverlay has justifyContent and alignItems set to 'center' */}
  <View style={[styles.modalOverlay, { justifyContent: 'center', alignItems: 'center' }]}>
    <View style={[styles.modalContainer2, { width: '85%', maxWidth: 340, padding: 24, alignItems: 'center', alignSelf: 'center' }]}>
      
      {/* Warning Icon with subtle red aura */}
      <View style={{
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: '#FEF2F2',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
        borderWidth: 8,
        borderColor: '#FEE2E2'
      }}>
        <Ionicons name="alert-circle-outline" size={24} color="#DC2626" />
      </View>

      {/* Title */}
      <Text style={{ fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 8, textAlign: 'center' }}>
        Delete Reminder
      </Text>

      {/* Subtitle / Description */}
      <Text style={{ fontSize: 14, color: '#6B7280', textAlign: 'center', marginBottom: 24, lineHeight: 20 }}>
        Are you sure you want to delete "{reminderToDelete?.title}"?{'\n'}This action cannot be undone.
      </Text>

      {/* Action Buttons */}
      <View style={{ flexDirection: 'row', gap: 12, width: '100%' }}>
        <TouchableOpacity
          style={{
            flex: 1,
            backgroundColor: '#F3F4F6',
            paddingVertical: 12,
            borderRadius: 12,
            alignItems: 'center',
          }}
          onPress={() => setDeleteModalVisible(false)}
          disabled={isDeleting}
        >
          <Text style={{ color: '#374151', fontWeight: '600', fontSize: 15 }}>Cancel</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={{
            flex: 1,
            backgroundColor: '#DC2626',
            paddingVertical: 12,
            borderRadius: 12,
            alignItems: 'center',
          }}
          onPress={confirmDeleteReminder}
          disabled={isDeleting}
        >
          <Text style={{ color: '#FFFFFF', fontWeight: '600', fontSize: 15 }}>
            {isDeleting ? 'Deleting...' : 'Delete'}
          </Text>
        </TouchableOpacity>
      </View>

    </View>
  </View>
</Modal>

      {/* MODAL FOR ADDING A NEW REMINDER */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={addModalVisible}
        onRequestClose={() => {
          resetForm();
          setAddModalVisible(false);
          setErrorMessage(null);   // <-- Add this
          setSuccessMessage(null); // <-- Add this
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
                <Ionicons name="close" size={20} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Inline Error Banner */}
            {errorMessage && (
              <View style={styles.inlineErrorContainer}>
                <Ionicons name="alert-circle-outline" size={18} color="#DC2626" />
                <Text style={styles.inlineErrorText}>{errorMessage}</Text>
              </View>
            )}

            {/* Inline Success Banner */}
            {successMessage && (
              <View style={styles.inlineSuccessContainer}>
                <Ionicons name="checkmark-circle-outline" size={18} color="#16A34A" />
                <Text style={styles.inlineSuccessText}>{successMessage}</Text>
              </View>
            )}

            <ScrollView contentContainerStyle={styles.formContainer} showsVerticalScrollIndicator={false}>
              <Text style={styles.inputLabel}>Title</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g., Electricity Bill"
                placeholderTextColor={COLORS.textMuted}
                value={newTitle}
                onChangeText={setNewTitle}
              />

              <Text style={styles.inputLabel}>Amount (₱)</Text>
              <TextInput
                style={styles.textInput}
                placeholder="0.00"
                placeholderTextColor={COLORS.textMuted}
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
                      style={[
                        styles.categoryChip,
                        isSelected && { backgroundColor: COLORS.headerDark, borderColor: COLORS.headerDark }
                      ]}
                    >
                      <Text style={[styles.categoryChipText, isSelected && { color: '#FFFFFF' }]}>
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
                placeholderTextColor={COLORS.textMuted}
                value={newDueDate}
                onChangeText={setNewDueDate}
              />

              <TouchableOpacity 
                style={styles.submitButton} 
                onPress={handleCreateReminder}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#FFFFFF" />
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

const styles = StyleSheet.create({
  mainContainer: { flex: 1, backgroundColor: COLORS.bg },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollView: { flex: 1 },
  scrollContent: { backgroundColor: COLORS.bg, paddingBottom: 50 },

  headerBackground: {
    backgroundColor: COLORS.headerDark,
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 12 : 22,
    paddingBottom: 30,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 16,
    elevation: 5,
    zIndex: 10,
  },
  topRowContainer: { marginBottom: 24 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  userProfileGroup: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatarImage: { width: 48, height: 48, borderRadius: 24, borderWidth: 2, borderColor: '#FFFFFF' },
  avatarFallback: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.yellowGreen,
  },
  avatarInitial: { color: '#FFFFFF', fontSize: 20, fontWeight: '700' },
  helloText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF', letterSpacing: -0.3, lineHeight: 26 },
  userNameText: { fontSize: 18, fontWeight: '600', color: 'rgba(255,255,255,0.82)', marginTop: 1 },
  
  roleBadgeContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    maxWidth: 120,
  },
  roleBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'capitalize',
    letterSpacing: 0.5,
  },

  balanceBlock: { alignItems: 'center' },
  balanceLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 12 },
  balanceLabelIconWrap: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: COLORS.yellowGreen, justifyContent: 'center', alignItems: 'center',
  },
  balanceLabel: { fontSize: 12, color: COLORS.white, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' },
  pillTrackOuter: { width: '100%', padding: 4, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.08)' },
  pillTrack: { width: '100%', height: 46, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.15)', overflow: 'hidden' },
  pillFill: { height: '100%', borderRadius: 26, backgroundColor: COLORS.cyan },
  balanceAmountRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 16 },
  pillAmountText: { fontSize: 32, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.6 },
  pillAmountDivider: { fontSize: 22, color: 'rgba(255,255,255,0.3)', fontWeight: '300' },
  pillAmountTotal: { fontSize: 15, fontWeight: '600', color: 'rgba(255,255,255,0.65)' },

  sectionBlock: { paddingHorizontal: 24, marginTop: 20 },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: COLORS.darkOlive, letterSpacing: -0.3 },
  seeAllText: { fontSize: 13, color: COLORS.deepTeal, fontWeight: '700' },

  dateStripContainer: {
    gap: 8,
    paddingVertical: 4,
  },
  dateBox: {
    width: 54,
    height: 72,
    borderRadius: 16,
    backgroundColor: COLORS.card,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  dateBoxToday: {
    backgroundColor: COLORS.headerDark,
    borderColor: COLORS.headerDark,
  },
  dateBoxBorderSelected: {
    borderColor: COLORS.headerDark,
    backgroundColor: COLORS.card,
  },
  dateDayName: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textMuted,
    marginBottom: 2,
  },
  dateDayNumber: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.darkOlive,
  },
  dateTextToday: {
    color: '#FFFFFF',
  },
  dateTextBorderSelected: {
    color: COLORS.headerDark,
  },
  dotContainer: {
    height: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
  },
  pendingDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: COLORS.olive,
  },
  pendingDotToday: {
    backgroundColor: COLORS.yellowGreen,
  },
  pendingDotBorderSelected: {
    backgroundColor: COLORS.deepTeal,
  },

  // Statistics Styles
  statsCard: {
    backgroundColor: COLORS.card,
    borderRadius: 24,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  circleContainer: {
    width: 180,
    height: 180,
    alignItems: 'center',
    justifyContent: 'center',
  },
  innerCircle: {
    position: 'absolute',
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: COLORS.card,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statsLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textMuted,
    marginBottom: 2,
  },
  statsAmount: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.darkOlive,
    letterSpacing: -0.5,
  },
  legendContainer: {
    width: '100%',
    marginTop: 16,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 16,
  },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  legendLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    marginRight: 12,
  },
  legendColorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  legendCategoryName: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.darkOlive,
  },
  legendRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendAmount: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.black,
  },
  legendPercentage: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  emptyLegendText: {
    textAlign: 'center',
    fontSize: 13,
    color: COLORS.textMuted,
    paddingVertical: 10,
  },
  lineGraphSubtitle: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontWeight: '600',
    marginBottom: 12,
    alignSelf: 'flex-start',
  },
  graphWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 8,
  },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    justifyContent: 'flex-end',
  },
  
  modalContainer: {
    backgroundColor: COLORS.bg,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 40,
    maxHeight: SCREEN_HEIGHT * 0.75,
    shadowColor: COLORS.modalShadow,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 10,
  },

modalContainer2: {
    backgroundColor: COLORS.bg,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 40,
    maxHeight: SCREEN_HEIGHT * 0.75,
    shadowColor: COLORS.modalShadow,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 10,
  },

  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  modalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    marginRight: 10,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.darkOlive,
  },
  modalSubtitle: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontWeight: '600',
    marginTop: 2,
  },
  modalCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBody: {
    gap: 10,
    paddingBottom: 20,
  },

  reminderCardHome: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 18,
  },
  cardContentHome: {
    flex: 1,
    marginRight: 8,
  },
  reminderTitleHome: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E293B',
  },
  reminderSubHome: {
    fontSize: 11,
    color: '#475569',
    marginTop: 2,
  },
  dueBadgeHome: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  dueBadgeTextHome: {
    fontSize: 11,
    fontWeight: '700',
  },

  calendarBadgeHome: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  deleteButtonHome: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(220, 38, 38, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },

  // Form Styles for Add Reminder
  formContainer: {
    gap: 12,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.darkOlive,
  },
  textInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    color: COLORS.black,
  },
  categoryScroll: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    marginRight: 8,
  },
  categoryChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.darkOlive,
  },
  submitButton: {
    backgroundColor: COLORS.headerDark,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 10,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  emptyStateContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    gap: 8,
  },
  emptyStateTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.darkOlive,
    marginTop: 4,
  },
  emptyStateText: {
    fontSize: 13,
    color: COLORS.textMuted,
    textAlign: 'center',
  },
  inlineErrorContainer: {
  flexDirection: 'row',
  alignItems: 'center',
  backgroundColor: '#FEF2F2',
  borderColor: '#FCA5A5',
  borderWidth: 1,
  paddingHorizontal: 12,
  paddingVertical: 10,
  borderRadius: 8,
  marginBottom: 16,
  gap: 8,
},
inlineErrorText: {
  color: '#DC2626',
  fontSize: 13,
  fontWeight: '500',
  flex: 1,
},
inlineSuccessContainer: {
  flexDirection: 'row',
  alignItems: 'center',
  backgroundColor: 'rgba(126, 160, 14, 0.1)',
  borderColor: 'rgba(126, 160, 14, 0.3)',
  borderWidth: 1,
  paddingHorizontal: 12,
  paddingVertical: 10,
  borderRadius: 8,
  marginBottom: 16,
  gap: 8,
},
inlineSuccessText: {
  color: COLORS.olive,
  fontSize: 13,
  fontWeight: '500',
  flex: 1,
},
balanceAmountLeft: {
  flexDirection: 'row', alignItems: 'baseline', gap: 8,
},
incomeIconButton: {
  width: 20,
  height: 20,
  borderRadius: 14,             // Makes it a perfect circle
  justifyContent: 'center',
  alignItems: 'center',
  shadowColor: '#000',          // Optional subtle shadow
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.2,
  shadowRadius: 1.41,
  marginLeft: 8,
},
seeMoreDateBox: {
  justifyContent: 'center',
  alignItems: 'center',
  backgroundColor: COLORS.card,
  borderStyle: 'dashed',
  borderWidth: 1.5,
  borderColor: COLORS.deepTeal,
},
seeMoreLabel: {
  fontSize: 12,
  fontWeight: '600',
  color: COLORS.deepTeal,
},

calendarCard: {
  backgroundColor: COLORS.card,
  borderRadius: 20,
  borderWidth: 1,
  borderColor: '#E2E8F0',
  paddingVertical: 8,
  overflow: 'hidden',
},
calendarLegendRow: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  marginTop: 14,
},
calendarLegendDot: {
  width: 6,
  height: 6,
  borderRadius: 3,
  backgroundColor: COLORS.olive,
},
calendarLegendText: {
  fontSize: 12,
  fontWeight: '600',
  color: COLORS.textMuted,
},

});