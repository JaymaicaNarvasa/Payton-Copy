// app/scan.tsx
import { theme } from '@/constants/theme';
import { scanStyles as styles } from '@/constants/ui.styles';
import { Ionicons } from '@expo/vector-icons';
import { decode } from 'base64-arraybuffer';
import { CameraView, FlashMode, useCameraPermissions } from 'expo-camera';
import { Stack, useLocalSearchParams, usePathname, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
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
import { PaytonAlertDialog } from '../../components/PaytonAlert';
import { supabase } from '../../lib/supabase';
import { getAiModel } from '../../services/aiClient';

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
  const { allowanceId: paramAllowanceId } = useLocalSearchParams<{ allowanceId?: string }>();

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
        <ActivityIndicator size="small" color={theme.colors.forestDeep} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[styles.fallbackContainer, styles.centerAlign, { paddingHorizontal: theme.space[32] }]}>
        <StatusBar style="dark" />
        <View style={styles.permissionIconCircle}>
          <Ionicons name="camera-outline" size={32} color={theme.colors.textSecondary} />
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

                  let targetAllowanceId = paramAllowanceId;

                  // 1. Get the latest allowance ID for inserting the expense
                  const { data: latestAllowance, error: latestError } = await supabase
                    .from('allowances')
                    .select('id')
                    .eq('spender_id', user.id)
                    .order('received_at', { ascending: false })
                    .limit(1)
                    .single();

                  if (latestError || !latestAllowance) {
                    setAlertConfig({
                      visible: true,
                      title: "No Allowance Found",
                      message: "No active allowance was detected for your account. Please set up an allowance before logging expenses.",
                      type: 'warning',
                      buttons: [{ text: "Got It", onPress: () => setAlertConfig(prev => ({ ...prev, visible: false })) }]
                    });
                    setFrozenPhoto(null);
                    return;
                  }

                  targetAllowanceId = latestAllowance.id;

                  // If a specific allowance ID was passed in params, verify it exists
                  if (paramAllowanceId) {
                    const { data: specificAllowance } = await supabase
                      .from('allowances')
                      .select('id')
                      .eq('id', paramAllowanceId)
                      .single();

                    if (specificAllowance) {
                      targetAllowanceId = specificAllowance.id;
                    }
                  }

                  // 2. Calculate total available allowance across ALL allowances for this spender
                  const { data: allAllowances, error: allowancesError } = await supabase
                    .from('allowances')
                    .select('id, amount')
                    .eq('spender_id', user.id);

                  if (allowancesError || !allAllowances || allAllowances.length === 0) {
                    throw new Error("Could not retrieve allowance details.");
                  }

                  const totalAllowanceAmount = allAllowances.reduce((sum, item) => sum + Number(item.amount || 0), 0);
                  const allowanceIds = allAllowances.map(item => item.id);

                  // 3. Calculate total spent across ALL allowances
                  const { data: spentData, error: spentError } = await supabase
                    .from('expenses')
                    .select('amount')
                    .in('allowance_id', allowanceIds);

                  if (spentError) throw spentError;

                  const totalSpent = (spentData || []).reduce((sum, item) => sum + Number(item.amount || 0), 0);
                  const remainingTotalAllowance = totalAllowanceAmount - totalSpent;

                  // 4. Check if expense amount is greater than the cumulative remaining allowance
                  if (Number(totalAmount) > remainingTotalAllowance) {
                    setAlertConfig({
                      visible: true,
                      title: "Amount Exceeded",
                      message: `The scanned amount (₱${Number(totalAmount).toFixed(2)}) is greater than your total remaining allowance balance across all funds (₱${remainingTotalAllowance.toFixed(2)}).`,
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
                      allowance_id: targetAllowanceId || null, 
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
        <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.black }]} />
      )}

      {/* Modern Overlay & Scanning Target Box */}
      <View style={styles.overlayContainer}>
        <View style={styles.topUtilityRow}>
          <TouchableOpacity 
            style={styles.utilityRoundButton} 
            onPress={() => router.back()}
            activeOpacity={0.7}
          >
            <Ionicons name="close" size={22} color={theme.colors.white} />
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
              color={torchOn ? theme.colors.emerald : theme.colors.white} 
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
            <ActivityIndicator size="small" color={theme.colors.emerald} />
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

      {/* Shared Payton alert */}
      <PaytonAlertDialog
        {...alertConfig}
        onDismiss={() => setAlertConfig(prev => ({ ...prev, visible: false }))}
      />
    </View>
  );
}