// app/(sponsorTabs)/allowance.tsx
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { supabase } from '../../lib/supabase';

/* ---------- Design Tokens — aligned with the rest of the app's teal palette ---------- */
const COLORS = {
  screenTeal: '#1F4F59',
  brand: '#1F4F59',
  surface: '#FFFFFF',
  pillBg: '#F1F5F9',
  softTint: '#F3F7F6',
  ink: '#173D45',
  inkSoft: '#64748B',
  muted: '#94A3B8',
  danger: '#EF4444',
  dangerSoft: '#FEF2F2',
  green: '#77f3a54b',
  pendingSoft: '#FEF9C3',
  pendingText: '#A16207',
};

const CARD_THEMES = [
  { bg: '#EAF6F7', text: '#1F4F59' },
  { bg: '#F4F8E8', text: '#213502' },
  { bg: '#FAFAD8', text: '#213502' },
];

const getLocalDateString = (year: number, monthIndex: number, day: number) => {
  const d = new Date(year, monthIndex, day);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const date = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${date}`;
};

const formatDisplayDate = (dateStr: string) => {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', {
    month: 'long',
    day: '2-digit',
    year: 'numeric',
  });
};

const formatDisplayDateRange = (startStr: string, endStr: string) => {
  if (!startStr) return '';
  if (startStr === endStr) return formatDisplayDate(startStr);

  const [startYear, startMonth, startDay] = startStr.split('-').map(Number);
  const [endYear, endMonth, endDay] = endStr.split('-').map(Number);

  const startDate = new Date(startYear, startMonth - 1, startDay);
  const endDate = new Date(endYear, endMonth - 1, endDay);

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    return `${startStr} - ${endStr}`;
  }

  if (startYear === endYear && startMonth === endMonth) {
    const monthName = startDate.toLocaleDateString('en-US', { month: 'long' });
    const formattedStartDay = String(startDay).padStart(2, '0');
    const formattedEndDay = String(endDay).padStart(2, '0');
    return `${monthName} ${formattedStartDay} - ${formattedEndDay}, ${startYear}`;
  }

  return `${formatDisplayDate(startStr)} - ${formatDisplayDate(endStr)}`;
};

const getPeriodDates = (period: 'today' | 'week' | 'nextWeek' | 'month' | 'nextMonth') => {
  const d = new Date();
  const year = d.getFullYear();
  const month = d.getMonth();
  const day = d.getDate();

  if (period === 'today') {
    const todayStr = getLocalDateString(year, month, day);
    return { start: todayStr, end: todayStr };
  } 
  
  if (period === 'week') {
    const currentDayOfWeek = d.getDay();
    const startOfWeek = new Date(year, month, day - currentDayOfWeek);
    const endOfWeek = new Date(year, month, day + (6 - currentDayOfWeek));

    return {
      start: getLocalDateString(startOfWeek.getFullYear(), startOfWeek.getMonth(), startOfWeek.getDate()),
      end: getLocalDateString(endOfWeek.getFullYear(), endOfWeek.getMonth(), endOfWeek.getDate())
    };
  }

  if (period === 'nextWeek') {
    const currentDayOfWeek = d.getDay();
    const startOfNextWeek = new Date(year, month, day + (7 - currentDayOfWeek));
    const endOfNextWeek = new Date(year, month, day + (13 - currentDayOfWeek));

    return {
      start: getLocalDateString(startOfNextWeek.getFullYear(), startOfNextWeek.getMonth(), startOfNextWeek.getDate()),
      end: getLocalDateString(endOfNextWeek.getFullYear(), endOfNextWeek.getMonth(), endOfNextWeek.getDate())
    };
  }
  
  if (period === 'month') {
    const startOfMonth = getLocalDateString(year, month, 1);
    const endOfMonth = getLocalDateString(year, month + 1, 0);
    return { start: startOfMonth, end: endOfMonth };
  }

  const startOfNextMonth = getLocalDateString(year, month + 1, 1);
  const endOfNextMonth = getLocalDateString(year, month + 2, 0);
  return { start: startOfNextMonth, end: endOfNextMonth };
};

interface SelectedSpender {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
}

interface SpenderMember {
  id: string;
  spender_id: string;
  name: string;
  email: string;
  status: string;
  avatarUrl?: string | null;
}

export default function AllowanceScreen() {
  const router = useRouter();

  const [selectedSpender, setSelectedSpender] = useState<SelectedSpender | null>(null);
  const [allowanceName, setAllowanceName] = useState('');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Modern Feedback Banner State
  const [feedback, setFeedback] = useState<{ type: 'error' | 'success'; message: string } | null>(null);

  const showNotice = (type: 'error' | 'success', message: string) => {
    setFeedback({ type, message });
  };

  // Modal State for Member Selection
  const [modalVisible, setModalVisible] = useState(false);
  const [connectedMembers, setConnectedMembers] = useState<SpenderMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

  // Period Selector State (Default: 'today')
  const [selectedPeriod, setSelectedPeriod] = useState<'today' | 'week' | 'nextWeek' | 'month' | 'nextMonth' | 'custom'>('today');

  const defaultPeriodDates = getPeriodDates('today');
  const [startDate, setStartDate] = useState(defaultPeriodDates.start);
  const [endDate, setEndDate] = useState(defaultPeriodDates.end);

  // Custom Calendar Modal States
  const [customModalVisible, setCustomModalVisible] = useState(false);
  const [currentCalendarDate, setCurrentCalendarDate] = useState(new Date());
  const [tempStartDate, setTempStartDate] = useState<string | null>(null);
  const [tempEndDate, setTempEndDate] = useState<string | null>(null);

  const hasInputs = Boolean(selectedSpender || allowanceName.trim().length > 0 || amount.trim().length > 0);

  const resetFormState = () => {
    setAllowanceName('');
    setAmount('');
    setSelectedSpender(null);
    setSelectedPeriod('today');
    const defaultDates = getPeriodDates('today');
    setStartDate(defaultDates.start);
    setEndDate(defaultDates.end);
    setModalVisible(false);
    setCustomModalVisible(false);
    setTempStartDate(null);
    setTempEndDate(null);
    setCurrentCalendarDate(new Date());
    setFeedback(null);
  };

  useFocusEffect(
    useCallback(() => {
      resetFormState();
    }, [])
  );

  const fetchConnectedMembers = async () => {
    try {
      setLoadingMembers(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('sponsor_spenders')
        .select(`
          id, status, spender_id,
          profiles!spender_id ( full_name, email, avatar_url )
        `)
        .eq('sponsor_id', user.id);

      if (error) throw error;

      const formattedMembers = (data || []).map((item: any) => ({
        id: item.id,
        spender_id: item.spender_id,
        name: item.profiles?.full_name || 'No Name',
        email: item.profiles?.email || 'No Email',
        avatarUrl: item.profiles?.avatar_url || null,
        status: item.status
      }));

      setConnectedMembers(formattedMembers);
    } catch (error: any) {
      showNotice('error', error.message || 'Failed to fetch members.');
    } finally {
      setLoadingMembers(false);
    }
  };

  const handleOpenMemberModal = () => {
    fetchConnectedMembers();
    setModalVisible(true);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    resetFormState();
    setRefreshing(false);
  };

  const handleSaveAllowance = async () => {
    if (!selectedSpender) {
      showNotice('error', 'Please select a member to allocate allowance.');
      return;
    }

    const parsedAmount = parseFloat(amount);
    if (!allowanceName.trim() || isNaN(parsedAmount) || parsedAmount <= 0) {
      showNotice('error', 'Please provide a valid name and a positive amount.');
      return;
    }

    if (!startDate.trim() || !endDate.trim()) {
      showNotice('error', 'Please specify both coverage start and end dates.');
      return;
    }

    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const payload = {
        sponsor_id: user.id,
        spender_id: selectedSpender.id,
        allowance_name: allowanceName.trim(),
        amount: parsedAmount,
        start_date: startDate,
        end_date: endDate
      };

      const { error } = await supabase
        .from('allowances')
        .insert([payload]);

      if (error) throw error;
      
      // Log the successful allowance creation matching your logs table schema
      await supabase.from('logs').insert({
        user_id: user.id,
        details: `allocated allowance "${allowanceName.trim()}" (${parsedAmount}) for spender "${selectedSpender.name || selectedSpender.id}".`,
      });

      showNotice('success', 'Allowance allocated successfully!');
      setTimeout(() => {
        router.replace('/(sponsorTabs)/home');
      }, 800);
    } catch (e: any) { 
      showNotice('error', e.message || 'Something went wrong. Please try again.'); 
    } finally { 
      setLoading(false); 
    }
  };

  return (
    <View style={styles.screenBg}>
      <StatusBar style="light" />

      <View style={styles.whiteSheet}>
        <ScrollView 
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.brand]} tintColor={COLORS.brand} />
          }
        >
          <View style={styles.header}>
            <TouchableOpacity 
              style={styles.inlineBackButton} 
              activeOpacity={0.7} 
              onPress={() => router.replace('/(sponsorTabs)/home')}
            >
              <Ionicons name="arrow-back" size={20} color={COLORS.brand} />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>Set Allowance</Text>
              <Text style={styles.mainSubtitle}>Select a spender and allocate allowance.</Text>
            </View>
          </View>

          {/* Modern Feedback Banner */}
          {feedback && (
            <View style={[
              styles.bannerContainer, 
              feedback.type === 'success' ? styles.bannerSuccess : styles.bannerError
            ]}>
              <Ionicons 
                name={feedback.type === 'success' ? 'checkmark-circle' : 'alert-circle'} 
                size={18} 
                color={feedback.type === 'success' ? '#047857' : COLORS.danger} 
              />
              <Text style={[
                styles.bannerText,
                feedback.type === 'success' ? styles.bannerTextSuccess : styles.bannerTextError
              ]}>
                {feedback.message}
              </Text>
              <TouchableOpacity onPress={() => setFeedback(null)} style={styles.bannerClose}>
                <Ionicons name="close" size={14} color={feedback.type === 'success' ? '#047857' : COLORS.danger} />
              </TouchableOpacity>
            </View>
          )}

          <Text style={[styles.sectionTitle, feedback ? { marginTop: 16 } : {}]}>Target Member</Text>
          {selectedSpender ? (
            <View style={styles.selectedSpenderCard}>
              <View style={styles.avatarContainer}>
                {selectedSpender.avatarUrl ? (
                  <Image source={{ uri: selectedSpender.avatarUrl }} style={styles.avatarImage} />
                ) : (
                  <Ionicons name="person" size={16} color={COLORS.brand} />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.spenderName}>{selectedSpender.name}</Text>
                <Text style={styles.spenderEmail}>{selectedSpender.email || 'Beneficiary'}</Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedSpender(null)} style={styles.removeButton}>
                <Ionicons name="close" size={16} color={COLORS.danger} />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.selectMemberButton} activeOpacity={0.7} onPress={handleOpenMemberModal}>
              <View style={styles.addCircleOutline}>
                <Ionicons name="add" size={18} color={COLORS.brand} />
              </View>
              <Text style={styles.selectMemberText}>Select a Member to Allocate</Text>
            </TouchableOpacity>
          )}

          <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Allowance Details</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Allowance Name</Text>
            <TextInput 
              style={styles.pillInput} 
              value={allowanceName} 
              onChangeText={setAllowanceName} 
              placeholder="e.g. Weekly Allowance" 
              placeholderTextColor={COLORS.muted} 
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Amount (PHP)</Text>
            <View style={styles.amountWrapper}>
              <Text style={styles.currencyPrefix}>₱</Text>
              <TextInput 
                style={[styles.pillInput, styles.amountInput]} 
                keyboardType="decimal-pad" 
                value={amount} 
                onChangeText={setAmount} 
                placeholder="0.00" 
                placeholderTextColor={COLORS.muted} 
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Coverage Period</Text>
            
            <View style={styles.periodSelectorContainer}>
              {[
                { key: 'today', label: 'Today' },
                { key: 'week', label: 'This Week' },
                { key: 'nextWeek', label: 'Next Week' },
                { key: 'month', label: 'This Month' },
                { key: 'nextMonth', label: 'Next Month' },
              ].map((item) => {
                const isActive = selectedPeriod === item.key;
                return (
                  <TouchableOpacity
                    key={item.key}
                    style={[styles.periodPill, isActive && styles.periodPillActive]}
                    activeOpacity={0.8}
                    onPress={() => {
                      setSelectedPeriod(item.key as any);
                      const dates = getPeriodDates(item.key as any);
                      setStartDate(dates.start);
                      setEndDate(dates.end);
                    }}
                  >
                    <Text style={[styles.periodPillText, isActive && styles.periodPillTextActive]}>
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}

              <TouchableOpacity
                style={[styles.periodPill, selectedPeriod === 'custom' && styles.periodPillActive]}
                activeOpacity={0.8}
                onPress={() => {
                  setTempStartDate(null);
                  setTempEndDate(null);
                  setCurrentCalendarDate(new Date());
                  setCustomModalVisible(true);
                }}
              >
                <Text style={[styles.periodPillText, selectedPeriod === 'custom' && styles.periodPillTextActive]}>
                  Custom
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.dateRangeIndicator}>
              <Ionicons name="calendar-outline" size={14} color={COLORS.inkSoft} />
              <Text style={styles.dateRangeIndicatorText}>
                {formatDisplayDateRange(startDate, endDate)}
              </Text>
            </View>
          </View>

          <View style={styles.actionButtonsRow}>
            {hasInputs && (
              <TouchableOpacity 
                style={styles.cancelButton} 
                activeOpacity={0.85} 
                onPress={resetFormState}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity 
              style={[styles.saveButton, hasInputs && { flex: 1 }]} 
              activeOpacity={0.85} 
              onPress={handleSaveAllowance} 
              disabled={loading}
            >
              {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveButtonText}>Confirm Allocation</Text>}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>

      {/* Connected Members Selection Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Member</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.modalCloseButton}>
                <Ionicons name="close" size={20} color={COLORS.brand} />
              </TouchableOpacity>
            </View>

            {loadingMembers ? (
              <ActivityIndicator size="large" color={COLORS.brand} style={{ marginVertical: 40 }} />
            ) : (
              <FlatList
                data={connectedMembers}
                keyExtractor={(item) => item.id}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 20 }}
                ListEmptyComponent={
                  <View style={styles.emptyContainer}>
                    <Text style={styles.emptyTitle}>No connected members</Text>
                    <Text style={styles.emptySubtitle}>Go to the members tab to link a spender first.</Text>
                  </View>
                }
                renderItem={({ item, index }) => {
                  const theme = CARD_THEMES[index % CARD_THEMES.length];
                  const isPending = item.status === 'pending';

                  return (
                    <TouchableOpacity
                      style={[styles.modalCard, { backgroundColor: theme.bg, opacity: isPending ? 0.6 : 1 }]}
                      activeOpacity={0.8}
                      disabled={isPending}
                      onPress={() => {
                        if (isPending) {
                          showNotice('error', "Spender hasn't accepted your link request yet.");
                          setModalVisible(false);
                          return;
                        }
                        setSelectedSpender({
                          id: item.spender_id,
                          name: item.name,
                          email: item.email,
                          avatarUrl: item.avatarUrl
                        });
                        setModalVisible(false);
                      }}
                    >
                      <View style={styles.gridAvatarCircle}>
                        {item.avatarUrl ? (
                          <Image source={{ uri: item.avatarUrl }} style={styles.avatarImage} />
                        ) : (
                          <Text style={[styles.avatarText, { color: theme.text }]}>
                            {item.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
                          </Text>
                        )}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.gridMemberName, { color: theme.text }]} numberOfLines={1}>{item.name}</Text>
                        <Text style={styles.gridMemberEmail} numberOfLines={1}>{item.email}</Text>
                      </View>
                      {isPending && (
                        <View style={[styles.gridStatusBadge, styles.badgePending]}>
                          <Text style={[styles.statusText, { color: COLORS.pendingText }]}>Pending</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                }}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* Custom Range Calendar Picker Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={customModalVisible}
        onRequestClose={() => setCustomModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '85%' }]}>
            
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Date Range</Text>
              <TouchableOpacity onPress={() => setCustomModalVisible(false)} style={styles.modalCloseButton}>
                <Ionicons name="close" size={20} color={COLORS.brand} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalDivider} />

            <View style={styles.calendarNavRow}>
              <Text style={styles.calendarMonthTitle}>
                {currentCalendarDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
              </Text>
              <View style={styles.calendarArrowsContainer}>
                <TouchableOpacity 
                  style={styles.calendarArrowBtn}
                  onPress={() => {
                    const prev = new Date(currentCalendarDate);
                    prev.setMonth(prev.getMonth() - 1);
                    const today = new Date();
                    if (prev.getFullYear() > today.getFullYear() || (prev.getFullYear() === today.getFullYear() && prev.getMonth() >= today.getMonth())) {
                      setCurrentCalendarDate(prev);
                    }
                  }}
                >
                  <Ionicons name="chevron-back" size={18} color={COLORS.brand} />
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.calendarArrowBtn}
                  onPress={() => {
                    const next = new Date(currentCalendarDate);
                    next.setMonth(next.getMonth() + 1);
                    setCurrentCalendarDate(next);
                  }}
                >
                  <Ionicons name="chevron-forward" size={18} color={COLORS.brand} />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.weekDaysRow}>
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => (
                <Text key={i} style={styles.weekDayText}>{d}</Text>
              ))}
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.daysGrid}>
                {(() => {
                  const year = currentCalendarDate.getFullYear();
                  const month = currentCalendarDate.getMonth();
                  const firstDayIndex = new Date(year, month, 1).getDay();
                  const totalDays = new Date(year, month + 1, 0).getDate();
                  const todayStr = getLocalDateString(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());

                  const cells = [];
                  for (let i = 0; i < firstDayIndex; i++) {
                    cells.push(<View key={`empty-${i}`} style={styles.dayCellEmpty} />);
                  }

                  for (let day = 1; day <= totalDays; day++) {
                    const dateStr = getLocalDateString(year, month, day);
                    const isPast = dateStr < todayStr;

                    const isStart = tempStartDate === dateStr;
                    const isEnd = tempEndDate === dateStr;
                    const isInRange = tempStartDate && tempEndDate && dateStr > tempStartDate && dateStr < tempEndDate;

                    cells.push(
                      <TouchableOpacity
                        key={dateStr}
                        disabled={isPast}
                        style={[
                          styles.dayCell,
                          isPast && styles.dayCellDisabled,
                          (isStart || isEnd) && styles.dayCellSelected,
                          isInRange && styles.dayCellInRange,
                        ]}
                        onPress={() => {
                          if (!tempStartDate || (tempStartDate && tempEndDate)) {
                            setTempStartDate(dateStr);
                            setTempEndDate(null);
                          } else if (tempStartDate && !tempEndDate) {
                            if (dateStr < tempStartDate) {
                              setTempStartDate(dateStr);
                            } else {
                              setTempEndDate(dateStr);
                            }
                          }
                        }}
                      >
                        <Text style={[
                          styles.dayCellText,
                          isPast && styles.dayCellTextDisabled,
                          (isStart || isEnd) && styles.dayCellTextSelected,
                        ]}>
                          {day}
                        </Text>
                      </TouchableOpacity>
                    );
                  }
                  return cells;
                })()}
              </View>
            </ScrollView>

            <View style={[styles.actionButtonsRow, { marginTop: 16 }]}>
              <TouchableOpacity 
                style={[styles.cancelButton, !tempStartDate && { opacity: 0.5, borderColor: COLORS.muted }]} 
                activeOpacity={0.85} 
                disabled={!tempStartDate}
                onPress={() => {
                  if (tempStartDate) {
                    setTempStartDate(null);
                    setTempEndDate(null);
                  }
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.saveButton, { opacity: (!tempStartDate || !tempEndDate) ? 0.5 : 1 }]} 
                activeOpacity={0.85} 
                disabled={!tempStartDate || !tempEndDate}
                onPress={() => {
                  if (tempStartDate && tempEndDate) {
                    setStartDate(tempStartDate);
                    setEndDate(tempEndDate);
                    setSelectedPeriod('custom');
                    setCustomModalVisible(false);
                  }
                }}
              >
                <Text style={styles.saveButtonText}>Save</Text>
              </TouchableOpacity>
            </View>

          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screenBg: {
    flex: 1,
    backgroundColor: COLORS.screenTeal,
  },
  whiteSheet: {
    flex: 1,
    backgroundColor: COLORS.softTint,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    overflow: 'hidden',
    marginTop: 33,
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
  },
  inlineBackButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: COLORS.pillBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  mainSubtitle: {
    fontSize: 13,
    color: COLORS.inkSoft,
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  selectMemberButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    backgroundColor: COLORS.surface,
    borderRadius: 24,
    gap: 10,
  },
  addCircleOutline: {
    width: 48,
    height: 48,
    borderRadius: 50,
    borderWidth: 2,
    borderColor: COLORS.brand,
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectMemberText: {
    color: COLORS.brand,
    fontWeight: '600',
    fontSize: 12,
  },
  selectedSpenderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    gap: 12,
  },
  avatarContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.softTint,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 20,
  },
  spenderName: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.brand,
  },
  spenderEmail: {
    fontSize: 12,
    color: COLORS.inkSoft,
  },
  removeButton: {
    padding: 7,
    backgroundColor: COLORS.dangerSoft,
    borderRadius: 10,
  },
  inputGroup: {
    gap: 8,
    marginTop: 18,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  pillInput: {
    backgroundColor: COLORS.surface,
    paddingHorizontal: 20,
    borderRadius: 30,
    height: 50,
    color: COLORS.brand,
    fontSize: 15,
    fontWeight: '500',
  },
  amountWrapper: {
    position: 'relative',
    justifyContent: 'center',
  },
  currencyPrefix: {
    position: 'absolute',
    left: 20,
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.brand,
    zIndex: 1,
  },
  amountInput: {
    paddingLeft: 36,
  },
  periodSelectorContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  periodPill: {
    flexBasis: '31%',
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
    marginBottom: 4,
  },
  periodPillActive: {
    backgroundColor: COLORS.brand,
  },
  periodPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.inkSoft,
    textAlign: 'center',
  },
  periodPillTextActive: {
    color: '#FFFFFF',
  },
  dateRangeIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    paddingHorizontal: 4,
  },
  dateRangeIndicatorText: {
    fontSize: 12,
    color: COLORS.inkSoft,
    fontWeight: '500',
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 32,
  },
  cancelButton: {
    backgroundColor: COLORS.pillBg,
    height: 56,
    paddingHorizontal: 24,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.muted,
  },
  cancelButtonText: {
    color: COLORS.brand,
    fontWeight: '700',
    fontSize: 15,
    letterSpacing: 0.2,
  },
  saveButton: {
    backgroundColor: COLORS.brand,
    height: 56,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  saveButtonText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 15,
    letterSpacing: 0.2,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingHorizontal: 24,
  },
  modalContent: {
    backgroundColor: COLORS.softTint,
    borderRadius: 32,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 24,
    width: '100%',
    maxHeight: '75%',
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.pillBg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    padding: 14,
    marginBottom: 10,
    gap: 12,
  },
  gridAvatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  avatarText: {
    fontWeight: '700',
    fontSize: 13,
  },
  gridMemberName: {
    fontSize: 15,
    fontWeight: '700',
  },
  gridMemberEmail: {
    fontSize: 11,
    color: COLORS.inkSoft,
    marginTop: 2,
  },
  gridStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  badgePending: {
    backgroundColor: COLORS.pendingSoft,
  },
  statusText: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.brand,
  },
  emptySubtitle: {
    fontSize: 13,
    color: COLORS.inkSoft,
    textAlign: 'center',
    marginTop: 4,
  },
  calendarNavRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  calendarMonthTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.brand,
  },
  calendarArrowsContainer: {
    flexDirection: 'row',
    backgroundColor: COLORS.pillBg,
    borderRadius: 14,
    padding: 2,
    gap: 4,
  },
  calendarArrowBtn: {
    width: 32,
    height: 32,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
  },
  weekDaysRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 8,
  },
  weekDayText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.muted,
    width: '14%',
    textAlign: 'center',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCellEmpty: {
    width: '14.28%',
    height: 40,
  },
  dayCell: {
    width: '14.28%',
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 2,
  },
  dayCellDisabled: {
    opacity: 0.3,
  },
  dayCellSelected: {
    backgroundColor: '#00f7ff',
    borderRadius: 30,
  },
  dayCellInRange: {
    backgroundColor: '#bafdff',
  },
  dayCellText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.brand,
  },
  dayCellTextDisabled: {
    color: COLORS.muted,
  },
  dayCellTextSelected: {
    color: COLORS.brand,
  },
  modalDivider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    width: '100%',
    marginBottom: 10,
  },
  bannerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    marginBottom: 4,
    gap: 10,
    borderWidth: 1,
  },
  bannerError: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FEE2E2',
  },
  bannerSuccess: {
    backgroundColor: '#ECFDF5',
    borderColor: '#D1FAE5',
  },
  bannerText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
  },
  bannerTextError: {
    color: '#991B1B',
  },
  bannerTextSuccess: {
    color: '#065F46',
  },
  bannerClose: {
    padding: 2,
  },
});