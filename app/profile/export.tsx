// app/profile/export.tsx
// Built ONLY from existing exports of constants/ui.styles.ts:
//   profileStyles (gradient header + mint sheet), incomeStyles (card, option rows, badges, empty text),
//   resetPasswordStyles (primary button). Messages are shown with the shared PaytonAlertDialog.
// All Supabase / CSV / sharing logic below is unchanged.
import { Ionicons } from '@expo/vector-icons';
import { File, Paths } from 'expo-file-system';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native';

import GradientBackground from '../../components/GradientBackground';
import { AlertType, PaytonAlertDialog } from '../../components/PaytonAlert';
import { theme } from '../../constants/theme';
import { incomeStyles, profileStyles, resetPasswordStyles } from '../../constants/ui.styles';
import { supabase } from '../../lib/supabase';

export default function ExportScreen() {
  const router = useRouter();
  const [isExporting, setIsExporting] = useState(false);
  const [loadingMeta, setLoadingMeta] = useState(true);

  const [userRole, setUserRole] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  // Sponsor-specific states
  const [linkedSpenders, setLinkedSpenders] = useState<any[]>([]);
  const [selectedSpenderId, setSelectedSpenderId] = useState<string | null>(null);
  const [loadingAllowances, setLoadingAllowances] = useState(false);

  const [allowanceOptions, setAllowanceOptions] = useState<any[]>([]);
  const [selectedAllowanceId, setSelectedAllowanceId] = useState<string | null>(null);

  const [incomePeriods, setIncomePeriods] = useState<any[]>([]);
  const [selectedIncomeId, setSelectedIncomeId] = useState<string | null>(null);

  // Shared alert dialog (local-state API) - replaces the old inline banner
  const [alert, setAlert] = useState<{ visible: boolean; type: AlertType; title: string; message: string }>({
    visible: false,
    type: 'info',
    title: '',
    message: '',
  });

  const showAlert = (type: AlertType, title: string, message: string) =>
    setAlert({ visible: true, type, title, message });
  const hideAlert = () => setAlert((prev) => ({ ...prev, visible: false }));

  useEffect(() => {
    fetchUserRoleAndOptions();
  }, []);

  // Fetch initial profile & role data
  const fetchUserRoleAndOptions = async () => {
    try {
      setLoadingMeta(true);
      hideAlert();
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) throw new Error("No authenticated user found.");

      setUserId(user.id);

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (profileError) throw profileError;

      const role = profileData?.role || 'Personal';
      setUserRole(role);

      if (role === 'Sponsor') {
        const { data: allowancesData, error: allowancesError } = await supabase
          .from('allowances')
          .select('spender_id, profiles:spender_id(id, full_name, email)')
          .eq('sponsor_id', user.id);

        if (allowancesError) throw allowancesError;

        const uniqueSpendersMap = new Map();
        allowancesData?.forEach((item: any) => {
          if (item.profiles) {
            uniqueSpendersMap.set(item.profiles.id, item.profiles);
          }
        });

        const spenders = Array.from(uniqueSpendersMap.values());
        setLinkedSpenders(spenders);
        if (spenders.length > 0) {
          setSelectedSpenderId(spenders[0].id);
          fetchAllowancesForSpender(spenders[0].id, user.id);
        }
      } else if (role === 'Spender') {
        const { data: allowancesData, error: allowancesError } = await supabase
          .from('allowances')
          .select('id, allowance_name, amount, start_date, end_date')
          .eq('spender_id', user.id);

        if (!allowancesError && allowancesData) {
          const sortedAllowances = allowancesData.sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime());
          setAllowanceOptions(sortedAllowances);
          if (sortedAllowances.length > 0) setSelectedAllowanceId(sortedAllowances[0].id);
        }
      } else {
        const { data: incomeData, error: incomeError } = await supabase
          .from('income')
          .select('id, source_name, amount, start_date, end_date')
          .eq('user_id', user.id);

        if (!incomeError && incomeData) {
          const sortedIncome = incomeData.sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime());
          setIncomePeriods(sortedIncome);
          if (sortedIncome.length > 0) setSelectedIncomeId(sortedIncome[0].id);
        }
      }
    } catch (error: any) {
      console.error("Error fetching export metadata:", error.message);
      showAlert('error', 'Could Not Load Options', "Failed to load export options based on your role.");
    } finally {
      setLoadingMeta(false);
    }
  };

  const fetchAllowancesForSpender = async (spenderId: string, sponsorId: string) => {
    try {
      setLoadingAllowances(true);
      setSelectedAllowanceId(null);

      const { data: allowancesData, error } = await supabase
        .from('allowances')
        .select('id, allowance_name, amount, start_date, end_date')
        .eq('sponsor_id', sponsorId)
        .eq('spender_id', spenderId);

      if (error) throw error;

      if (allowancesData) {
        const sortedAllowances = allowancesData.sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime());
        setAllowanceOptions(sortedAllowances);
        if (sortedAllowances.length > 0) setSelectedAllowanceId(sortedAllowances[0].id);
      }
    } catch (error: any) {
      console.error("Error fetching spender allowances:", error.message);
    } finally {
      setLoadingAllowances(false);
    }
  };

  const handleExport = async () => {
    if (!userId) return;
    setIsExporting(true);
    hideAlert();

    try {
      let csvContent = "";
      let fileName = "statement_ledger.csv";
      let logDetails = "exported financial statement CSV.";

      const formatSpentAt = (dateString: string) => {
        if (!dateString) return "";
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return dateString;

        const months = [
          "January", "February", "March", "April", "May", "June",
          "July", "August", "September", "October", "November", "December"
        ];

        const month = months[date.getMonth()];
        const day = date.getDate();
        const year = date.getFullYear();

        let hours = date.getHours();
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        const ampm = hours >= 12 ? 'PM' : 'AM';

        hours = hours % 12 || 12;
        const formattedHours = String(hours).padStart(2, '0');

        return `${month} ${day}, ${year} at ${formattedHours}:${minutes}:${seconds} ${ampm}`;
      };

      const sanitizeFileName = (name: string) => {
        return name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
      };

      if (userRole === 'Sponsor') {
        if (!selectedSpenderId) {
          showAlert('warning', 'Select a Spender', "Please select a spender first before exporting.");
          setIsExporting(false);
          return;
        }
        if (!selectedAllowanceId) {
          showAlert('warning', 'Select an Allowance Period', "Please select an allowance period to export.");
          setIsExporting(false);
          return;
        }

        const { data: spenderProfile } = await supabase
          .from('profiles')
          .select('full_name, email')
          .eq('id', selectedSpenderId)
          .single();

        const { data: allowanceData } = await supabase
          .from('allowances')
          .select('allowance_name')
          .eq('id', selectedAllowanceId)
          .single();

        const spenderName = sanitizeFileName(spenderProfile?.full_name || spenderProfile?.email || 'spender');
        const allowanceName = sanitizeFileName(allowanceData?.allowance_name || 'allowance');
        fileName = `${spenderName}_${allowanceName}.csv`;
        logDetails = `exported CSV statement for spender "${spenderProfile?.full_name || spenderProfile?.email}" (${allowanceData?.allowance_name || 'allowance'}).`;

        const { data: expenses, error } = await supabase
          .from('expenses')
          .select('id, amount, description, spent_at')
          .eq('allowance_id', selectedAllowanceId);

        if (error) throw error;

        csvContent = "No.,Amount,Description,Spent At\n";
        expenses?.forEach((item, index) => {
          const formattedDate = formatSpentAt(item.spent_at);
          csvContent += `"${index + 1}","${item.amount}","${item.description || ''}","${formattedDate}"\n`;
        });

      } else if (userRole === 'Spender') {
        if (!selectedAllowanceId) {
          showAlert('warning', 'Select an Allowance Period', "Please select an allowance period to export.");
          setIsExporting(false);
          return;
        }

        const { data: userProfile } = await supabase
          .from('profiles')
          .select('full_name, email')
          .eq('id', userId)
          .single();

        const { data: allowanceData } = await supabase
          .from('allowances')
          .select('allowance_name')
          .eq('id', selectedAllowanceId)
          .single();

        const userName = sanitizeFileName(userProfile?.full_name || userProfile?.email || 'user');
        const allowanceName = sanitizeFileName(allowanceData?.allowance_name || 'allowance');
        fileName = `${userName}_${allowanceName}.csv`;
        logDetails = `exported CSV statement for allowance "${allowanceData?.allowance_name || 'allowance'}".`;

        const { data: expenses, error } = await supabase
          .from('expenses')
          .select('id, amount, description, spent_at')
          .eq('allowance_id', selectedAllowanceId);

        if (error) throw error;

        csvContent = "No.,Amount,Description,Spent At\n";
        expenses?.forEach((item, index) => {
          const formattedDate = formatSpentAt(item.spent_at);
          csvContent += `"${index + 1}","${item.amount}","${item.description || ''}","${formattedDate}"\n`;
        });

      } else {
        if (!selectedIncomeId) {
          showAlert('warning', 'Select an Income Period', "Please select an income period to export.");
          setIsExporting(false);
          return;
        }

        const { data: userProfile } = await supabase
          .from('profiles')
          .select('full_name, email')
          .eq('id', userId)
          .single();

        const { data: incomeDataObj } = await supabase
          .from('income')
          .select('source_name')
          .eq('id', selectedIncomeId)
          .single();

        const userName = sanitizeFileName(userProfile?.full_name || userProfile?.email || 'user');
        const incomeName = sanitizeFileName(incomeDataObj?.source_name || 'income');
        fileName = `${userName}_${incomeName}.csv`;
        logDetails = `exported CSV statement for income source "${incomeDataObj?.source_name || 'income'}".`;

        const { data: expenses, error } = await supabase
          .from('expenses')
          .select('id, amount, description, spent_at')
          .eq('income_id', selectedIncomeId);

        if (error) throw error;

        csvContent = "No.,Amount,Description,Spent At\n";
        expenses?.forEach((item, index) => {
          const formattedDate = formatSpentAt(item.spent_at);
          csvContent += `"${index + 1}","${item.amount}","${item.description || ''}","${formattedDate}"\n`;
        });
      }

      const file = new File(Paths.cache, fileName);
      if (file.exists) {
        file.delete();
      }
      file.create();
      file.write(csvContent);

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri);
        showAlert('success', 'Export Ready', "File generated successfully!");
      } else {
        showAlert('success', 'Export Ready', `File generated successfully at: ${file.uri}`);
      }

      // Insert log into the Supabase 'logs' table
      await supabase.from('logs').insert([
        {
          user_id: userId,
          details: logDetails,
        }
      ]);

    } catch (error: any) {
      console.error("Export error:", error.message);
      showAlert('error', 'Export Failed', error.message || "An error occurred while generating your report.");
    } finally {
      setIsExporting(false);
    }
  };

  // One selectable row (radio for spenders, checkbox for periods), built from incomeStyles.toggleRow
  const renderOption = (
    key: string,
    title: string,
    amount: number | null,
    isSelected: boolean,
    onPress: () => void,
    iconOn: 'radio-button-on' | 'checkbox',
    iconOff: 'radio-button-off' | 'square-outline',
  ) => (
    <TouchableOpacity
      key={key}
      style={[
        incomeStyles.toggleRow,
        { marginVertical: theme.space[6] },
        isSelected && { backgroundColor: theme.colors.brandWash, borderColor: theme.colors.brand },
      ]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={incomeStyles.toggleTextContainer}>
        <Text style={[incomeStyles.toggleLabel, isSelected && { color: theme.colors.brand }]}>{title}</Text>
        {amount !== null && (
          <View style={[incomeStyles.countBadge, { alignSelf: 'flex-start', marginTop: theme.space[6] }]}>
            <Text style={incomeStyles.countBadgeText}>₱{Number(amount).toLocaleString()}</Text>
          </View>
        )}
      </View>
      <Ionicons
        name={isSelected ? iconOn : iconOff}
        size={20}
        color={isSelected ? theme.colors.brandDark : theme.colors.borderStrong}
      />
    </TouchableOpacity>
  );

  if (loadingMeta) {
    return (
      <View style={[profileStyles.container, profileStyles.centerLoading]}>
        <ActivityIndicator size="large" color={theme.colors.brandDark} />
        <Text style={[incomeStyles.emptyText, { marginTop: theme.space[12] }]}>Loading export settings...</Text>
      </View>
    );
  }

  return (
    <View style={profileStyles.container}>
      <StatusBar style="light" />

      {/* Gradient header (same as Profile / About) */}
      <View style={profileStyles.modernHeader}>
        <View style={profileStyles.headerGradientFill} pointerEvents="none">
          <GradientBackground />
        </View>
        <TouchableOpacity onPress={() => router.back()} style={profileStyles.backBtnTouchable} hitSlop={12}>
          <Ionicons name="chevron-back" size={22} color={theme.colors.white} />
        </TouchableOpacity>
        <Text style={profileStyles.headerTitleCentered}>Export Data</Text>
        <View style={profileStyles.backBtnTouchable} />
      </View>

      {/* Mint sheet over the gradient */}
      <View style={profileStyles.sheet}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[profileStyles.scrollContent, { paddingBottom: theme.space[24] }]}
        >
          <View style={profileStyles.modernCardGroup}>
            <View style={incomeStyles.incomeCard}>
              {/* Title block */}
              <View style={{ alignItems: 'center', marginBottom: theme.space[16] }}>
                <View style={incomeStyles.emptyIconBox}>
                  <Ionicons name="cloud-download-outline" size={28} color={theme.colors.brand} />
                </View>
                <Text style={incomeStyles.emptyTitle}>Data CSV Ledger</Text>
                <View style={incomeStyles.countBadge}>
                  <Text style={incomeStyles.countBadgeText}>Role: {userRole}</Text>
                </View>
              </View>

              {/* SPONSOR FLOW: Select Spender First */}
              {userRole === 'Sponsor' && (
                <View style={{ marginBottom: theme.space[16] }}>
                  <Text style={profileStyles.groupContextLabel}>1. Select Spender</Text>
                  {linkedSpenders.length === 0 ? (
                    <Text style={incomeStyles.allocationEmptyText}>No linked spenders found.</Text>
                  ) : (
                    linkedSpenders.map((spender) =>
                      renderOption(
                        spender.id,
                        spender.full_name || spender.email,
                        null,
                        selectedSpenderId === spender.id,
                        () => {
                          setSelectedSpenderId(spender.id);
                          if (userId) fetchAllowancesForSpender(spender.id, userId);
                        },
                        'radio-button-on',
                        'radio-button-off',
                      )
                    )
                  )}
                </View>
              )}

              {/* ALLOWANCE SELECTION (For Spender or Sponsor) */}
              {(userRole === 'Spender' || userRole === 'Sponsor') ? (
                <View style={{ marginBottom: theme.space[16] }}>
                  <Text style={profileStyles.groupContextLabel}>
                    {userRole === 'Sponsor' ? '2. Select Allowance Period' : 'Select Allowance Period'}
                  </Text>
                  {loadingAllowances ? (
                    <ActivityIndicator color={theme.colors.brandDark} style={{ marginVertical: theme.space[12] }} />
                  ) : allowanceOptions.length === 0 ? (
                    <Text style={incomeStyles.allocationEmptyText}>No allowance periods found for this selection.</Text>
                  ) : (
                    allowanceOptions.map((item) =>
                      renderOption(
                        item.id,
                        item.allowance_name,
                        item.amount,
                        selectedAllowanceId === item.id,
                        () => setSelectedAllowanceId(item.id),
                        'checkbox',
                        'square-outline',
                      )
                    )
                  )}
                </View>
              ) : (
                // PERSONAL FLOW: Select Income Period
                <View style={{ marginBottom: theme.space[16] }}>
                  <Text style={profileStyles.groupContextLabel}>Select Income Period</Text>
                  {incomePeriods.length === 0 ? (
                    <Text style={incomeStyles.allocationEmptyText}>No income sources found.</Text>
                  ) : (
                    incomePeriods.map((item) =>
                      renderOption(
                        item.id,
                        item.source_name,
                        item.amount,
                        selectedIncomeId === item.id,
                        () => setSelectedIncomeId(item.id),
                        'checkbox',
                        'square-outline',
                      )
                    )
                  )}
                </View>
              )}

              <TouchableOpacity
                style={[resetPasswordStyles.primaryButton, { marginTop: theme.space[8] }, isExporting && profileStyles.disabledButton]}
                onPress={handleExport}
                disabled={isExporting}
                activeOpacity={0.85}
              >
                {isExporting ? (
                  <ActivityIndicator color={theme.colors.white} />
                ) : (
                  <Text style={resetPasswordStyles.buttonText}>GENERATE & DOWNLOAD CSV</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </View>

      {/* Shared Payton alert (validation, errors, success) */}
      <PaytonAlertDialog
        visible={alert.visible}
        type={alert.type}
        title={alert.title}
        message={alert.message}
        onDismiss={hideAlert}
      />
    </View>
  );
}