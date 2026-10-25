import { Ionicons } from '@expo/vector-icons';
import { File, Paths } from 'expo-file-system';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../(spenderTabs)/profile';
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

  // Modern Inline Alert State: { type: 'error' | 'success' | 'info', message: string } | null
  const [inlineAlert, setInlineAlert] = useState<{ type: 'error' | 'success' | 'info'; message: string } | null>(null);

  useEffect(() => {
    fetchUserRoleAndOptions();
  }, []);

  // Fetch initial profile & role data
  const fetchUserRoleAndOptions = async () => {
    try {
      setLoadingMeta(true);
      setInlineAlert(null);
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
      setInlineAlert({ type: 'error', message: "Failed to load export options based on your role." });
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
    setInlineAlert(null);

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
          setInlineAlert({ type: 'error', message: "Please select a spender first before exporting." });
          setIsExporting(false);
          return;
        }
        if (!selectedAllowanceId) {
          setInlineAlert({ type: 'error', message: "Please select an allowance period to export." });
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
          setInlineAlert({ type: 'error', message: "Please select an allowance period to export." });
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
          setInlineAlert({ type: 'error', message: "Please select an income period to export." });
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
        setInlineAlert({ type: 'success', message: "File generated successfully!" });
      } else {
        setInlineAlert({ type: 'success', message: `File generated successfully at: ${file.uri}` });
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
      setInlineAlert({ type: 'error', message: error.message || "An error occurred while generating your report." });
    } finally {
      setIsExporting(false);
    }
  };

  if (loadingMeta) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#173D45" />
        <Text style={{ marginTop: 12, color: '#64748B' }}>Loading export settings...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      
      <View style={styles.modernHeader}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtnTouchable}>
          <Ionicons name="arrow-back" size={20} color="#ffffff" />
        </TouchableOpacity>
        <Text style={styles.headerTitleCentered}>Export Data</Text>
        <View style={{ width: 20 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <View style={styles.iconCircle}>
            <Ionicons name="cloud-download-outline" size={32} color="#173D45" />
          </View>
          <Text style={styles.cardTitle}>Data CSV Ledger</Text>
          <View style={styles.roleBadge}>
            <Text style={styles.roleBadgeText}>Role: {userRole}</Text>
          </View>

          {/* INLINE ALERT BANNER */}
          {inlineAlert && (
            <View style={[
              styles.inlineAlertContainer, 
              inlineAlert.type === 'error' ? styles.alertError : styles.alertSuccess
            ]}>
              <Ionicons 
                name={inlineAlert.type === 'error' ? "alert-circle-outline" : "checkmark-circle-outline"} 
                size={18} 
                color={inlineAlert.type === 'error' ? "#DC2626" : "#059669"} 
                style={{ marginRight: 8, marginTop: 1 }}
              />
              <Text style={[
                styles.inlineAlertText,
                inlineAlert.type === 'error' ? styles.alertTextError : styles.alertTextSuccess
              ]}>
                {inlineAlert.message}
              </Text>
              <TouchableOpacity onPress={() => setInlineAlert(null)} style={{ marginLeft: 8 }}>
                <Ionicons name="close" size={16} color="#64748B" />
              </TouchableOpacity>
            </View>
          )}

          {/* SPONSOR FLOW: Select Spender First */}
          {userRole === 'Sponsor' && (
            <View style={styles.sectionContainer}>
              <Text style={styles.label}>1. Select Spender</Text>
              {linkedSpenders.length === 0 ? (
                <Text style={styles.noDataText}>No linked spenders found.</Text>
              ) : (
                linkedSpenders.map((spender) => {
                  const isSelected = selectedSpenderId === spender.id;
                  return (
                    <TouchableOpacity
                      key={spender.id}
                      style={[styles.optionCard, isSelected && styles.selectedChip]}
                      onPress={() => {
                        setSelectedSpenderId(spender.id);
                        if (userId) fetchAllowancesForSpender(spender.id, userId);
                      }}
                      activeOpacity={0.8}
                    >
                      <View style={styles.optionContent}>
                        <Text style={[styles.optionTitle, isSelected && styles.selectedOptionText]}>
                          {spender.full_name || spender.email}
                        </Text>
                      </View>
                      <Ionicons 
                        name={isSelected ? "radio-button-on" : "radio-button-off"} 
                        size={20} 
                        color={isSelected ? "#173D45" : "#CBD5E1"} 
                      />
                    </TouchableOpacity>
                  );
                })
              )}
            </View>
          )}

          {/* ALLOWANCE SELECTION (For Spender or Sponsor) */}
          {(userRole === 'Spender' || userRole === 'Sponsor') ? (
            <View style={styles.sectionContainer}>
              <Text style={styles.label}>
                {userRole === 'Sponsor' ? '2. Select Allowance Period' : 'Select Allowance Period'}
              </Text>
              {loadingAllowances ? (
                <ActivityIndicator color="#173D45" style={{ marginVertical: 12 }} />
              ) : allowanceOptions.length === 0 ? (
                <Text style={styles.noDataText}>No allowance periods found for this selection.</Text>
              ) : (
                allowanceOptions.map((item) => {
                  const isSelected = selectedAllowanceId === item.id;
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={[styles.optionCard, isSelected && styles.selectedChip]}
                      onPress={() => setSelectedAllowanceId(item.id)}
                      activeOpacity={0.8}
                    >
                      <View style={styles.optionContent}>
                        <Text style={[styles.optionTitle, isSelected && styles.selectedOptionText]}>
                          {item.allowance_name}
                        </Text>
                        <View style={[styles.amountBadge, isSelected && styles.selectedAmountBadge]}>
                          <Text style={[styles.amountText, isSelected && styles.selectedAmountText]}>
                            ₱{Number(item.amount).toLocaleString()}
                          </Text>
                        </View>
                      </View>
                      <Ionicons 
                        name={isSelected ? "checkbox" : "square-outline"} 
                        size={20} 
                        color={isSelected ? "#173D45" : "#CBD5E1"} 
                      />
                    </TouchableOpacity>
                  );
                })
              )}
            </View>
          ) : (
            // PERSONAL FLOW: Select Income Period
            <View style={styles.sectionContainer}>
              <Text style={styles.label}>Select Income Period</Text>
              {incomePeriods.length === 0 ? (
                <Text style={styles.noDataText}>No income sources found.</Text>
              ) : (
                incomePeriods.map((item) => {
                  const isSelected = selectedIncomeId === item.id;
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={[styles.optionCard, isSelected && styles.selectedChip]}
                      onPress={() => setSelectedIncomeId(item.id)}
                      activeOpacity={0.8}
                    >
                      <View style={styles.optionContent}>
                        <Text style={[styles.optionTitle, isSelected && styles.selectedOptionText]}>
                          {item.source_name}
                        </Text>
                        <View style={[styles.amountBadge, isSelected && styles.selectedAmountBadge]}>
                          <Text style={[styles.amountText, isSelected && styles.selectedAmountText]}>
                            ₱{Number(item.amount).toLocaleString()}
                          </Text>
                        </View>
                      </View>
                      <Ionicons 
                        name={isSelected ? "checkbox" : "square-outline"} 
                        size={20} 
                        color={isSelected ? "#173D45" : "#CBD5E1"} 
                      />
                    </TouchableOpacity>
                  );
                })
              )}
            </View>
          )}

          <TouchableOpacity 
            style={[styles.pillPrimaryActionBtn, isExporting && styles.disabledButton]} 
            onPress={handleExport}
            disabled={isExporting}
            activeOpacity={0.85}
          >
            {isExporting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.pillPrimaryActionBtnText}>GENERATE & DOWNLOAD CSV</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5fcfa' },
  centered: { justifyContent: 'center', alignItems: 'center' },
  modernHeader: { 
    flexDirection: 'row', 
    justifyContent: 'center', 
    alignItems: 'center', 
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'android' ? 44 : 20,
    paddingBottom: 20,
    backgroundColor: colors?.headerDark || '#173D45',
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },
  backBtnTouchable: { width: 20 },
  headerTitleCentered: { 
    flex: 1, 
    textAlign: 'center', 
    fontSize: 20, 
    fontWeight: '800', 
    color: '#ffffff', 
    letterSpacing: -0.5 
  },
  content: { paddingHorizontal: 20, paddingVertical: 24 },
  card: { 
    backgroundColor: '#FFFFFF', 
    padding: 24, 
    borderRadius: 24, 
    borderWidth: 1, 
    borderColor: '#E2E8F0', 
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: '#EBF6F5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardTitle: { fontSize: 18, fontWeight: '700', color: '#1E293B', marginBottom: 6 },
  roleBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    marginBottom: 20,
  },
  roleBadgeText: { fontSize: 12, fontWeight: '600', color: '#475569' },
  
  /* Modern Inline Alert Styles */
  inlineAlertContainer: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 20,
    borderWidth: 1,
  },
  alertError: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
  },
  alertSuccess: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  inlineAlertText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
  },
  alertTextError: {
    color: '#991B1B',
  },
  alertTextSuccess: {
    color: '#065F46',
  },

  sectionContainer: { width: '100%', marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '600', color: '#334155', marginBottom: 10 },
  noDataText: { fontSize: 13, color: '#94A3B8', fontStyle: 'italic', marginBottom: 12 },
  optionCard: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    borderRadius: 16,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectedChip: {
    backgroundColor: '#EBF6F5',
    borderColor: '#173D45',
  },
  optionContent: {
    flex: 1,
    marginRight: 12,
  },
  optionTitle: { fontSize: 15, fontWeight: '600', color: '#334155', marginBottom: 6 },
  selectedOptionText: { color: '#173D45' },
  amountBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  selectedAmountBadge: {
    backgroundColor: '#D1E8E4',
  },
  amountText: { fontSize: 12, fontWeight: '600', color: '#64748B' },
  selectedAmountText: { color: '#173D45' },
  pillPrimaryActionBtn: {
    backgroundColor: '#173D45',
    borderRadius: 30,
    paddingVertical: 16,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  pillPrimaryActionBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', letterSpacing: 0.5 },
  disabledButton: { backgroundColor: '#CBD5E1' }
});