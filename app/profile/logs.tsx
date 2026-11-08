// app/profile/logs.tsx
// Skeleton rows while loading, inline error with Retry if the fetch fails.
// The Supabase fetch / refresh / filter logic is unchanged.
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, Text, TextInput, TouchableOpacity, View } from 'react-native';

import InlineMessage from '../../components/profile/InlineMessage';
import ProfileScreen from '../../components/profile/ProfileScreen';
import { SkeletonGroup, SkeletonLogItem } from '../../components/profile/Skeleton';
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
  const [loadError, setLoadError] = useState<string | null>(null);

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
        setLoadError('Could not load your activity logs.');
      } else if (data) {
        setLoadError(null);
        setLogs(data);
      }
    } catch (err) {
      console.error('Unexpected error fetching logs:', err);
      setLoadError('Could not load your activity logs.');
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

  const retry = () => {
    setLoading(true);
    setLoadError(null);
    fetchLogs();
  };

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

  const listHeader = (
    <View>
      {/* Search Input Bar */}
      <View style={monitoringStyles.searchContainer}>
        <Ionicons name="search" size={18} color={theme.colors.textMuted} />
        <TextInput
          style={monitoringStyles.searchInput}
          placeholder="Search activity logs..."
          placeholderTextColor={theme.colors.textSubtle}
          value={searchQuery}
          onChangeText={setSearchQuery}
          returnKeyType="search"
          accessibilityLabel="Search activity logs"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity
            onPress={() => setSearchQuery('')}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
          >
            <Ionicons name="close-circle" size={18} color={theme.colors.textSubtle} />
          </TouchableOpacity>
        )}
      </View>

      <View style={[incomeStyles.sectionHeaderRow, { marginTop: theme.space[12] }]}>
        <Text style={[profileStyles.groupContextLabel, { marginBottom: 0 }]}>Recent System Transactions</Text>
        {!loading && (
          <View style={incomeStyles.countBadge}>
            <Text style={incomeStyles.countBadgeText}>{filteredLogs.length} logs</Text>
          </View>
        )}
      </View>

      {loadError ? (
        <InlineMessage
          type="error"
          message={loadError}
          actionLabel="Retry"
          onAction={retry}
          style={{ marginTop: theme.space[12] }}
        />
      ) : null}
    </View>
  );

  const listEmpty = loading ? (
    <SkeletonGroup>
      {Array.from({ length: 6 }).map((_, i) => (
        <SkeletonLogItem key={i} />
      ))}
    </SkeletonGroup>
  ) : loadError ? null : (
    <View style={incomeStyles.emptyContainer}>
      <View style={incomeStyles.emptyIconBox}>
        <Ionicons name="file-tray-outline" size={26} color={theme.colors.brand} />
      </View>
      <Text style={incomeStyles.emptyText}>
        {searchQuery ? 'No matching activity logs found.' : 'No activity logs found.'}
      </Text>
    </View>
  );

  return (
    <ProfileScreen title="Activity Logs" onBack={() => router.back()} scroll={false}>
      <FlatList
        data={loading ? [] : filteredLogs}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={monitoringStyles.listContent}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmpty}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.brandDark}
            colors={[theme.colors.brandDark]}
          />
        }
        renderItem={({ item }) => (
          <View style={incomeStyles.incomeCard}>
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
        )}
      />
    </ProfileScreen>
  );
}
