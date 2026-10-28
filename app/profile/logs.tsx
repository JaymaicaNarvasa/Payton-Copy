// app/logs.tsx
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { colors } from '../(spenderTabs)/profile'; // Adjust import path if needed
import { supabase } from '../../lib/supabase'; // Adjust import path to your supabase client

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
    <View style={styles.container}>
      <StatusBar style="light" />
      
      {/* Modern Curved Header */}
      <View style={styles.modernHeader}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtnTouchable} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={20} color="#ffffff" />
        </TouchableOpacity>
        <Text style={styles.headerTitleCentered}>Activity Logs</Text>
        <View style={{ width: 20 }} />
      </View>

      <ScrollView 
        contentContainerStyle={styles.scrollContent} 
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#204d3a" />
        }
      >
        {/* Search Input Bar */}
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={18} color="#64748B" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search activity logs..."
            placeholderTextColor="#94A3B8"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} activeOpacity={0.7}>
              <Ionicons name="close-circle" size={18} color="#94A3B8" />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionLabel}>Recent System Transactions</Text>
          <Text style={styles.countBadge}>{filteredLogs.length} logs</Text>
        </View>
        
        {loading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color="#204d3a" />
          </View>
        ) : filteredLogs.length === 0 ? (
          <View style={styles.centerContainer}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="file-tray-outline" size={32} color="#94A3B8" />
            </View>
            <Text style={styles.emptyText}>
              {searchQuery ? 'No matching activity logs found.' : 'No activity logs found.'}
            </Text>
          </View>
        ) : (
          filteredLogs.map((item) => {
            return (
              <View key={item.id} style={styles.logCard}>
                <View style={styles.iconCircle}>
                  <Ionicons name="document-text" size={18} color="#204d3a" />
                </View>
                <View style={styles.logInfo}>
                  <Text style={styles.logDesc}>You {item.details}</Text>
                  <View style={styles.logFooterRow}>
                    <Ionicons name="time-outline" size={12} color="#94A3B8" style={{ marginRight: 4 }} />
                    <Text style={styles.logTime}>{formatTimestamp(item.created_at)}</Text>
                  </View>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#F8FAFC',
  },
  modernHeader: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'android' ? 48 : 24,
    paddingBottom: 24,
    backgroundColor: colors.headerDark,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 5,
  },
  backBtnTouchable: { 
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitleCentered: { 
    flex: 1, 
    textAlign: 'center', 
    fontSize: 18, 
    fontWeight: '700', 
    color: '#ffffff', 
    letterSpacing: -0.3 
  },
  scrollContent: { 
    paddingHorizontal: 20, 
    paddingTop: 24, 
    paddingBottom: 48,
    flexGrow: 1,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    paddingHorizontal: 16,
    height: 50,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#1E293B',
    fontWeight: '500',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    paddingHorizontal: 4,
  },
  sectionLabel: { 
    fontSize: 11, 
    fontWeight: '700', 
    color: '#64748B', 
    textTransform: 'uppercase', 
    letterSpacing: 0.8 
  },
  countBadge: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    backgroundColor: '#EDF2F7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  centerContainer: {
    paddingVertical: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#EDF2F7',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '500',
    textAlign: 'center',
  },
  logCard: { 
    backgroundColor: '#FFFFFF', 
    padding: 16, 
    borderRadius: 16, 
    marginBottom: 10, 
    borderWidth: 1, 
    borderColor: '#E8EEF5',
    flexDirection: 'row',
    alignItems: 'flex-start',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 4,
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#E6F4F1',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    marginTop: 2,
  },
  logInfo: {
    flex: 1,
  },
  logDesc: { 
    fontSize: 14, 
    color: '#1E293B', 
    lineHeight: 20,
    fontWeight: '500',
    marginBottom: 6,
  },
  logFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logTime: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '500',
  },
});