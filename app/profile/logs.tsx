// app/logs.tsx
// Built ONLY from existing exports of constants/ui.styles.ts:
//   profileStyles (gradient header + mint sheet), incomeStyles (log cards, count badge, empty state),
//   monitoringStyles (search bar). The Supabase fetch / refresh / filter logic below is unchanged.
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';

import GradientBackground from '../../components/GradientBackground';
import { theme } from '../../constants/theme';
import { incomeStyles, monitoringStyles, profileStyles } from '../../constants/ui.styles';
import { supabase } from '../../lib/supabase';

interface LogItem {
  id: string;
  details: string;
  created_at: string;
}

export default function ActivityLogsScreen() {
  const router = useRouter();
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Function to fetch logs from Supabase
  const fetchLogs = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('logs')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching logs:', error.message);
      } else if (data) {
        setLogs(data);
      }
    } catch (err) {
      console.error('Unexpected error fetching logs:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchLogs();
  }, []);

  // Format timestamp nicely
  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  // Filter logs based on search query (searching against "You " + details)
  const filteredLogs = logs.filter((item) => {
    const query = searchQuery.toLowerCase();
    const processedDetails = `You ${item.details}`.toLowerCase();
    return processedDetails.includes(query);
  });

  return (
    <View style={profileStyles.container}>
      <StatusBar style="light" />

      {/* Gradient header (same as Profile / About) */}
      <View style={profileStyles.modernHeader}>
        <View style={profileStyles.headerGradientFill} pointerEvents="none">
          <GradientBackground />
        </View>
        <TouchableOpacity onPress={() => router.back()} style={profileStyles.backBtnTouchable} activeOpacity={0.7} hitSlop={12}>
          <Ionicons name="chevron-back" size={22} color={theme.colors.white} />
        </TouchableOpacity>
        <Text style={profileStyles.headerTitleCentered}>Activity Logs</Text>
        <View style={profileStyles.backBtnTouchable} />
      </View>

      {/* Mint sheet over the gradient */}
      <View style={profileStyles.sheet}>
        <ScrollView
          contentContainerStyle={[profileStyles.scrollContent, { paddingBottom: theme.space[40] }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.colors.brandDark}
              colors={[theme.colors.brandDark]}
            />
          }
        >
          <View style={profileStyles.modernCardGroup}>
            {/* Search Input Bar */}
            <View style={monitoringStyles.searchContainer}>
              <Ionicons name="search" size={18} color={theme.colors.textMuted} />
              <TextInput
                style={monitoringStyles.searchInput}
                placeholder="Search activity logs..."
                placeholderTextColor={theme.colors.textSubtle}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')} activeOpacity={0.7}>
                  <Ionicons name="close-circle" size={18} color={theme.colors.textSubtle} />
                </TouchableOpacity>
              )}
            </View>

            <View style={[incomeStyles.sectionHeaderRow, { marginTop: theme.space[12] }]}>
              <Text style={[profileStyles.groupContextLabel, { marginBottom: 0 }]}>Recent System Transactions</Text>
              <View style={incomeStyles.countBadge}>
                <Text style={incomeStyles.countBadgeText}>{filteredLogs.length} logs</Text>
              </View>
            </View>

            {loading ? (
              <ActivityIndicator size="large" color={theme.colors.brandDark} style={{ marginTop: theme.space[40] }} />
            ) : filteredLogs.length === 0 ? (
              <View style={incomeStyles.emptyContainer}>
                <View style={incomeStyles.emptyIconBox}>
                  <Ionicons name="file-tray-outline" size={26} color={theme.colors.brand} />
                </View>
                <Text style={incomeStyles.emptyText}>
                  {searchQuery ? 'No matching activity logs found.' : 'No activity logs found.'}
                </Text>
              </View>
            ) : (
              filteredLogs.map((item) => (
                <View key={item.id} style={incomeStyles.incomeCard}>
                  <View style={incomeStyles.cardHeaderLeft}>
                    <View style={incomeStyles.statusBadge}>
                      <Ionicons name="document-text" size={20} color={theme.colors.success} />
                    </View>
                    <View style={incomeStyles.titleWrapper}>
                      <Text style={profileStyles.rowPrimaryLabel}>You {item.details}</Text>
                      <View style={[incomeStyles.dateContainer, { marginTop: theme.space[6] }]}>
                        <Ionicons name="time-outline" size={12} color={theme.colors.textSubtle} />
                        <Text style={incomeStyles.dateText}>{formatTimestamp(item.created_at)}</Text>
                      </View>
                    </View>
                  </View>
                </View>
              ))
            )}
          </View>
        </ScrollView>
      </View>
    </View>
  );
}