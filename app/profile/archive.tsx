import { theme } from '@/constants/theme';
import { archiveStyles as styles } from '@/constants/ui.styles';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Modal, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { GradientBackground } from '../../components/GradientBackground';
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
        return { bg: theme.colors.emerald50, border: theme.colors.emerald, text: theme.colors.emerald800, icon: 'checkmark-circle-outline' };
      case 'error':
        return { bg: theme.colors.dangerBg, border: theme.colors.dangerBright, text: theme.colors.dangerDeep, icon: 'alert-circle-outline' };
      case 'warning':
        return { bg: theme.colors.warningWash, border: theme.colors.amber, text: theme.colors.warningDeep, icon: 'warning-outline' };
      default:
        return { bg: theme.colors.greenBg, border: theme.colors.info, text: theme.colors.blueDeep, icon: 'information-circle-outline' };
    }
  };

  const currentAlertStyle = getAlertStyles(alertBanner.type);

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      
      <View style={styles.modernHeader}>
        <View style={styles.headerGradientFill}>
          <GradientBackground />
        </View>
        <TouchableOpacity 
          onPress={selectedItem ? handleBackToArchiveList : () => router.back()} 
          style={styles.backBtnTouchable}
        >
          <Ionicons name="arrow-back" size={20} color={theme.colors.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitleCentered} numberOfLines={1}>
          {selectedItem ? (selectedItem.allowance_name || selectedItem.source_name) : 'Archive Data'}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.sheet}>

      {/* Modern Inline Alert Banner */}
      {alertBanner.visible && (
        <View style={[styles.inlineAlertContainer, { backgroundColor: currentAlertStyle.bg, borderColor: currentAlertStyle.border }]}>
          <Ionicons name={currentAlertStyle.icon as any} size={18} color={currentAlertStyle.border} style={{ marginRight: theme.space[8] }} />
          <Text style={[styles.inlineAlertText, { color: currentAlertStyle.text }]}>{alertBanner.message}</Text>
          <TouchableOpacity onPress={() => setAlertBanner((prev) => ({ ...prev, visible: false }))} style={{ marginLeft: 'auto', padding: theme.space[2] }}>
            <Ionicons name="close" size={16} color={currentAlertStyle.text} />
          </TouchableOpacity>
        </View>
      )}

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={theme.colors.brandDark} />
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
                <Ionicons name="calendar-outline" size={12} color={theme.colors.textMuted} style={{ marginRight: theme.space[4] }} />
                <Text style={styles.cardDates}>
                  {formatDateRange(selectedItem.start_date, selectedItem.end_date)}
                </Text>
              </View>
            </View>

            <View style={styles.metricsGrid}>
              <View style={styles.metricBox}>
                <Text style={styles.metricTitle}>Total Spent</Text>
                <Text style={[styles.metricValue, { color: theme.colors.dangerBright }]}>₱{totalSpent.toLocaleString()}</Text>
              </View>
              <View style={styles.metricDivider} />
              <View style={styles.metricBox}>
                <Text style={styles.metricTitle}>Remaining</Text>
                <Text style={[styles.metricValue, { color: isOverBudget ? theme.colors.dangerBright : theme.colors.emerald }]}>
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
                      backgroundColor: isOverBudget ? theme.colors.dangerBright : theme.colors.emerald 
                    }
                  ]} 
                />
              </View>
            </View>
          </View>

          <Text style={styles.sectionHeader}>Associated Expenses</Text>
          
          {!loadingExpenses && expenses.length > 0 && (
            <View style={styles.searchContainer}>
              <Ionicons name="search" size={16} color={theme.colors.textSubtle} style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search description or category..."
                placeholderTextColor={theme.colors.textSubtle}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <Ionicons name="close-circle" size={16} color={theme.colors.textSubtle} />
                </TouchableOpacity>
              )}
            </View>
          )}

          {loadingExpenses ? (
            <ActivityIndicator size="small" color={theme.colors.brandDark} style={{ marginTop: theme.space[20] }} />
          ) : expenses.length === 0 ? (
            <View style={styles.emptyExpenses}>
              <Ionicons name="receipt-outline" size={32} color={theme.colors.borderStrong} style={{ marginBottom: theme.space[8] }} />
              <Text style={styles.subTitle}>No expenses recorded under this record.</Text>
            </View>
          ) : filteredExpenses.length === 0 ? (
            <View style={styles.emptyExpenses}>
              <Ionicons name="search-outline" size={32} color={theme.colors.borderStrong} style={{ marginBottom: theme.space[8] }} />
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
                const iconBgColor = category?.color || theme.colors.border;

                return (
                  <View style={styles.expenseItem}>
                    <View style={[styles.expenseIconContainer, { backgroundColor: iconBgColor }]}>
                      <Ionicons name={iconName} size={16} color={theme.colors.brandDark} />
                    </View>

                    <View style={{ flex: 1, marginRight: theme.space[12] }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
                        <Text style={styles.expenseDesc}>{item.description || 'No Description'}</Text>
                        {item.photo_url ? (
                          <TouchableOpacity 
                            onPress={() => setSelectedPhoto(item.photo_url)} 
                            style={styles.photoIconButton}
                          >
                            <Ionicons name="image-outline" size={14} color={theme.colors.tealDeep} />
                          </TouchableOpacity>
                        ) : null}
                      </View>
                      <Text style={styles.expenseDate}>{formatDateTimeString(item.spent_at)}</Text>
                    </View>
                    <Text style={styles.expenseAmount}>-₱{Number(item.amount).toLocaleString()}</Text>
                  </View>
                );
              }}
              contentContainerStyle={{ paddingBottom: theme.space[30] }}
            />
          )}
        </View>
      ) : inactiveItems.length === 0 ? (
        <View style={styles.centerContainer}>
          <View style={styles.iconCircle}>
            <Ionicons name="archive-outline" size={40} color={theme.colors.brandDark} />
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
                <View style={{ flex: 1, marginRight: theme.space[12] }}>
                  <Text style={styles.itemTitle}>{item.allowance_name || item.source_name}</Text>
                  <View style={styles.itemSubtitleRow}>
                    <Ionicons name="time-outline" size={12} color={theme.colors.textMuted} style={{ marginRight: theme.space[4] }} />
                    <Text style={styles.itemSubtitle}>
                      {formatDateRange(item.start_date, item.end_date)}
                    </Text>
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end', marginRight: theme.space[8] }}>
                  <Text style={styles.itemAmount}>₱{Number(item.amount).toLocaleString()}</Text>
                  <View style={styles.chevronRow}>
                    <Text style={styles.viewDetailsText}>View</Text>
                    <Ionicons name="chevron-forward" size={14} color={theme.colors.tealDeep} />
                  </View>
                </View>
              </TouchableOpacity>

              {/* Action Buttons Row */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[6] }}>
                {userRole !== 'Spender' && (
                  <TouchableOpacity 
                    style={styles.unarchiveBtn} 
                    onPress={() => confirmUnarchiveItem(item)}
                  >
                    <Ionicons name="arrow-undo-outline" size={16} color={theme.colors.tealDeep} />
                  </TouchableOpacity>
                )}

                {userRole !== 'Spender' && (
                  <TouchableOpacity 
                    style={styles.deleteBtn} 
                    onPress={() => confirmDeleteItem(item)}
                  >
                    <Ionicons name="trash-outline" size={16} color={theme.colors.dangerBright} />
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
              { backgroundColor: dialogConfig.type === 'delete' ? theme.colors.dangerBg : theme.colors.tealPale }
            ]}>
              <Ionicons 
                name={dialogConfig.type === 'delete' ? 'trash-outline' : 'arrow-undo-outline'} 
                size={24} 
                color={dialogConfig.type === 'delete' ? theme.colors.dangerBright : theme.colors.tealDeep} 
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
                  { backgroundColor: dialogConfig.type === 'delete' ? theme.colors.dangerBright : theme.colors.tealDeep }
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
            <Ionicons name="close" size={24} color={theme.colors.white} />
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
    </View>
  );
}