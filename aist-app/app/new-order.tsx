/**
 * New Order Screen — beta-ready
 *
 * 3 services only: Flash Express, Window Delivery, Buy For Me
 * Address fields open the real address-picker screen (Nominatim geocoding).
 * Prices shown as "from X CZK" — real total is calculated on confirm screen.
 * Continue button disabled until both addresses are filled.
 */
import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { useApp, ServiceType } from "@/context/AppContext";
import { useLang } from "@/context/LanguageContext";
import * as Haptics from "expo-haptics";

interface ServiceCard {
  id: ServiceType;
  emoji: string;
  emojiColor: string;
  nameKey: string;
  descKey: string;
  fromPrice: string;
  priceSub: string;
  etaItems: string[];
  badge?: string;
  badgeColor?: string;
  badgeTextColor?: string;
}

const SERVICES: ServiceCard[] = [
  {
    id: "express",
    emoji: "⚡",
    emojiColor: "#FEE2E2",
    nameKey: "flashExpress",
    descKey: "flashDesc",
    fromPrice: "229",
    priceSub: "CZK",
    etaItems: ["ASAP", "Max 15 kg", "SLA included"],
    badge: "ASAP",
    badgeColor: "#FEE2E2",
    badgeTextColor: Colors.red,
  },
  {
    id: "standard",
    emoji: "🕐",
    emojiColor: "#EBF0FF",
    nameKey: "windowDelivery",
    descKey: "windowDesc",
    fromPrice: "89",
    priceSub: "CZK",
    etaItems: ["3-hour time slot", "Choose your window", "Max 15 kg"],
  },
  {
    id: "sameday",
    emoji: "🛍️",
    emojiColor: "#EBF0FF",
    nameKey: "buyForMe",
    descKey: "buyDesc",
    fromPrice: "279",
    priceSub: "+ km",
    etaItems: ["Courier shops for you", "+ 25 CZK/km", "+ waiting fee"],
    badge: "Unique",
    badgeColor: Colors.primaryMid,
    badgeTextColor: Colors.primaryDark,
  },
];

export default function NewOrderScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { pickup, dropoff, pickupCoords, dropoffCoords, selectedService, setSelectedService } = useApp();
  const { t } = useLang();

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  // Both address label AND real coordinates required — text alone is not enough
  const hasPickup = pickup.trim().length > 0 && pickupCoords !== null;
  const hasDropoff = dropoff.trim().length > 0 && dropoffCoords !== null;
  const isValid = hasPickup && hasDropoff;

  const handleContinue = () => {
    if (!isValid) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push("/confirm-order");
  };

  const openPickup = () => {
    Haptics.selectionAsync();
    router.push("/address-picker?mode=pickup");
  };

  const openDropoff = () => {
    Haptics.selectionAsync();
    router.push("/address-picker?mode=dropoff");
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 4 }]}>
        <View style={styles.headerTop}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Feather name="arrow-left" size={18} color={Colors.black} />
          </TouchableOpacity>
          <Text style={styles.title}>{t("newOrderTitle")}</Text>
        </View>

        {/* Address block */}
        <View style={styles.addressBlock}>
          {/* Pickup */}
          <TouchableOpacity
            style={styles.addrRow}
            onPress={openPickup}
            testID="pickup-input"
            activeOpacity={0.7}
          >
            <View style={[styles.addrDot, { backgroundColor: Colors.primary }]} />
            <View style={styles.addrText}>
              <Text style={styles.addrLabel}>{t("pickup")}</Text>
              {pickup ? (
                <Text style={styles.addrVal} numberOfLines={1}>
                  {pickup}
                </Text>
              ) : (
                <Text style={styles.addrPlaceholder}>
                  {t("enterPickup")}
                </Text>
              )}
            </View>
            {pickupCoords ? (
              <Feather name="check-circle" size={16} color="#16a34a" />
            ) : (
              <Feather name="search" size={14} color={Colors.gray2} />
            )}
          </TouchableOpacity>

          <View style={styles.addrDivider} />

          {/* Dropoff */}
          <TouchableOpacity
            style={styles.addrRow}
            onPress={openDropoff}
            testID="dropoff-input"
            activeOpacity={0.7}
          >
            <View style={[styles.addrDot, { backgroundColor: Colors.red }]} />
            <View style={styles.addrText}>
              <Text style={styles.addrLabel}>{t("delivery")}</Text>
              {dropoff ? (
                <Text style={styles.addrVal} numberOfLines={1}>
                  {dropoff}
                </Text>
              ) : (
                <Text style={styles.addrPlaceholder}>
                  {t("enterDropoff")}
                </Text>
              )}
            </View>
            {dropoffCoords ? (
              <Feather name="check-circle" size={16} color="#16a34a" />
            ) : (
              <Feather name="search" size={14} color={Colors.gray2} />
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Service cards */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollInner}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.sectionLabel}>{t("chooseService")}</Text>

        {SERVICES.map((svc) => {
          const isSelected = selectedService === svc.id;
          return (
            <TouchableOpacity
              key={svc.id}
              style={[
                styles.serviceCard,
                isSelected && styles.serviceCardSelected,
              ]}
              onPress={() => {
                Haptics.selectionAsync();
                setSelectedService(svc.id);
              }}
              testID={`service-${svc.id}`}
              activeOpacity={0.8}
            >
              <View style={styles.scTop}>
                <View
                  style={[
                    styles.scIcon,
                    { backgroundColor: svc.emojiColor },
                  ]}
                >
                  <Text style={styles.scEmoji}>{svc.emoji}</Text>
                </View>

                <View style={styles.scInfo}>
                  <View style={styles.scNameRow}>
                    <Text style={styles.scName}>{t(svc.nameKey as any)}</Text>
                    {svc.badge && (
                      <View
                        style={[
                          styles.scBadge,
                          { backgroundColor: svc.badgeColor },
                        ]}
                      >
                        <Text
                          style={[
                            styles.scBadgeText,
                            { color: svc.badgeTextColor },
                          ]}
                        >
                          {svc.badge}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.scDesc}>{t(svc.descKey as any)}</Text>
                </View>

                <View style={styles.priceBlock}>
                  <Text style={styles.priceFrom}>from</Text>
                  <Text style={styles.price}>{svc.fromPrice}</Text>
                  <Text style={styles.priceSub}>{svc.priceSub}</Text>
                </View>
              </View>

              {/* ETA pills */}
              <View style={styles.scEta}>
                {svc.etaItems.map((e, i) => (
                  <View key={i} style={styles.scEtaPill}>
                    <Text style={styles.scEtaPillText}>{e}</Text>
                  </View>
                ))}
                {isSelected && (
                  <View style={styles.selectedMark}>
                    <Feather name="check" size={12} color={Colors.primary} />
                    <Text style={styles.selectedText}>Selected</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          );
        })}

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Bottom bar */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 16 }]}>
        {!isValid && (
          <Text style={styles.validationHint}>
            {!pickup
              ? "Search and confirm a pickup address"
              : !pickupCoords
              ? "Confirm pickup address to get coordinates"
              : !dropoff
              ? "Search and confirm a delivery address"
              : "Confirm delivery address to get coordinates"}
          </Text>
        )}
        <TouchableOpacity
          style={[styles.ctaBtn, !isValid && styles.ctaBtnDisabled]}
          onPress={handleContinue}
          disabled={!isValid}
          testID="continue-btn"
        >
          <Text style={styles.ctaBtnText}>
            {t("continueBtn")}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray4 },
  header: {
    backgroundColor: "white",
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray3,
    paddingHorizontal: 16,
    paddingBottom: 0,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 14,
    paddingTop: 8,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.gray4,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  title: { fontSize: 18, fontWeight: "700" as const, color: Colors.black },
  addressBlock: {
    backgroundColor: Colors.gray4,
    borderRadius: 14,
    overflow: "hidden",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.gray3,
  },
  addrRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    backgroundColor: "white",
  },
  addrDot: { width: 12, height: 12, borderRadius: 6, flexShrink: 0 },
  addrText: { flex: 1 },
  addrLabel: {
    fontSize: 10,
    color: Colors.gray2,
    fontWeight: "500" as const,
  },
  addrVal: {
    fontSize: 14,
    color: Colors.black,
    fontWeight: "600" as const,
    marginTop: 1,
  },
  addrPlaceholder: {
    fontSize: 14,
    color: Colors.gray2,
    fontWeight: "400" as const,
    marginTop: 1,
  },
  addrDivider: { height: 1, backgroundColor: Colors.gray3 },
  scroll: { flex: 1 },
  scrollInner: { padding: 16 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700" as const,
    color: Colors.gray2,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 12,
  },
  serviceCard: {
    backgroundColor: "white",
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: "transparent",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  serviceCardSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryBg,
  },
  scTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 10,
  },
  scIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  scEmoji: { fontSize: 24 },
  scInfo: { flex: 1 },
  scNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  scName: { fontSize: 15, fontWeight: "700" as const, color: Colors.black },
  scDesc: { fontSize: 12, color: Colors.gray, marginTop: 3, lineHeight: 18 },
  scBadge: {
    paddingVertical: 2,
    paddingHorizontal: 7,
    borderRadius: 100,
  },
  scBadgeText: { fontSize: 10, fontWeight: "700" as const },
  priceBlock: { alignItems: "flex-end", flexShrink: 0 },
  priceFrom: { fontSize: 10, color: Colors.gray2 },
  price: { fontSize: 20, fontWeight: "800" as const, color: Colors.black },
  priceSub: { fontSize: 10, color: Colors.gray },
  scEta: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: Colors.gray3,
    paddingTop: 10,
  },
  scEtaPill: {
    backgroundColor: Colors.gray4,
    borderRadius: 100,
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  scEtaPillText: {
    fontSize: 11,
    fontWeight: "600" as const,
    color: Colors.black,
  },
  selectedMark: {
    marginLeft: "auto",
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  selectedText: {
    fontSize: 11,
    fontWeight: "700" as const,
    color: Colors.primary,
  },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "white",
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.gray3,
    gap: 6,
  },
  validationHint: {
    fontSize: 12,
    color: Colors.gray,
    textAlign: "center",
  },
  ctaBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaBtnDisabled: { opacity: 0.45 },
  ctaBtnText: { color: "white", fontWeight: "700" as const, fontSize: 16 },
});
