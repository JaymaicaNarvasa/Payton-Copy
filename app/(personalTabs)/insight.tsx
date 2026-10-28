import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useRef, useState } from 'react';
import {
    FlatList,
    Image,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { getAiModel } from '../../services/aiClient';

import { supabase } from '../../lib/supabase';

interface PacingResult {
    pacingStatus: 'ON_TRACK' | 'WARNING' | 'CRITICAL';
    safeDailyLimit: number;
    projectedRunwayDays: number;
    insightSummary: string;
    actionableTip: string;
    total_allowance: number;
    total_spent: number;
    remaining_balance: number;
}

interface Message {
    id: string;
    sender: 'user' | 'coach';
    type: 'text' | 'pacing';
    content?: string;
    pacingData?: PacingResult;
}

export default function InsightScreen() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [typing, setTyping] = useState(false);
    const [inputText, setInputText] = useState('');
    const flatListRef = useRef<FlatList>(null);

    const [messages, setMessages] = useState<Message[]>([
        {
            id: '1',
            sender: 'coach',
            type: 'text',
            content: "Hello! I'm Coach Payton, your personal AI financial assistant. How can I help optimize your wealth today?",
        },
    ]);

    const handleFetchPacingInsights = async () => {
        try {
            setLoading(true);
            setTyping(true);

            const userMsg: Message = {
                id: Date.now().toString(),
                sender: 'user',
                type: 'text',
                content: 'Check My Financial Status',
            };
            setMessages((prev) => [...prev, userMsg]);

            const { data: { user }, error: authError } = await supabase.auth.getUser();
            if (authError || !user) throw new Error('User session not found.');

            const { data: profile } = await supabase
                .from('profiles')
                .select('role')
                .eq('id', user.id)
                .single();

            const isPersonal = profile?.role === 'Personal';
            const rpcName = isPersonal ? 'get_personal_pacing_data' : 'get_spender_pacing_data';
            const rpcParams = isPersonal ? { p_user_id: user.id } : { p_spender_id: user.id };

            const { data: metrics, error: dbError } = await supabase.rpc(rpcName, rpcParams);

            if (dbError) throw dbError;
            if (!metrics || !metrics.has_active_allowance) {
                throw new Error(isPersonal ? 'No active income period found.' : 'No active allowance found for this period.');
            }

            const model = getAiModel('insight', { 
                model: "gemini-3.5-flash-lite",
                generationConfig: { responseMimeType: "application/json" }
            });

            const prompt = `
                Analyze these pacing metrics (${isPersonal ? 'Personal Income Source' : 'Spender Allowance'}):
                ${JSON.stringify(metrics)}

                CRITICAL INSTRUCTIONS:
    1. Always use the Philippine Peso sign (₱) for all monetary values. Never use dollars ($).
    2. MATHEMATICAL CONSISTENCY CHECK: Before writing "insightSummary", verify all comparisons. If remaining_balance is greater than pending_reminders, do NOT state that it is less than them. Ensure your text reflects the exact relative values provided in the JSON payload.

                Rules:
                1. "pacingStatus": WARNING if current_daily_avg > safe_daily_limit, CRITICAL if remaining_balance < pending_reminders, else ON_TRACK.
                2. "safeDailyLimit": Set to ${metrics.safe_daily_limit}.
                3. "projectedRunwayDays": Calculate remaining_balance / current_daily_avg (1 decimal place). If current_daily_avg is 0, return remaining_balance.
                4. "insightSummary": 2 sentences explaining why they are burning through funds faster than their safe limit. Use '₱' for currency.
                5. "actionableTip": 1 actionable tip addressing their top_spending_category (${metrics.top_spending_category}) and pending_reminders (₱${metrics.pending_reminders}). Use '₱' for currency.
            `;

            const result = await model.generateContent(prompt);
            const cleanText = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
            const parsedData = JSON.parse(cleanText) as PacingResult;

            parsedData.total_allowance = metrics.total_allowance;
            parsedData.total_spent = metrics.total_spent;
            parsedData.remaining_balance = metrics.remaining_balance;

            const coachMsg: Message = {
                id: (Date.now() + 1).toString(),
                sender: 'coach',
                type: 'pacing',
                pacingData: parsedData,
            };
            setMessages((prev) => [...prev, coachMsg]);
        } catch (err: any) {
            const errorMsg: Message = {
                id: (Date.now() + 1).toString(),
                sender: 'coach',
                type: 'text',
                content: `⚠️ Pacing Analysis Unavailable\n\n${err.message || 'We ran into an issue fetching your insights. Please try again in a moment.'}`
            };
            setMessages((prev) => [...prev, errorMsg]);
        } finally {
            setLoading(false);
            setTyping(false);
        }
    };

    const handleSendMessage = async (textToSend?: string) => {
        const textContent = textToSend || inputText;
        if (!textContent.trim()) return;

        const userText = textContent.trim();
        if (!textToSend) setInputText('');

        const userMsg: Message = {
            id: Date.now().toString(),
            sender: 'user',
            type: 'text',
            content: userText,
        };

        setMessages((prev) => [...prev, userMsg]);
        setLoading(true);
        setTyping(true);

        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('User not found');

            const { data: profile } = await supabase
                .from('profiles')
                .select('role')
                .eq('id', user.id)
                .single();

            const isPersonal = profile?.role === 'Personal';
            const rpcName = isPersonal ? 'get_personal_pacing_data' : 'get_spender_pacing_data';
            const rpcParams = isPersonal ? { p_user_id: user.id } : { p_spender_id: user.id };
            const { data: metrics } = await supabase.rpc(rpcName, rpcParams);

            const { data: remindersData } = await supabase
                .from('reminders')
                .select('*')
                .eq('user_id', user.id)
                .eq('status', 'pending');

            const { data: splitFriendsData } = await supabase
                .from('split_friends')
                .select(`*, friends ( name )`);

            const model = getAiModel('coach', { 
                model: "gemini-3.5-flash-lite",
                generationConfig: { responseMimeType: "application/json" }
            });

            const classificationPrompt = `
                You are Coach Payton, an intelligent AI financial coach and advisor. You provide insights, spending behavior analysis, predictions, and suggestions. You do NOT log expenses directly.
                User Message: "${userText}"
                Active Pacing Metrics: ${JSON.stringify(metrics)}
                Pending Reminders: ${JSON.stringify(remindersData || [])}
                Split Friends Debts Data: ${JSON.stringify(splitFriendsData || [])}

                CRITICAL INSTRUCTION: Always use the Philippine Peso sign (₱) for all monetary values. Never use dollars ($).

                Determine the intent of the user. Return a JSON object with:
                - intent: "DATABASE_QUERY" or "GENERAL_CHAT"
                - replyText: string (Direct coaching response to the user using '₱' for any amounts. If the user asks to log an expense, gently remind them that you are an advisory coach providing insights and predictions, and guide them on how it affects their remaining balance ₱${metrics?.remaining_balance || 0}.)
            `;

            const classificationResult = await model.generateContent(classificationPrompt);
            const cleanClassificationText = classificationResult.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
            const parsedIntent = JSON.parse(cleanClassificationText);

            const coachMsg: Message = {
                id: (Date.now() + 1).toString(),
                sender: 'coach',
                type: 'text',
                content: parsedIntent.replyText || "I received a response, but it doesn't make sense. Please try again!",
            };
            setMessages((prev) => [...prev, coachMsg]);

        } catch (err: any) {
            const errorMsg: Message = {
                id: (Date.now() + 1).toString(),
                sender: 'coach',
                type: 'text',
                content: "I encountered an issue fetching your data. Please try again.",
            };
            setMessages((prev) => [...prev, errorMsg]);
        } finally {
            setLoading(false);
            setTyping(false);
        }
    };

    const getStatusConfig = (status?: string) => {
        switch (status) {
            case 'ON_TRACK': return { color: '#059669', bg: '#D1FAE5', label: 'On Track 🚀' };
            case 'WARNING': return { color: '#D97706', bg: '#FEF3C7', label: 'Warning ⚠️' };
            case 'CRITICAL': return { color: '#DC2626', bg: '#FEE2E2', label: 'Critical 🚨' };
            default: return { color: '#047857', bg: '#E6F4EA', label: 'Analyzing...' };
        }
    };

    const renderItem = ({ item }: { item: Message }) => {
        if (item.sender === 'user') {
            return (
                <View style={styles.userMessageRow}>
                    <View style={styles.userBubble}>
                        <Text style={styles.userText}>{item.content}</Text>
                    </View>
                </View>
            );
        }

        return (
            <View style={styles.coachMessageRow}>
                <View style={styles.avatarContainer}>
                    <Image 
                        source={require("../../assets/images/coachpayton.png")} 
                        style={styles.chatAvatar} 
                    />
                    <View style={styles.onlineBadge} />
                </View>
                <View style={styles.coachContentContainer}>
                    {item.type === 'text' && (
                        <View style={styles.coachBubble}>
                            <Text style={styles.coachText}>{item.content}</Text>
                        </View>
                    )}

                    {item.type === 'pacing' && item.pacingData && (() => {
                        const statusCfg = getStatusConfig(item.pacingData.pacingStatus);
                        return (
                            <View style={styles.resultContainer}>
                                <View style={styles.aiCardHeader}>
                                    <View style={styles.aiCardTitleGroup}>
                                        <Ionicons name="sparkles" size={16} color="#059669" />
                                        <Text style={styles.aiCardHeaderTitle}>AI Financial Health Report</Text>
                                    </View>
                                    <View style={[styles.statusBadge, { backgroundColor: statusCfg.bg }]}>
                                        <Text style={[styles.statusText, { color: statusCfg.color }]}>
                                            {statusCfg.label}
                                        </Text>
                                    </View>
                                </View>

                                <View style={styles.progressSection}>
                                    <View style={styles.progressLabels}>
                                        <Text style={styles.progressLabelText}>Spent: ₱{item.pacingData.total_spent || 0}</Text>
                                        <Text style={styles.progressLabelText}>Allowance: ₱{item.pacingData.total_allowance || 0}</Text>
                                    </View>
                                    <View style={styles.progressBarBackground}>
                                        <View 
                                            style={[
                                                styles.progressBarFill, 
                                                { 
                                                    width: `${Math.max(
                                                        0, 
                                                        Math.min(
                                                            100, 
                                                            ((item.pacingData.total_spent || 0) / (item.pacingData.total_allowance || 1)) * 100
                                                        )
                                                    )}%` 
                                                }
                                            ]} 
                                        />
                                    </View>
                                </View>

                                <View style={styles.metricsRow}>
                                    <View style={styles.metricCard}>
                                        <Text style={styles.metricLabel}>Safe Daily Limit</Text>
                                        <Text style={styles.metricValue}>₱{item?.pacingData?.safeDailyLimit != null ? Number(item.pacingData.safeDailyLimit).toFixed(2) : '0.00'}</Text>
                                    </View>
                                    <View style={styles.metricCard}>
                                        <Text style={styles.metricLabel}>Runway Left</Text>
                                        <Text style={styles.metricValue}>{item?.pacingData?.projectedRunwayDays ?? '0'} Days</Text>
                                    </View>
                                </View>

                                <View style={styles.summaryBox}>
                                    <Text style={styles.summaryTitle}>Coach Analysis</Text>
                                    <Text style={styles.summaryText}>{item.pacingData.insightSummary}</Text>
                                </View>

                                <View style={styles.tipCard}>
                                    <View style={styles.tipIconBox}>
                                        <Ionicons name="bulb" size={18} color="#D97706" />
                                    </View>
                                    <View style={styles.tipTextContainer}>
                                        <Text style={styles.tipTitle}>Smart Recommendation</Text>
                                        <Text style={styles.tipDescription}>{item.pacingData.actionableTip}</Text>
                                    </View>
                                </View>
                            </View>
                        );
                    })()}
                </View>
            </View>
        );
    };

    return (
        <View style={styles.safeArea}>
            <Stack.Screen options={{ headerShown: false }} />
            <StatusBar style="light" />

            <KeyboardAvoidingView 
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
                style={styles.modalOverlay}
            >
                <View style={styles.mainContainer}>
                    {/* Header */}
                    <View style={styles.headerRow}>
                        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                            <Ionicons name="chevron-back" size={22} color="#064E3B" />
                        </TouchableOpacity>
                        
                        <View style={styles.headerTitleRow}>
                            <View style={styles.avatarContainer}>
                                <Image 
                                    source={require("../../assets/images/coachpayton.png")} 
                                    style={styles.headerAvatar} 
                                />
                                <View style={styles.onlineBadge} />
                            </View>
                            <View style={styles.titleContainer}>
                                <Text style={styles.screenTitle}>Coach Payton</Text>
                                <View style={styles.activeStatusRow}>
                                    <Text style={styles.screenSubtitle}>Active Now</Text>
                                </View>
                            </View>
                        </View>
                    </View>

                    {/* Chat Messages */}
                    <FlatList
                        ref={flatListRef}
                        data={messages}
                        keyExtractor={(item) => item.id}
                        renderItem={renderItem}
                        contentContainerStyle={styles.chatScrollContent}
                        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
                        keyboardShouldPersistTaps="handled"
                    />

                    {/* Typing Indicator */}
                    {typing && (
                        <View style={styles.coachMessageRow}>
                            <View style={styles.avatarContainer}>
                                <Image 
                                    source={require("../../assets/images/coachpayton.png")} 
                                    style={styles.chatAvatar} 
                                />
                            </View>
                            <View style={styles.typingBubble}>
                                <View style={styles.typingDots}>
                                    <View style={[styles.dot, styles.dot1]} />
                                    <View style={[styles.dot, styles.dot2]} />
                                    <View style={[styles.dot, styles.dot3]} />
                                </View>
                                <Text style={styles.typingText}>Coach Payton is thinking...</Text>
                            </View>
                        </View>
                    )}

                    {/* Bottom Control Bar */}
                    <View style={styles.bottomBarContainer}>
                        {/* Quick Prompts Bar */}
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll}>
                            <TouchableOpacity style={styles.chipButton} onPress={handleFetchPacingInsights} disabled={loading}>
                                <Ionicons name="analytics" size={14} color="#059669" />
                                <Text style={styles.chipText}>Check Status</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.chipButton} onPress={() => handleSendMessage("What are my pending reminders?")} disabled={loading}>
                                <Ionicons name="calendar-outline" size={14} color="#059669" />
                                <Text style={styles.chipText}>Pending Bills?</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.chipButton} onPress={() => handleSendMessage("Give me tips to save more money this week")} disabled={loading}>
                                <Ionicons name="bulb-outline" size={14} color="#059669" />
                                <Text style={styles.chipText}>Saving Tips</Text>
                            </TouchableOpacity>
                        </ScrollView>

                        {/* Input Row */}
                        <View style={styles.inputRow}>
                            <TextInput
                                style={styles.textInput}
                                placeholder="Ask Coach Payton something..."
                                placeholderTextColor="#94A3B8"
                                value={inputText}
                                onChangeText={setInputText}
                            />
                            <TouchableOpacity 
                                style={[styles.sendButton, !inputText.trim() && styles.sendButtonDisabled]} 
                                onPress={() => handleSendMessage()}
                                disabled={!inputText.trim() || loading}
                            >
                                <Ionicons name="arrow-up" size={18} color="#FFFFFF" />
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </KeyboardAvoidingView>
        </View>
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: '#1F4F59' },
    modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(6, 78, 59, 0.6)' },
    mainContainer: {
        flex: 1,
        backgroundColor: '#F6FBF9',
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        overflow: 'hidden',
        marginTop: 45,
        paddingTop: 8,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 14,
        gap: 14,
        backgroundColor: '#FFFFFF',
        borderBottomWidth: 1,
        borderBottomColor: '#E2F0EC',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.03,
        shadowRadius: 2,
        elevation: 2,
    },
    backButton: { 
        padding: 6,
        backgroundColor: '#ECFDF5',
        borderRadius: 10,
    },
    headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    avatarContainer: { position: 'relative' },
    headerAvatar: { width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, borderColor: '#059669' },
    chatAvatar: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: '#059669' },
    onlineBadge: {
        position: 'absolute',
        bottom: 0,
        right: 0,
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: '#059669',
        borderWidth: 1.5,
        borderColor: '#FFFFFF',
    },
    titleContainer: { flexDirection: 'column' },
    screenTitle: { fontSize: 16, fontWeight: '700', color: '#064E3B', letterSpacing: -0.2 },
    activeStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
    screenSubtitle: { fontSize: 11, color: '#047857', fontWeight: '500' },
    chatScrollContent: { padding: 16, paddingBottom: 20 },
    userMessageRow: { flexDirection: 'row', justifyContent: 'flex-end', marginVertical: 6 },
    userBubble: {
        backgroundColor: '#059669',
        borderRadius: 20,
        borderBottomRightRadius: 6,
        paddingHorizontal: 16,
        paddingVertical: 12,
        maxWidth: '80%',
        shadowColor: '#059669',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 4,
        elevation: 2,
    },
    userText: { color: '#FFFFFF', fontSize: 14, fontWeight: '500' },
    coachMessageRow: { flexDirection: 'row', alignItems: 'flex-start', marginVertical: 8, gap: 10 },
    coachContentContainer: { flex: 1 },
    coachBubble: {
        backgroundColor: '#FFFFFF',
        borderRadius: 20,
        borderBottomLeftRadius: 6,
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderWidth: 1,
        borderColor: '#D1E7DD',
        maxWidth: '92%',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.02,
        shadowRadius: 2,
        elevation: 1,
    },
    coachText: { color: '#064E3B', fontSize: 14, lineHeight: 21 },
    typingBubble: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 16,
        borderBottomLeftRadius: 4,
        borderWidth: 1,
        borderColor: '#D1E7DD',
        gap: 8,
    },
    typingDots: { flexDirection: 'row', gap: 3, alignItems: 'center' },
    dot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#059669' },
    dot1: { opacity: 0.4 },
    dot2: { opacity: 0.7 },
    dot3: { opacity: 1 },
    typingText: { fontSize: 12, color: '#047857', fontStyle: 'italic' },
    resultContainer: { 
        marginTop: 4, 
        gap: 12,
        backgroundColor: '#FFFFFF',
        padding: 16,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#D1E7DD',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 3,
    },
    aiCardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottomWidth: 1,
        borderBottomColor: '#E2F0EC',
        paddingBottom: 10,
    },
    aiCardTitleGroup: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    aiCardHeaderTitle: { fontSize: 13, fontWeight: '700', color: '#064E3B' },
    statusBadge: {
        paddingVertical: 4,
        paddingHorizontal: 10,
        borderRadius: 20,
    },
    statusText: { fontWeight: '700', fontSize: 11, letterSpacing: 0.3 },
    progressSection: { gap: 6, backgroundColor: '#F0FDF4', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#DCFCE7' },
    progressLabels: { flexDirection: 'row', justifyContent: 'space-between' },
    progressLabelText: { fontSize: 11, fontWeight: '600', color: '#047857' },
    progressBarBackground: { height: 8, backgroundColor: '#D1E7DD', borderRadius: 4, overflow: 'hidden' },
    progressBarFill: { height: '100%', backgroundColor: '#059669', borderRadius: 4 },
    metricsRow: { flexDirection: 'row', gap: 10 },
    metricCard: {
        flex: 1,
        backgroundColor: '#F0FDF4',
        padding: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#DCFCE7',
    },
    metricLabel: { fontSize: 11, color: '#047857', fontWeight: '500' },
    metricValue: { fontSize: 15, fontWeight: '700', color: '#064E3B', marginTop: 4 },
    summaryBox: {
        backgroundColor: '#F0FDF4',
        padding: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#DCFCE7',
    },
    summaryTitle: { fontSize: 12, fontWeight: '700', color: '#064E3B', marginBottom: 4 },
    summaryText: { fontSize: 12, color: '#065F46', lineHeight: 18 },
    tipCard: {
        flexDirection: 'row',
        gap: 10,
        backgroundColor: '#FFFBEB',
        padding: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#FDE68A',
        alignItems: 'flex-start',
    },
    tipIconBox: {
        backgroundColor: '#FEF3C7',
        padding: 6,
        borderRadius: 8,
    },
    tipTextContainer: { flex: 1 },
    tipTitle: { fontSize: 12, fontWeight: '700', color: '#92400E' },
    tipDescription: { fontSize: 11, color: '#B45309', marginTop: 2, lineHeight: 16 },
    bottomBarContainer: {
        padding: 12,
        backgroundColor: '#FFFFFF',
        borderTopWidth: 1,
        borderTopColor: '#E2F0EC',
        gap: 10,
    },
    chipsScroll: { flexDirection: 'row', paddingBottom: 4 },
    chipButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#ECFDF5',
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#A7F3D0',
        gap: 6,
        marginRight: 8,
    },
    chipText: { color: '#059669', fontWeight: '600', fontSize: 12 },
    inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    textInput: {
        flex: 1,
        backgroundColor: '#F6FBF9',
        borderWidth: 1,
        borderColor: '#D1E7DD',
        borderRadius: 24,
        paddingHorizontal: 16,
        paddingVertical: 10,
        fontSize: 14,
        color: '#064E3B',
    },
    sendButton: {
        backgroundColor: '#05968a',
        justifyContent: 'center',
        alignItems: 'center',
        width: 42,
        height: 42,
        borderRadius: 21,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 3,
        elevation: 2,
    },
    sendButtonDisabled: { backgroundColor: '#d1dad5', shadowOpacity: 0 },
});