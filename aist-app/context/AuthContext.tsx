import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  emailLogin,
  emailRegister,
  restoreSession,
  logout as serviceLogout,
  type AuthUser,
  type UserRole,
} from "@/services/authService";
import { handleGoogleAccessToken, isGoogleSignInConfigured } from "@/services/firebase/googleAuth";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type AuthMethod = "phone" | "email" | "google" | null;

export interface User extends AuthUser {}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isOnboarded: boolean;
  isLoading: boolean;
  // Email auth
  signInWithEmail: (email: string, password: string) => Promise<void>;
  registerWithEmail: (email: string, password: string, name: string) => Promise<void>;
  // Placeholder hooks for Firebase Phone + Google (wire up in services/firebase/)
  signInWithPhone: (idToken: string, phone: string) => Promise<void>;
  signInWithGoogle: (idToken: string) => Promise<void>;
  // Session management
  signOut: () => Promise<void>;
  markOnboarded: () => Promise<void>;
  // Role helpers
  isCustomer: boolean;
  isCourier: boolean;
  // Legacy compat (used by auth screens that call signIn directly)
  signIn: (method: AuthMethod, data?: Partial<User>) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------
const AuthContext = createContext<AuthContextType>({
  user: null,
  isAuthenticated: false,
  isOnboarded: false,
  isLoading: true,
  signInWithEmail: async () => {},
  registerWithEmail: async () => {},
  signInWithPhone: async () => {},
  signInWithGoogle: async () => {},
  signOut: async () => {},
  markOnboarded: async () => {},
  isCustomer: false,
  isCourier: false,
  signIn: async () => {},
});

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------
const ONBOARDED_KEY = "@aist_onboarded";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isOnboarded, setIsOnboarded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // ── Restore session on mount ──────────────────────────────────────────────
  useEffect(() => {
    async function restore() {
      try {
        const [onboarded, restoredUser] = await Promise.all([
          AsyncStorage.getItem(ONBOARDED_KEY),
          restoreSession(),
        ]);
        if (onboarded === "true") setIsOnboarded(true);
        if (restoredUser) setUser(restoredUser);
      } catch {
        // Ignore restore errors — user stays unauthenticated
      } finally {
        setIsLoading(false);
      }
    }
    restore();
  }, []);

  // ── Email sign in ─────────────────────────────────────────────────────────
  const signInWithEmail = useCallback(async (email: string, password: string) => {
    const { user: u } = await emailLogin(email, password);
    setUser(u);
  }, []);

  // ── Email register ────────────────────────────────────────────────────────
  const registerWithEmail = useCallback(
    async (email: string, password: string, name: string) => {
      const { user: u } = await emailRegister(email, password, name);
      setUser(u);
    },
    []
  );

  // ── Firebase Phone Auth integration point ─────────────────────────────────
  // When Firebase Phone auth is ready, import confirmPhoneCode from
  // services/firebase/phoneAuth.ts, exchange the Firebase ID token at
  // POST /api/auth/firebase, then call setUser() with the returned user.
  const signInWithPhone = useCallback(
    async (_idToken: string, phone: string) => {
      // SCAFFOLD — replace body when Firebase is configured
      const mockUser: User = {
        id: "phone-mock",
        email: "",
        name: phone,
        role: "customer",
        phone,
        authMethod: "phone",
      };
      setUser(mockUser);
    },
    []
  );

  // ── Google OAuth Sign-In (expo-auth-session PKCE) ────────────────────────
  // Receives a Google access_token (from useGoogleAuthRequest hook in the
  // sign-in screen) and exchanges it at POST /api/auth/google.
  //
  // Required ENV:
  //   EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID / EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID
  //
  // Without credentials: shows a "not configured" error to the user.
  const signInWithGoogleCtx = useCallback(async (accessToken: string) => {
    if (!isGoogleSignInConfigured) {
      throw new Error("Google Sign-In not configured. Set EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID.");
    }
    const { user: u } = await handleGoogleAccessToken(accessToken);
    setUser(u as User);
  }, []);

  // ── Sign out ──────────────────────────────────────────────────────────────
  const signOut = useCallback(async () => {
    await serviceLogout();
    setUser(null);
  }, []);

  // ── Mark onboarded ────────────────────────────────────────────────────────
  const markOnboarded = useCallback(async () => {
    setIsOnboarded(true);
    await AsyncStorage.setItem(ONBOARDED_KEY, "true");
  }, []);

  // ── Legacy signIn (used by auth screens directly) ─────────────────────────
  // Routes legacy callers to the proper method.
  const signIn = useCallback(
    async (method: AuthMethod, data?: Partial<User>) => {
      if (method === "email") {
        // legacy callers should migrate to signInWithEmail; for now mock
        const u: User = {
          id: data?.id ?? "legacy-email",
          email: data?.email ?? "",
          name: data?.name ?? data?.email?.split("@")[0] ?? "User",
          role: "customer",
          authMethod: "email",
        };
        setUser(u);
      } else if (method === "phone") {
        await signInWithPhone("", data?.phone ?? "");
      } else if (method === "google") {
        await signInWithGoogleCtx("");
      }
    },
    [signInWithPhone, signInWithGoogleCtx]
  );

  // ── Computed ──────────────────────────────────────────────────────────────
  const isCustomer = user?.role === "customer";
  const isCourier = user?.role === "courier";

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isOnboarded,
        isLoading,
        signInWithEmail,
        registerWithEmail,
        signInWithPhone,
        signInWithGoogle: signInWithGoogleCtx,
        signOut,
        markOnboarded,
        isCustomer,
        isCourier,
        signIn,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
