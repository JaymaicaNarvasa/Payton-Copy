// app/(...)/archive.tsx
// Built ONLY from existing exports of constants/ui.styles.ts:
//   profileStyles (gradient header + mint sheet), incomeStyles (cards, banners, empty state, buttons),
//   monitoringStyles (search, transaction rows, progress bar, photo viewer). Confirm dialog = PaytonAlertDialog.
// All Supabase / business logic below is unchanged.
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Modal, Text, TextInput, TouchableOpacity, View } from 'react-native';

import GradientBackground from '../../components/GradientBackground';
import { PaytonAlertDialog } from '../../components/PaytonAlert';
import { theme } from '../../constants/theme';
import { incomeStyles, monitoringStyles, profileStyles } from '../../constants/ui.styles';
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

  // Inline alert banner state
  const [alertBanner, setAlertBanner] = useState<{
    visible: boolean;
    type: 'success' | 'error' | 'info' | 'warning';
    message: string;
  }>({
    visible: false,
    type: 'info',
    message: '',
  });

  // Confirmation dialog state (delete / restore) -> rendered with PaytonAlertDialog
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

  // Banner look per type, built from the shared theme tokens / incomeStyles banners
  const getBannerLook = (type: string) => {
    switch (type) {
      case 'success':
        return { box: incomeStyles.bannerSuccess, text: incomeStyles.bannerTextSuccess, color: theme.colors.green, icon: 'checkmark-circle-outline' };
      case 'error':
        return { box: incomeStyles.bannerError, text: incomeStyles.bannerTextError, color: theme.colors.danger, icon: 'alert-circle-outline' };
      case 'warning':
        return {
          box: { backgroundColor: theme.colors.warningBg, borderColor: theme.colors.warningBorder },
          text: { color: theme.colors.warningDeep },
          color: theme.colors.warningMid,
          icon: 'warning-outline',
        };
      default:
        return {
          box: { backgroundColor: theme.colors.accentTint, borderColor: theme.colors.accentSoft },
          text: { color: theme.colors.brand },
          color: theme.colors.accent,
          icon: 'information-circle-outline',
        };
    }
  };

  const bannerLook = getBannerLook(alertBanner.type);

  /* ---------- Detail view pieces ---------- */
  const detailHeader = selectedItem ? (
    <View>
      <View style={incomeStyles.incomeCard}>
        <View style={incomeStyles.cardHeaderRow}>
          <View style={incomeStyles.titleWrapper}>
            <Text style={incomeStyles.dateText}>Total Allocation</Text>
            <Text style={[incomeStyles.amountText, { fontSize: theme.fontSize.display, color: theme.colors.brandInk }]}>
              ₱{totalAmount.toLocaleString()}
            </Text>
          </View>
        </View>

        <View style={[incomeStyles.previewDateBox, { marginTop: theme.space[12] }]}>
          <Ionicons name="calendar-outline" size={14} color={theme.colors.brand} />
          <Text style={incomeStyles.previewDateText} numberOfLines={1}>
            {formatDateRange(selectedItem.start_date, selectedItem.end_date)}
          </Text>
        </View>

        <View style={incomeStyles.cardDivider} />

        <View style={incomeStyles.cardFooterRow}>
          <View style={[incomeStyles.amountContainer, { alignItems: 'flex-start' }]}>
            <Text style={incomeStyles.dateText}>Total Spent</Text>
            <Text style={[incomeStyles.amountText, { color: theme.colors.danger }]}>₱{totalSpent.toLocaleString()}</Text>
          </View>
          <View style={incomeStyles.amountContainer}>
            <Text style={incomeStyles.dateText}>Remaining</Text>
            <Text style={[incomeStyles.amountText, { color: isOverBudget ? theme.colors.danger : theme.colors.success }]}>
              ₱{totalRemaining.toLocaleString()}
            </Text>
          </View>
        </View>

        <View style={monitoringStyles.heroTrack}>
          <View
            style={[
              monitoringStyles.heroFill,
              {
                width: `${remainingRatio * 100}%`,
                backgroundColor: isOverBudget ? theme.colors.danger : theme.colors.progressFill,
              },
            ]}
          />
        </View>
        <Text style={[incomeStyles.dateText, { textAlign: 'center', marginTop: theme.space[8] }]}>
          {(remainingRatio * 100).toFixed(0)}% remaining
        </Text>
      </View>

      <Text style={[incomeStyles.sectionTitle, { marginTop: theme.space[8], marginBottom: theme.space[12] }]}>
        Associated Expenses
      </Text>

      {!loadingExpenses && expenses.length > 0 && (
        <View style={monitoringStyles.searchContainer}>
          <Ionicons name="search" size={16} color={theme.colors.textSubtle} />
          <TextInput
            style={monitoringStyles.searchInput}
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
    </View>
  ) : null;

  const detailEmpty = loadingExpenses ? (
    <ActivityIndicator size="small" color={theme.colors.brandDark} style={{ marginTop: theme.space[20] }} />
  ) : (
    <View style={incomeStyles.emptyContainer}>
      <View style={incomeStyles.emptyIconBox}>
        <Ionicons name={expenses.length === 0 ? 'receipt-outline' : 'search-outline'} size={26} color={theme.colors.brand} />
      </View>
      <Text style={incomeStyles.emptyText}>
        {expenses.length === 0 ? 'No expenses recorded under this record.' : 'No matching expenses found.'}
      </Text>
    </View>
  );

  return (
    <View style={profileStyles.container}>
      <StatusBar style="light" />

      {/* Gradient header (same as Profile / About) */}
      <View style={profileStyles.modernHeader}>
        <View style={profileStyles.headerGradientFill} pointerEvents="none">
          <GradientBackground />
        </View>
        <TouchableOpacity
          onPress={selectedItem ? handleBackToArchiveList : () => router.back()}
          style={profileStyles.backBtnTouchable}
          hitSlop={12}
        >
          <Ionicons name="chevron-back" size={22} color={theme.colors.white} />
        </TouchableOpacity>
        <Text style={profileStyles.headerTitleCentered} numberOfLines={1}>
          {selectedItem ? (selectedItem.allowance_name || selectedItem.source_name) : 'Archive Data'}
        </Text>
        <View style={profileStyles.backBtnTouchable} />
      </View>

      {/* Mint sheet over the gradient */}
      <View style={profileStyles.sheet}>
        {/* Inline alert banner */}
        {alertBanner.visible && (
          <View style={profileStyles.modernCardGroup}>
            <View style={[incomeStyles.inlineBanner, bannerLook.box]}>
              <Ionicons name={bannerLook.icon as any} size={18} color={bannerLook.color} />
              <Text style={[incomeStyles.bannerText, bannerLook.text]}>{alertBanner.message}</Text>
              <TouchableOpacity onPress={() => setAlertBanner((prev) => ({ ...prev, visible: false }))} hitSlop={8}>
                <Ionicons name="close" size={16} color={bannerLook.color} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {loading ? (
          <View style={profileStyles.centerLoading}>
            <ActivityIndicator size="large" color={theme.colors.brandDark} />
          </View>
        ) : selectedItem ? (
          <FlatList
            data={loadingExpenses ? [] : filteredExpenses}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={monitoringStyles.listContent}
            ListHeaderComponent={detailHeader}
            ListEmptyComponent={detailEmpty}
            renderItem={({ item }) => {
              const category = item.categories;
              const iconName = (category?.icon || 'pricetag-outline') as any;
              const iconBgColor = category?.color || theme.colors.border;

              return (
                <View style={monitoringStyles.txRow}>
                  <View style={[monitoringStyles.txIconBox, { backgroundColor: iconBgColor }]}>
                    <Ionicons name={iconName} size={18} color={theme.colors.brandDark} />
                  </View>

                  <View style={monitoringStyles.txBody}>
                    <View style={monitoringStyles.txNameRow}>
                      <Text style={monitoringStyles.txName} numberOfLines={1}>
                        {item.description || 'No Description'}
                      </Text>
                      {item.photo_url ? (
                        <TouchableOpacity onPress={() => setSelectedPhoto(item.photo_url)} style={monitoringStyles.photoBadge}>
                          <Ionicons name="image-outline" size={13} color={theme.colors.mintPillText} />
                        </TouchableOpacity>
                      ) : null}
                    </View>
                    <Text style={monitoringStyles.txMeta}>{formatDateTimeString(item.spent_at)}</Text>
                  </View>
                  <Text style={monitoringStyles.txAmount}>-₱{Number(item.amount).toLocaleString()}</Text>
                </View>
              );
            }}
          />
        ) : inactiveItems.length === 0 ? (
          <View style={[profileStyles.centerLoading, { paddingHorizontal: theme.space[24] }]}>
            <View style={[incomeStyles.emptyContainer, { alignSelf: 'stretch' }]}>
              <View style={incomeStyles.emptyIconBox}>
                <Ionicons name="archive-outline" size={26} color={theme.colors.brand} />
              </View>
              <Text style={incomeStyles.emptyTitle}>Archive Empty</Text>
              <Text style={incomeStyles.emptyText}>You have no inactive records at this moment.</Text>
            </View>
          </View>
        ) : (
          <FlatList
            data={inactiveItems}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={monitoringStyles.listContent}
            renderItem={({ item }) => (
              <View style={incomeStyles.incomeCard}>
                <TouchableOpacity activeOpacity={0.7} onPress={() => handleSelectItem(item)}>
                  <View style={incomeStyles.cardHeaderRow}>
                    <View style={incomeStyles.cardHeaderLeft}>
                      <View style={incomeStyles.statusBadge}>
                        <Ionicons name="archive-outline" size={20} color={theme.colors.success} />
                      </View>
                      <View style={incomeStyles.titleWrapper}>
                        <Text style={incomeStyles.sourceText} numberOfLines={1}>
                          {item.allowance_name || item.source_name}
                        </Text>
                      </View>
                    </View>
                    <View style={incomeStyles.amountContainer}>
                      <Text style={incomeStyles.amountText}>₱{Number(item.amount).toLocaleString()}</Text>
                    </View>
                  </View>
                </TouchableOpacity>

                <View style={incomeStyles.cardDivider} />

                <View style={incomeStyles.cardFooterRow}>
                  <View style={incomeStyles.dateContainer}>
                    <Ionicons name="time-outline" size={12} color={theme.colors.textMuted} />
                    <Text style={incomeStyles.dateText} numberOfLines={1}>
                      {formatDateRange(item.start_date, item.end_date)}
                    </Text>
                  </View>

                  <View style={incomeStyles.actionButtonsRow}>
                    <TouchableOpacity
                      style={[incomeStyles.actionButton, incomeStyles.archiveButtonBorder]}
                      onPress={() => handleSelectItem(item)}
                    >
                      <Ionicons name="chevron-forward" size={16} color={theme.colors.brand} />
                    </TouchableOpacity>

                    {userRole !== 'Spender' && (
                      <TouchableOpacity
                        style={[incomeStyles.actionButton, incomeStyles.archiveButtonBorder]}
                        onPress={() => confirmUnarchiveItem(item)}
                      >
                        <Ionicons name="arrow-undo-outline" size={16} color={theme.colors.brand} />
                      </TouchableOpacity>
                    )}

                    {userRole !== 'Spender' && (
                      <TouchableOpacity
                        style={[incomeStyles.actionButton, incomeStyles.deleteButtonBorder]}
                        onPress={() => confirmDeleteItem(item)}
                      >
                        <Ionicons name="trash-outline" size={16} color={theme.colors.danger} />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </View>
            )}
          />
        )}
      </View>

      {/* Delete / Restore confirmation (shared PaytonAlertDialog, local-state API) */}
      <PaytonAlertDialog
        visible={dialogConfig.visible}
        title={dialogConfig.title}
        message={dialogConfig.message}
        type={dialogConfig.type === 'delete' ? 'error' : 'info'}
        buttons={[
          { text: 'Cancel', style: 'cancel', onPress: closeDialog },
          {
            text: dialogConfig.type === 'delete' ? 'Delete' : 'Restore',
            style: dialogConfig.type === 'delete' ? 'destructive' : 'default',
            onPress: handleExecuteDialogAction,
          },
        ]}
        onDismiss={closeDialog}
      />

      {/* Fullscreen photo viewer */}
      <Modal visible={!!selectedPhoto} transparent animationType="fade" onRequestClose={() => setSelectedPhoto(null)}>
        <View style={monitoringStyles.imageOverlay}>
          <TouchableOpacity style={monitoringStyles.closeImageButton} onPress={() => setSelectedPhoto(null)}>
            <Ionicons name="close" size={24} color={theme.colors.white} />
          </TouchableOpacity>
          {selectedPhoto && (
            <Image source={{ uri: selectedPhoto }} style={monitoringStyles.fullScreenImage} resizeMode="contain" />
          )}
        </View>
      </Modal>
    </View>
  );
}