import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// NOTE: adjust these three paths to match your project.
import GradientBackground from '@/components/GradientBackground';
import { theme } from '@/constants/theme';
import { incomeStyles as styles } from '@/constants/ui.styles';
import { supabase } from '../../lib/supabase';

const { colors } = theme;

interface IncomeItem {
  id: string;
  user_id: string;
  source_name: string;
  amount: number;
  start_date: string;
  end_date: string;
  received_at: string;
  is_archived?: boolean;
}

interface InlineMessage {
  type: 'error' | 'success' | 'warning';
  text: string;
}

const PERIODS = ['Today', 'This Week', 'Next Week', 'This Month', 'Next Month', 'Custom'];

const formatDate = (dateStr: string) => {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (isNaN(date.getTime())) return dateStr;

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const toLocalDateString = (d: Date) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function IncomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [incomes, setIncomes] = useState<IncomeItem[]>([]);

  // Inline notification state
  const [screenMessage, setScreenMessage] = useState<InlineMessage | null>(null);
  const [modalMessage, setModalMessage] = useState<InlineMessage | null>(null);
  const [allocationMessage, setAllocationMessage] = useState<InlineMessage | null>(null);

  // Confirmation dialog state (archive / delete)
  const [confirmConfig, setConfirmConfig] = useState<{
    visible: boolean;
    title: string;
    message: string;
    type: 'danger' | 'warning';
    onConfirm: () => void;
  }>({ visible: false, title: '', message: '', type: 'danger', onConfirm: () => {} });

  // Add-income modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [sourceName, setSourceName] = useState('');
  const [amount, setAmount] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedPeriod, setSelectedPeriod] = useState<string>('Today');
  const [submitting, setSubmitting] = useState(false);

  // Custom calendar picker state
  const [calendarModalVisible, setCalendarModalVisible] = useState(false);
  const [currentCalendarDate, setCurrentCalendarDate] = useState(new Date());
  const [tempStartDate, setTempStartDate] = useState<string>('');
  const [tempEndDate, setTempEndDate] = useState<string>('');

  const [enableBudgetAllocation, setEnableBudgetAllocation] = useState(false);
  const [allocationModalVisible, setAllocationModalVisible] = useState(false);
  const [categories, setCategories] = useState<any[]>([]);
  const [categoryAllocations, setCategoryAllocations] = useState<Record<string, string>>({});

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Rounded to cents so float noise (0.1 + 0.2) never blocks an exact allocation.
  const getRemainingBalance = () => {
    const totalIncome = parseFloat(amount) || 0;
    const totalAllocated = Object.values(categoryAllocations).reduce<number>((sum, val) => sum + (parseFloat(val) || 0), 0);
    return Math.round((totalIncome - totalAllocated) * 100) / 100;
  };

  const handleAllocationChange = (categoryId: string, value: string) => {
    setCategoryAllocations((prev) => ({
      ...prev,
      [categoryId]: value,
    }));
  };

  const fetchData = async () => {
    try {
      setScreenMessage(null);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: incomeData, error: incomeError } = await supabase
        .from('income')
        .select('*')
        .eq('user_id', user.id)
        .order('received_at', { ascending: false });

      if (incomeError) throw incomeError;
      setIncomes(incomeData || []);

      const { data: categoryData, error: categoryError } = await supabase
        .from('categories')
        .select('*')
        .or(`user_id.eq.${user.id},user_id.is.null`);

      if (categoryError) throw categoryError;
      setCategories(categoryData || []);
    } catch (error: any) {
      setScreenMessage({ type: 'error', text: error.message });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchData();
    }, [])
  );

  const handleSelectPeriod = (period: string) => {
    setSelectedPeriod(period);
    const now = new Date();
    const todayStr = toLocalDateString(now);

    if (period === 'Today') {
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (period === 'This Week') {
      const dayOfWeek = now.getDay();
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - dayOfWeek);
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      setStartDate(toLocalDateString(startOfWeek));
      setEndDate(toLocalDateString(endOfWeek));
    } else if (period === 'Next Week') {
      const dayOfWeek = now.getDay();
      const startOfNextWeek = new Date(now);
      startOfNextWeek.setDate(now.getDate() - dayOfWeek + 7);
      const endOfNextWeek = new Date(startOfNextWeek);
      endOfNextWeek.setDate(startOfNextWeek.getDate() + 6);
      setStartDate(toLocalDateString(startOfNextWeek));
      setEndDate(toLocalDateString(endOfNextWeek));
    } else if (period === 'This Month') {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      setStartDate(toLocalDateString(startOfMonth));
      setEndDate(toLocalDateString(endOfMonth));
    } else if (period === 'Next Month') {
      const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const endOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 2, 0);
      setStartDate(toLocalDateString(startOfNextMonth));
      setEndDate(toLocalDateString(endOfNextMonth));
    } else if (period === 'Custom') {
      setTempStartDate(startDate || todayStr);
      setTempEndDate(endDate || todayStr);
      setCurrentCalendarDate(startDate ? new Date(startDate) : now);
      setCalendarModalVisible(true);
    }
  };

  const handleResetForm = () => {
    setSourceName('');
    setAmount('');
    setCategoryAllocations({});
    setEnableBudgetAllocation(false);
    setModalMessage(null);
    setAllocationMessage(null);
    handleSelectPeriod('Today');
  };

  const handleOpenAddModal = () => {
    handleResetForm();
    setModalVisible(true);
  };

  const handleCloseAddModal = () => {
    setModalVisible(false);
    setAllocationModalVisible(false);
  };

  const handleSaveIncome = async () => {
    setModalMessage(null);
    if (!sourceName.trim() || !amount.trim() || !startDate.trim() || !endDate.trim()) {
      setModalMessage({ type: 'error', text: 'Please fill in all required fields.' });
      return;
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setModalMessage({ type: 'error', text: 'Please enter a valid amount.' });
      return;
    }

    if (enableBudgetAllocation && getRemainingBalance() !== 0) {
      setModalMessage({ type: 'error', text: 'Please allocate exact income across categories (Remaining must be ₱0.00).' });
      return;
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
      setModalMessage({ type: 'error', text: 'Dates must be in YYYY-MM-DD format.' });
      return;
    }

    if (startDate > endDate) {
      setModalMessage({ type: 'error', text: 'Start Date cannot be later than End Date.' });
      return;
    }

    try {
      setSubmitting(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const payload = {
        user_id: user.id,
        source_name: sourceName.trim(),
        amount: parsedAmount,
        start_date: startDate,
        end_date: endDate,
        received_at: new Date().toISOString(),
        is_archived: false,
      };

      const { data: incomeData, error: insertError } = await supabase.from('income').insert([payload]).select().single();
      if (insertError) throw insertError;

      if (enableBudgetAllocation) {
        const budgetEntries = Object.entries(categoryAllocations)
          .filter(([_, val]) => parseFloat(val) > 0)
          .map(([categoryId, val]) => ({
            user_id: user.id,
            category_id: categoryId,
            income_id: incomeData.id,
            allocated_amount: parseFloat(val),
          }));

        if (budgetEntries.length > 0) {
          const { error: budgetError } = await supabase.from('budgets').insert(budgetEntries);
          if (budgetError) throw budgetError;
        }
      }

      // Show success inside the modal, then close it after a short delay
      setModalMessage({ type: 'success', text: 'Income added successfully!' });
      fetchData();

      setTimeout(() => {
        setModalVisible(false);
        setModalMessage(null);
        setCategoryAllocations({});
        setEnableBudgetAllocation(false);
      }, 1500);
    } catch (error: any) {
      setModalMessage({ type: 'error', text: error.message });
    } finally {
      setSubmitting(false);
    }
  };

  const showMessageWithTimeout = (type: 'success' | 'error', text: string) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setScreenMessage({ type, text });
    timeoutRef.current = setTimeout(() => {
      setScreenMessage(null);
    }, 3000);
  };

  const closeConfirm = () => setConfirmConfig((prev) => ({ ...prev, visible: false }));

  const handleArchiveIncome = (id: string) => {
    setConfirmConfig({
      visible: true,
      title: 'Archive Income',
      message: 'Are you sure you want to archive this income record?',
      type: 'warning',
      onConfirm: async () => {
        try {
          const { error } = await supabase.from('income').update({ is_archived: true }).eq('id', id);
          if (error) throw error;
          closeConfirm();
          fetchData();
          showMessageWithTimeout('success', 'Income record archived successfully.');
        } catch (err: any) {
          showMessageWithTimeout('error', err.message);
          closeConfirm();
        }
      },
    });
  };

  const handleDeleteIncome = (id: string) => {
    setConfirmConfig({
      visible: true,
      title: 'Delete Income',
      message: 'Are you sure you want to permanently delete this income record?',
      type: 'danger',
      onConfirm: async () => {
        try {
          const { error } = await supabase.from('income').delete().eq('id', id);
          if (error) throw error;
          closeConfirm();
          fetchData();
          showMessageWithTimeout('success', 'Income record deleted successfully.');
        } catch (err: any) {
          showMessageWithTimeout('error', err.message);
          closeConfirm();
        }
      },
    });
  };

  const activeIncomes = incomes.filter((i) => !i.is_archived);

  const handleDayPress = (dateStr: string) => {
    const todayStr = toLocalDateString(new Date());
    if (dateStr < todayStr) return;

    if (!tempStartDate || (tempStartDate && tempEndDate)) {
      setTempStartDate(dateStr);
      setTempEndDate('');
    } else if (tempStartDate && !tempEndDate) {
      if (dateStr < tempStartDate) {
        setTempStartDate(dateStr);
      } else {
        setTempEndDate(dateStr);
      }
    }
  };

  const changeMonth = (direction: number) => {
    const newDate = new Date(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth() + direction, 1);
    setCurrentCalendarDate(newDate);
  };

  const renderCalendarDays = () => {
    const year = currentCalendarDate.getFullYear();
    const month = currentCalendarDate.getMonth();
    const firstDayIndex = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    const todayStr = toLocalDateString(new Date());

    const days = [];
    for (let i = 0; i < firstDayIndex; i++) {
      days.push(<View key={`empty-${i}`} style={styles.calendarDayCell} />);
    }

    for (let day = 1; day <= totalDays; day++) {
      const dateObj = new Date(year, month, day);
      const dateStr = toLocalDateString(dateObj);

      const isPast = dateStr < todayStr;
      const isStart = tempStartDate === dateStr;
      const isEnd = tempEndDate === dateStr;
      const isInRange = tempStartDate && tempEndDate && dateStr > tempStartDate && dateStr < tempEndDate;

      days.push(
        <TouchableOpacity
          key={dateStr}
          style={[
            styles.calendarDayCell,
            isPast && styles.calendarDayCellDisabled,
            isInRange && styles.calendarCellInRange,
            (isStart || isEnd) && styles.calendarCellEndpoint,
          ]}
          onPress={() => handleDayPress(dateStr)}
          activeOpacity={isPast ? 1 : 0.7}
          disabled={isPast}
        >
          <Text
            style={[
              styles.calendarDayText,
              isPast && styles.calendarDayTextDisabled,
              (isStart || isEnd) && styles.calendarDayTextSelected,
            ]}
          >
            {day}
          </Text>
        </TouchableOpacity>
      );
    }
    return days;
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.loadingCenter]}>
        <StatusBar style="light" />
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }

  const remaining = getRemainingBalance();
  const allocationOk = remaining === 0;

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Header: gradient + action buttons (same as Transactions / Split) */}
      <View style={[styles.topBackgroundHeader, { paddingTop: insets.top + theme.space[8] }]}>
        <View style={styles.headerGradientFill} pointerEvents="none">
          <GradientBackground />
        </View>
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.headerActionButton} onPress={() => router.back()} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={20} color={colors.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Income Management</Text>
          <TouchableOpacity style={styles.headerActionButton} onPress={handleOpenAddModal} activeOpacity={0.7}>
            <Ionicons name="add" size={22} color={colors.white} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Content sheet slides over the header */}
      <View style={styles.sheet}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                fetchData();
              }}
              tintColor={colors.brand}
            />
          }
        >
          {screenMessage && (
            <View style={[styles.inlineBanner, screenMessage.type === 'error' ? styles.bannerError : styles.bannerSuccess]}>
              <Ionicons
                name={screenMessage.type === 'error' ? 'alert-circle-outline' : 'checkmark-circle-outline'}
                size={16}
                color={screenMessage.type === 'error' ? colors.danger : colors.green}
              />
              <Text style={[styles.bannerText, screenMessage.type === 'error' ? styles.bannerTextError : styles.bannerTextSuccess]}>
                {screenMessage.text}
              </Text>
            </View>
          )}

          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>All Income Streams</Text>
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>{activeIncomes.length} Total</Text>
            </View>
          </View>

          {activeIncomes.length === 0 ? (
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconBox}>
                <Ionicons name="receipt-outline" size={28} color={colors.brand} />
              </View>
              <Text style={styles.emptyTitle}>No Income Found</Text>
              <Text style={styles.emptyText}>Tap the '+' icon above to add a new income stream.</Text>
            </View>
          ) : (
            activeIncomes.map((item) => (
              <IncomeCard
                key={item.id}
                item={item}
                onArchive={() => handleArchiveIncome(item.id)}
                onDelete={() => handleDeleteIncome(item.id)}
              />
            ))
          )}
        </ScrollView>
      </View>

      {/* Add Income (bottom sheet, like the add-expense modal) */}
      <Modal animationType="slide" transparent visible={modalVisible} onRequestClose={handleCloseAddModal}>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.modalSheet}>
              <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <View style={styles.modalHeaderRow}>
                  <Text style={styles.modalTitle}>Add Income</Text>
                  <TouchableOpacity onPress={handleCloseAddModal} style={styles.modalCloseBtn}>
                    <Ionicons name="close" size={18} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>

                {modalMessage && modalMessage.type === 'error' && (
                  <View style={[styles.inlineBanner, styles.bannerError]}>
                    <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
                    <Text style={[styles.bannerText, styles.bannerTextError]}>{modalMessage.text}</Text>
                  </View>
                )}

                {modalMessage && modalMessage.type === 'success' && (
                  <View style={[styles.inlineBanner, styles.bannerSuccess]}>
                    <Ionicons name="checkmark-circle-outline" size={16} color={colors.green} />
                    <Text style={[styles.bannerText, styles.bannerTextSuccess]}>{modalMessage.text}</Text>
                  </View>
                )}

                <Text style={styles.inputLabel}>Source Name</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="e.g. Salary, Freelance, Allowance"
                  placeholderTextColor={colors.textSubtle}
                  value={sourceName}
                  onChangeText={setSourceName}
                />

                <Text style={styles.inputLabel}>Amount (₱)</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="0.00"
                  placeholderTextColor={colors.textSubtle}
                  keyboardType="numeric"
                  value={amount}
                  onChangeText={setAmount}
                />

                <Text style={styles.inputLabel}>Coverage Period</Text>
                <View style={styles.chipsGrid}>
                  {PERIODS.map((period) => {
                    const isSelected = selectedPeriod === period;
                    return (
                      <TouchableOpacity
                        key={period}
                        style={[styles.chipButton, isSelected && styles.chipButtonSelected]}
                        onPress={() => handleSelectPeriod(period)}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>{period}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <View style={styles.previewDateBox}>
                  <Ionicons name="calendar-outline" size={14} color={colors.brand} />
                  <Text style={styles.previewDateText}>
                    {startDate && endDate
                      ? startDate === endDate
                        ? formatDate(startDate)
                        : `${formatDate(startDate)} → ${formatDate(endDate)}`
                      : 'Select period'}
                  </Text>
                </View>

                <View style={styles.toggleRow}>
                  <View style={styles.toggleTextContainer}>
                    <Text style={styles.toggleLabel}>Set Budget Allocation</Text>
                    <Text style={styles.toggleSubtext}>Allocate this income across categories</Text>
                  </View>
                  <Switch
                    trackColor={{ false: colors.borderStrong, true: colors.brand }}
                    thumbColor={enableBudgetAllocation ? colors.white : colors.surfaceAlt}
                    ios_backgroundColor={colors.borderStrong}
                    onValueChange={(value) => {
                      setEnableBudgetAllocation(value);
                      if (value) setAllocationModalVisible(true);
                    }}
                    value={enableBudgetAllocation}
                  />
                </View>

                <View style={styles.modalButtonsRow}>
                  <TouchableOpacity style={[styles.modalButton, styles.cancelBtn]} onPress={handleCloseAddModal} disabled={submitting}>
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalButton, styles.confirmBtn, submitting && styles.buttonDisabled]}
                    onPress={handleSaveIncome}
                    disabled={submitting}
                  >
                    {submitting ? (
                      <ActivityIndicator color={colors.white} size="small" />
                    ) : (
                      <Text style={styles.confirmBtnText}>Save Income</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Calendar range picker (centered card) */}
      <Modal animationType="fade" transparent visible={calendarModalVisible} onRequestClose={() => setCalendarModalVisible(false)}>
        <View style={styles.modalOverlayCenter}>
          <View style={styles.calendarModalContainer}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Select Date Range</Text>
              <TouchableOpacity onPress={() => setCalendarModalVisible(false)} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <View style={styles.calendarMonthHeader}>
              <Text style={styles.calendarMonthTitle}>
                {currentCalendarDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </Text>
              <View style={styles.calendarNavRow}>
                <TouchableOpacity onPress={() => changeMonth(-1)} style={styles.calendarNavBtn}>
                  <Ionicons name="chevron-back" size={18} color={colors.textStrong} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => changeMonth(1)} style={styles.calendarNavBtn}>
                  <Ionicons name="chevron-forward" size={18} color={colors.textStrong} />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.calendarDaysOfWeek}>
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                <Text key={d} style={styles.calendarDayOfWeekText}>{d}</Text>
              ))}
            </View>

            <View style={styles.calendarGrid}>{renderCalendarDays()}</View>

            <View style={styles.modalButtonsRow}>
              <TouchableOpacity style={[styles.modalButton, styles.cancelBtn]} onPress={() => setCalendarModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmBtn]}
                onPress={() => {
                  if (tempStartDate) {
                    setStartDate(tempStartDate);
                    setEndDate(tempEndDate || tempStartDate);
                  }
                  setCalendarModalVisible(false);
                }}
              >
                <Text style={styles.confirmBtnText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Budget allocation (bottom sheet) */}
      <Modal animationType="slide" transparent visible={allocationModalVisible} onRequestClose={() => setAllocationModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.modalSheet}>
              <View style={styles.modalHeaderRow}>
                <Text style={styles.modalTitle}>Allocate Budget</Text>
                <TouchableOpacity onPress={() => setAllocationModalVisible(false)} style={styles.modalCloseBtn}>
                  <Ionicons name="close" size={18} color={colors.textMuted} />
                </TouchableOpacity>
              </View>

              <View style={[styles.allocationStatusBox, allocationOk ? styles.allocationStatusOk : styles.allocationStatusWarn]}>
                <Ionicons
                  name={allocationOk ? 'checkmark-circle-outline' : 'alert-circle-outline'}
                  size={16}
                  color={allocationOk ? colors.roleGreen : colors.warningDeep}
                />
                <Text style={[styles.allocationStatusText, allocationOk ? styles.allocationStatusTextOk : styles.allocationStatusTextWarn]}>
                  Remaining to Allocate: ₱{remaining.toFixed(2)}
                </Text>
              </View>

              <ScrollView contentContainerStyle={styles.allocationList} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                {categories.length === 0 ? (
                  <Text style={styles.allocationEmptyText}>No categories found. Please add categories first.</Text>
                ) : (
                  categories.map((cat) => (
                    <View key={cat.id} style={styles.allocationRow}>
                      <View style={styles.allocationCategoryLeft}>
                        <Ionicons
                          name={cat.icon || 'folder-outline'}
                          size={18}
                          color={cat.color || colors.brand}
                          style={styles.allocationCategoryIcon}
                        />
                        <Text style={styles.allocationCategoryName}>{cat.name}</Text>
                      </View>
                      <TextInput
                        style={styles.allocationInput}
                        placeholder="0.00"
                        placeholderTextColor={colors.textSubtle}
                        keyboardType="numeric"
                        value={categoryAllocations[cat.id] || ''}
                        onChangeText={(val) => handleAllocationChange(cat.id, val)}
                      />
                    </View>
                  ))
                )}
              </ScrollView>

              <TouchableOpacity
                style={[styles.modalButton, styles.confirmBtn, !allocationOk && styles.buttonDisabled, { flex: 0, marginTop: theme.space[12] }]}
                disabled={!allocationOk}
                onPress={() => setAllocationModalVisible(false)}
              >
                <Text style={styles.confirmBtnText}>Confirm Allocation</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Archive / delete confirmation (styled like paytonAlertStyles) */}
      <Modal animationType="fade" transparent visible={confirmConfig.visible} onRequestClose={closeConfirm}>
        <View style={styles.modalOverlayCenter}>
          <View style={styles.confirmCard}>
            <View style={[styles.confirmIconBox, confirmConfig.type === 'danger' ? styles.confirmIconDanger : styles.confirmIconWarning]}>
              <Ionicons
                name={confirmConfig.type === 'danger' ? 'trash-outline' : 'archive-outline'}
                size={24}
                color={confirmConfig.type === 'danger' ? colors.danger : colors.brand}
              />
            </View>
            <Text style={styles.confirmTitle}>{confirmConfig.title}</Text>
            <Text style={styles.confirmMessage}>{confirmConfig.message}</Text>
            <View style={styles.confirmActions}>
              <TouchableOpacity style={[styles.modalButton, styles.cancelBtn]} onPress={closeConfirm}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, confirmConfig.type === 'danger' ? styles.dangerBtn : styles.confirmBtn]}
                onPress={confirmConfig.onConfirm}
              >
                <Text style={styles.confirmBtnText}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function IncomeCard({ item, onArchive, onDelete }: { item: IncomeItem; onArchive: () => void; onDelete: () => void }) {
  const isSameDate = item.start_date === item.end_date;

  return (
    <View style={styles.incomeCard}>
      <View style={styles.cardHeaderRow}>
        <View style={styles.cardHeaderLeft}>
          <View style={styles.statusBadge}>
            <Ionicons name="wallet" size={20} color={colors.success} />
          </View>
          <View style={styles.titleWrapper}>
            <Text style={styles.sourceText} numberOfLines={1}>{item.source_name}</Text>
          </View>
        </View>

        <View style={styles.amountContainer}>
          <Text style={styles.amountText}>₱{Number(item.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}</Text>
        </View>
      </View>

      <View style={styles.cardDivider} />

      <View style={styles.cardFooterRow}>
        <View style={styles.dateContainer}>
          <Ionicons name="calendar-outline" size={13} color={colors.textMuted} />
          <Text style={styles.dateText}>
            {isSameDate ? formatDate(item.start_date) : `${formatDate(item.start_date)} → ${formatDate(item.end_date)}`}
          </Text>
        </View>

        <View style={styles.actionButtonsRow}>
          <TouchableOpacity onPress={onArchive} style={[styles.actionButton, styles.archiveButtonBorder]} activeOpacity={0.7}>
            <Ionicons name="archive-outline" size={15} color={colors.brand} />
          </TouchableOpacity>
          <TouchableOpacity onPress={onDelete} style={[styles.actionButton, styles.deleteButtonBorder]} activeOpacity={0.7}>
            <Ionicons name="trash-outline" size={15} color={colors.danger} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}