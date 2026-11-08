// app/scan.tsx (Spender)
import { theme } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { decode } from 'base64-arraybuffer';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Stack, useLocalSearchParams, usePathname, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Dimensions, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  FadeIn,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PaytonAlertDialog } from '../../components/PaytonAlert';
import { supabase } from '../../lib/supabase';
import { getAiModel } from '../../services/aiClient';

/* -------------------------------------------------------------------------- */
/*                                   Config                                   */
/* -------------------------------------------------------------------------- */

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

const MODEL_NAME = 'gemini-3.5-flash-lite';

// Live receipt tracking. Set to false to use a fixed, centered frame instead
// (saves API calls). Each detection tick sends one small snapshot to Gemini.
const LIVE_DETECTION = true;
const DETECT_INTERVAL_MS = 1600;
const MISSES_BEFORE_RELEASE = 2; // consecutive misses before the frame lets go

const CATEGORIES = [
  'Food',
  'Transportation',
  'Utilities',
  'Shopping',
  'Entertainment',
  'Healthcare',
  'Education',
] as const;

const DEFAULT_FRAME_W = SCREEN_W * 0.82;
const DEFAULT_FRAME_H = DEFAULT_FRAME_W * 1.3;
const DEFAULT_FRAME = {
  x: (SCREEN_W - DEFAULT_FRAME_W) / 2,
  y: (SCREEN_H - DEFAULT_FRAME_H) / 2 - 40,
  w: DEFAULT_FRAME_W,
  h: DEFAULT_FRAME_H,
};

const MASK_COLOR = 'rgba(0,0,0,0.55)';
const CORNER_IDLE = 'rgba(255,255,255,0.92)';
const SPRING = { damping: 20, stiffness: 160, mass: 0.8 };

/* -------------------------------------------------------------------------- */
/*                                    Types                                   */
/* -------------------------------------------------------------------------- */

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

interface ExtractedReceipt {
  name: string;
  amount: number;
  category: string;
}

interface NormalizedBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

class ScanFlowError extends Error {
  constructor(
    public title: string,
    message: string,
    public kind: 'warning' | 'error' = 'warning'
  ) {
    super(message);
  }
}

/* -------------------------------------------------------------------------- */
/*                                   Helpers                                  */
/* -------------------------------------------------------------------------- */

const parseJson = (text: string) => JSON.parse(text.replace(/```json|```/g, '').trim());

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Converts a box normalized to the captured photo into screen pixels,
 * accounting for the preview being "cover"-fitted (cropped) on screen.
 */
const photoBoxToScreen = (box: NormalizedBox, photoW: number, photoH: number) => {
  const scale = Math.max(SCREEN_W / photoW, SCREEN_H / photoH);
  const dispW = photoW * scale;
  const dispH = photoH * scale;
  const offX = (dispW - SCREEN_W) / 2;
  const offY = (dispH - SCREEN_H) / 2;

  const pad = 0.015; // hug slightly outside the receipt edges
  let x = (box.x - pad) * dispW - offX;
  let y = (box.y - pad) * dispH - offY;
  let w = (box.width + pad * 2) * dispW;
  let h = (box.height + pad * 2) * dispH;

  x = Math.max(8, x);
  y = Math.max(8, y);
  w = Math.min(w, SCREEN_W - 8 - x);
  h = Math.min(h, SCREEN_H - 8 - y);
  return { x, y, w, h };
};

/* -------------------------------------------------------------------------- */
/*                               Small components                             */
/* -------------------------------------------------------------------------- */

function SkeletonBlock({ style }: { style: object }) {
  const pulse = useSharedValue(0.4);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) }), -1, true);
    return () => cancelAnimation(pulse);
  }, []);
  const animated = useAnimatedStyle(() => ({ opacity: pulse.value }));
  return <Animated.View style={[styles.skeleton, style, animated]} />;
}

function RoundButton({
  icon,
  label,
  onPress,
  disabled,
  active,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <View style={styles.sideSlot}>
      <TouchableOpacity
        style={[styles.roundButton, active && styles.roundButtonActive, disabled && styles.disabled]}
        onPress={onPress}
        disabled={disabled}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <Ionicons
          name={icon}
          size={22}
          color={active ? theme.colors.forestDeep : theme.colors.white}
        />
      </TouchableOpacity>
      <Text style={[styles.sideLabel, disabled && styles.disabled]}>{label}</Text>
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/*                                   Screen                                   */
/* -------------------------------------------------------------------------- */

export default function ScanReceiptScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { allowanceId: paramAllowanceId } = useLocalSearchParams<{ allowanceId?: string }>();

  const isFocused = pathname === '/scan' || pathname.includes('scan');

  const [permission, requestPermission] = useCameraPermissions();
  const [cameraReady, setCameraReady] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [detected, setDetected] = useState(false);
  const [frozenPhoto, setFrozenPhoto] = useState<string | null>(null);
  const [torchOn, setTorchOn] = useState(false);

  const cameraRef = useRef<CameraView>(null);
  const detectModelRef = useRef<any>(null);
  const detectingRef = useRef(false);
  const missesRef = useRef(0);
  const savingRef = useRef(false);
  const pausedRef = useRef(false);

  const [alertConfig, setAlertConfig] = useState<AlertConfig>({
    visible: false,
    title: '',
    message: '',
    type: 'info',
    buttons: [],
  });

  const closeAlert = useCallback(() => setAlertConfig((prev) => ({ ...prev, visible: false })), []);
  const showAlert = useCallback(
    (config: Omit<AlertConfig, 'visible'>) => setAlertConfig({ visible: true, ...config }),
    []
  );

  pausedRef.current = scanning || !!frozenPhoto || alertConfig.visible;

  /* ----------------------------- Animated values ---------------------------- */

  const fx = useSharedValue(DEFAULT_FRAME.x);
  const fy = useSharedValue(DEFAULT_FRAME.y);
  const fw = useSharedValue(DEFAULT_FRAME.w);
  const fh = useSharedValue(DEFAULT_FRAME.h);
  const lock = useSharedValue(0); // 0 = searching, 1 = receipt locked
  const laser = useSharedValue(0);
  const laserOpacity = useSharedValue(0);
  const pulse = useSharedValue(0);

  // Dimmed overlay with a cut-out that follows the frame.
  const maskTop = useAnimatedStyle(() => ({ top: 0, left: 0, right: 0, height: fy.value }));
  const maskBottom = useAnimatedStyle(() => ({ top: fy.value + fh.value, left: 0, right: 0, bottom: 0 }));
  const maskLeft = useAnimatedStyle(() => ({ top: fy.value, height: fh.value, left: 0, width: fx.value }));
  const maskRight = useAnimatedStyle(() => ({
    top: fy.value,
    height: fh.value,
    left: fx.value + fw.value,
    right: 0,
  }));

  const frameStyle = useAnimatedStyle(() => ({
    left: fx.value,
    top: fy.value,
    width: fw.value,
    height: fh.value,
  }));

  const cornerStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(lock.value, [0, 1], [CORNER_IDLE, theme.colors.emerald]),
    opacity: 0.8 + pulse.value * 0.2,
  }));

  const laserStyle = useAnimatedStyle(() => ({
    opacity: laserOpacity.value,
    transform: [{ translateY: laser.value * (fh.value - 2) }],
  }));

  useEffect(() => {
    if (scanning) {
      laserOpacity.value = withTiming(1, { duration: 200 });
      laser.value = withRepeat(withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.quad) }), -1, true);
      pulse.value = withRepeat(withTiming(1, { duration: 700, easing: Easing.inOut(Easing.ease) }), -1, true);
    } else {
      cancelAnimation(laser);
      cancelAnimation(pulse);
      laserOpacity.value = withTiming(0, { duration: 200 });
      laser.value = 0;
      pulse.value = withTiming(0, { duration: 200 });
    }
  }, [scanning]);

  /* --------------------------- Live receipt tracking ------------------------- */

  const moveFrame = useCallback(
    (box: { x: number; y: number; w: number; h: number }, locked: boolean) => {
      fx.value = withSpring(box.x, SPRING);
      fy.value = withSpring(box.y, SPRING);
      fw.value = withSpring(box.w, SPRING);
      fh.value = withSpring(box.h, SPRING);
      lock.value = withTiming(locked ? 1 : 0, { duration: 220 });
      setDetected(locked);
    },
    []
  );

  const detectReceipt = useCallback(async () => {
    if (detectingRef.current || pausedRef.current || !cameraRef.current) return;
    detectingRef.current = true;
    try {
      const snap = await cameraRef.current.takePictureAsync({
        quality: 0.15,
        base64: true,
        skipProcessing: false,
        shutterSound: false,
      });
      if (!snap?.base64 || pausedRef.current) return;

      if (!detectModelRef.current) {
        detectModelRef.current = getAiModel('scan', {
          model: MODEL_NAME,
          generationConfig: { responseMimeType: 'application/json', temperature: 0 },
        });
      }

      const result = await detectModelRef.current.generateContent([
        `Find the single receipt, bill or paper slip in this image.
Return strict JSON with its bounding box normalized from 0 to 1 relative to the image width and height:
{"found": boolean, "x": number (left edge), "y": number (top edge), "width": number, "height": number}
If no receipt is clearly visible, return {"found": false, "x": 0, "y": 0, "width": 0, "height": 0}.`,
        { inlineData: { data: snap.base64, mimeType: 'image/jpeg' } },
      ]);

      if (pausedRef.current) return;

      const box = parseJson(result.response.text()) as NormalizedBox & { found: boolean };
      const valid =
        box.found &&
        box.width > 0.15 &&
        box.height > 0.15 &&
        box.x >= 0 &&
        box.y >= 0 &&
        box.x + box.width <= 1.02 &&
        box.y + box.height <= 1.02;

      if (valid) {
        missesRef.current = 0;
        moveFrame(photoBoxToScreen(box, snap.width, snap.height), true);
      } else {
        missesRef.current += 1;
        if (missesRef.current >= MISSES_BEFORE_RELEASE) moveFrame(DEFAULT_FRAME, false);
      }
    } catch {
      // Detection is best-effort; never surface errors to the user.
    } finally {
      detectingRef.current = false;
    }
  }, [moveFrame]);

  useEffect(() => {
    if (!LIVE_DETECTION || !permission?.granted || !isFocused || !cameraReady) return;
    const id = setInterval(detectReceipt, DETECT_INTERVAL_MS);
    return () => clearInterval(id);
  }, [permission?.granted, isFocused, cameraReady, detectReceipt]);

  /* ------------------------------ Receipt flow ------------------------------ */

  const extractReceipt = async (base64: string): Promise<ExtractedReceipt> => {
    const model = getAiModel('scan', {
      model: MODEL_NAME,
      generationConfig: { responseMimeType: 'application/json' },
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

    const result = await model.generateContent([
      prompt,
      { inlineData: { data: base64, mimeType: 'image/jpeg' } },
    ]);
    const info = parseJson(result.response.text());

    const amount = Number(info.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new ScanFlowError(
        'No Total Found',
        "We couldn't find a total amount on this receipt. Try again with the whole receipt in view.",
        'warning'
      );
    }

    const category =
      CATEGORIES.find((c) => c.toLowerCase() === String(info.category || '').toLowerCase()) ?? 'Food';

    return {
      name: String(info.name || 'Scanned Receipt').slice(0, 25),
      amount,
      category,
    };
  };

  const saveExpense = async (receipt: ExtractedReceipt, base64: string) => {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) throw new Error('You must be logged in to log expenses.');

    // All allowances for this spender (newest first) for balance check + target allowance.
    const { data: allAllowances, error: allowancesError } = await supabase
      .from('allowances')
      .select('id, amount')
      .eq('spender_id', user.id)
      .order('received_at', { ascending: false });

    if (allowancesError) throw new Error('Could not retrieve allowance details.');
    if (!allAllowances || allAllowances.length === 0) {
      throw new ScanFlowError(
        'No Allowance Found',
        'No active allowance was detected for your account. Please set up an allowance before logging expenses.'
      );
    }

    const targetAllowanceId =
      (paramAllowanceId && allAllowances.find((a) => a.id === paramAllowanceId)?.id) || allAllowances[0].id;

    const totalAllowance = allAllowances.reduce((sum, a) => sum + Number(a.amount || 0), 0);
    const { data: spentData, error: spentError } = await supabase
      .from('expenses')
      .select('amount')
      .in('allowance_id', allAllowances.map((a) => a.id));
    if (spentError) throw spentError;

    const totalSpent = (spentData || []).reduce((sum, e) => sum + Number(e.amount || 0), 0);
    const remaining = totalAllowance - totalSpent;

    if (receipt.amount > remaining) {
      throw new ScanFlowError(
        'Amount Exceeded',
        `The scanned amount (₱${receipt.amount.toFixed(2)}) is greater than your total remaining allowance balance across all funds (₱${remaining.toFixed(2)}).`
      );
    }

    const { data: categoryData } = await supabase
      .from('categories')
      .select('id')
      .eq('name', receipt.category)
      .single();

    const fileName = `${user.id}/${Date.now()}.jpg`;
    const { error: uploadError } = await supabase.storage
      .from('receipts')
      .upload(fileName, decode(base64), { contentType: 'image/jpeg', upsert: false });
    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage.from('receipts').getPublicUrl(fileName);

    const { error: insertError } = await supabase.from('expenses').insert([
      {
        description: receipt.name,
        amount: receipt.amount,
        allowance_id: targetAllowanceId,
        spent_at: new Date().toISOString(),
        user_id: user.id,
        category_id: categoryData?.id ?? null,
        photo_url: urlData.publicUrl,
      },
    ]);
    if (insertError) throw insertError;

    await supabase.from('logs').insert({
      user_id: user.id,
      details: `scanned receipt and logged expense "${receipt.name}" (${receipt.amount}).`,
    });
  };

  const handleLogExpense = async (receipt: ExtractedReceipt, base64: string) => {
    if (savingRef.current) return;
    savingRef.current = true;
    closeAlert();
    try {
      await saveExpense(receipt, base64);
      showAlert({
        title: 'Success',
        message: 'Expense and receipt logged successfully!',
        type: 'success',
        buttons: [
          {
            text: 'Done',
            onPress: () => {
              closeAlert();
              router.replace('/transaction');
            },
          },
        ],
      });
    } catch (err: any) {
      const flow = err instanceof ScanFlowError ? err : null;
      if (!flow) console.error('Database/Storage Log Error:', err);
      showAlert({
        title: flow?.title ?? 'Error',
        message: err?.message || 'Could not save the expense or upload the receipt.',
        type: flow?.kind ?? 'error',
        buttons: [{ text: flow ? 'Got It' : 'Dismiss', onPress: closeAlert }],
      });
    } finally {
      savingRef.current = false;
      setFrozenPhoto(null);
    }
  };

  const handleTakePicture = async () => {
    if (!cameraRef.current || scanning) return;

    setScanning(true);
    pausedRef.current = true;

    try {
      // Let any in-flight detection snapshot finish so captures don't collide.
      for (let i = 0; i < 20 && detectingRef.current; i++) await sleep(100);

      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.7,
        base64: true,
        skipProcessing: false,
      });
      if (!photo?.base64) throw new Error('Unable to read image data.');

      setFrozenPhoto(photo.uri); // freeze the frame for a smooth transition

      const receipt = await extractReceipt(photo.base64);
      const base64 = photo.base64;

      showAlert({
        title: 'Scan Complete',
        message: `${receipt.name} • ₱${receipt.amount.toFixed(2)}\nCategory: ${receipt.category}`,
        type: 'success',
        buttons: [
          {
            text: 'Try Again',
            style: 'cancel',
            onPress: () => {
              closeAlert();
              setFrozenPhoto(null);
            },
          },
          { text: 'Log Expense', onPress: () => handleLogExpense(receipt, base64) },
        ],
      });
    } catch (error: any) {
      const flow = error instanceof ScanFlowError ? error : null;
      if (!flow) console.error('Gemini Scan Error:', error);
      showAlert({
        title: flow?.title ?? 'Scan Failed',
        message:
          flow?.message ??
          "We couldn't read this receipt. Make sure it's well lit, flat, and fully inside the frame.",
        type: flow?.kind ?? 'error',
        buttons: [{ text: 'Try Again', onPress: closeAlert }],
      });
      setFrozenPhoto(null);
    } finally {
      setScanning(false);
    }
  };

  const toggleTorch = () => setTorchOn((prev) => !prev);

  /* --------------------------------- Render --------------------------------- */

  if (!permission) {
    // Skeleton instead of a spinner while permission state loads.
    return (
      <View style={styles.fallbackContainer}>
        <StatusBar style="dark" />
        <SkeletonBlock style={{ width: 72, height: 72, borderRadius: 36, marginBottom: 24 }} />
        <SkeletonBlock style={{ width: 200, height: 20, borderRadius: 8, marginBottom: 12 }} />
        <SkeletonBlock style={{ width: 260, height: 14, borderRadius: 7, marginBottom: 8 }} />
        <SkeletonBlock style={{ width: 220, height: 14, borderRadius: 7 }} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[styles.fallbackContainer, { paddingHorizontal: theme.space[32] }]}>
        <StatusBar style="dark" />
        <View style={styles.permissionIconCircle}>
          <Ionicons name="camera-outline" size={32} color={theme.colors.textSecondary} />
        </View>
        <Text style={styles.permissionTitle}>Camera Access Required</Text>
        <Text style={styles.permissionDescription}>
          To scan and process receipts with Payton, please allow camera access.
        </Text>
        <TouchableOpacity style={styles.grantButton} onPress={requestPermission} activeOpacity={0.85}>
          <Text style={styles.grantButtonText}>Allow Camera Access</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.grantSecondary} onPress={() => router.back()} activeOpacity={0.7}>
          <Text style={styles.grantSecondaryText}>Not now</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const statusText = scanning
    ? 'Reading receipt…'
    : detected
    ? 'Receipt detected · tap to capture'
    : 'Align the receipt inside the frame';

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" />

      {/* Live camera / frozen capture */}
      {frozenPhoto ? (
        <Animated.Image
          entering={FadeIn.duration(180)}
          source={{ uri: frozenPhoto }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />
      ) : isFocused ? (
        <CameraView
          style={StyleSheet.absoluteFill}
          ref={cameraRef}
          facing="back"
          enableTorch={torchOn}
          active={isFocused}
          onCameraReady={() => setCameraReady(true)}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.black }]} />
      )}

      {/* Dimmed surround that follows the frame */}
      <Animated.View pointerEvents="none" style={[styles.mask, maskTop]} />
      <Animated.View pointerEvents="none" style={[styles.mask, maskBottom]} />
      <Animated.View pointerEvents="none" style={[styles.mask, maskLeft]} />
      <Animated.View pointerEvents="none" style={[styles.mask, maskRight]} />

      {/* Tracking frame */}
      <Animated.View pointerEvents="none" style={[styles.frame, frameStyle]}>
        <Animated.View style={[styles.corner, styles.cornerTL, cornerStyle]} />
        <Animated.View style={[styles.corner, styles.cornerTR, cornerStyle]} />
        <Animated.View style={[styles.corner, styles.cornerBL, cornerStyle]} />
        <Animated.View style={[styles.corner, styles.cornerBR, cornerStyle]} />

        {/* Scanning beam */}
        <Animated.View style={[styles.laser, laserStyle]}>
          <View style={styles.laserGlowOuter} />
          <View style={styles.laserGlowInner} />
          <View style={styles.laserCore} />
        </Animated.View>
      </Animated.View>

      {/* Status pill */}
      <View pointerEvents="none" style={[styles.pillWrap, { top: insets.top + 14 }]}>
        <View style={styles.pill}>
          <View style={[styles.pillDot, (detected || scanning) && styles.pillDotActive]} />
          <Text style={styles.pillText}>{statusText}</Text>
        </View>
      </View>

      {/* Bottom controls: cancel · capture · flash */}
      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 16) + 12 }]}>
        <RoundButton icon="close" label="Cancel" onPress={() => router.back()} disabled={scanning} />

        <TouchableOpacity
          style={[styles.captureRing, scanning && styles.disabledCapture]}
          onPress={handleTakePicture}
          disabled={scanning}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Capture receipt"
        >
          <View style={[styles.captureInner, scanning && styles.captureInnerBusy]} />
        </TouchableOpacity>

        <RoundButton
          icon={torchOn ? 'flash' : 'flash-off-outline'}
          label="Flash"
          onPress={toggleTorch}
          active={torchOn}
          disabled={scanning}
        />
      </View>

      <PaytonAlertDialog {...alertConfig} onDismiss={closeAlert} />
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/*                                   Styles                                   */
/* -------------------------------------------------------------------------- */

const CORNER = 30;
const CORNER_W = 4;
const CORNER_R = 12;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.black },

  // Permission / fallback
  fallbackContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.white,
  },
  skeleton: { backgroundColor: 'rgba(0,0,0,0.08)' },
  permissionIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.05)',
    marginBottom: 24,
  },
  permissionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.forestDeep,
    marginBottom: 10,
    textAlign: 'center',
  },
  permissionDescription: {
    fontSize: 14,
    lineHeight: 21,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: 28,
  },
  grantButton: {
    alignSelf: 'stretch',
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.forestDeep,
  },
  grantButtonText: { color: theme.colors.white, fontSize: 15, fontWeight: '600' },
  grantSecondary: { marginTop: 14, padding: 8 },
  grantSecondaryText: { color: theme.colors.textSecondary, fontSize: 14, fontWeight: '500' },

  // Overlay
  mask: { position: 'absolute', backgroundColor: MASK_COLOR },
  frame: { position: 'absolute', overflow: 'visible' },
  corner: { position: 'absolute', width: CORNER, height: CORNER, borderColor: CORNER_IDLE },
  cornerTL: { top: 0, left: 0, borderTopWidth: CORNER_W, borderLeftWidth: CORNER_W, borderTopLeftRadius: CORNER_R },
  cornerTR: { top: 0, right: 0, borderTopWidth: CORNER_W, borderRightWidth: CORNER_W, borderTopRightRadius: CORNER_R },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: CORNER_W, borderLeftWidth: CORNER_W, borderBottomLeftRadius: CORNER_R },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: CORNER_W, borderRightWidth: CORNER_W, borderBottomRightRadius: CORNER_R },

  // Scan beam
  laser: { position: 'absolute', left: 6, right: 6, top: 0, height: 2, justifyContent: 'center' },
  laserGlowOuter: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 64,
    top: -31,
    borderRadius: 32,
    backgroundColor: theme.colors.emerald,
    opacity: 0.1,
  },
  laserGlowInner: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 22,
    top: -10,
    borderRadius: 11,
    backgroundColor: theme.colors.emerald,
    opacity: 0.22,
  },
  laserCore: {
    height: 2,
    borderRadius: 1,
    backgroundColor: theme.colors.emerald,
    shadowColor: theme.colors.emerald,
    shadowOpacity: 0.9,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },

  // Status pill
  pillWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  pillDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8, backgroundColor: 'rgba(255,255,255,0.5)' },
  pillDotActive: { backgroundColor: theme.colors.emerald },
  pillText: { color: theme.colors.white, fontSize: 13, fontWeight: '600', letterSpacing: 0.2 },

  // Bottom controls
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 20,
    paddingHorizontal: 28,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sideSlot: { width: 72, alignItems: 'center', paddingTop: 11 },
  roundButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  roundButtonActive: { backgroundColor: theme.colors.emerald, borderColor: theme.colors.emerald },
  sideLabel: { marginTop: 6, color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: '600' },
  disabled: { opacity: 0.4 },

  captureRing: {
    width: 74,
    height: 74,
    borderRadius: 37,
    borderWidth: 4,
    borderColor: theme.colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: theme.colors.white },
  captureInnerBusy: { width: 28, height: 28, borderRadius: 8, backgroundColor: theme.colors.emerald },
  disabledCapture: { borderColor: 'rgba(255,255,255,0.5)' },
});
