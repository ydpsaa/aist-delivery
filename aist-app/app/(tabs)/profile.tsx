import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  Switch,
  Modal,
  Alert,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "@/constants/colors";
import { useLang } from "@/context/LanguageContext";
import { LANGUAGES, LangCode } from "@/i18n/translations";
import { useAuth } from "@/context/AuthContext";
import * as Haptics from "expo-haptics";

type FeatherIconName = React.ComponentProps<typeof Feather>["name"];

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t, lang, setLang } = useLang();
  const { user, signOut } = useAuth();
  const [showLangModal, setShowLangModal] = useState(false);

  const topPad = Platform.OS === "web" ? 16 : insets.top;

  const CURRENT_LANG = LANGUAGES.find((l) => l.code === lang);

  const displayName = user?.name || user?.email?.split("@")[0] || "AIST User";
  const avatarLetter = displayName.charAt(0).toUpperCase();
  const userEmail = user?.email ?? "";
  const userRole = user?.role ?? "customer";

  const handleLogout = () => {
    if (Platform.OS === "web") {
      signOut().then(() => router.replace("/welcome"));
      return;
    }
    Alert.alert(
      t("logout"),
      "Are you sure you want to sign out?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: t("logout"),
          style: "destructive",
          onPress: async () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            await signOut();
            router.replace("/welcome");
          },
        },
      ]
    );
  };

  const menuSections: {
    title: string;
    items: {
      icon: FeatherIconName;
      label: string;
      sub?: string;
      onPress?: () => void;
      rightEl?: React.ReactNode;
      danger?: boolean;
    }[];
  }[] = [
    {
      title: t("account").toUpperCase(),
      items: [
        {
          icon: "user",
          label: t("personalInfo"),
          sub: userEmail || displayName,
        },
        {
          icon: "map-pin",
          label: t("addresses"),
        },
      ],
    },
    {
      title: t("settings").toUpperCase(),
      items: [
        { icon: "bell", label: t("notifications") },
        {
          icon: "globe",
          label: t("language"),
          sub: `${CURRENT_LANG?.flag} ${CURRENT_LANG?.label}`,
          onPress: () => setShowLangModal(true),
        },
      ],
    },
    {
      title: t("support").toUpperCase(),
      items: [
        { icon: "help-circle", label: t("help") },
        { icon: "mail", label: t("contact") },
        {
          icon: "log-out",
          label: t("logout"),
          onPress: handleLogout,
          danger: true,
        },
      ],
    },
  ];

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={[styles.header, { paddingTop: topPad + 20 }]}>
          <View style={styles.avatarWrap}>
            <Text style={styles.avatarText}>{avatarLetter}</Text>
          </View>
          <View style={styles.headerInfo}>
            <Text style={styles.name}>{displayName}</Text>
            <Text style={styles.emailText}>{userEmail}</Text>
            <View style={styles.roleRow}>
              <View style={styles.roleBadge}>
                <Text style={styles.roleBadgeText}>
                  {userRole.charAt(0).toUpperCase() + userRole.slice(1)}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Menu sections */}
        <View style={styles.menuWrap}>
          {menuSections.map((section) => (
            <View key={section.title} style={styles.menuSection}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <View style={styles.menuCard}>
                {section.items.map((item, idx) => (
                  <TouchableOpacity
                    key={item.label}
                    style={[
                      styles.menuItem,
                      idx === section.items.length - 1 && styles.menuItemLast,
                    ]}
                    onPress={item.onPress}
                    activeOpacity={item.onPress ? 0.7 : 1}
                  >
                    <View
                      style={[
                        styles.miIconWrap,
                        item.danger && styles.miIconWrapDanger,
                      ]}
                    >
                      <Feather
                        name={item.icon}
                        size={18}
                        color={item.danger ? Colors.red : Colors.primary}
                      />
                    </View>
                    <View style={styles.miText}>
                      <Text
                        style={[
                          styles.miTitle,
                          item.danger && { color: Colors.red },
                        ]}
                      >
                        {item.label}
                      </Text>
                      {item.sub ? (
                        <Text style={styles.miSub}>{item.sub}</Text>
                      ) : null}
                    </View>
                    {item.rightEl ? (
                      item.rightEl
                    ) : item.onPress && !item.danger ? (
                      <Feather
                        name="chevron-right"
                        size={16}
                        color={Colors.gray2}
                      />
                    ) : null}
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ))}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Language Modal */}
      <Modal
        visible={showLangModal}
        animationType="slide"
        transparent
        presentationStyle="overFullScreen"
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          onPress={() => setShowLangModal(false)}
          activeOpacity={1}
        >
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>{t("language")}</Text>
            {LANGUAGES.map((l) => (
              <TouchableOpacity
                key={l.code}
                style={[
                  styles.langItem,
                  lang === l.code && styles.langItemActive,
                ]}
                onPress={() => {
                  setLang(l.code as LangCode);
                  Haptics.selectionAsync();
                  setShowLangModal(false);
                }}
              >
                <Text style={styles.langFlag}>{l.flag}</Text>
                <Text
                  style={[
                    styles.langLabel,
                    lang === l.code && styles.langLabelActive,
                  ]}
                >
                  {l.label}
                </Text>
                {lang === l.code && (
                  <Feather name="check" size={18} color={Colors.primary} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray4 },
  header: {
    backgroundColor: "white",
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray3,
    marginBottom: 20,
  },
  avatarWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: "white", fontWeight: "800" as const, fontSize: 24 },
  headerInfo: { flex: 1 },
  name: { fontSize: 20, fontWeight: "800" as const, color: Colors.black },
  emailText: { fontSize: 12, color: Colors.gray, marginTop: 2 },
  roleRow: { flexDirection: "row", marginTop: 6 },
  roleBadge: {
    backgroundColor: Colors.primaryBg,
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 100,
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: "700" as const,
    color: Colors.primaryDark,
  },
  menuWrap: { paddingHorizontal: 16 },
  menuSection: { marginBottom: 20 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "700" as const,
    color: Colors.gray2,
    letterSpacing: 0.8,
    marginBottom: 8,
    marginLeft: 4,
  },
  menuCard: {
    backgroundColor: "white",
    borderRadius: 12,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray3,
  },
  menuItemLast: { borderBottomWidth: 0 },
  miIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.primaryBg,
    alignItems: "center",
    justifyContent: "center",
  },
  miIconWrapDanger: { backgroundColor: "#FEE2E2" },
  miText: { flex: 1 },
  miTitle: { fontSize: 14, fontWeight: "600" as const, color: Colors.black },
  miSub: { fontSize: 11, color: Colors.gray, marginTop: 1 },
  // Language modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: "white",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  modalHandle: {
    width: 36,
    height: 4,
    backgroundColor: Colors.gray3,
    borderRadius: 2,
    marginBottom: 20,
    alignSelf: "center",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800" as const,
    color: Colors.black,
    marginBottom: 16,
  },
  langItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 6,
  },
  langItemActive: { backgroundColor: Colors.primaryBg },
  langFlag: { fontSize: 28 },
  langLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: "500" as const,
    color: Colors.black,
  },
  langLabelActive: {
    color: Colors.primaryDark,
    fontWeight: "700" as const,
  },
});
