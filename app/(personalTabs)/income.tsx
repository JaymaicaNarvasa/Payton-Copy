import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  StatusBar as NativeStatusBar,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';


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
        <ActivityIndicator size="large" color="#1F4F59" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <View style={styles.headerContainer}>
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.iconCircleButton} onPress={() => router.back()} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={20} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Income Management</Text>
          <TouchableOpacity style={styles.iconCircleButton} onPress={handleOpenAddModal} activeOpacity={0.7}>
            <Ionicons name="add" size={22} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} tintColor="#1F4F59" />
        }
      >
        <View style={styles.bodyCard}>
          {screenMessage && (
            <View style={[styles.inlineBanner, screenMessage.type === 'error' ? styles.bannerError : styles.bannerSuccess]}>
              <Ionicons 
                name={screenMessage.type === 'error' ? 'alert-circle-outline' : 'checkmark-circle-outline'} 
                size={16} 
                color={screenMessage.type === 'error' ? '#991B1B' : '#166534'} 
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
                <Ionicons name="receipt-outline" size={28} color="#1F4F59" />
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
                  <Ionicons name="close" size={18} color="#64748B" />
                </TouchableOpacity>
              </View>

              {/* Error Banner */}
              {modalMessage && modalMessage.type === 'error' && (
                <View style={[styles.inlineBanner, styles.bannerError, { marginBottom: 12 }]}>
                  <Ionicons name="alert-circle-outline" size={16} color="#DC2626" />
                  <Text style={[styles.bannerText, styles.bannerTextError]}>{modalMessage.text}</Text>
                </View>
              )}

              {/* Success Banner */}
              {modalMessage && modalMessage.type === 'success' && (
                <View style={[styles.inlineBanner, styles.bannerSuccess, { marginBottom: 12 }]}>
                  <Ionicons name="checkmark-circle-outline" size={16} color="#16A34A" />
                  <Text style={[styles.bannerText, styles.bannerTextSuccess]}>{modalMessage.text}</Text>
                </View>
              )}

              <Text style={styles.inputLabel}>Source Name</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="e.g. Salary, Freelance, Allowance"
                placeholderTextColor="#94A3B8"
                value={sourceName}
                onChangeText={setSourceName}
              />

              <Text style={styles.inputLabel}>Amount (₱)</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="0.00"
                placeholderTextColor="#94A3B8"
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
                <Ionicons name="calendar-outline" size={14} color="#1F4F59" />
                <Text style={styles.previewDateText}>
                  {startDate && endDate ? (startDate === endDate ? formatDate(startDate) : `${formatDate(startDate)} → ${formatDate(endDate)}`) : 'Select period'}
                </Text>
              </View>

              <View style={styles.toggleRow}>
                <View style={styles.toggleTextContainer}>
                  <Text style={[styles.inputLabel, { marginBottom: 2 }]}>Set Budget Allocation</Text>
                  <Text style={styles.toggleSubtext}>Allocate this income across categories</Text>
                </View>
                <Switch
                  trackColor={{ false: '#CBD5E1', true: '#1F4F59' }}
                  thumbColor={enableBudgetAllocation ? '#FFFFFF' : '#F1F5F9'}
                  ios_backgroundColor="#CBD5E1"
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
                    <ActivityIndicator color="#FFFFFF" size="small" />
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
                <Ionicons name="close" size={18} color="#64748B" />
              </TouchableOpacity>
            </View>

            <View style={styles.calendarMonthHeader}>
              <Text style={styles.calendarMonthTitle}>
                {currentCalendarDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </Text>
              <View style={styles.calendarNavRow}>
                <TouchableOpacity onPress={() => changeMonth(-1)} style={styles.calendarNavBtn}>
                  <Ionicons name="chevron-back" size={18} color="#0F172A" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => changeMonth(1)} style={styles.calendarNavBtn}>
                  <Ionicons name="chevron-forward" size={18} color="#0F172A" />
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
                <Ionicons name="close" size={18} color="#64748B" />
              </TouchableOpacity>
            </View>

            <View
              style={[
                styles.previewDateBox,
                {
                  backgroundColor: getRemainingBalance() === 0 ? '#DCFCE7' : '#FEF3C7',
                  borderColor: getRemainingBalance() === 0 ? '#BBF7D0' : '#FDE68A',
                  borderWidth: 1,
                },
              ]}
            >
              <Ionicons
                name={getRemainingBalance() === 0 ? 'checkmark-circle-outline' : 'alert-circle-outline'}
                size={16}
                color={getRemainingBalance() === 0 ? '#166534' : '#92400E'}
              />
              <Text style={[styles.previewDateText, { fontWeight: '600', color: getRemainingBalance() === 0 ? '#166534' : '#92400E' }]}>
                Remaining to Allocate: ₱{getRemainingBalance().toFixed(2)}
              </Text>
            </View>

            <ScrollView contentContainerStyle={{ paddingVertical: 10 }} showsVerticalScrollIndicator={false}>
              {categories.length === 0 ? (
                <Text style={{ textAlign: 'center', color: '#64748B', marginVertical: 20 }}>No categories found. Please add categories first.</Text>
              ) : (
                categories.map((cat) => (
                  <View key={cat.id} style={styles.allocationRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                      <Ionicons name={cat.icon || 'folder-outline'} size={18} color={cat.color || '#1F4F59'} style={{ marginRight: 8 }} />
                      <Text style={[styles.inputLabel, { marginBottom: 0, color: '#334155' }]}>{cat.name}</Text>
                    </View>
                    <TextInput
                      style={[styles.modalInput, { width: 110, textAlign: 'right', marginBottom: 0 }]}
                      placeholder="0.00"
                      placeholderTextColor="#94A3B8"
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
                  marginTop: 12, 
                  paddingVertical: 14, 
                  borderRadius: 12, 
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
            <View style={[styles.emptyIconBox, { backgroundColor: confirmConfig.type === 'danger' ? '#FEF2F2' : '#F0F5F2', alignSelf: 'center', marginBottom: 16 }]}>
              <Ionicons 
                name={confirmConfig.type === 'danger' ? 'trash-outline' : 'archive-outline'} 
                size={24} 
                color={confirmConfig.type === 'danger' ? '#DC2626' : '#1F4F59'} 
              />
            </View>
            <Text style={[styles.modalTitle, { textAlign: 'center', marginBottom: 6 }]}>{confirmConfig.title}</Text>
            <Text style={{ fontSize: 13, color: '#64748B', textAlign: 'center', marginBottom: 20, lineHeight: 18 }}>
              {confirmConfig.message}
            </Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity 
                style={[styles.modalButton, styles.cancelBtn]} 
                onPress={() => setConfirmConfig(prev => ({ ...prev, visible: false }))}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalButton, { backgroundColor: confirmConfig.type === 'danger' ? '#DC2626' : '#1F4F59' }]} 
                onPress={confirmConfig.onConfirm}
              >
                <Text style={[styles.confirmBtnText, { color: '#FFFFFF' }]}>Confirm</Text>
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
            <Ionicons name="wallet" size={18} color="#1F4F59" />
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
          <Ionicons name="calendar-outline" size={13} color="#64748B" />
          <Text style={styles.dateText}>
            {isSameDate ? formatDate(item.start_date) : `${formatDate(item.start_date)} → ${formatDate(item.end_date)}`}
          </Text>
        </View>

        <View style={styles.actionButtonsRow}>
          <TouchableOpacity onPress={onArchive} style={[styles.actionButton, styles.archiveButtonBorder]} activeOpacity={0.7}>
            <Ionicons name="archive-outline" size={13} color="#1F4F59" />
          </TouchableOpacity>
          <TouchableOpacity onPress={onDelete} style={[styles.actionButton, styles.deleteButtonBorder]} activeOpacity={0.7}>
            <Ionicons name="trash-outline" size={13} color="#E11D48" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  loadingCenter: { justifyContent: 'center', alignItems: 'center' },
  headerContainer: {
    backgroundColor: '#1F4F59',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? (NativeStatusBar.currentHeight ? NativeStatusBar.currentHeight + 16 : 44) : 16,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    paddingBottom: 20,
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.2 },
  iconCircleButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: { flexGrow: 1, backgroundColor: '#F8FAFC' },
  bodyCard: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    paddingTop: 22,
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1F4F59' },
  countBadge: {
    backgroundColor: '#E6FFFA',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  countBadgeText: { fontSize: 11, fontWeight: '700', color: '#1F4F59' },
  emptyContainer: {
    paddingVertical: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderStyle: 'dashed',
    marginTop: 4,
  },
  emptyIconBox: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: '#F0FDFA',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: '#0F172A', marginBottom: 4 },
  emptyText: { fontSize: 12, color: '#64748B', fontWeight: '500', textAlign: 'center', paddingHorizontal: 32 },
  incomeCard: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#1F4F59',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    marginRight: 8,
  },
  statusBadge: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#E6FFFA',
    justifyContent: 'center',
    alignItems: 'center',
  },
  titleWrapper: {
    flex: 1,
  },
  sourceText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  amountContainer: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  amountText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1F4F59',
  },
  cardDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 12,
  },
  cardFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    marginRight: 6,
  },
  dateText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#64748B',
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F5F2',
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#F0F5F2',
    gap: 4,
  },
  archiveButtonBorder: {
    backgroundColor: '#F0F5F2',
    borderColor: '#F0F5F2',
  },
  deleteButtonBorder: {
    backgroundColor: '#FFF5F5',
    borderColor: '#FFF5F5',
  },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.5)', justifyContent: 'center', alignItems: 'center' },
  modalScrollContent: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', width: '100%',padding: 20 },
  modalContainer: { backgroundColor: '#FFFFFF', width: '100%', padding: 24, borderRadius: 24, shadowColor: '#1F4F59', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.1, shadowRadius: 20, elevation: 5 },
  calendarModalContainer: { backgroundColor: '#FFFFFF', width: '90%', maxWidth: 380, padding: 20, borderRadius: 24, shadowColor: '#1F4F59', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.1, shadowRadius: 20, elevation: 5 },
  modalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#0F172A' },
  modalCloseBtn: { width: 30, height: 30, borderRadius: 8, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center' },
  inputLabel: { fontSize: 12, color: '#475569', fontWeight: '600', marginBottom: 6, marginTop: 4 },
  modalInput: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    padding: 12,
    borderRadius: 12,
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 4,
    backgroundColor: '#F8FAFC',
    color: '#0F172A',
  },
  chipsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  chipButton: {
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    width: '31%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  chipButtonSelected: {
    backgroundColor: '#1F4F59',
    borderColor: '#1F4F59',
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  chipTextSelected: {
    color: '#FFFFFF',
  },
  previewDateBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F0FDFA',
    padding: 10,
    borderRadius: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#CCFBF1',
  },
  previewDateText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1F4F59',
  },
  modalButtonsRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 12 },
  modalButton: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, flex: 1, alignItems: 'center' },
  cancelBtn: { backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0' },
  cancelBtnText: { color: '#475569', fontWeight: '600', fontSize: 13 },
  confirmBtn: { backgroundColor: '#1F4F59' },
  confirmBtnText: { color: '#FFFFFF', fontWeight: '600', fontSize: 13 },

  calendarMonthHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  calendarMonthTitle: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  calendarNavRow: { flexDirection: 'row', gap: 8 },
  calendarNavBtn: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center' },
  calendarDaysOfWeek: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 8 },
  calendarDayOfWeekText: { fontSize: 11, fontWeight: '600', color: '#64748B', width: '14.28%', textAlign: 'center' },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 16 },
  calendarDayCell: { width: '14.28%', aspectRatio: 1, justifyContent: 'center', alignItems: 'center', marginVertical: 2 },
  calendarDayCellDisabled: { opacity: 0.3 },
  calendarCellInRange: { backgroundColor: '#bafdff' },
  calendarCellEndpoint: { backgroundColor: '#00f7ff', borderRadius: 20 },
  calendarDayText: { fontSize: 13, fontWeight: '600', color: '#334155' },
  calendarDayTextDisabled: { color: '#94A3B8' },
  calendarDayTextSelected: { color: '#0F172A', fontWeight: '700' },

  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 14,
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  toggleTextContainer: {
    flex: 1,
    marginRight: 10,
  },
  toggleSubtext: {
    fontSize: 12,
    color: '#64748B',
  },
  allocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    backgroundColor: '#FFFFFF',
  },
  // Add these entries to your existing StyleSheet.create object:
  inlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    marginBottom: 14,
    gap: 8,
    borderWidth: 1,
  },
  bannerError: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FEE2E2',
  },
  bannerSuccess: {
    backgroundColor: '#F0FDF4',
    borderColor: '#DCFCE7',
  },
  bannerText: {
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  bannerTextError: {
    color: '#DC2626',
  },
  bannerTextSuccess: {
    color: '#166534',
  },
});