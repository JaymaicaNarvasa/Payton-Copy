// app/profile/export.tsx
// Exports a professional Excel report (.xlsx) with ALL of the user's data instead of a single period:
//   Summary · Monthly Expenses · Allowance/Income Periods · Categories · All Transactions (with charts).
// Spender / Personal export immediately. Sponsors pick which linked spender to export.
// Skeleton while options load; selection problems show below the related list;
// success / failure show in an inline banner. The report itself is built in lib/expenseReport.ts.
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
import { generateExpenseReport, XLSX_MIME } from '../../lib/expenseReport';
import { supabase } from '../../lib/supabase';

type SelectionErrors = { spender?: string };

type SheetInfo = { icon: keyof typeof Ionicons.glyphMap; title: string; subtitle: string };

export default function ExportScreen() {
  const router = useRouter();
  const [isExporting, setIsExporting] = useState(false);
  const [loadingMeta, setLoadingMeta] = useState(true);

  const [userRole, setUserRole] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  // Sponsor-specific states
  const [linkedSpenders, setLinkedSpenders] = useState<any[]>([]);
  const [selectedSpenderId, setSelectedSpenderId] = useState<string | null>(null);

  // Inline feedback
  const [selectionErrors, setSelectionErrors] = useState<SelectionErrors>({});
  const [formMessage, setFormMessage] = useState<FormMessage>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    fetchUserRoleAndOptions();
  }, []);

  // Fetch initial profile & role data (and the linked spenders for sponsors)
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
        if (spenders.length > 0) setSelectedSpenderId(spenders[0].id);
      }
    } catch (error: any) {
      console.error("Error fetching export metadata:", error.message);
      setLoadError("Failed to load export options based on your role.");
    } finally {
      setLoadingMeta(false);
    }
  };

  const handleExport = async () => {
    if (!userId) return;
    setIsExporting(true);
    setFormMessage(null);
    setSelectionErrors({});

    try {
      if (userRole === 'Sponsor' && !selectedSpenderId) {
        setSelectionErrors({ spender: 'Please select a spender first before exporting.' });
        return;
      }

      // Fetches every allowance/income + expense for this user and builds the .xlsx
      const { bytes, fileName, logDetails } = await generateExpenseReport({
        userId,
        role: userRole,
        spenderId: selectedSpenderId,
      });

      const file = new File(Paths.cache, fileName);
      if (file.exists) {
        file.delete();
      }
      file.create();
      file.write(bytes);

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, {
          mimeType: XLSX_MIME,
          UTI: 'org.openxmlformats.spreadsheetml.sheet',
          dialogTitle: 'Share expense report',
        });
        setFormMessage({ type: 'success', message: 'Report generated successfully!' });
      } else {
        setFormMessage({ type: 'success', message: `Report generated successfully at: ${file.uri}` });
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

  // One selectable spender row (radio), built from incomeStyles.toggleRow
  const renderSpenderOption = (spender: any) => {
    const isSelected = selectedSpenderId === spender.id;
    return (
      <TouchableOpacity
        key={spender.id}
        style={[
          incomeStyles.toggleRow,
          { marginVertical: theme.space[6] },
          isSelected && { backgroundColor: theme.colors.brandWash, borderColor: theme.colors.brand },
        ]}
        onPress={() => {
          setSelectedSpenderId(spender.id);
          setSelectionErrors((prev) => ({ ...prev, spender: undefined }));
        }}
        activeOpacity={0.8}
        accessibilityRole="radio"
        accessibilityState={{ checked: isSelected }}
      >
        <View style={incomeStyles.toggleTextContainer}>
          <Text style={[incomeStyles.toggleLabel, isSelected && { color: theme.colors.brand }]}>
            {spender.full_name || spender.email}
          </Text>
        </View>
        <Ionicons
          name={isSelected ? 'radio-button-on' : 'radio-button-off'}
          size={20}
          color={isSelected ? theme.colors.brandDark : theme.colors.borderStrong}
        />
      </TouchableOpacity>
    );
  };

  // What the exported workbook contains
  const periodsSheetName = userRole === 'Personal' ? 'Income Periods' : 'Allowance Periods';
  const sheets: SheetInfo[] = [
    { icon: 'speedometer-outline', title: 'Summary', subtitle: 'Key figures, spending charts and monthly trend' },
    { icon: 'calendar-outline', title: 'Monthly Expenses', subtitle: 'A table for every month with monthly totals' },
    {
      icon: 'wallet-outline',
      title: periodsSheetName,
      subtitle: userRole === 'Personal' ? 'Every income source with spent, remaining and total' : 'Every allowance with spent, remaining and total',
    },
    { icon: 'pie-chart-outline', title: 'Categories', subtitle: 'Spending by category with charts and a month-by-month grid' },
    { icon: 'list-outline', title: 'All Transactions', subtitle: 'Complete, filterable list of every expense' },
  ];

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
          label="GENERATE EXCEL REPORT"
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
              <Ionicons name="bar-chart-outline" size={28} color={theme.colors.brand} />
            </View>
            <Text style={incomeStyles.emptyTitle}>Excel Expense Report</Text>
            <View style={incomeStyles.countBadge}>
              <Text style={incomeStyles.countBadgeText}>Role: {userRole}</Text>
            </View>
          </View>

          {/* SPONSOR FLOW: choose whose data to export */}
          {userRole === 'Sponsor' && (
            <View style={{ marginBottom: theme.space[16] }}>
              <FieldLabel>Select Spender</FieldLabel>
              {linkedSpenders.length === 0 ? (
                <Text style={incomeStyles.allocationEmptyText}>No linked spenders found.</Text>
              ) : (
                linkedSpenders.map(renderSpenderOption)
              )}
              <FieldError message={selectionErrors.spender} style={{ marginTop: theme.space[6] }} />
            </View>
          )}

          {/* What's inside the report */}
          <View style={{ marginBottom: theme.space[16] }}>
            <FieldLabel>What's included</FieldLabel>
            <Text style={[incomeStyles.allocationEmptyText, { textAlign: 'left', marginBottom: theme.space[8] }]}>
              {userRole === 'Sponsor'
                ? 'All allowances and expenses for the selected spender, in one workbook.'
                : 'All of your data in one workbook, not just a single period.'}
            </Text>
            {sheets.map((sheet) => (
              <View
                key={sheet.title}
                style={{ flexDirection: 'row', alignItems: 'center', marginVertical: theme.space[6] }}
              >
                <View style={{ width: 36, alignItems: 'center' }}>
                  <Ionicons name={sheet.icon} size={22} color={theme.colors.brand} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={incomeStyles.toggleLabel}>{sheet.title}</Text>
                  <Text style={[incomeStyles.allocationEmptyText, { textAlign: 'left' }]}>{sheet.subtitle}</Text>
                </View>
              </View>
            ))}
          </View>

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
