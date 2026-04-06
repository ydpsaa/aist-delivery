import React, { useRef, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
  Platform,
  Image,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "@/constants/colors";
import { RealMapView } from "@/components/RealMapView";
import { useApp } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";
import { useLang } from "@/context/LanguageContext";
import * as Haptics from "expo-haptics";
import { getCurrentPosition } from "@/services/locationService";

interface Category {
  id: string;
  emoji: string;
  label: string;
  sub: string;
  color: string;
  featured?: boolean;
}

const CATEGORIES: Category[] = [
  {
    id: "flash",
    emoji: "⚡",
    label: "Flash Express",
    sub: "od 229 CZK",
    color: "#FEE2E2",
    featured: true,
  },
  {
    id: "window",
    emoji: "🕐",
    label: "Window Delivery",
    sub: "od 89 CZK",
    color: "#EBF0FF",
  },
  {
    id: "buy",
    emoji: "🛍️",
    label: "Buy For Me",
    sub: "od 279 CZK",
    color: "#EBF0FF",
  },
];

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { orderHistory, pickupCoords, dropoffCoords } = useApp();
  const { user } = useAuth();
  const { t } = useLang();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 500,
      useNativeDriver: false,
    }).start();

    // Request user location to center the map
    getCurrentPosition()
      .then((pos) => { if (pos) setUserLocation(pos); })
      .catch(() => { /* permission denied — map defaults to Prague */ });
  }, []);

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const handleNewOrder = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push("/new-order");
  };

  const displayName = user?.name || user?.email?.split("@")[0] || "";
  const avatarLetter = displayName ? displayName.charAt(0).toUpperCase() : "A";

  const recentOrders = orderHistory.slice(0, 2);

  const SERVICE_EMOJIS: Record<string, string> = {
    express: "⚡",
    standard: "🕐",
    cargo: "📦",
    sameday: "🛍️",
  };
  const SERVICE_LABELS: Record<string, string> = {
    express: "Flash Express",
    standard: "Window Delivery",
    cargo: "Cargo",
    sameday: "Buy For Me",
  };
  const SERVICE_COLORS: Record<string, string> = {
    express: "#FEE2E2",
    standard: "#EBF0FF",
    cargo: "#EEF2FF",
    sameday: "#EBF0FF",
  };

  return (
    <View style={styles.container}>
      {/* Map */}
      <View style={styles.mapContainer}>
        <RealMapView
          height={320}
          userLocation={userLocation}
          pickupCoord={pickupCoords}
          dropoffCoord={dropoffCoords}
        />

        {/* Top bar over map */}
        <View style={[styles.topBar, { top: topPad + 8 }]}>
          <View style={styles.logoPill}>
            <Image
              source={require("../../assets/images/aist-logo-compact.png")}
              style={styles.logoImage}
              resizeMode="contain"
            />
          </View>
          <TouchableOpacity
            style={styles.avatarBtn}
            onPress={() => router.push("/(tabs)/profile")}
          >
            <Text style={styles.avatarText}>{avatarLetter}</Text>
          </TouchableOpacity>
        </View>

        {/* Location pill */}
        <TouchableOpacity
          style={styles.locationPill}
          onPress={handleNewOrder}
          testID="new-order-btn"
        >
          <View style={styles.locDot} />
          <View style={styles.locTextContainer}>
            <Text style={styles.locLabel}>{t("whereTo")}</Text>
            <Text style={styles.locAddress} numberOfLines={1}>
              {t("enterAddress")}
            </Text>
          </View>
          <Text style={styles.locArrow}>›</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollContent}
        contentContainerStyle={styles.scrollInner}
        showsVerticalScrollIndicator={false}
        testID="home-scroll"
      >
        {/* Categories */}
        <Text style={styles.sectionLabel}>{t("ourServices")}</Text>
        <View style={styles.catGrid}>
          {CATEGORIES.map((cat) => (
            <TouchableOpacity
              key={cat.id}
              style={[
                styles.catItem,
                cat.featured && styles.catItemFeatured,
              ]}
              onPress={handleNewOrder}
              activeOpacity={0.7}
              testID={`cat-${cat.id}`}
            >
              <View style={[styles.catIconBg, { backgroundColor: cat.color }]}>
                <Text style={styles.catEmoji}>{cat.emoji}</Text>
              </View>
              <Text
                style={[
                  styles.catName,
                  cat.featured && styles.catNameFeatured,
                ]}
              >
                {cat.label}
              </Text>
              <Text style={styles.catSub}>{cat.sub}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Recent orders — only real ones */}
        {recentOrders.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>{t("recentOrders")}</Text>
            {recentOrders.map((order) => (
              <TouchableOpacity
                key={order.id}
                style={styles.recentOrder}
                onPress={() => router.push("/(tabs)/tracking")}
              >
                <View
                  style={[
                    styles.roIcon,
                    {
                      backgroundColor:
                        SERVICE_COLORS[order.service] ?? "#EBF0FF",
                    },
                  ]}
                >
                  <Text style={styles.roEmoji}>
                    {SERVICE_EMOJIS[order.service] ?? "📦"}
                  </Text>
                </View>
                <View style={styles.roInfo}>
                  <Text style={styles.roName}>
                    {SERVICE_LABELS[order.service] ?? order.service}
                  </Text>
                  <Text style={styles.roSub} numberOfLines={1}>
                    {order.pickup} → {order.dropoff}
                  </Text>
                </View>
                <View
                  style={[
                    styles.roStatus,
                    {
                      backgroundColor:
                        order.status === "delivered"
                          ? Colors.primaryMid
                          : "#FEF3C7",
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.roStatusText,
                      {
                        color:
                          order.status === "delivered"
                            ? Colors.primaryDark
                            : "#92400E",
                      },
                    ]}
                  >
                    {order.status.charAt(0).toUpperCase() +
                      order.status.slice(1)}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </>
        )}

        <View style={styles.bottomPad} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray4 },
  mapContainer: { height: 320, flexShrink: 0 },
  topBar: {
    position: "absolute",
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    zIndex: 10,
  },
  logoPill: {
    backgroundColor: "white",
    borderRadius: 12,
    paddingVertical: 7,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  logoImage: { width: 88, height: 30 },
  avatarBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  avatarText: { color: "white", fontWeight: "700" as const, fontSize: 16 },
  locationPill: {
    position: "absolute",
    bottom: 16,
    left: 16,
    right: 16,
    backgroundColor: "white",
    borderRadius: 14,
    padding: 12,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
    zIndex: 5,
  },
  locDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.primary,
    flexShrink: 0,
  },
  locTextContainer: { flex: 1 },
  locLabel: { fontSize: 10, color: Colors.gray2, fontWeight: "500" as const },
  locAddress: {
    fontSize: 13,
    color: Colors.black,
    fontWeight: "600" as const,
    marginTop: 1,
  },
  locArrow: { fontSize: 18, color: Colors.gray2 },
  scrollContent: { flex: 1 },
  scrollInner: { padding: 16 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700" as const,
    color: Colors.gray2,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 12,
    marginTop: 4,
  },
  catGrid: { flexDirection: "row", gap: 8, marginBottom: 20 },
  catItem: {
    flex: 1,
    backgroundColor: "white",
    borderRadius: 10,
    padding: 14,
    paddingHorizontal: 8,
    alignItems: "center",
    gap: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  catItemFeatured: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryBg,
  },
  catIconBg: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  catEmoji: { fontSize: 22 },
  catName: {
    fontSize: 11,
    fontWeight: "600" as const,
    color: Colors.black,
    textAlign: "center",
    lineHeight: 16,
  },
  catNameFeatured: { color: Colors.primaryDark },
  catSub: { fontSize: 10, color: Colors.gray, textAlign: "center" },
  recentOrder: {
    backgroundColor: "white",
    borderRadius: 10,
    padding: 12,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  roIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  roEmoji: { fontSize: 18 },
  roInfo: { flex: 1 },
  roName: { fontSize: 13, fontWeight: "600" as const, color: Colors.black },
  roSub: { fontSize: 11, color: Colors.gray, marginTop: 2 },
  roStatus: { paddingVertical: 3, paddingHorizontal: 8, borderRadius: 100 },
  roStatusText: { fontSize: 11, fontWeight: "600" as const },
  bottomPad: { height: 100 },
});
