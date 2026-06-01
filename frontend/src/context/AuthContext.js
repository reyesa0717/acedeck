// Auth + session provider. Supports real Supabase accounts, a trusted-vendor shortcut, and
// guest sessions (customer/partner) gated by PIN. Exposes plan limits and guest permissions.
import React, { createContext, useContext, useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import {
  setActiveUser,
  setSupabase,
  syncFromCloud,
  wipeUserData,
} from "../../../backend/src/services/storage";

// Debug config
const DEBUG_MODE = false;
const DEBUG_USER = {
  id: "debug-user-001",
  email: "debug@acedeck.dev",
  storeName: "Debug Store 🛠",
  plan: "team",
};
const DEBUG_PASSWORD = "debug123";

const TRUSTED_VENDOR = {
  id: "trusted-vendor-001",
  storeName: "Trusted Vendor",
  plan: "team",
  pin: "999999",
};

// Supabase
let supabase = null;
try {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (url && key) {
    const { createClient } = require("@supabase/supabase-js");
    supabase = createClient(url, key);
    setSupabase(supabase);
  }
} catch {}

// RevenueCat disabled
let Purchases = null;

// Storage keys
const K = {
  SESSION: "pp_session_v1",
  GUEST: "pp_guest_v1",
  PIN_CUSTOMER: "pp_pin_customer",
  PIN_PARTNER: "pp_pin_partner",
  PLAN: "pp_plan_v1",
};

// Plan limits: catalog size, history retention, cloud sync, and how many guest PINs are allowed.
export const PLAN_LIMITS = {
  free: { catalogMax: 300, historyDays: 7, cloudSync: false, guestPins: 1 },
  pro: { catalogMax: Infinity, historyDays: 90, cloudSync: true, guestPins: 2 },
  team: { catalogMax: Infinity, historyDays: 90, cloudSync: true, guestPins: 5 },
};

// Guest role permission gates: customers can browse + sell; partners also get acquire + history.
export const GUEST_ROLES = {
  customer: {
    label: "Customer",
    color: "#22C55E",
    bgColor: "rgba(34,197,94,0.12)",
    borderColor: "rgba(34,197,94,0.3)",
    canSell: true,
    canAcquire: false,
    canHistory: false,
    canInventory: false,
    canImport: false,
    canAccount: false,
    badge: "Browse + sell",
    description: "Browse catalog, check prices & log sales",
  },
  partner: {
    label: "Partner",
    color: "#1976D2",
    bgColor: "rgba(25,118,210,0.12)",
    borderColor: "rgba(25,118,210,0.3)",
    canSell: true,
    canAcquire: true,
    canHistory: true,
    canInventory: false,
    canImport: false,
    canAccount: false,
    badge: "Full access",
    description: "All POS + history and P&L reports",
  },
};

// Context
const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isGuest, setIsGuest] = useState(false);
  const [guestRole, setGuestRole] = useState(null);
  const [vendorInfo, setVendorInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isDebug, setIsDebug] = useState(false);

  // Restore session
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(K.SESSION);
        if (raw) {
          const u = JSON.parse(raw);
          if (u.id === TRUSTED_VENDOR?.id) {
            setActiveUser(u.id);
            setUser({ ...u, plan: "team" });
            setLoading(false);
            return;
          }
          if (u.id === DEBUG_USER.id && DEBUG_MODE) {
            setActiveUser(u.id);
            setUser({ ...u, plan: "team" });
            setIsDebug(true);
            setLoading(false);
            return;
          }
          setActiveUser(u.id);
          setUser(u);
          setLoading(false);

          if (supabase)
            _fetchPlan(u.id)
              .then((plan) => {
                if (plan !== u.plan) setUser((p) => ({ ...p, plan }));
              })
              .catch(() => {});
          return;
        }
        const guestRaw = await AsyncStorage.getItem(K.GUEST);
        if (guestRaw) {
          const g = JSON.parse(guestRaw);
          setIsGuest(true);
          setGuestRole(g.role || "customer");
          setVendorInfo({ storeName: g.storeName });
          setLoading(false);
          return;
        }

        if (supabase) {
          try {
            const {
              data: { session },
            } = await supabase.auth.getSession();
            if (session?.user) {
              const plan = await _fetchPlan(session.user.id);
              const u = {
                id: session.user.id,
                email: session.user.email,
                storeName: session.user.user_metadata?.storeName || "My Store",
                plan,
              };
              await AsyncStorage.setItem(K.SESSION, JSON.stringify(u));
              setActiveUser(u.id);
              setUser(u);
              setLoading(false);
              syncFromCloud().catch(() => {});
              return;
            }
          } catch {}
        }
      } catch {}
      setLoading(false);
    })();
  }, []);

  const _fetchPlan = async (userId) => {
    if (!supabase || !userId) return "pro";
    try {
      const { data } = await supabase
        .from("profiles")
        .select("plan")
        .eq("id", userId)
        .maybeSingle();
      return data?.plan || "pro";
    } catch {
      return "pro";
    }
  };

  // Sign in
  const signIn = async ({ email, password }) => {
    // Debug
    if (DEBUG_MODE && email === DEBUG_USER.email && password === DEBUG_PASSWORD) {
      await AsyncStorage.setItem(K.SESSION, JSON.stringify(DEBUG_USER));
      setActiveUser(DEBUG_USER.id);
      setUser({ ...DEBUG_USER, plan: "team" });
      setIsDebug(true);
      return { error: null };
    }
    if (!supabase) {
      const raw = await AsyncStorage.getItem(K.SESSION);
      if (raw) {
        const u = JSON.parse(raw);
        setActiveUser(u.id);
        setUser(u);
        return { error: null };
      }
      return { error: { message: "No account found. Sign up first, or use debug login." } };
    }
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error };
    const plan = await _fetchPlan(data.user.id);
    const u = {
      id: data.user.id,
      email,
      storeName: data.user.user_metadata?.storeName || "My Store",
      plan,
    };
    await AsyncStorage.setItem(K.SESSION, JSON.stringify(u));
    setActiveUser(u.id);
    setUser(u);
    syncFromCloud().catch(() => {});
    return { error: null };
  };

  // Sign up
  const signUp = async ({ email, password, storeName, customerPin, partnerPin }) => {
    let userId;
    if (!supabase) {
      userId = Date.now().toString();
      const u = { id: userId, email, storeName, plan: "free" };
      await AsyncStorage.setItem(K.SESSION, JSON.stringify(u));
      setActiveUser(userId);
      setUser(u);
    } else {
      const redirectTo =
        process.env.EXPO_PUBLIC_SUPABASE_EMAIL_REDIRECT_TO ||
        process.env.EXPO_PUBLIC_SUPABASE_URL ||
        undefined;

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { storeName },
          ...(redirectTo ? { emailRedirectTo: redirectTo } : {}),
        },
      });
      if (error) return { error };
      userId = data.user.id;
      const u = { id: userId, email, storeName, plan: "free" };
      await AsyncStorage.setItem(K.SESSION, JSON.stringify(u));
      setActiveUser(userId);
      setUser(u);
      supabase
        .from("profiles")
        .upsert(
          { id: userId, store_name: storeName, plan: "free" },
          { onConflict: "id", ignoreDuplicates: true }
        )
        .catch(() => {});
    }
    await _savePins(userId, customerPin, partnerPin);
    return { error: null };
  };

  // Sign out
  const signOut = async () => {
    try {
      if (user?.avatarUri) await FileSystem.deleteAsync(user.avatarUri, { idempotent: true });
    } catch {}
    try {
      if (supabase) await supabase.auth.signOut();
    } catch {}
    await AsyncStorage.multiRemove([K.SESSION, K.GUEST]);
    setActiveUser("local");
    setUser(null);
    setIsGuest(false);
    setIsDebug(false);
    setGuestRole(null);
    setVendorInfo(null);
  };

  // Delete Account
  const deleteAccount = async () => {
    const uid = user?.id;
    if (!uid) return { error: { message: "No signed-in account to delete." } };
    try {
      if (supabase) {
        const tables = [
          ["catalog", "user_id"],
          ["transactions", "user_id"],
          ["acquisitions", "user_id"],
          ["vendor_pins", "user_id"],
          ["profiles", "id"],
        ];
        for (const [table, col] of tables) {
          try {
            const { error } = await supabase.from(table).delete().eq(col, uid);
            if (error) console.warn("[auth] delete " + table + ":", error.message);
          } catch (e) {
            console.warn("[auth] delete " + table + ":", e?.message || e);
          }
        }
      }

      try {
        if (user?.avatarUri) await FileSystem.deleteAsync(user.avatarUri, { idempotent: true });
      } catch {}

      await wipeUserData(uid);
      try {
        if (supabase) await supabase.auth.signOut();
      } catch {}
      await AsyncStorage.multiRemove([K.SESSION, K.GUEST, K.PIN_CUSTOMER, K.PIN_PARTNER, K.PLAN]);

      setActiveUser("local");
      setUser(null);
      setIsGuest(false);
      setIsDebug(false);
      setGuestRole(null);
      setVendorInfo(null);
      return { error: null };
    } catch (e) {
      return { error: { message: e.message || "Delete failed." } };
    }
  };

  // Guest PIN login
  const signInWithPin = async (pinInput) => {
    const pinStr = String(pinInput).trim();

    if (TRUSTED_VENDOR && pinStr === TRUSTED_VENDOR.pin) {
      const u = {
        id: TRUSTED_VENDOR.id,
        email: "",
        storeName: TRUSTED_VENDOR.storeName,
        plan: "team",
      };
      await AsyncStorage.setItem(K.SESSION, JSON.stringify(u));
      setActiveUser(u.id);
      setUser(u);
      setIsGuest(false);
      return { error: null };
    }

    const localCustomer = await AsyncStorage.getItem(K.PIN_CUSTOMER);
    const localPartner = await AsyncStorage.getItem(K.PIN_PARTNER);
    const sessionRaw = await AsyncStorage.getItem(K.SESSION);
    const session = sessionRaw ? JSON.parse(sessionRaw) : null;
    if (localCustomer === pinStr) return _setGuest("customer", session?.storeName || "Local Store");
    if (localPartner === pinStr) return _setGuest("partner", session?.storeName || "Local Store");

    // Supabase PIN lookup
    if (supabase) {
      try {
        const { data } = await supabase
          .from("vendor_pins")
          .select("role, user_id, profiles:user_id(store_name)")
          .eq("pin", pinStr)
          .maybeSingle();
        if (data)
          return _setGuest(data.role || "customer", data.profiles?.store_name || "Vendor Store");
      } catch {}
    }

    return { error: { message: "Invalid PIN. Check with your vendor for the correct code." } };
  };

  const _setGuest = async (role, storeName) => {
    const info = { role, storeName };
    await AsyncStorage.setItem(K.GUEST, JSON.stringify(info));
    setIsGuest(true);
    setGuestRole(role);
    setVendorInfo({ storeName });
    return { error: null };
  };

  // Pin Page
  const _savePins = async (userId, customerPin, partnerPin) => {
    if (customerPin?.length >= 4) {
      await AsyncStorage.setItem(K.PIN_CUSTOMER, String(customerPin));
      if (supabase && userId)
        supabase
          .from("vendor_pins")
          .upsert({ user_id: userId, pin: String(customerPin), role: "customer" })
          .catch(() => {});
    }
    if (partnerPin?.length >= 4) {
      await AsyncStorage.setItem(K.PIN_PARTNER, String(partnerPin));
      if (supabase && userId)
        supabase
          .from("vendor_pins")
          .upsert({ user_id: userId, pin: String(partnerPin), role: "partner" })
          .catch(() => {});
    }
  };

  const getPins = async () => ({
    customer: (await AsyncStorage.getItem(K.PIN_CUSTOMER)) || null,
    partner: (await AsyncStorage.getItem(K.PIN_PARTNER)) || null,
  });

  const regeneratePin = async (role = "customer") => {
    const newPin = String(Math.floor(100000 + Math.random() * 900000));
    await AsyncStorage.setItem(role === "partner" ? K.PIN_PARTNER : K.PIN_CUSTOMER, newPin);
    if (supabase && user?.id)
      supabase
        .from("vendor_pins")
        .upsert({ user_id: user.id, pin: newPin, role })
        .catch(() => {});
    return newPin;
  };

  const updatePin = async (role, newPin) => {
    if (!newPin || newPin.length < 4)
      return { error: { message: "PIN must be at least 4 digits" } };
    await AsyncStorage.setItem(role === "partner" ? K.PIN_PARTNER : K.PIN_CUSTOMER, String(newPin));
    if (supabase && user?.id)
      supabase
        .from("vendor_pins")
        .upsert({ user_id: user.id, pin: String(newPin), role })
        .catch(() => {});
    return { error: null };
  };

  const upgradePlan = async (planId) => {
    if (!Purchases) return { error: { message: "Purchases SDK not available" } };
    try {
      const { customerInfo } = await Purchases.purchasePackage(planId);
      const e = customerInfo.entitlements.active;
      const plan = e["team"] ? "team" : e["pro"] ? "pro" : "free";
      await AsyncStorage.setItem(K.PLAN, plan);
      setUser((u) => ({ ...u, plan }));
      return { error: null };
    } catch (e) {
      return { error: { message: e.message } };
    }
  };

  const restorePurchases = async () => {
    if (!Purchases) return;
    try {
      const { customerInfo } = await Purchases.restorePurchases();
      const e = customerInfo.entitlements.active;
      const plan = e["team"] ? "team" : e["pro"] ? "pro" : "free";
      await AsyncStorage.setItem(K.PLAN, plan);
      setUser((u) => ({ ...u, plan }));
    } catch {}
  };

  // PFP
  const setProfileAvatar = async (pickerUri) => {
    if (!user?.id) return { error: { message: "Sign in to set a profile photo." } };
    try {
      if (!pickerUri) {
        if (user.avatarUri) {
          try {
            await FileSystem.deleteAsync(user.avatarUri, { idempotent: true });
          } catch {}
        }
        const next = { ...user };
        delete next.avatarUri;
        await AsyncStorage.setItem(K.SESSION, JSON.stringify(next));
        setUser(next);
        return { error: null };
      }
      const dest =
        FileSystem.documentDirectory + "avatar_" + user.id.replace(/[^a-zA-Z0-9_-]/g, "_") + ".jpg";
      try {
        await FileSystem.deleteAsync(dest, { idempotent: true });
      } catch {}
      await FileSystem.copyAsync({ from: pickerUri, to: dest });
      const next = { ...user, avatarUri: dest };
      await AsyncStorage.setItem(K.SESSION, JSON.stringify(next));
      setUser(next);
      return { error: null };
    } catch (e) {
      return { error: { message: e.message || "Could not save profile photo." } };
    }
  };

  const limits = PLAN_LIMITS[user?.plan || "free"];
  const isPro = user?.plan === "pro" || user?.plan === "team";
  const isTeam = user?.plan === "team";
  const guestPerms = isGuest ? GUEST_ROLES[guestRole] || GUEST_ROLES.customer : null;
  const isTrusted = user?.id === TRUSTED_VENDOR?.id;

  return (
    <AuthContext.Provider
      value={{
        user,
        isGuest,
        isDebug,
        isTrusted,
        guestRole,
        guestPerms,
        vendorInfo,
        loading,
        isPro,
        isTeam,
        limits,
        signUp,
        signIn,
        signOut,
        signInWithPin,
        deleteAccount,
        upgradePlan,
        restorePurchases,
        getPins,
        regeneratePin,
        updatePin,
        setProfileAvatar,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
