/**
 * Tracking Screen — live customer order tracking
 *
 * Shows a 5-step progress timeline driven by real WebSocket events from
 * OrderTrackingContext. Falls back gracefully to mock data when no real
 * order is active (so the screen still looks good in demos / review).
 */
import React, { useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "@/constants/colors";
import { RealMapView } from "@/components/RealMapView";
import { useLang } from "@/context/LanguageContext";
import { useOrderTracking } from "@/context/OrderTrackingContext";
import { orderStatusStep, type OrderStatus } from "@/services/customerService";
import * as Haptics from "expo-haptics";

// ---------------------------------------------------------------------------
// Step definitions (always 5 steps)
// ---------------------------------------------------------------------------
interface Step {
  labelKey: string;
  statusAt: OrderStatus;
  symbol: string;
}

const STEPS: Step[] = [
  { labelKey: "orderConfirmed",   statusAt: "searching",      symbol: "✓" },
  { labelKey: "courierHeading",   statusAt: "assigned",       symbol: "→" },
  { labelKey: "courierArrived",   statusAt: "courier_arrived",symbol: "📍" },
  { labelKey: "packagePickedUp",  statusAt: "picked_up",      symbol: "📦" },
  { labelKey: "delivered",        statusAt: "delivered",      symbol: "🎉" },
];

// ---------------------------------------------------------------------------
// Mock data for demo / unauthenticated view
// ---------------------------------------------------------------------------
const MOCK_ORDER = {
  id: "AIST-2847",
  pickupAddress: { address: "Hurbanova 970/27" },
  deliveryAddress: { address: "U Trešnovky 1740" },
  priceCzk: 229,
  status: "searching" as OrderStatus,
};

export default function TrackingScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useLang();
  const { activeOrder, courierLocation, liveState, clearActiveOrder } = useOrderTracking();

  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Pulse animation for the "in progress" badge
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.3, duration: 750, useNativeDriver: false }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 750, useNativeDriver: false }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  // Use real order if available, otherwise mock
  const order = activeOrder ?? MOCK_ORDER;
  const currentStep = orderStatusStep(order.status as OrderStatus);
  const isCancelled = order.status === "cancelled";
  const isDelivered = order.status === "delivered";
  const isDone = isCancelled || isDelivered;

  const statusBadgeLabel = isDone
    ? isCancelled
      ? t("cancelled") ?? "Cancelled"
      : t("delivered") ?? "Delivered"
    : t("inProgress") ?? "In Progress";

  const statusBadgeBg = isCancelled ? "#FFF0F0" : isDone ? Colors.greenMid : Colors.greenMid;
  const statusBadgeDotColor = isCancelled ? "#D32F2F" : Colors.green;
  const statusBadgeTextColor = isCancelled ? "#D32F2F" : Colors.greenDark;

  const handleDelivered = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.push("/tip");
  };

  const handleDone = () => {
    clearActiveOrder();
    router.replace("/(tabs)");
  };

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  // -------------------------------------------------------------------------
  // Step helper
  // -------------------------------------------------------------------------
  function getStepState(stepIdx: number): "done" | "active" | "pending" | "cancelled" {
    if (isCancelled) return stepIdx === 0 ? "done" : "cancelled";
    if (stepIdx < currentStep) return "done";
    if (stepIdx === currentStep) return "active";
    return "pending";
  }

  const pickupLabel = "pickupAddress" in order
    ? (order as typeof activeOrder)!.pickupAddress.address
    : (order as typeof MOCK_ORDER).pickupAddress.address;

  const dropoffLabel = "deliveryAddress" in order
    ? (order as typeof activeOrder)!.deliveryAddress.address
    : (order as typeof MOCK_ORDER).deliveryAddress.address;

  return (
    <View style={styles.container}>
      <RealMapView
        height={300}
        showCourier
        courierCoord={courierLocation ? { latitude: courierLocation.lat, longitude: courierLocation.lng } : null}
      />

      {/* Back button */}
      <View style={[styles.headerOverlay, { top: topPad + 8 }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="arrow-left" size={20} color={Colors.black} />
        </TouchableOpacity>
        {/* Live indicator */}
        {liveState === "connected" && (
          <View style={styles.livePill}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        )}
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyInner} showsVerticalScrollIndicator={false}>

        {/* Order info card */}
        <View style={styles.orderInfoCard}>
          <View style={styles.oicHeader}>
            <Text style={styles.oicId}>#{order.id}</Text>
            <View style={[styles.oicStatus, { backgroundColor: statusBadgeBg }]}>
              {!isDone && <Animated.View style={[styles.oicPulse, { opacity: pulseAnim, backgroundColor: statusBadgeDotColor }]} />}
              <Text style={[styles.oicStatusText, { color: statusBadgeTextColor }]}>{statusBadgeLabel}</Text>
            </View>
          </View>

          <View style={styles.oicRoute}>
            <View style={styles.oicAddr}>
              <Text style={styles.oicAddrLabel}>{t("from2") ?? "From"}</Text>
              <Text style={styles.oicAddrVal} numberOfLines={2}>{pickupLabel}</Text>
            </View>
            <Text style={styles.oicArrow}>→</Text>
            <View style={[styles.oicAddr, { alignItems: "flex-end" }]}>
              <Text style={styles.oicAddrLabel}>{t("to2") ?? "To"}</Text>
              <Text style={styles.oicAddrVal} numberOfLines={2}>{dropoffLabel}</Text>
            </View>
          </View>

          <View style={styles.oicStats}>
            <View style={styles.oicStat}>
              <Text style={[styles.oicStatVal, { color: Colors.green }]}>~8 min</Text>
              <Text style={styles.oicStatLabel}>{t("eta") ?? "ETA"}</Text>
            </View>
            <View style={styles.oicStatDivider} />
            <View style={styles.oicStat}>
              <Text style={styles.oicStatVal}>3.2 km</Text>
              <Text style={styles.oicStatLabel}>{t("distance") ?? "Distance"}</Text>
            </View>
            <View style={styles.oicStatDivider} />
            <View style={styles.oicStat}>
              <Text style={styles.oicStatVal}>{order.priceCzk} CZK</Text>
              <Text style={styles.oicStatLabel}>{t("total") ?? "Total"}</Text>
            </View>
          </View>
        </View>

        {/* Progress card */}
        <View style={styles.progressCard}>
          <Text style={styles.progressTitle}>{t("deliveryProgress") ?? "Delivery Progress"}</Text>

          {STEPS.map((step, i) => {
            const state = getStepState(i);
            const isDoneStep = state === "done";
            const isActiveStep = state === "active";
            const isPendingOrCancelled = state === "pending" || state === "cancelled";
            const isLast = i === STEPS.length - 1;

            return (
              <View key={i} style={styles.stepRow}>
                <View style={styles.stepLeft}>
                  <View style={[
                    styles.stepDot,
                    isDoneStep && styles.stepDotDone,
                    isActiveStep && styles.stepDotActive,
                    isPendingOrCancelled && styles.stepDotPending,
                  ]}>
                    <Text style={[
                      styles.stepDotText,
                      isPendingOrCancelled && { color: Colors.gray2 },
                    ]}>{step.symbol}</Text>
                  </View>
                  {!isLast && (
                    <View style={[styles.stepLine, isDoneStep && styles.stepLineDone]} />
                  )}
                </View>
                <View style={styles.stepContent}>
                  <Text style={[styles.stepLabel, isPendingOrCancelled && styles.stepLabelPending]}>
                    {t(step.labelKey) ?? step.labelKey}
                  </Text>
                  <Text style={[styles.stepTime, isActiveStep && styles.stepTimeEta]}>
                    {isDoneStep ? "✓ Complete" : isActiveStep ? "In progress…" : "Waiting"}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>

        {/* Action buttons */}
        {isDelivered && !isCancelled && (
          <TouchableOpacity style={styles.deliveredBtn} onPress={handleDelivered} testID="tip-btn">
            <Text style={styles.deliveredBtnText}>{t("rateCourier") ?? "Leave a Tip"}</Text>
          </TouchableOpacity>
        )}

        {/* Simulate delivery — only visible in demo (no real order) */}
        {!activeOrder && (
          <TouchableOpacity style={styles.simulateBtn} onPress={handleDelivered} testID="delivered-btn">
            <Text style={styles.simulateBtnText}>{t("simulateDelivery") ?? "Simulate Delivery"}</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.backHomeBtn} onPress={isDone ? handleDone : () => router.replace("/(tabs)")}>
          <Text style={styles.backHomeBtnText}>{isDone ? t("done") ?? "Done" : t("backHome") ?? "Back to home"}</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.primaryBg },
  headerOverlay: { position: "absolute", left: 16, right: 16, zIndex: 10, flexDirection: "row", alignItems: "center", gap: 10 },
  backBtn: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: "white",
    alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3,
  },
  livePill: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "white", paddingVertical: 5, paddingHorizontal: 10,
    borderRadius: 100,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 3, elevation: 2,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.green },
  liveText: { fontSize: 11, fontWeight: "800" as const, color: Colors.greenDark },
  body: { flex: 1 },
  bodyInner: { padding: 16 },
  orderInfoCard: {
    backgroundColor: "white", borderRadius: 16, overflow: "hidden", marginBottom: 12,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 3,
  },
  oicHeader: {
    paddingHorizontal: 16, paddingVertical: 12, flexDirection: "row",
    justifyContent: "space-between", alignItems: "center",
    borderBottomWidth: 1, borderBottomColor: Colors.gray3,
  },
  oicId: { fontSize: 12, fontWeight: "700" as const, color: Colors.gray2 },
  oicStatus: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingVertical: 3, paddingHorizontal: 10, borderRadius: 100,
  },
  oicPulse: { width: 6, height: 6, borderRadius: 3 },
  oicStatusText: { fontSize: 12, fontWeight: "700" as const },
  oicRoute: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.gray3, gap: 12,
  },
  oicAddr: { flex: 1 },
  oicAddrLabel: { fontSize: 10, color: Colors.gray2 },
  oicAddrVal: { fontSize: 13, fontWeight: "600" as const, color: Colors.black, marginTop: 1 },
  oicArrow: { fontSize: 16, color: Colors.gray2 },
  oicStats: { flexDirection: "row", paddingVertical: 12 },
  oicStat: { flex: 1, alignItems: "center" },
  oicStatVal: { fontSize: 15, fontWeight: "700" as const, color: Colors.black },
  oicStatLabel: { fontSize: 10, color: Colors.gray2, marginTop: 2 },
  oicStatDivider: { width: 1, backgroundColor: Colors.gray3 },
  progressCard: {
    backgroundColor: "white", borderRadius: 16, padding: 16, marginBottom: 12,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 3,
  },
  progressTitle: { fontSize: 13, fontWeight: "700" as const, color: Colors.black, marginBottom: 12 },
  stepRow: { flexDirection: "row", gap: 14, alignItems: "flex-start" },
  stepLeft: { alignItems: "center", flexShrink: 0, paddingTop: 2, width: 22 },
  stepDot: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  stepDotDone: { backgroundColor: Colors.green },
  stepDotActive: {
    backgroundColor: Colors.green,
    shadowColor: Colors.green, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.4, shadowRadius: 4, elevation: 4,
  },
  stepDotPending: { backgroundColor: Colors.gray3 },
  stepDotText: { fontSize: 10, fontWeight: "700" as const, color: "white" },
  stepLine: { width: 2, height: 24, marginTop: 4, backgroundColor: Colors.gray3 },
  stepLineDone: { backgroundColor: Colors.green },
  stepContent: { flex: 1, paddingBottom: 14 },
  stepLabel: { fontSize: 13, fontWeight: "600" as const, color: Colors.black },
  stepLabelPending: { color: Colors.gray2 },
  stepTime: { fontSize: 11, color: Colors.gray, marginTop: 1 },
  stepTimeEta: { color: Colors.green, fontWeight: "600" as const },
  deliveredBtn: {
    backgroundColor: Colors.green, borderRadius: 16, paddingVertical: 18,
    alignItems: "center", justifyContent: "center", marginBottom: 10,
  },
  deliveredBtnText: { color: "white", fontWeight: "700" as const, fontSize: 16 },
  simulateBtn: {
    borderWidth: 2, borderColor: Colors.green, borderRadius: 16, paddingVertical: 18,
    alignItems: "center", justifyContent: "center", backgroundColor: "white", marginBottom: 10,
  },
  simulateBtnText: { color: Colors.greenDark, fontWeight: "700" as const, fontSize: 16 },
  backHomeBtn: { backgroundColor: Colors.gray4, borderRadius: 16, paddingVertical: 18, alignItems: "center" },
  backHomeBtnText: { color: Colors.black, fontWeight: "600" as const, fontSize: 15 },
});
