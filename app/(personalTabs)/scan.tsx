// app/scan.tsx
import { Ionicons } from '@expo/vector-icons';
import { getAiModel } from '../../services/aiClient';
import { decode } from 'base64-arraybuffer';
import { CameraView, FlashMode, useCameraPermissions } from 'expo-camera';
import { Stack, useLocalSearchParams, usePathname, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming
} from 'react-native-reanimated';
import { supabase } from '../../lib/supabase';

const { width } = Dimensions.get('window');

interface AlertConfig {
  visible: boolean;
  title: string;
  message: string;
  type: 'success' | 'warning' | 'error' | 'info';
  buttons: {
    text: string;
    style?: 'default' | 'cancel' | 'destructive';
    onPress: () => void;
  }[];
}

export default function ScanReceiptScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const { incomeId: paramIncomeId } = useLocalSearchParams<{ incomeId?: string }>();

  const isFocused = pathname === '/scan' || pathname.includes('scan');

  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(false);
  const [frozenPhoto, setFrozenPhoto] = useState<string | null>(null);
  const [flash, setFlash] = useState<FlashMode>('off');
  const [torchOn, setTorchOn] = useState<boolean>(false);
  const cameraRef = useRef<any>(null);

  // Modern Custom Alert State
  const [alertConfig, setAlertConfig] = useState<AlertConfig>({
    visible: false,
    title: '',
    message: '',
    type: 'info',
    buttons: [],
  });

  // Laser animation value for scanning effect
  const scanAnim = useSharedValue(0);

  useEffect(() => {
    if (scanning) {
      scanAnim.value = withRepeat(
        withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.ease) }),
        -1,
        true
      );
    } else {
      scanAnim.value = 0;
    }
  }, [scanning]);

  const laserStyle = useAnimatedStyle(() => {
    const targetHeight = width * 1.15;
    return {
      transform: [
        {
          translateY: scanAnim.value * targetHeight,
        },
      ],
    };
  });

  if (!permission) {
    return (
      <View style={[styles.fallbackContainer, styles.centerAlign]}>
        <StatusBar style="dark" />
        <ActivityIndicator size="small" color="#0E2417" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[styles.fallbackContainer, styles.centerAlign, { paddingHorizontal: 32 }]}>
        <StatusBar style="dark" />
        <View style={styles.permissionIconCircle}>
          <Ionicons name="camera-outline" size={32} color="#475569" />
        </View>
        <Text style={styles.permissionTitle}>Camera Access Required</Text>
        <Text style={styles.permissionDescription}>
          To automatically scan and process transaction receipts with Payton, please grant camera permissions in your system choices.
        </Text>
        <TouchableOpacity style={styles.grantPermissionBtn} onPress={requestPermission}>
          <Text style={styles.grantPermissionBtnText}>Allow Camera Access</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const toggleFlash = () => {
    setTorchOn((prev) => !prev);
    setFlash((current) => (current === 'off' ? 'on' : 'off'));
  };

  const handleTakePicture = async () => {
    if (cameraRef.current && !scanning) {
      try {
        setScanning(true);
        
        const options = { quality: 0.7, base64: true, skipProcessing: false };
        const photo = await cameraRef.current.takePictureAsync(options);

        if (!photo.base64) {
          throw new Error("Unable to read valid image binary base64 data stream.");
        }

        // Freeze frame with captured URI for smooth UX transition
        setFrozenPhoto(photo.uri);

        const model = getAiModel('scan', { 
          model: "gemini-3.5-flash-lite",
          generationConfig: {
            responseMimeType: "application/json",
          }
        });

        const prompt = `
          Analyze this receipt image. Extract structural merchant properties, total amount, and classify the expense.

          ALLOWED CATEGORIES (Pick EXACTLY ONE from this list):
          - "Food" (7-Eleven, Fast food, Restaurants, Cafes, Bakeries, Convenience stores)
          - "Transportation" (Gas stations, Fare, Taxi, Grab, Parking)
          - "Utilities" (Water, Electricity, Internet, Phone bills)
          - "Shopping" (Clothing, Electronics, Malls, Retail)
          - "Entertainment" (Movies, Games, Recreation, Hobbies)
          - "Healthcare" (Pharmacy, Medicines, Clinic, Hospital)
          - "Education" (Tuition, Books, School supplies)

          Return a strict raw JSON matching this format:
          {
            "name": "string (Name of the merchant / store, max 25 characters)",
            "amount": number (Total amount/balance due as a numeric float value without currency symbol),
            "category": "string (Exact match from the ALLOWED CATEGORIES list above)"
          }
        `;

        const imagePart = {
          inlineData: {
            data: photo.base64,
            mimeType: "image/jpeg"
          },
        };

        const result = await model.generateContent([prompt, imagePart]);
        const responseText = result.response.text();
        
        const cleanJsonText = responseText.replace(/```json|```/g, '').trim();
        const extractedInfo = JSON.parse(cleanJsonText);

        const merchantName = extractedInfo.name || 'Scanned Receipt';
        const totalAmount = extractedInfo.amount || 0;
        const matchedCategory = extractedInfo.category || 'Food';

        setAlertConfig({
          visible: true,
          title: "Scan Complete",
          message: `${merchantName} • ₱${Number(totalAmount).toFixed(2)}\nCategory: ${matchedCategory}`,
          type: 'success',
          buttons: [
            {
              text: "Try Again",
              style: "cancel",
              onPress: () => {
                setAlertConfig(prev => ({ ...prev, visible: false }));
                setFrozenPhoto(null);
              }
            },
            {
              text: "Log Expense",
              onPress: async () => {
                setAlertConfig(prev => ({ ...prev, visible: false }));
                try {
                  const { data: { user }, error: userError } = await supabase.auth.getUser();
                  if (userError || !user) throw new Error("You must be logged in to log expenses.");

                  let targetIncomeId = paramIncomeId;

                  // 1. Get the latest income ID for inserting the expense
                  const { data: latestIncome, error: latestError } = await supabase
                    .from('income')
                    .select('id')
                    .eq('user_id', user.id)
                    .order('received_at', { ascending: false })
                    .limit(1)
                    .single();

                  if (latestError || !latestIncome) {
                    setAlertConfig({
                      visible: true,
                      title: "No Income Found",
                      message: "No active income was detected for your account. Please set up an income before logging expenses.",
                      type: 'warning',
                      buttons: [{ text: "Got It", onPress: () => setAlertConfig(prev => ({ ...prev, visible: false })) }]
                    });
                    setFrozenPhoto(null);
                    return;
                  }

                  targetIncomeId = latestIncome.id;

                  // If a specific income ID was passed in params, verify it exists
                  if (paramIncomeId) {
                    const { data: specificIncome } = await supabase
                      .from('income')
                      .select('id')
                      .eq('id', paramIncomeId)
                      .single();

                    if (specificIncome) {
                      targetIncomeId = specificIncome.id;
                    }
                  }

                  // 2. Calculate total available income across ALL income for this personal
                  const { data: allIncomes, error: incomeError } = await supabase
                    .from('income')
                    .select('id, amount')
                    .eq('user_id', user.id);

                  if (incomeError || !allIncomes || allIncomes.length === 0) {
                    throw new Error("Could not retrieve income details.");
                  }

                  const totalIncomeAmount = allIncomes.reduce((sum, item) => sum + Number(item.amount || 0), 0);
                  const incomeIds = allIncomes.map(item => item.id);

                  // 3. Calculate total spent across ALL income for this personal
                  const { data: spentData, error: spentError } = await supabase
                    .from('expenses')
                    .select('amount')
                    .in('income_id', incomeIds);

                  if (spentError) throw spentError;

                  const totalSpent = (spentData || []).reduce((sum, item) => sum + Number(item.amount || 0), 0);
                  const remainingTotalIncome = totalIncomeAmount - totalSpent;

                  // 4. Check if expense amount is greater than the cumulative remaining income
                  if (Number(totalAmount) > remainingTotalIncome) {
                    setAlertConfig({
                      visible: true,
                      title: "Amount Exceeded",
                      message: `The scanned amount (₱${Number(totalAmount).toFixed(2)}) is greater than your total remaining income balance across all funds (₱${remainingTotalIncome.toFixed(2)}).`,
                      type: 'warning',
                      buttons: [{ text: "Got It", onPress: () => setAlertConfig(prev => ({ ...prev, visible: false })) }]
                    });
                    setFrozenPhoto(null);
                    return;
                  }

                  const { data: categoryData } = await supabase
                    .from('categories')
                    .select('id')
                    .eq('name', matchedCategory)
                    .single();

                  const categoryId = categoryData ? categoryData.id : null;

                  const fileName = `${user.id}/${Date.now()}.jpg`;
                  const { error: uploadError } = await supabase.storage
                    .from('receipts')
                    .upload(fileName, decode(photo.base64), {
                      contentType: 'image/jpeg',
                      upsert: false
                    });

                  if (uploadError) throw uploadError;

                  const { data: urlData } = supabase.storage
                    .from('receipts')
                    .getPublicUrl(fileName);

                  const photoUrl = urlData.publicUrl;

                  const { error: insertError } = await supabase.from('expenses').insert([
                    { 
                      description: merchantName, 
                      amount: Number(totalAmount), 
                      income_id: targetIncomeId || null, 
                      spent_at: new Date().toISOString(),
                      user_id: user.id,
                      category_id: categoryId,
                      photo_url: photoUrl
                    }
                  ]);
                  
                  if (insertError) throw insertError;

                  // Log the successful scanned receipt/expense action matching your logs table schema
                  await supabase.from('logs').insert({
                    user_id: user.id,
                    details: `scanned receipt and logged expense "${merchantName}" (${Number(totalAmount)}).`,
                  });

                  setAlertConfig({
                    visible: true,
                    title: "Success",
                    message: "Expense and receipt logged successfully!",
                    type: 'success',
                    buttons: [{ text: "Done", onPress: () => {
                      setAlertConfig(prev => ({ ...prev, visible: false }));
                      router.replace('/transaction');
                    }}]
                  });
                } catch (dbError: any) {
                  console.error("Database/Storage Log Error:", dbError);
                  setAlertConfig({
                    visible: true,
                    title: "Error",
                    message: dbError.message || "Could not save the expense or upload the receipt.",
                    type: 'error',
                    buttons: [{ text: "Dismiss", onPress: () => setAlertConfig(prev => ({ ...prev, visible: false })) }]
                  });
                } finally {
                  setFrozenPhoto(null);
                }
              }
            }
          ]
        });

      } catch (error: any) {
        console.error("Gemini Scan Error:", error);
        setAlertConfig({
          visible: true,
          title: "Scan Failed",
          message: "Gemini could not read or structuralize the text nodes accurately. Make sure the receipt matches the green framing borders.",
          type: 'error',
          buttons: [{ text: "Try Again", onPress: () => setAlertConfig(prev => ({ ...prev, visible: false })) }]
        });
        setFrozenPhoto(null);
      } finally {
        setScanning(false);
      }
    }
  };

  const getAlertIconConfig = () => {
    switch (alertConfig.type) {
      case 'success':
        return { name: 'checkmark-circle' as const, color: '#10B981', bg: 'rgba(16, 185, 129, 0.15)' };
      case 'warning':
        return { name: 'warning' as const, color: '#F59E0B', bg: 'rgba(245, 158, 11, 0.15)' };
      case 'error':
        return { name: 'alert-circle' as const, color: '#EF4444', bg: 'rgba(239, 68, 68, 0.15)' };
      default:
        return { name: 'information-circle' as const, color: '#3B82F6', bg: 'rgba(59, 130, 246, 0.15)' };
    }
  };

  const alertIcon = getAlertIconConfig();

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" />
      
      {/* Live camera view or Frozen Image Preview */}
      {frozenPhoto ? (
        <Animated.Image source={{ uri: frozenPhoto }} style={StyleSheet.absoluteFill} />
      ) : isFocused ? (
        <CameraView 
          style={StyleSheet.absoluteFill} 
          ref={cameraRef} 
          facing="back"
          enableTorch={torchOn}
          active={isFocused}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: '#000000' }]} />
      )}

      {/* Modern Overlay & Scanning Target Box */}
      <View style={styles.overlayContainer}>
        <View style={styles.topUtilityRow}>
          <TouchableOpacity 
            style={styles.utilityRoundButton} 
            onPress={() => router.back()}
            activeOpacity={0.7}
          >
            <Ionicons name="close" size={22} color="#FFFFFF" />
          </TouchableOpacity>

          <View style={styles.badgeContainer}>
            <View style={styles.pulseDot} />
            <Text style={styles.instructionText}>AI Auto-Detect</Text>
          </View>

          <TouchableOpacity 
            style={[styles.utilityRoundButton, torchOn && styles.utilityButtonActive]} 
            onPress={toggleFlash}
            activeOpacity={0.7}
          >
            <Ionicons 
              name={torchOn ? "flash" : "flash-off-outline"} 
              size={20} 
              color={torchOn ? "#10B981" : "#FFFFFF"} 
            />
          </TouchableOpacity>
        </View>

        {/* Dynamic Edge Framing Target with Corner Highlights */}
        <View style={styles.scanTargetBox}>
          <View style={[styles.cornerMarker, styles.topLeftMarker]} />
          <View style={[styles.cornerMarker, styles.topRightMarker]} />
          <View style={[styles.cornerMarker, styles.bottomLeftMarker]} />
          <View style={[styles.cornerMarker, styles.bottomRightMarker]} />

          {/* Animated Laser Scanning Line */}
          {scanning && (
            <Animated.View style={[styles.laserLineContainer, laserStyle]}>
              <View style={styles.laserGlow} />
              <View style={styles.laserCore} />
            </Animated.View>
          )}
        </View>

        <View style={styles.safeBottomHeaderSpacer} />
      </View>

      {/* Bottom Shutter Controls */}
      <View style={styles.actionControlContainer}>
        {scanning ? (
          <View style={styles.loadingBlock}>
            <ActivityIndicator size="small" color="#10B981" />
            <Text style={styles.loadingText}>Extracting receipt data via Gemini...</Text>
          </View>
        ) : (
          <TouchableOpacity 
            style={styles.outerCaptureRing} 
            onPress={handleTakePicture}
            activeOpacity={0.8}
          >
            <View style={styles.innerCaptureSolid} />
          </TouchableOpacity>
        )}
      </View>

      {/* Modern Custom Alert Modal */}
      <Modal transparent visible={alertConfig.visible} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.alertContainer}>
            <View style={[styles.iconContainer, { backgroundColor: alertIcon.bg }]}>
              <Ionicons name={alertIcon.name} size={28} color={alertIcon.color} />
            </View>

            <Text style={styles.alertTitle}>{alertConfig.title}</Text>
            <Text style={styles.alertMessage}>{alertConfig.message}</Text>

            <View style={styles.buttonGroup}>
              {alertConfig.buttons.map((btn, index) => {
                const isCancel = btn.style === 'cancel';
                return (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.alertButton,
                      isCancel ? styles.cancelButton : styles.primaryButton,
                      alertConfig.buttons.length > 1 && { flex: 1 },
                    ]}
                    activeOpacity={0.8}
                    onPress={btn.onPress}
                  >
                    <Text
                      style={[
                        styles.buttonText,
                        isCancel ? styles.cancelButtonText : styles.primaryButtonText,
                      ]}
                    >
                      {btn.text}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  fallbackContainer: { flex: 1, backgroundColor: '#FAFBFD' },
  centerAlign: { justifyContent: 'center', alignItems: 'center' },
  topUtilityRow: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Platform.OS === 'android' ? 50 : 10,
  },
  utilityRoundButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(15, 23, 42, 0.6)', 
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)'
  },
  utilityButtonActive: {
    backgroundColor: '#FFFFFF',
    borderColor: '#10B981'
  },
  badgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    gap: 8,
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
  },
  instructionText: { 
    color: '#FFFFFF', 
    fontSize: 13, 
    fontWeight: '600', 
    letterSpacing: 0.2,
  },
  overlayContainer: { 
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'space-between', 
    alignItems: 'center', 
    backgroundColor: 'rgba(3, 7, 18, 0.55)', 
    paddingHorizontal: 20,
    paddingBottom: 110,
  },
  scanTargetBox: { 
    width: width * 0.82, 
    height: width * 1.2, 
    borderWidth: 1.5, 
    borderColor: 'rgba(16, 185, 129, 0.4)', 
    borderRadius: 28, 
    backgroundColor: 'transparent',
    overflow: 'hidden',
    position: 'relative'
  },
  cornerMarker: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderColor: '#10B981',
    borderWidth: 3,
  },
  topLeftMarker: {
    top: -2,
    left: -2,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderTopLeftRadius: 18,
  },
  topRightMarker: {
    top: -2,
    right: -2,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
    borderTopRightRadius: 18,
  },
  bottomLeftMarker: {
    bottom: -2,
    left: -2,
    borderRightWidth: 0,
    borderTopWidth: 0,
    borderBottomLeftRadius: 18,
  },
  bottomRightMarker: {
    bottom: -2,
    right: -2,
    borderLeftWidth: 0,
    borderTopWidth: 0,
    borderBottomRightRadius: 18,
  },
  laserLineContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  laserCore: {
    width: '90%',
    height: 3,
    backgroundColor: '#34D399',
    borderRadius: 2,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 10,
    elevation: 8,
  },
  laserGlow: {
    position: 'absolute',
    width: '100%',
    height: 16,
    backgroundColor: 'rgba(52, 211, 153, 0.15)',
  },
  safeBottomHeaderSpacer: { marginBottom: 10 },
  actionControlContainer: { 
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(3, 7, 18, 0.9)', 
    paddingTop: 24,
    paddingBottom: Platform.OS === 'ios' ? 44 : 28, 
    alignItems: 'center', 
    justifyContent: 'center',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)'
  },
  outerCaptureRing: { 
    width: 78, 
    height: 78, 
    borderRadius: 39, 
    borderWidth: 4, 
    borderColor: '#FFFFFF', 
    justifyContent: 'center', 
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5
  },
  innerCaptureSolid: { 
    width: 60, 
    height: 60, 
    borderRadius: 30, 
    backgroundColor: '#10B981' 
  },
  loadingBlock: { 
    alignItems: 'center', 
    flexDirection: 'row', 
    gap: 12,
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)'
  },
  loadingText: { color: '#E2E8F0', fontSize: 13, fontWeight: '600', letterSpacing: -0.2 },
  permissionIconCircle: { 
    width: 64, 
    height: 64, 
    borderRadius: 20, 
    backgroundColor: '#F1F5F9', 
    justifyContent: 'center', 
    alignItems: 'center', 
    marginBottom: 5,
    borderWidth: 1,
    borderColor: '#E2E8F0'
  },
  permissionTitle: { fontSize: 20, fontWeight: '700', color: '#1E293B', textAlign: 'center', letterSpacing: -0.4 },
  permissionDescription: { fontSize: 14, color: '#64748B', textAlign: 'center', marginTop: 8, lineHeight: 22, fontWeight: '400' },
  grantPermissionBtn: { backgroundColor: '#1E293B', paddingVertical: 14, paddingHorizontal: 28, borderRadius: 16, marginTop: 28 },
  grantPermissionBtnText: { color: '#FFFFFF', fontWeight: '600', fontSize: 14 },

  // Custom Alert Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(3, 7, 18, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  alertContainer: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#0F172A',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 10,
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  alertTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#F8FAFC',
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  alertMessage: {
    fontSize: 14,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  buttonGroup: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  alertButton: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButton: {
    backgroundColor: '#10B981',
    flex: 1,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  cancelButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    flex: 1,
  },
  cancelButtonText: {
    color: '#E2E8F0',
    fontWeight: '600',
    fontSize: 14,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '600',
  }
});