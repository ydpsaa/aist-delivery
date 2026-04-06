import React, { useEffect, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  Animated,
  Image,
} from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/context/AuthContext";

export default function SplashScreen() {
  const router = useRouter();
  const { isAuthenticated, isLoading, isOnboarded, user } = useAuth();
  const [animDone, setAnimDone] = useState(false);

  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.88)).current;
  const loaderWidth = useRef(new Animated.Value(0)).current;
  const loaderOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(logoOpacity, { toValue: 1, duration: 500, useNativeDriver: false }),
        Animated.spring(logoScale, { toValue: 1, tension: 55, friction: 8, useNativeDriver: false }),
      ]),
      Animated.parallel([
        Animated.timing(loaderOpacity, { toValue: 1, duration: 200, useNativeDriver: false }),
        Animated.timing(loaderWidth, { toValue: 1, duration: 1500, useNativeDriver: false }),
      ]),
    ]).start(() => setAnimDone(true));

    const fallback = setTimeout(() => setAnimDone(true), 4000);
    return () => clearTimeout(fallback);
  }, []);

  useEffect(() => {
    if (!animDone || isLoading) return;
    if (isAuthenticated) {
      if (user?.role === "courier") {
        router.replace("/(courier)");
      } else {
        router.replace("/(tabs)");
      }
    } else if (isOnboarded) {
      router.replace("/auth");
    } else {
      router.replace("/welcome");
    }
  }, [animDone, isLoading, isAuthenticated, isOnboarded]);

  const loaderWidthInterp = loaderWidth.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  return (
    <View style={styles.container}>
      {/* New brand logo */}
      <Animated.View
        style={[
          styles.logoWrap,
          { opacity: logoOpacity, transform: [{ scale: logoScale }] },
        ]}
      >
        <Image
          source={require("../assets/images/aist-logo-new.png")}
          style={styles.logoImage}
          resizeMode="contain"
        />
      </Animated.View>

      {/* Progress bar */}
      <Animated.View style={[styles.loaderWrap, { opacity: loaderOpacity }]}>
        <View style={styles.loaderTrack}>
          <Animated.View
            style={[styles.loaderFill, { width: loaderWidthInterp }]}
          />
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    gap: 40,
  },
  logoWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  logoImage: {
    width: 240,
    height: 80,
  },
  loaderWrap: {
    alignItems: "center",
  },
  loaderTrack: {
    width: 120,
    height: 4,
    backgroundColor: "#E5E7EB",
    borderRadius: 2,
    overflow: "hidden",
  },
  loaderFill: {
    height: "100%",
    backgroundColor: "#1762FF",
    borderRadius: 2,
  },
});
