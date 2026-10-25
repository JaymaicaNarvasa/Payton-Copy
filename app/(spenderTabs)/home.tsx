import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Modal,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import Svg, { Circle, G, Line, Polyline, Text as SvgText } from 'react-native-svg';

import { theme } from '@/constants/theme';
import { homeStyles as styles } from '@/constants/ui.styles';
import { GradientBackground } from '../../components/GradientBackground';
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
        .eq('is_archived', false) // Only fetch non-archived allowances
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
            categories ( id, name, icon )
          `)
          .in('allowance_id', allowanceIds);

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
            color: theme.chart.category[index % theme.chart.category.length],
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
    setErrorMessage(null);    // <-- Add this
    setSuccessMessage(null); // <-- Add this
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
      allowance_id: summary?.allowanceId || null,
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

    // 1. Fetch the user's active (non-archived) allowance records[cite: 1]
    const { data: allowances, error: allowanceFetchError } = await supabase
      .from('allowances')
      .select('amount')
      .eq('spender_id', user.id)
      .eq('is_archived', false);

    if (allowanceFetchError) throw allowanceFetchError;

    if (!allowances || allowances.length === 0) {
      setErrorMessage('Cannot settle reminder: No allowance records found.');
      return;
    }

    const totalAllowance = allowances.reduce((sum, item) => sum + Number(item.amount), 0);

    // 2. Fetch expenses only where the associated allowance has is_archived = false
    // Note: Replace 'allowances' with the exact foreign table name if it differs in your schema
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

    // 3. Calculate the actual remaining balance
    const remaining = totalAllowance - totalExpenses;

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
        allowance_id: summary?.allowanceId || null,
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
      <View style={[styles.loadingContainer, { backgroundColor: theme.colors.background }]}>
        <ExpoStatusBar style="light" />
        <ActivityIndicator size="large" color={theme.colors.brand} />
      </View>
    );
  }

  const remainingPercentage = summary && summary.totalAllowance > 0
    ? Math.max(0, Math.min(((summary.totalAllowance - summary.totalSpent) / summary.totalAllowance) * 100, 100))
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
  const CHART_BOX = 260; // must match circleContainer width/height in ui.styles.ts
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
        <View style={styles.headerGradientClip}>
          <GradientBackground />
        </View>
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
            <Text style={styles.balanceLabel}>Remaining Balance</Text>
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
      </View>

      {/* SCROLLABLE CONTENT */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.olive]} tintColor={theme.colors.olive} />
        }
        showsVerticalScrollIndicator={false}
        bounces
      >
        <View style={styles.sectionBlock}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Upcoming Dues</Text>
            <TouchableOpacity style={styles.addReminderPill} onPress={() => setAddModalVisible(true)} activeOpacity={0.8}>
              <Ionicons name="add" size={14} color={theme.colors.mintPillText} />
              <Text style={styles.seeAllText}>Set Reminders</Text>
            </TouchableOpacity>
          </View>

          {/* Upcoming due cards */}
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
            <View style={styles.addReminderPill}>
              <Text style={styles.seeAllText}>Current</Text>
            </View>
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
                  stroke={theme.colors.border}
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

              {/* Percentage labels around the ring */}
              {(() => {
                let acc = 0;
                const labelRadius = radius + strokeWidth / 2 + 16;
                return categoryStats.map((stat) => {
                  const mid = ((acc + stat.percentage / 2) / 100) * 2 * Math.PI - Math.PI / 2;
                  acc += stat.percentage;
                  if (stat.percentage < 4) return null;
                  return (
                    <Text
                      key={`lbl-${stat.categoryId}`}
                      style={[
                        styles.donutLabel,
                        {
                          color: stat.color,
                          left: CHART_BOX / 2 + labelRadius * Math.cos(mid) - 20,
                          top: CHART_BOX / 2 + labelRadius * Math.sin(mid) - 8,
                        },
                      ]}
                    >
                      {Math.round(stat.percentage)}%
                    </Text>
                  );
                });
              })()}

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
                            stroke={theme.colors.border}
                            strokeDasharray="4,4"
                            strokeWidth="1"
                          />
                          <SvgText
                            x={paddingLeft - 15}
                            y={yPos + 4}
                            fontSize="9"
                            fill={theme.colors.textMuted}
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
                      stroke={theme.colors.brand}
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
                          fill={theme.colors.lime}
                          stroke={theme.colors.brand}
                          strokeWidth="2"
                        />
                        <SvgText
                          x={p.x}
                          y={chartHeight - 6}
                          fontSize="9"
                          fill={theme.colors.textMuted}
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
                    { backgroundColor: selectedDaysInfo.urgent ? theme.colors.dangerBg : theme.colors.alpha.brand[10] }
                  ]}>
                    <Text style={[
                      styles.dueBadgeTextHome, 
                      { color: selectedDaysInfo.urgent ? theme.colors.danger : theme.colors.brand }
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
                      style={[styles.reminderCardHome, { backgroundColor: cardBgColor, opacity: isPaid ? 0.75 : 1 }]}
                    >
                      <View style={styles.calendarBadgeHome}>
                        <Ionicons name={categoryIcon as any} size={22} color={theme.colors.brand} />
                      </View>

                      <View style={styles.cardContentHome}>
                        <Text style={[styles.reminderTitleHome, isPaid && { textDecorationLine: 'line-through', color: theme.colors.textMuted }]}>
                          {due.title}
                        </Text>
                        <Text style={styles.reminderSubHome}>
                          ₱{Number(due.amount).toFixed(2)}
                        </Text>
                      </View>

                      {/* Conditional Actions or Paid Badge */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[8] }}>
                        {isPaid ? (
                          <View style={{ paddingHorizontal: theme.space[12], paddingVertical: theme.space[6], backgroundColor: theme.colors.alpha.olive[15], borderRadius: theme.radius.sm, marginRight: theme.space[4] }}>
                            <Text style={{ color: theme.colors.olive, fontWeight: theme.fontWeight.semibold, fontSize: theme.fontSize.caption }}>Paid</Text>
                          </View>
                        ) : (
                          /* Settle Button (Only shown when not paid) */
                          <TouchableOpacity 
                            style={[styles.deleteButtonHome, { backgroundColor: theme.colors.alpha.brand[10] }]} 
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

{/* CUSTOM DELETE CONFIRMATION MODAL */}
<Modal
  animationType="fade"
  transparent={true}
  visible={deleteModalVisible}
  onRequestClose={() => !isDeleting && setDeleteModalVisible(false)}
>
  {/* Ensure modalOverlay has justifyContent and alignItems set to 'center' */}
  <View style={[styles.modalOverlay, { justifyContent: 'center', alignItems: 'center' }]}>
    <View style={[styles.modalContainer2, { width: '85%', maxWidth: 340, padding: theme.space[24], alignItems: 'center', alignSelf: 'center' }]}>
      
      {/* Warning Icon with subtle red aura */}
      <View style={{
        width: 48,
        height: 48,
        borderRadius: theme.radius.xxl,
        backgroundColor: theme.colors.dangerBg,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: theme.space[16],
        borderWidth: 8,
        borderColor: theme.colors.dangerSoft
      }}>
        <Ionicons name="alert-circle-outline" size={24} color={theme.colors.danger} />
      </View>

      {/* Title */}
      <Text style={{ fontSize: theme.fontSize.title, fontWeight: theme.fontWeight.bold, color: theme.colors.gray900, marginBottom: theme.space[8], textAlign: 'center' }}>
        Delete Reminder
      </Text>

      {/* Subtitle / Description */}
      <Text style={{ fontSize: theme.fontSize.body, color: theme.colors.textGray, textAlign: 'center', marginBottom: theme.space[24], lineHeight: 20 }}>
        Are you sure you want to delete "{reminderToDelete?.title}"?{'\n'}This action cannot be undone.
      </Text>

      {/* Action Buttons */}
      <View style={{ flexDirection: 'row', gap: theme.space[12], width: '100%' }}>
        <TouchableOpacity
          style={{
            flex: 1,
            backgroundColor: theme.colors.surfaceGray,
            paddingVertical: theme.space[12],
            borderRadius: theme.radius.md,
            alignItems: 'center',
          }}
          onPress={() => setDeleteModalVisible(false)}
          disabled={isDeleting}
        >
          <Text style={{ color: theme.colors.gray700, fontWeight: theme.fontWeight.semibold, fontSize: theme.fontSize.bodyLg }}>Cancel</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={{
            flex: 1,
            backgroundColor: theme.colors.danger,
            paddingVertical: theme.space[12],
            borderRadius: theme.radius.md,
            alignItems: 'center',
          }}
          onPress={confirmDeleteReminder}
          disabled={isDeleting}
        >
          <Text style={{ color: theme.colors.white, fontWeight: theme.fontWeight.semibold, fontSize: theme.fontSize.bodyLg }}>
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
                      style={[
                        styles.categoryChip,
                        isSelected && { backgroundColor: theme.colors.brand, borderColor: theme.colors.brand }
                      ]}
                    >
                      <Text style={[styles.categoryChipText, isSelected && { color: theme.colors.white }]}>
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
    </View>
  );
}