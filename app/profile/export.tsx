// app/profile/export.tsx
// Skeleton while options load; selection problems show directly below the related list;
// success / failure show in an inline banner above the button. Supabase / CSV / sharing logic is unchanged.
import { Ionicons } from '@expo/vector-icons';
import { File, Paths } from 'expo-file-system';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useEffect, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

import { FieldError, FieldLabel } from '../../components/profile/FormField';
import InlineMessage, { FormMessage } from '../../components/profile/InlineMessage';
import PrimaryButton from '../../components/profile/PrimaryButton';
import ProfileScreen from '../../components/profile/ProfileScreen';
import {
  Skeleton,
  SkeletonButton,
  SkeletonGroup,
  SkeletonOption,
} from '../../components/profile/Skeleton';
import { theme } from '../../constants/theme';
import { incomeStyles, profileStyles } from '../../constants/ui.styles';
import { supabase } from '../../lib/supabase';

type SelectionErrors = { spender?: string; period?: string };

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

  // Inline feedback
  const [selectionErrors, setSelectionErrors] = useState<SelectionErrors>({});
  const [formMessage, setFormMessage] = useState<FormMessage>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    fetchUserRoleAndOptions();
  }, []);

  // Fetch initial profile & role data
  const fetchUserRoleAndOptions = async () => {
    try {
      setLoadingMeta(true);
      setFormMessage(null);
      setLoadError(null);
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
      setLoadError("Failed to load export options based on your role.");
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
    setFormMessage(null);
    setSelectionErrors({});

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
          setSelectionErrors({ spender: 'Please select a spender first before exporting.' });
          setIsExporting(false);
          return;
        }
        if (!selectedAllowanceId) {
          setSelectionErrors({ period: 'Please select an allowance period to export.' });
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
          setSelectionErrors({ period: 'Please select an allowance period to export.' });
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
          setSelectionErrors({ period: 'Please select an income period to export.' });
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
        setFormMessage({ type: 'success', message: 'File generated successfully!' });
      } else {
        setFormMessage({ type: 'success', message: `File generated successfully at: ${file.uri}` });
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
      setFormMessage({ type: 'error', message: error.message || 'An error occurred while generating your report.' });
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
      accessibilityRole={iconOn === 'radio-button-on' ? 'radio' : 'checkbox'}
      accessibilityState={{ checked: isSelected }}
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

  /* ---------- Loading: skeleton (header stays) ---------- */
  if (loadingMeta) {
    return (
      <ProfileScreen title="Export Data" onBack={() => router.back()} footer={<SkeletonButton />}>
        <SkeletonGroup style={profileStyles.modernCardGroup}>
          <View style={incomeStyles.incomeCard}>
            <View style={{ alignItems: 'center', marginBottom: theme.space[16] }}>
              <Skeleton width={56} height={56} radius={28} />
              <Skeleton width={150} height={18} style={{ marginTop: theme.space[12] }} />
              <Skeleton width={100} height={22} radius={11} style={{ marginTop: theme.space[10] }} />
            </View>
            <Skeleton width={130} height={12} style={{ marginBottom: theme.space[8] }} />
            <SkeletonOption />
            <SkeletonOption />
            <SkeletonOption />
          </View>
        </SkeletonGroup>
      </ProfileScreen>
    );
  }

  return (
    <ProfileScreen
      title="Export Data"
      onBack={() => router.back()}
      footer={
        <PrimaryButton
          label="GENERATE & DOWNLOAD CSV"
          icon="download-outline"
          onPress={handleExport}
          loading={isExporting}
        />
      }
    >
      <View style={profileStyles.modernCardGroup}>
        {loadError ? (
          <InlineMessage type="error" message={loadError} actionLabel="Retry" onAction={fetchUserRoleAndOptions} />
        ) : null}

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
              <FieldLabel>1. Select Spender</FieldLabel>
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
                      setSelectionErrors((prev) => ({ ...prev, spender: undefined }));
                      if (userId) fetchAllowancesForSpender(spender.id, userId);
                    },
                    'radio-button-on',
                    'radio-button-off',
                  )
                )
              )}
              <FieldError message={selectionErrors.spender} style={{ marginTop: theme.space[6] }} />
            </View>
          )}

          {/* ALLOWANCE SELECTION (For Spender or Sponsor) */}
          {(userRole === 'Spender' || userRole === 'Sponsor') ? (
            <View style={{ marginBottom: theme.space[16] }}>
              <FieldLabel>
                {userRole === 'Sponsor' ? '2. Select Allowance Period' : 'Select Allowance Period'}
              </FieldLabel>
              {loadingAllowances ? (
                <SkeletonGroup>
                  <SkeletonOption />
                  <SkeletonOption />
                </SkeletonGroup>
              ) : allowanceOptions.length === 0 ? (
                <Text style={incomeStyles.allocationEmptyText}>No allowance periods found for this selection.</Text>
              ) : (
                allowanceOptions.map((item) =>
                  renderOption(
                    item.id,
                    item.allowance_name,
                    item.amount,
                    selectedAllowanceId === item.id,
                    () => {
                      setSelectedAllowanceId(item.id);
                      setSelectionErrors((prev) => ({ ...prev, period: undefined }));
                    },
                    'checkbox',
                    'square-outline',
                  )
                )
              )}
              <FieldError message={selectionErrors.period} style={{ marginTop: theme.space[6] }} />
            </View>
          ) : (
            // PERSONAL FLOW: Select Income Period
            <View style={{ marginBottom: theme.space[16] }}>
              <FieldLabel>Select Income Period</FieldLabel>
              {incomePeriods.length === 0 ? (
                <Text style={incomeStyles.allocationEmptyText}>No income sources found.</Text>
              ) : (
                incomePeriods.map((item) =>
                  renderOption(
                    item.id,
                    item.source_name,
                    item.amount,
                    selectedIncomeId === item.id,
                    () => {
                      setSelectedIncomeId(item.id);
                      setSelectionErrors((prev) => ({ ...prev, period: undefined }));
                    },
                    'checkbox',
                    'square-outline',
                  )
                )
              )}
              <FieldError message={selectionErrors.period} style={{ marginTop: theme.space[6] }} />
            </View>
          )}

          {formMessage ? (
            <InlineMessage
              type={formMessage.type}
              message={formMessage.message}
              onDismiss={() => setFormMessage(null)}
              style={{ marginBottom: 0 }}
            />
          ) : null}
        </View>
      </View>
    </ProfileScreen>
  );
}
