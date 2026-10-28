import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Modal, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { colors } from '../(spenderTabs)/profile';
import { supabase } from '../../lib/supabase';

export default function ArchiveScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [inactiveItems, setInactiveItems] = useState<any[]>([]);
  const [selectedItem, setSelectedItem] = useState<any | null>(null);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [loadingExpenses, setLoadingExpenses] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  
  // Search state for associated expenses
  const [searchQuery, setSearchQuery] = useState('');
  
  // Fullscreen photo modal state
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);

  // Modern Inline Alert Message State
  const [alertBanner, setAlertBanner] = useState<{
    visible: boolean;
    type: 'success' | 'error' | 'info' | 'warning';
    message: string;
  }>({
    visible: false,
    type: 'info',
    message: '',
  });

  // Modern Custom Action Dialog State (Now used strictly for destructive/restoration confirmation choices)
  const [dialogConfig, setDialogConfig] = useState<{
    visible: boolean;
    type: 'delete' | 'unarchive';
    title: string;
    message: string;
    itemToProcess: any | null;
  }>({
    visible: false,
    type: 'delete',
    title: '',
    message: '',
    itemToProcess: null,
  });

  useEffect(() => {
    fetchArchivedData();
  }, []);

  const showAlertBanner = (type: 'success' | 'error' | 'info' | 'warning', message: string, autoDismiss = true) => {
    setAlertBanner({ visible: true, type, message });
    if (autoDismiss) {
      setTimeout(() => {
        setAlertBanner((prev) => ({ ...prev, visible: false }));
      }, 4000);
    }
  };

  const fetchArchivedData = async () => {
    try {
      setLoading(true);
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) return;

      setCurrentUserId(user.id);

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (profileError || !profile) return;
      setUserRole(profile.role);

      const today = new Date().toISOString().split('T')[0];

      if (profile.role === 'Personal') {
        const { data: income, error } = await supabase
          .from('income')
          .select('*')
          .eq('user_id', user.id)
          .eq('is_archived', true)
          .order('end_date', { ascending: false });

        if (!error) setInactiveItems(income || []);
      } else {
        const { data: allowances, error } = await supabase
          .from('allowances')
          .select('*')
          .or(`spender_id.eq.${user.id},sponsor_id.eq.${user.id}`)
          .eq('is_archived', true)
          .order('end_date', { ascending: false });

        if (!error) setInactiveItems(allowances || []);
      }
    } catch (err) {
      console.error('Error fetching archive:', err);
      showAlertBanner('error', 'Failed to load archive data.');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectItem = async (item: any) => {
    setSelectedItem(item);
    setLoadingExpenses(true);
    setSearchQuery('');

    let query = supabase
      .from('expenses')
      .select(`
        *,
        categories (
          name,
          icon,
          color
        )
      `);

    if (item.allowance_name) {
      query = query.eq('allowance_id', item.id);
    } else if (item.source_name) {
      query = query.eq('income_id', item.id);
    }

    const { data, error } = await query.order('spent_at', { ascending: false });

    if (!error) {
      setExpenses(data || []);
    } else {
      console.error('Error fetching expenses with category:', error.message);
      showAlertBanner('error', 'Could not load associated expenses.');
    }
    setLoadingExpenses(false);
  };

  const confirmDeleteItem = (item: any) => {
    const itemName = item.allowance_name || item.source_name;
    setDialogConfig({
      visible: true,
      type: 'delete',
      title: 'Delete Record',
      message: `Are you sure you want to delete "${itemName}"? This action is permanent and cannot be undone.`,
      itemToProcess: item,
    });
  };

  const confirmUnarchiveItem = (item: any) => {
    const itemName = item.allowance_name || item.source_name;
    setDialogConfig({
      visible: true,
      type: 'unarchive',
      title: 'Restore Record',
      message: `Do you want to restore "${itemName}" back to active records?`,
      itemToProcess: item,
    });
  };

  const handleExecuteDialogAction = async () => {
    const { type, itemToProcess } = dialogConfig;
    if (!itemToProcess) return;

    try {
      const itemName = itemToProcess.allowance_name || itemToProcess.source_name;
      const isIncome = !!itemToProcess.source_name;
      const tableName = isIncome ? 'income' : 'allowances';

      if (type === 'delete') {
        const { error } = await supabase
          .from(tableName)
          .delete()
          .eq('id', itemToProcess.id);

        if (error) {
          showAlertBanner('error', error.message);
        } else {
          if (currentUserId) {
            await supabase.from('logs').insert({
              user_id: currentUserId,
              details: `deleted archived record "${itemName}" (${tableName}).`,
            });
          }

          setInactiveItems((prev) => prev.filter((i) => i.id !== itemToProcess.id));
          closeDialog();
          showAlertBanner('success', `Successfully deleted "${itemName}".`);
        }
      } else if (type === 'unarchive') {
        const { error } = await supabase
          .from(tableName)
          .update({ is_archived: false })
          .eq('id', itemToProcess.id);

        if (error) {
          showAlertBanner('error', error.message);
        } else {
          if (currentUserId) {
            await supabase.from('logs').insert({
              user_id: currentUserId,
              details: `restored record "${itemName}" from archive.`,
            });
          }

          setInactiveItems((prev) => prev.filter((i) => i.id !== itemToProcess.id));
          closeDialog();
          showAlertBanner('success', `Successfully restored "${itemName}" to active records.`);
        }
      }
    } catch (err) {
      console.error('Error executing dialog action:', err);
      showAlertBanner('error', 'An unexpected error occurred while processing your request.');
    }
  };

  const closeDialog = () => {
    setDialogConfig({
      visible: false,
      type: 'delete',
      title: '',
      message: '',
      itemToProcess: null,
    });
  };

  const handleBackToArchiveList = () => {
    setSelectedItem(null);
    setExpenses([]);
    setSearchQuery('');
  };

  const formatDateString = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      const [year, month, day] = dateStr.split('-');
      const date = new Date(Number(year), Number(month) - 1, Number(day));
      return date.toLocaleDateString('en-US', {
        month: 'long',
        day: '2-digit',
        year: 'numeric',
      });
    } catch (e) {
      return dateStr;
    }
  };

  const formatDateTimeString = (dateString: string) => {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return dateString;

      const formattedDate = date.toLocaleDateString('en-US', {
        month: 'long',
        day: '2-digit',
        year: 'numeric',
      });
      const formattedTime = date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });

      return `${formattedDate} • ${formattedTime}`;
    } catch (e) {
      return dateString;
    }
  };

  const formatDateRange = (startDateStr: string, endDateStr: string) => {
    if (!startDateStr || !endDateStr) return '';
    try {
      if (startDateStr === endDateStr) {
        return formatDateString(startDateStr);
      }

      const [startYear, startMonth, startDay] = startDateStr.split('-');
      const [endYear, endMonth, endDay] = endDateStr.split('-');

      const startDate = new Date(Number(startYear), Number(startMonth) - 1, Number(startDay));
      const endDate = new Date(Number(endYear), Number(endMonth) - 1, Number(endDay));

      const startMonthName = startDate.toLocaleDateString('en-US', { month: 'long' });
      const endMonthName = endDate.toLocaleDateString('en-US', { month: 'long' });

      if (startYear === endYear && startMonth === endMonth) {
        return `${startMonthName} ${startDay} - ${endDay}, ${startYear}`;
      } else if (startYear === endYear) {
        return `${startMonthName} ${startDay} - ${endMonthName} ${endDay}, ${startYear}`;
      } else {
        return `${formatDateString(startDateStr)} - ${formatDateString(endDateStr)}`;
      }
    } catch (e) {
      return `${startDateStr} → ${endDateStr}`;
    }
  };

  const totalSpent = expenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const totalAmount = Number(selectedItem?.amount || 0);
  const totalRemaining = totalAmount - totalSpent;
  
  const remainingRatio = totalAmount > 0 ? Math.max(0, Math.min(totalRemaining / totalAmount, 1)) : 0;
  const isOverBudget = totalSpent > totalAmount;

  const filteredExpenses = expenses.filter((item) => {
    const desc = item.description?.toLowerCase() || '';
    const categoryName = item.categories?.name?.toLowerCase() || '';
    const query = searchQuery.toLowerCase();
    return desc.includes(query) || categoryName.includes(query);
  });

  const getAlertStyles = (type: string) => {
    switch (type) {
      case 'success':
        return { bg: '#ecfdf5', border: '#10b981', text: '#065f46', icon: 'checkmark-circle-outline' };
      case 'error':
        return { bg: '#fef2f2', border: '#ef4444', text: '#991b1b', icon: 'alert-circle-outline' };
      case 'warning':
        return { bg: '#fffbeb', border: '#f59e0b', text: '#92400e', icon: 'warning-outline' };
      default:
        return { bg: '#f0fdf4', border: '#3b82f6', text: '#1e40af', icon: 'information-circle-outline' };
    }
  };

  const currentAlertStyle = getAlertStyles(alertBanner.type);

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      
      <View style={styles.modernHeader}>
        <TouchableOpacity 
          onPress={selectedItem ? handleBackToArchiveList : () => router.back()} 
          style={styles.backBtnTouchable}
        >
          <Ionicons name="arrow-back" size={20} color="#ffffff" />
        </TouchableOpacity>
        <Text style={styles.headerTitleCentered} numberOfLines={1}>
          {selectedItem ? (selectedItem.allowance_name || selectedItem.source_name) : 'Archive Data'}
        </Text>
        <View style={{ width: 20 }} />
      </View>

      {/* Modern Inline Alert Banner */}
      {alertBanner.visible && (
        <View style={[styles.inlineAlertContainer, { backgroundColor: currentAlertStyle.bg, borderColor: currentAlertStyle.border }]}>
          <Ionicons name={currentAlertStyle.icon as any} size={18} color={currentAlertStyle.border} style={{ marginRight: 8 }} />
          <Text style={[styles.inlineAlertText, { color: currentAlertStyle.text }]}>{alertBanner.message}</Text>
          <TouchableOpacity onPress={() => setAlertBanner((prev) => ({ ...prev, visible: false }))} style={{ marginLeft: 'auto', padding: 2 }}>
            <Ionicons name="close" size={16} color={currentAlertStyle.text} />
          </TouchableOpacity>
        </View>
      )}

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#173D45" />
        </View>
      ) : selectedItem ? (
        <View style={styles.detailContainer}>
          
          <View style={styles.cardDetail}>
            <View style={styles.cardTopRow}>
              <View>
                <Text style={styles.cardLabel}>Total Allocation</Text>
                <Text style={styles.cardAmount}>₱{totalAmount.toLocaleString()}</Text>
              </View>
              <View style={styles.validityBadge}>
                <Ionicons name="calendar-outline" size={12} color="#64748b" style={{ marginRight: 4 }} />
                <Text style={styles.cardDates}>
                  {formatDateRange(selectedItem.start_date, selectedItem.end_date)}
                </Text>
              </View>
            </View>

            <View style={styles.metricsGrid}>
              <View style={styles.metricBox}>
                <Text style={styles.metricTitle}>Total Spent</Text>
                <Text style={[styles.metricValue, { color: '#ef4444' }]}>₱{totalSpent.toLocaleString()}</Text>
              </View>
              <View style={styles.metricDivider} />
              <View style={styles.metricBox}>
                <Text style={styles.metricTitle}>Remaining</Text>
                <Text style={[styles.metricValue, { color: isOverBudget ? '#ef4444' : '#10b981' }]}>
                  ₱{totalRemaining.toLocaleString()}
                </Text>
              </View>
            </View>

            <View style={styles.progressSection}>
              <View style={styles.progressHeaderRow}>
                <Text style={styles.progressLabel}>Remaining</Text>
                <Text style={styles.progressPercent}>{(remainingRatio * 100).toFixed(0)}%</Text>
              </View>
              <View style={styles.progressBarBackground}>
                <View 
                  style={[
                    styles.progressBarFill, 
                    { 
                      width: `${remainingRatio * 100}%`,
                      backgroundColor: isOverBudget ? '#ef4444' : '#10b981' 
                    }
                  ]} 
                />
              </View>
            </View>
          </View>

          <Text style={styles.sectionHeader}>Associated Expenses</Text>
          
          {!loadingExpenses && expenses.length > 0 && (
            <View style={styles.searchContainer}>
              <Ionicons name="search" size={16} color="#94a3b8" style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search description or category..."
                placeholderTextColor="#94a3b8"
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <Ionicons name="close-circle" size={16} color="#94a3b8" />
                </TouchableOpacity>
              )}
            </View>
          )}

          {loadingExpenses ? (
            <ActivityIndicator size="small" color="#173D45" style={{ marginTop: 20 }} />
          ) : expenses.length === 0 ? (
            <View style={styles.emptyExpenses}>
              <Ionicons name="receipt-outline" size={32} color="#cbd5e1" style={{ marginBottom: 8 }} />
              <Text style={styles.subTitle}>No expenses recorded under this record.</Text>
            </View>
          ) : filteredExpenses.length === 0 ? (
            <View style={styles.emptyExpenses}>
              <Ionicons name="search-outline" size={32} color="#cbd5e1" style={{ marginBottom: 8 }} />
              <Text style={styles.subTitle}>No matching expenses found.</Text>
            </View>
          ) : (
            <FlatList
              data={filteredExpenses}
              keyExtractor={(item) => item.id}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => {
                const category = item.categories;
                const iconName = (category?.icon || 'pricetag-outline') as any;
                const iconBgColor = category?.color || '#e2e8f0';

                return (
                  <View style={styles.expenseItem}>
                    <View style={[styles.expenseIconContainer, { backgroundColor: iconBgColor }]}>
                      <Ionicons name={iconName} size={16} color="#173D45" />
                    </View>

                    <View style={{ flex: 1, marginRight: 12 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
                        <Text style={styles.expenseDesc}>{item.description || 'No Description'}</Text>
                        {item.photo_url ? (
                          <TouchableOpacity 
                            onPress={() => setSelectedPhoto(item.photo_url)} 
                            style={styles.photoIconButton}
                          >
                            <Ionicons name="image-outline" size={14} color="#0f766e" />
                          </TouchableOpacity>
                        ) : null}
                      </View>
                      <Text style={styles.expenseDate}>{formatDateTimeString(item.spent_at)}</Text>
                    </View>
                    <Text style={styles.expenseAmount}>-₱{Number(item.amount).toLocaleString()}</Text>
                  </View>
                );
              }}
              contentContainerStyle={{ paddingBottom: 30 }}
            />
          )}
        </View>
      ) : inactiveItems.length === 0 ? (
        <View style={styles.centerContainer}>
          <View style={styles.iconCircle}>
            <Ionicons name="archive-outline" size={40} color="#173D45" />
          </View>
          <Text style={styles.mainTitle}>Archive Empty</Text>
          <Text style={styles.subTitle}>You have no inactive records at this moment.</Text>
        </View>
      ) : (
        <FlatList
          data={inactiveItems}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContainer}
          renderItem={({ item }) => (
            <View style={styles.archiveCard}>
              <TouchableOpacity style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }} onPress={() => handleSelectItem(item)}>
                <View style={{ flex: 1, marginRight: 12 }}>
                  <Text style={styles.itemTitle}>{item.allowance_name || item.source_name}</Text>
                  <View style={styles.itemSubtitleRow}>
                    <Ionicons name="time-outline" size={12} color="#64748B" style={{ marginRight: 4 }} />
                    <Text style={styles.itemSubtitle}>
                      {formatDateRange(item.start_date, item.end_date)}
                    </Text>
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end', marginRight: 8 }}>
                  <Text style={styles.itemAmount}>₱{Number(item.amount).toLocaleString()}</Text>
                  <View style={styles.chevronRow}>
                    <Text style={styles.viewDetailsText}>View</Text>
                    <Ionicons name="chevron-forward" size={14} color="#0f766e" />
                  </View>
                </View>
              </TouchableOpacity>

              {/* Action Buttons Row */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                {userRole !== 'Spender' && (
                  <TouchableOpacity 
                    style={styles.unarchiveBtn} 
                    onPress={() => confirmUnarchiveItem(item)}
                  >
                    <Ionicons name="arrow-undo-outline" size={16} color="#0f766e" />
                  </TouchableOpacity>
                )}

                {userRole !== 'Spender' && (
                  <TouchableOpacity 
                    style={styles.deleteBtn} 
                    onPress={() => confirmDeleteItem(item)}
                  >
                    <Ionicons name="trash-outline" size={16} color="#ef4444" />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}
        />
      )}

      {/* Confirmation Modal */}
      <Modal visible={dialogConfig.visible} transparent={true} animationType="fade">
        <View style={styles.dialogOverlay}>
          <View style={styles.dialogContainer}>
            <View style={[
              styles.dialogIconContainer, 
              { backgroundColor: dialogConfig.type === 'delete' ? '#fef2f2' : '#e6f4f1' }
            ]}>
              <Ionicons 
                name={dialogConfig.type === 'delete' ? 'trash-outline' : 'arrow-undo-outline'} 
                size={24} 
                color={dialogConfig.type === 'delete' ? '#ef4444' : '#0f766e'} 
              />
            </View>

            <Text style={styles.dialogTitle}>{dialogConfig.title}</Text>
            <Text style={styles.dialogMessage}>{dialogConfig.message}</Text>

            <View style={styles.dialogButtonRow}>
              <TouchableOpacity style={styles.dialogCancelButton} onPress={closeDialog}>
                <Text style={styles.dialogCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[
                  styles.dialogConfirmButton, 
                  { backgroundColor: dialogConfig.type === 'delete' ? '#ef4444' : '#0f766e' }
                ]} 
                onPress={handleExecuteDialogAction}
              >
                <Text style={styles.dialogConfirmText}>
                  {dialogConfig.type === 'delete' ? 'Delete' : 'Restore'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Fullscreen Photo Modal */}
      <Modal visible={!!selectedPhoto} transparent={true} animationType="fade">
        <View style={styles.modalBackground}>
          <TouchableOpacity 
            style={styles.closeButtonContainer} 
            onPress={() => setSelectedPhoto(null)}
          >
            <Ionicons name="close" size={24} color="#ffffff" />
          </TouchableOpacity>
          {selectedPhoto && (
            <Image 
              source={{ uri: selectedPhoto }} 
              style={styles.fullscreenImage} 
              resizeMode="contain" 
            />
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#f8fafc',
  },
  modernHeader: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'android' ? 44 : 20,
    paddingBottom: 20,
    backgroundColor: colors.headerDark,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },
  inlineAlertContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  inlineAlertText: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  backBtnTouchable: { 
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center'
  },
  headerTitleCentered: { 
    flex: 1, 
    textAlign: 'center', 
    fontSize: 17, 
    fontWeight: '700', 
    color: '#ffffff', 
    marginHorizontal: 12,
  },
  centerContainer: { 
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center', 
    paddingHorizontal: 40 
  },
  iconCircle: { 
    width: 80, 
    height: 80, 
    borderRadius: 24, 
    backgroundColor: '#EBF6F5', 
    justifyContent: 'center', 
    alignItems: 'center', 
    marginBottom: 20 
  },
  mainTitle: { 
    fontSize: 18, 
    fontWeight: '700', 
    color: '#1E293B', 
    marginBottom: 8 
  },
  subTitle: { 
    fontSize: 14, 
    color: '#64748B', 
    textAlign: 'center', 
    lineHeight: 22 
  },
  listContainer: {
    padding: 20,
  },
  archiveCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    borderWidth: 3,
    borderColor: '#f1f5f9',
  },
  unarchiveBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#e6f4f1',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ccebe6',
  },
  deleteBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#fef2f2',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#fee2e2',
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 4,
  },
  itemSubtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  itemSubtitle: {
    fontSize: 11,
    color: '#64748B',
  },
  itemAmount: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f766e',
    marginBottom: 4,
  },
  chevronRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  viewDetailsText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#0f766e',
    marginRight: 2,
  },
  detailContainer: {
    flex: 1,
    padding: 20,
  },
  cardDetail: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 20,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 1,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  cardLabel: {
    fontSize: 12,
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  cardAmount: {
    fontSize: 26,
    fontWeight: '800',
    color: '#1e293b',
  },
  validityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    maxWidth: '55%',
  },
  cardDates: {
    fontSize: 10,
    color: '#475569',
    fontWeight: '500',
    flexShrink: 1,
  },
  metricsGrid: {
    flexDirection: 'row',
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    paddingVertical: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  metricBox: {
    flex: 1,
    alignItems: 'center',
  },
  metricDivider: {
    width: 1,
    backgroundColor: '#e2e8f0',
  },
  metricTitle: {
    fontSize: 11,
    color: '#64748b',
    marginBottom: 2,
    fontWeight: '500',
  },
  metricValue: {
    fontSize: 15,
    fontWeight: '700',
  },
  progressSection: {
    marginTop: 4,
  },
  progressHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  progressLabel: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
  },
  progressPercent: {
    fontSize: 12,
    color: '#1e293b',
    fontWeight: '700',
  },
  progressBarBackground: {
    height: 8,
    backgroundColor: '#f1f5f9',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  sectionHeader: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 12,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 10 : 4,
    marginBottom: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#1e293b',
  },
  emptyExpenses: {
    marginTop: 40,
    alignItems: 'center',
  },
  expenseItem: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  expenseIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  expenseDesc: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 2,
    marginRight: 6,
  },
  photoIconButton: {
    padding: 4,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#e6f4f1',
    borderRadius: 6,
    marginBottom: 2,
  },
  expenseDate: {
    fontSize: 11,
    color: '#94a3b8',
  },
  expenseAmount: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ef4444',
  },
  // Custom Dialog Modal Styles (Reserved strictly for confirmations)
  dialogOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  dialogContainer: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 5,
  },
  dialogIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  dialogTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 8,
    textAlign: 'center',
  },
  dialogMessage: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  dialogButtonRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  dialogCancelButton: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  dialogCancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
  },
  dialogConfirmButton: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  dialogConfirmText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  modalBackground: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonContainer: {
    position: 'absolute',
    top: 50,
    right: 25,
    zIndex: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 20,
    padding: 8,
  },
  fullscreenImage: {
    width: '90%',
    height: '80%',
  },
});