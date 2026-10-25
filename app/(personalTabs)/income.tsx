import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  RefreshControl,
  ScrollView,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';


import { theme } from '@/constants/theme';
import { incomeStyles as styles } from '@/constants/ui.styles';
import { supabase } from '../../lib/supabase';

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
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [incomes, setIncomes] = useState<IncomeItem[]>([]);

  // Inline Notification State
  const [screenMessage, setScreenMessage] = useState<InlineMessage | null>(null);
  const [modalMessage, setModalMessage] = useState<InlineMessage | null>(null);
  const [allocationMessage, setAllocationMessage] = useState<InlineMessage | null>(null);

  // Confirmation Action State (Replacing destructive/archive alert popups)
  const [confirmConfig, setConfirmConfig] = useState<{
    visible: boolean;
    title: string;
    message: string;
    type: 'danger' | 'warning';
    onConfirm: () => void;
  }>({ visible: false, title: '', message: '', type: 'danger', onConfirm: () => {} });

  // Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [sourceName, setSourceName] = useState('');
  const [amount, setAmount] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedPeriod, setSelectedPeriod] = useState<string>('Today');
  const [submitting, setSubmitting] = useState(false);

  // Custom Calendar Picker Modal State
  const [calendarModalVisible, setCalendarModalVisible] = useState(false);
  const [currentCalendarDate, setCurrentCalendarDate] = useState(new Date());
  const [tempStartDate, setTempStartDate] = useState<string>('');
  const [tempEndDate, setTempEndDate] = useState<string>('');

  const [enableBudgetAllocation, setEnableBudgetAllocation] = useState(false);
  const [allocationModalVisible, setAllocationModalVisible] = useState(false);
  const [categories, setCategories] = useState<any[]>([]);
  const [categoryAllocations, setCategoryAllocations] = useState<Record<string, string>>({});

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const getRemainingBalance = () => {
    const totalIncome = parseFloat(amount) || 0;
    const totalAllocated = Object.values(categoryAllocations).reduce<number>((sum, val) => sum + (parseFloat(val) || 0), 0);
    return totalIncome - totalAllocated;
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

  const handleOpenAddModal = () => {
    handleResetForm();
    setModalVisible(true);
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

    // 1. Show success message inside the modal
    setModalMessage({ type: 'success', text: 'Income added successfully!' });
    fetchData();

    // 2. Wait 1.5 seconds, then clear form states and close the modal
    setTimeout(() => {
      setModalVisible(false);
      setModalMessage(null);
      setCategoryAllocations({});
      setEnableBudgetAllocation(false);
      // Optional: clear inputs here if you have a reset function like handleResetForm()
    }, 1500);

  } catch (error: any) {
    setModalMessage({ type: 'error', text: error.message });
  } finally {
    setSubmitting(false);
  }
};

const showMessageWithTimeout = (type: 'success' | 'error', text: string) => {
  // Clear any existing timeout to prevent overlapping clears
  if (timeoutRef.current) {
    clearTimeout(timeoutRef.current);
  }

  setScreenMessage({ type, text });

  // Hide the message after 3 seconds (3000ms)
  timeoutRef.current = setTimeout(() => {
    setScreenMessage(null);
  }, 3000);
};

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
        
        setConfirmConfig((prev) => ({ ...prev, visible: false }));
        fetchData();
        showMessageWithTimeout('success', 'Income record archived successfully.');
      } catch (err: any) {
        showMessageWithTimeout('error', err.message);
        setConfirmConfig((prev) => ({ ...prev, visible: false }));
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
        
        setConfirmConfig((prev) => ({ ...prev, visible: false }));
        fetchData();
        showMessageWithTimeout('success', 'Income record deleted successfully.');
      } catch (err: any) {
        showMessageWithTimeout('error', err.message);
        setConfirmConfig((prev) => ({ ...prev, visible: false }));
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
        <ActivityIndicator size="large" color={theme.colors.brand} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <View style={styles.headerContainer}>
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.iconCircleButton} onPress={() => router.back()} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={20} color={theme.colors.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Income Management</Text>
          <TouchableOpacity style={styles.iconCircleButton} onPress={handleOpenAddModal} activeOpacity={0.7}>
            <Ionicons name="add" size={22} color={theme.colors.white} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} tintColor={theme.colors.brand} />
        }
      >
        <View style={styles.bodyCard}>
          {screenMessage && (
            <View style={[styles.inlineBanner, screenMessage.type === 'error' ? styles.bannerError : styles.bannerSuccess]}>
              <Ionicons 
                name={screenMessage.type === 'error' ? 'alert-circle-outline' : 'checkmark-circle-outline'} 
                size={16} 
                color={screenMessage.type === 'error' ? theme.colors.dangerDeep : theme.colors.roleGreen} 
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
                <Ionicons name="receipt-outline" size={28} color={theme.colors.brand} />
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
        </View>
      </ScrollView>

      {/* Add Income Modal */}
      <Modal animationType="fade" transparent={true} visible={modalVisible} onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <ScrollView contentContainerStyle={styles.modalScrollContent}>
            <View style={styles.modalContainer}>
              <View style={styles.modalHeaderRow}>
                <Text style={styles.modalTitle}>Add Income</Text>
                <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.modalCloseBtn}>
                  <Ionicons name="close" size={18} color={theme.colors.textMuted} />
                </TouchableOpacity>
              </View>

              {/* Error Banner */}
              {modalMessage && modalMessage.type === 'error' && (
                <View style={[styles.inlineBanner, styles.bannerError, { marginBottom: theme.space[12] }]}>
                  <Ionicons name="alert-circle-outline" size={16} color={theme.colors.danger} />
                  <Text style={[styles.bannerText, styles.bannerTextError]}>{modalMessage.text}</Text>
                </View>
              )}

              {/* Success Banner */}
              {modalMessage && modalMessage.type === 'success' && (
                <View style={[styles.inlineBanner, styles.bannerSuccess, { marginBottom: theme.space[12] }]}>
                  <Ionicons name="checkmark-circle-outline" size={16} color={theme.colors.green} />
                  <Text style={[styles.bannerText, styles.bannerTextSuccess]}>{modalMessage.text}</Text>
                </View>
              )}

              <Text style={styles.inputLabel}>Source Name</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="e.g. Salary, Freelance, Allowance"
                placeholderTextColor={theme.colors.textSubtle}
                value={sourceName}
                onChangeText={setSourceName}
              />

              <Text style={styles.inputLabel}>Amount (₱)</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="0.00"
                placeholderTextColor={theme.colors.textSubtle}
                keyboardType="numeric"
                value={amount}
                onChangeText={setAmount}
              />

              <Text style={styles.inputLabel}>Coverage Period</Text>
              <View style={styles.chipsGrid}>
                {['Today', 'This Week', 'Next Week', 'This Month', 'Next Month', 'Custom'].map((period) => {
                  const isSelected = selectedPeriod === period;
                  return (
                    <TouchableOpacity
                      key={period}
                      style={[styles.chipButton, isSelected && styles.chipButtonSelected]}
                      onPress={() => handleSelectPeriod(period)}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                        {period}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.previewDateBox}>
                <Ionicons name="calendar-outline" size={14} color={theme.colors.brand} />
                <Text style={styles.previewDateText}>
                  {startDate && endDate ? (startDate === endDate ? formatDate(startDate) : `${formatDate(startDate)} → ${formatDate(endDate)}`) : 'Select period'}
                </Text>
              </View>

              <View style={styles.toggleRow}>
                <View style={styles.toggleTextContainer}>
                  <Text style={[styles.inputLabel, { marginBottom: theme.space[2] }]}>Set Budget Allocation</Text>
                  <Text style={styles.toggleSubtext}>Allocate this income across categories</Text>
                </View>
                <Switch
                  trackColor={{ false: theme.colors.borderStrong, true: theme.colors.brand }}
                  thumbColor={enableBudgetAllocation ? theme.colors.white : theme.colors.surfaceAlt}
                  ios_backgroundColor={theme.colors.borderStrong}
                  onValueChange={(value) => {
                    setEnableBudgetAllocation(value);
                    if (value) setAllocationModalVisible(true);
                  }}
                  value={enableBudgetAllocation}
                />
              </View>

              <View style={styles.modalButtonsRow}>
                <TouchableOpacity style={[styles.modalButton, styles.cancelBtn]} onPress={handleResetForm} disabled={submitting}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modalButton, styles.confirmBtn]} onPress={handleSaveIncome} disabled={submitting}>
                  {submitting ? (
                    <ActivityIndicator color={theme.colors.white} size="small" />
                  ) : (
                    <Text style={styles.confirmBtnText}>Save Income</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Calendar Modal */}
      <Modal animationType="fade" transparent={true} visible={calendarModalVisible} onRequestClose={() => setCalendarModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.calendarModalContainer}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Select Date Range</Text>
              <TouchableOpacity onPress={() => setCalendarModalVisible(false)} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={18} color={theme.colors.textMuted} />
              </TouchableOpacity>
            </View>

            <View style={styles.calendarMonthHeader}>
              <Text style={styles.calendarMonthTitle}>
                {currentCalendarDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </Text>
              <View style={styles.calendarNavRow}>
                <TouchableOpacity onPress={() => changeMonth(-1)} style={styles.calendarNavBtn}>
                  <Ionicons name="chevron-back" size={18} color={theme.colors.textStrong} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => changeMonth(1)} style={styles.calendarNavBtn}>
                  <Ionicons name="chevron-forward" size={18} color={theme.colors.textStrong} />
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
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelBtn]}
                onPress={() => {
                  setTempStartDate('');
                  setTempEndDate('');
                }}
              >
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

      {/* Budget Allocation Modal */}
      <Modal animationType="slide" transparent={true} visible={allocationModalVisible} onRequestClose={() => setAllocationModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, { maxWidth: 400, width: '90%' }]}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Allocate Budget</Text>
              <TouchableOpacity onPress={() => setAllocationModalVisible(false)} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={18} color={theme.colors.textMuted} />
              </TouchableOpacity>
            </View>

            <View
              style={[
                styles.previewDateBox,
                {
                  backgroundColor: getRemainingBalance() === 0 ? theme.colors.greenSoft : theme.colors.warningBg,
                  borderColor: getRemainingBalance() === 0 ? theme.colors.greenLight : theme.colors.warningBorder,
                  borderWidth: 1,
                },
              ]}
            >
              <Ionicons
                name={getRemainingBalance() === 0 ? 'checkmark-circle-outline' : 'alert-circle-outline'}
                size={16}
                color={getRemainingBalance() === 0 ? theme.colors.roleGreen : theme.colors.warningDeep}
              />
              <Text style={[styles.previewDateText, { fontWeight: theme.fontWeight.semibold, color: getRemainingBalance() === 0 ? theme.colors.roleGreen : theme.colors.warningDeep }]}>
                Remaining to Allocate: ₱{getRemainingBalance().toFixed(2)}
              </Text>
            </View>

            <ScrollView contentContainerStyle={{ paddingVertical: theme.space[10] }} showsVerticalScrollIndicator={false}>
              {categories.length === 0 ? (
                <Text style={{ textAlign: 'center', color: theme.colors.textMuted, marginVertical: theme.space[20] }}>No categories found. Please add categories first.</Text>
              ) : (
                categories.map((cat) => (
                  <View key={cat.id} style={styles.allocationRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                      <Ionicons name={cat.icon || 'folder-outline'} size={18} color={cat.color || theme.colors.brand} style={{ marginRight: theme.space[8] }} />
                      <Text style={[styles.inputLabel, { marginBottom: 0, color: theme.colors.slate700 }]}>{cat.name}</Text>
                    </View>
                    <TextInput
                      style={[styles.modalInput, { width: 110, textAlign: 'right', marginBottom: 0 }]}
                      placeholder="0.00"
                      placeholderTextColor={theme.colors.textSubtle}
                      keyboardType="numeric"
                      value={categoryAllocations[cat.id] || ''}
                      onChangeText={(val) => handleAllocationChange(cat.id, val)}
                    />
                  </View>
                ))
              )}
            </ScrollView>

            <TouchableOpacity
              style={[
                styles.confirmBtn, 
                { 
                  marginTop: theme.space[12], 
                  paddingVertical: theme.space[14], 
                  borderRadius: theme.radius.md, 
                  alignItems: 'center', 
                  opacity: getRemainingBalance() !== 0 ? 0.6 : 1 
                }
              ]}
              disabled={getRemainingBalance() !== 0}
              onPress={() => setAllocationModalVisible(false)}
            >
              <Text style={styles.confirmBtnText}>Confirm Allocation</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modern Inline Confirmation Modal */}
      <Modal animationType="fade" transparent={true} visible={confirmConfig.visible} onRequestClose={() => setConfirmConfig(prev => ({ ...prev, visible: false }))}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, { maxWidth: 340, width: '85%', padding: 22 }]}>
            <View style={[styles.emptyIconBox, { backgroundColor: confirmConfig.type === 'danger' ? theme.colors.dangerBg : theme.colors.canvasMint, alignSelf: 'center', marginBottom: theme.space[16] }]}>
              <Ionicons 
                name={confirmConfig.type === 'danger' ? 'trash-outline' : 'archive-outline'} 
                size={24} 
                color={confirmConfig.type === 'danger' ? theme.colors.danger : theme.colors.brand} 
              />
            </View>
            <Text style={[styles.modalTitle, { textAlign: 'center', marginBottom: theme.space[6] }]}>{confirmConfig.title}</Text>
            <Text style={{ fontSize: theme.fontSize.caption, color: theme.colors.textMuted, textAlign: 'center', marginBottom: theme.space[20], lineHeight: 18 }}>
              {confirmConfig.message}
            </Text>
            <View style={{ flexDirection: 'row', gap: theme.space[10] }}>
              <TouchableOpacity 
                style={[styles.modalButton, styles.cancelBtn]} 
                onPress={() => setConfirmConfig(prev => ({ ...prev, visible: false }))}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalButton, { backgroundColor: confirmConfig.type === 'danger' ? theme.colors.danger : theme.colors.brand }]} 
                onPress={confirmConfig.onConfirm}
              >
                <Text style={[styles.confirmBtnText, { color: theme.colors.white }]}>Confirm</Text>
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
            <Ionicons name="wallet" size={18} color={theme.colors.brand} />
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
          <Ionicons name="calendar-outline" size={13} color={theme.colors.textMuted} />
          <Text style={styles.dateText}>
            {isSameDate ? formatDate(item.start_date) : `${formatDate(item.start_date)} → ${formatDate(item.end_date)}`}
          </Text>
        </View>

        <View style={styles.actionButtonsRow}>
          <TouchableOpacity onPress={onArchive} style={[styles.actionButton, styles.archiveButtonBorder]} activeOpacity={0.7}>
            <Ionicons name="archive-outline" size={13} color={theme.colors.brand} />
          </TouchableOpacity>
          <TouchableOpacity onPress={onDelete} style={[styles.actionButton, styles.deleteButtonBorder]} activeOpacity={0.7}>
            <Ionicons name="trash-outline" size={13} color={theme.colors.rose} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}