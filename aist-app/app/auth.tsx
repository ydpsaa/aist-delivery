import React, { useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { AistBirdIcon } from "@/components/AistLogo";

type FeatherIconName = React.ComponentProps<typeof Feather>["name"];

interface AuthOption {
  id: string;
  icon: FeatherIconName;
  label: string;
  sub: string;
  style: "primary" | "outline" | "google";
  route: string;
}

const AUTH_OPTIONS: AuthOption[] = [
  {
    id: "phone",
    icon: "smartphone",
    label: "Continue with Phone",
    sub: "We'll send you a confirmation code",
    style: "primary",
    route: "/login-phone",
  },
  {
    id: "email",
    icon: "mail",
    label: "Continue with Email",
    sub: "Sign in with your email address",
    style: "outline",
    route: "/login-email",
  },
  {
    id: "google",
    icon: "globe",
    label: "Continue with Google",
    sub: "Quick sign in with your Google account",
    style: "google",
    route: "/login-google",
  },
];

export default function AuthScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signIn } = useAuth();

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: false }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: false }),
    ]).start();
  }, []);

  const bottomPad = Platform.OS === "web" ? 32 : insets.bottom + 32;
  const topPad = Platform.OS === "web" ? 24 : insets.top + 24;

  const handleOption = (option: AuthOption) => {
    if (option.id === "google") {
      signIn("google");
      router.replace("/(tabs)");
      return;
    }
    router.push(option.route as any);
  };

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.inner,
          { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
          { paddingTop: topPad },
        ]}
      >
        {/* Back */}
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="arrow-left" size={20} color={Colors.black} />
        </TouchableOpacity>

        {/* Brand mark */}
        <View style={styles.brandMark}>
          <AistBirdIcon size={36} />
        </View>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Sign in to AIST</Text>
          <Text style={styles.subtitle}>
            Choose how you want to continue. It only takes a moment.
          </Text>
        </View>

        {/* Auth options */}
        <View style={styles.options}>
          {AUTH_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.id}
              style={[
                styles.optionBtn,
                opt.style === "primary" && styles.optionBtnPrimary,
                opt.style === "outline" && styles.optionBtnOutline,
                opt.style === "google" && styles.optionBtnGoogle,
              ]}
              onPress={() => handleOption(opt)}
              testID={`auth-${opt.id}`}
              activeOpacity={0.8}
            >
              <View
                style={[
                  styles.optionIconWrap,
                  opt.style === "primary" && styles.optionIconWrapPrimary,
                ]}
              >
                <Feather
                  name={opt.icon}
                  size={20}
                  color={opt.style === "primary" ? "white" : Colors.black}
                />
              </View>
              <View style={styles.optionText}>
                <Text
                  style={[
                    styles.optionLabel,
                    opt.style === "primary" && styles.optionLabelPrimary,
                  ]}
                >
                  {opt.label}
                </Text>
                <Text
                  style={[
                    styles.optionSub,
                    opt.style === "primary" && styles.optionSubPrimary,
                  ]}
                >
                  {opt.sub}
                </Text>
              </View>
              <Feather
                name="chevron-right"
                size={16}
                color={opt.style === "primary" ? "rgba(255,255,255,0.6)" : Colors.gray2}
              />
            </TouchableOpacity>
          ))}
        </View>

        {/* Divider */}
        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>Secure & private</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* Trust badges */}
        <View style={styles.badges}>
          {["🔒 Encrypted", "🇨🇿 GDPR", "⚡ 30 sec"].map((badge) => (
            <View key={badge} style={styles.badge}>
              <Text style={styles.badgeText}>{badge}</Text>
            </View>
          ))}
        </View>
      </Animated.View>

      {/* Footer */}
      <View style={[styles.footer, { paddingBottom: bottomPad }]}>
        <Text style={styles.footerText}>
          By continuing, you agree to our{" "}
          <Text style={styles.footerLink}>Terms of Service</Text>
          {" "}and{" "}
          <Text style={styles.footerLink}>Privacy Policy</Text>
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFF", justifyContent: "space-between" },
  inner: { flex: 1, paddingHorizontal: 24 },
  brandMark: { marginBottom: 20 },
  backBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.gray4,
    alignItems: "center", justifyContent: "center", marginBottom: 28,
  },
  header: { marginBottom: 32, gap: 8 },
  title: { fontSize: 32, fontWeight: "800" as const, color: Colors.black, letterSpacing: -0.5 },
  subtitle: { fontSize: 15, color: Colors.gray, lineHeight: 22 },
  options: { gap: 12, marginBottom: 28 },
  optionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 18,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: Colors.gray3,
    backgroundColor: "white",
  },
  optionBtnPrimary: {
    backgroundColor: Colors.green,
    borderColor: Colors.green,
    shadowColor: Colors.green,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  optionBtnOutline: {
    backgroundColor: "white",
    borderColor: Colors.gray3,
  },
  optionBtnGoogle: {
    backgroundColor: Colors.gray4,
    borderColor: Colors.gray3,
  },
  optionIconWrap: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.gray4,
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  optionIconWrapPrimary: {
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  optionText: { flex: 1 },
  optionLabel: { fontSize: 15, fontWeight: "700" as const, color: Colors.black },
  optionLabelPrimary: { color: "white" },
  optionSub: { fontSize: 12, color: Colors.gray, marginTop: 2 },
  optionSubPrimary: { color: "rgba(255,255,255,0.7)" },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 20,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: Colors.gray3 },
  dividerText: { fontSize: 12, color: Colors.gray2, fontWeight: "500" as const },
  badges: { flexDirection: "row", gap: 8, justifyContent: "center" },
  badge: {
    backgroundColor: Colors.gray4,
    borderRadius: 100,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  badgeText: { fontSize: 12, color: Colors.gray, fontWeight: "500" as const },
  footer: { paddingHorizontal: 24, paddingTop: 12 },
  footerText: { fontSize: 12, color: Colors.gray2, textAlign: "center", lineHeight: 18 },
  footerLink: { color: Colors.green, fontWeight: "600" as const },
});
