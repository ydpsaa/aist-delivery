import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Animated,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import * as Haptics from "expo-haptics";

const COUNTRY_CODES = [
  { code: "+420", flag: "🇨🇿", name: "CZ" },
  { code: "+380", flag: "🇺🇦", name: "UA" },
  { code: "+7", flag: "🇷🇺", name: "RU" },
  { code: "+44", flag: "🇬🇧", name: "GB" },
  { code: "+1", flag: "🇺🇸", name: "US" },
];

export default function LoginPhoneScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signIn } = useAuth();
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState(COUNTRY_CODES[0]);
  const [showCountries, setShowCountries] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: false }).start();
    setTimeout(() => inputRef.current?.focus(), 600);
  }, []);

  const bottomPad = Platform.OS === "web" ? 32 : insets.bottom + 32;
  const topPad = Platform.OS === "web" ? 24 : insets.top + 24;

  const isValid = phone.replace(/\D/g, "").length >= 9;
  const isCodeValid = code.length === 6;

  const handleSendCode = async () => {
    if (!isValid) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoading(true);
    await new Promise((r) => setTimeout(r, 1000));
    setLoading(false);
    setCodeSent(true);
  };

  const handleVerify = async () => {
    if (!isCodeValid) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setLoading(true);
    await new Promise((r) => setTimeout(r, 800));
    await signIn("phone", { phone: `${country.code} ${phone}` });
    router.replace("/(tabs)");
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={[styles.container, { paddingTop: topPad }]}>
        {/* Back */}
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="arrow-left" size={20} color={Colors.black} />
        </TouchableOpacity>

        <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerIcon}>
              <Text style={styles.headerIconEmoji}>📱</Text>
            </View>
            <Text style={styles.title}>
              {codeSent ? "Enter the code" : "Your phone number"}
            </Text>
            <Text style={styles.subtitle}>
              {codeSent
                ? `We sent a 6-digit code to ${country.code} ${phone}`
                : "We'll send you a short confirmation code."}
            </Text>
          </View>

          {!codeSent ? (
            <>
              {/* Phone input */}
              <View style={styles.phoneRow}>
                <TouchableOpacity
                  style={styles.countryBtn}
                  onPress={() => setShowCountries(!showCountries)}
                >
                  <Text style={styles.countryFlag}>{country.flag}</Text>
                  <Text style={styles.countryCode}>{country.code}</Text>
                  <Feather name="chevron-down" size={14} color={Colors.gray2} />
                </TouchableOpacity>
                <TextInput
                  ref={inputRef}
                  style={styles.phoneInput}
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="603 123 456"
                  placeholderTextColor={Colors.gray2}
                  keyboardType="phone-pad"
                  maxLength={15}
                  testID="phone-input"
                />
              </View>

              {/* Country picker */}
              {showCountries && (
                <View style={styles.countryList}>
                  {COUNTRY_CODES.map((c) => (
                    <TouchableOpacity
                      key={c.code}
                      style={[styles.countryItem, country.code === c.code && styles.countryItemActive]}
                      onPress={() => { setCountry(c); setShowCountries(false); }}
                    >
                      <Text style={styles.countryItemFlag}>{c.flag}</Text>
                      <Text style={styles.countryItemName}>{c.name}</Text>
                      <Text style={styles.countryItemCode}>{c.code}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </>
          ) : (
            <>
              {/* Code input */}
              <View style={styles.codeRow}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.codeBox,
                      code.length > i && styles.codeBoxFilled,
                      code.length === i && styles.codeBoxActive,
                    ]}
                  >
                    <Text style={styles.codeBoxText}>{code[i] || ""}</Text>
                  </View>
                ))}
              </View>
              <TextInput
                style={styles.hiddenInput}
                value={code}
                onChangeText={(t) => setCode(t.replace(/\D/g, "").slice(0, 6))}
                keyboardType="number-pad"
                maxLength={6}
                autoFocus
                testID="code-input"
              />
              <TouchableOpacity
                style={styles.resendBtn}
                onPress={() => setCodeSent(false)}
              >
                <Text style={styles.resendText}>← Change number</Text>
              </TouchableOpacity>
            </>
          )}
        </Animated.View>

        {/* CTA */}
        <View style={[styles.bottomWrap, { paddingBottom: bottomPad }]}>
          {/* Mock hint */}
          {codeSent && (
            <View style={styles.mockHint}>
              <Text style={styles.mockHintText}>💡 Demo: enter any 6 digits to continue</Text>
            </View>
          )}
          <TouchableOpacity
            style={[
              styles.ctaBtn,
              (!isValid && !codeSent) && styles.ctaBtnDisabled,
              (codeSent && !isCodeValid) && styles.ctaBtnDisabled,
              loading && styles.ctaBtnLoading,
            ]}
            onPress={codeSent ? handleVerify : handleSendCode}
            disabled={loading || (!isValid && !codeSent) || (codeSent && !isCodeValid)}
            testID="phone-cta-btn"
          >
            <Text style={styles.ctaBtnText}>
              {loading ? "Please wait..." : codeSent ? "Verify & Sign In" : "Send Code"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "white", paddingHorizontal: 24, justifyContent: "space-between" },
  backBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.gray4,
    alignItems: "center", justifyContent: "center", marginBottom: 24,
  },
  content: { flex: 1 },
  header: { marginBottom: 32, gap: 10 },
  headerIcon: {
    width: 64, height: 64, borderRadius: 20, backgroundColor: Colors.greenMid,
    alignItems: "center", justifyContent: "center", marginBottom: 4,
  },
  headerIconEmoji: { fontSize: 28 },
  title: { fontSize: 28, fontWeight: "800" as const, color: Colors.black, letterSpacing: -0.3 },
  subtitle: { fontSize: 15, color: Colors.gray, lineHeight: 22 },
  phoneRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 2,
    borderColor: Colors.green,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "white",
  },
  countryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 18,
    paddingHorizontal: 14,
    borderRightWidth: 1.5,
    borderRightColor: Colors.gray3,
  },
  countryFlag: { fontSize: 20 },
  countryCode: { fontSize: 15, fontWeight: "600" as const, color: Colors.black },
  phoneInput: {
    flex: 1,
    fontSize: 18,
    fontWeight: "600" as const,
    color: Colors.black,
    paddingVertical: 18,
    paddingHorizontal: 14,
  },
  countryList: {
    marginTop: 8,
    backgroundColor: "white",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.gray3,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  countryItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray3,
  },
  countryItemActive: { backgroundColor: Colors.greenBg },
  countryItemFlag: { fontSize: 20 },
  countryItemName: { flex: 1, fontSize: 14, fontWeight: "600" as const, color: Colors.black },
  countryItemCode: { fontSize: 14, color: Colors.gray },
  codeRow: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "center",
    marginBottom: 16,
  },
  codeBox: {
    width: 48, height: 60, borderRadius: 14,
    borderWidth: 2, borderColor: Colors.gray3,
    alignItems: "center", justifyContent: "center",
    backgroundColor: Colors.gray4,
  },
  codeBoxFilled: { backgroundColor: "white", borderColor: Colors.green },
  codeBoxActive: { borderColor: Colors.green, backgroundColor: "white" },
  codeBoxText: { fontSize: 24, fontWeight: "700" as const, color: Colors.black },
  hiddenInput: {
    position: "absolute",
    width: 1, height: 1, opacity: 0,
    left: -999,
  },
  resendBtn: { alignItems: "center", paddingVertical: 8 },
  resendText: { fontSize: 14, color: Colors.green, fontWeight: "600" as const },
  mockHint: {
    backgroundColor: "#FEF3C7",
    borderRadius: 10,
    padding: 10,
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  mockHintText: { fontSize: 13, color: "#92400E", fontWeight: "500" as const },
  bottomWrap: { gap: 10 },
  ctaBtn: {
    backgroundColor: Colors.green,
    borderRadius: 18,
    paddingVertical: 20,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: Colors.green,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  ctaBtnDisabled: { backgroundColor: Colors.gray3, shadowOpacity: 0 },
  ctaBtnLoading: { backgroundColor: Colors.greenLight },
  ctaBtnText: { color: "white", fontSize: 17, fontWeight: "700" as const },
});
