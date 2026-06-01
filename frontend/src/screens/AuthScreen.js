// Sign-in / sign-up screen, plus the trusted-vendor and guest entry points.
import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useAuth } from "../context/AuthContext";
import { colors, font, radius, spacing, gradients } from "../utils/theme";

const VIEWS = { LANDING: "landing", LOGIN: "login", SIGNUP: "signup" };

export default function AuthScreen() {
  const { signIn, signUp, signInWithPin } = useAuth();
  const [view, setView] = useState(VIEWS.LANDING);

  // Landing Page
  const [pin, setPin] = useState("");
  const [pinLoading, setPinLoading] = useState(false);

  // Login Page
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  // Signup Page
  const [storeName, setStoreName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPass, setSignupPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [vendorPin, setVendorPin] = useState("");
  const [partnerPin, setPartnerPin] = useState("");
  const [plan, setPlan] = useState("free");
  const [signupLoading, setSignupLoading] = useState(false);

  const handlePin = async () => {
    if (pin.length < 4) {
      Alert.alert("Invalid PIN", "Enter at least 4 digits.");
      return;
    }
    setPinLoading(true);
    const { error } = await signInWithPin(pin);
    if (error) Alert.alert("Invalid PIN", error.message);
    setPinLoading(false);
  };

  const handleLogin = async () => {
    if (!loginEmail || !loginPass) {
      Alert.alert("Missing fields", "Enter email and password.");
      return;
    }
    setLoginLoading(true);
    const { error } = await signIn({ email: loginEmail, password: loginPass });
    if (error) Alert.alert("Sign in failed", error.message);
    setLoginLoading(false);
  };

  const handleSignup = async () => {
    if (!storeName || !signupEmail || !signupPass) {
      Alert.alert("Missing fields", "Fill in store name, email and password.");
      return;
    }
    if (signupPass !== confirmPass) {
      Alert.alert("Password mismatch", "Passwords do not match.");
      return;
    }
    if (signupPass.length < 8) {
      Alert.alert("Weak password", "Use at least 8 characters.");
      return;
    }
    setSignupLoading(true);
    const { error } = await signUp({
      email: signupEmail,
      password: signupPass,
      storeName,
      customerPin: vendorPin,
      partnerPin,
    });
    if (error) Alert.alert("Sign up failed", error.message);
    setSignupLoading(false);
  };

  // LANDING
  if (view === VIEWS.LANDING)
    return (
      <LinearGradient
        colors={gradients.bg}
        style={s.fill}
        start={gradients.bgStart}
        end={gradients.bgEnd}
      >
        <SafeAreaView style={s.fill} edges={["top", "bottom"]}>
          <KeyboardAvoidingView
            style={s.fill}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
          >
            <ScrollView contentContainerStyle={s.landing} keyboardShouldPersistTaps="handled">
              <View style={s.logoWrap}>
                <Text style={s.logoIc}>IMG</Text>
                <Text style={s.logoName}>AceDeck</Text>
                <Text style={s.logoSub}>Your TCG point of sale</Text>
              </View>

              <TouchableOpacity
                style={s.btnPrimary}
                onPress={() => setView(VIEWS.SIGNUP)}
                activeOpacity={0.85}
              >
                <LinearGradient
                  colors={gradients.primary}
                  style={s.btnGrad}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  <Text style={s.btnPrimaryTxt}>Create account</Text>
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity
                style={s.btnSecondary}
                onPress={() => setView(VIEWS.LOGIN)}
                activeOpacity={0.85}
              >
                <Text style={s.btnSecondaryTxt}>Sign in</Text>
              </TouchableOpacity>

              <View style={s.dividerRow}>
                <View style={s.dividerLine} />
                <Text style={s.dividerTxt}>or enter vendor PIN</Text>
                <View style={s.dividerLine} />
              </View>

              <Text style={s.pinLabel}>Guest access — your vendor's PIN</Text>
              <View style={s.pinRow}>
                <TextInput
                  style={[s.inp, s.pinInp]}
                  value={pin}
                  onChangeText={setPin}
                  placeholder="6-digit PIN"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="number-pad"
                  maxLength={6}
                />
                <TouchableOpacity
                  style={s.pinBtn}
                  onPress={handlePin}
                  disabled={pinLoading}
                  activeOpacity={0.85}
                >
                  {pinLoading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <LinearGradient
                      colors={[colors.blue, colors.purple]}
                      style={s.pinBtnGrad}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                    >
                      <Text style={s.pinBtnTxt}>Go</Text>
                    </LinearGradient>
                  )}
                </TouchableOpacity>
              </View>
              <Text style={s.pinHint}>
                Ask your vendor for their PIN to buy & sell at their table
              </Text>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </LinearGradient>
    );

  // LOGIN
  if (view === VIEWS.LOGIN)
    return (
      <LinearGradient
        colors={gradients.bg}
        style={s.fill}
        start={gradients.bgStart}
        end={gradients.bgEnd}
      >
        <SafeAreaView style={s.fill} edges={["top", "bottom"]}>
          <KeyboardAvoidingView
            style={s.fill}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
          >
            <ScrollView contentContainerStyle={s.formWrap} keyboardShouldPersistTaps="handled">
              <TouchableOpacity style={s.backBtn} onPress={() => setView(VIEWS.LANDING)}>
                <Text style={s.backTxt}>← Back</Text>
              </TouchableOpacity>
              <Text style={s.formTitle}>Sign in</Text>

              <Text style={s.label}>Email</Text>
              <TextInput
                style={s.inp}
                value={loginEmail}
                onChangeText={setLoginEmail}
                placeholder="your@email.com"
                placeholderTextColor={colors.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />

              <Text style={s.label}>Password</Text>
              <TextInput
                style={s.inp}
                value={loginPass}
                onChangeText={setLoginPass}
                placeholder="••••••••"
                placeholderTextColor={colors.textMuted}
                secureTextEntry
              />

              <TouchableOpacity
                style={s.btnPrimary}
                onPress={handleLogin}
                disabled={loginLoading}
                activeOpacity={0.85}
              >
                <LinearGradient
                  colors={gradients.primary}
                  style={s.btnGrad}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  {loginLoading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={s.btnPrimaryTxt}>Sign in</Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity
                style={s.btnSecondary}
                onPress={() => setView(VIEWS.SIGNUP)}
                activeOpacity={0.85}
              >
                <Text style={s.btnSecondaryTxt}>Create account</Text>
              </TouchableOpacity>

              <TouchableOpacity style={{ marginTop: 8, alignItems: "center" }}>
                <Text style={s.pinHint}>Forgot password?</Text>
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </LinearGradient>
    );

  // SIGNUP
  return (
    <LinearGradient
      colors={gradients.bg}
      style={s.fill}
      start={gradients.bgStart}
      end={gradients.bgEnd}
    >
      <SafeAreaView style={s.fill} edges={["top", "bottom"]}>
        <KeyboardAvoidingView
          style={s.fill}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView contentContainerStyle={s.formWrap} keyboardShouldPersistTaps="handled">
            <TouchableOpacity style={s.backBtn} onPress={() => setView(VIEWS.LANDING)}>
              <Text style={s.backTxt}>← Back</Text>
            </TouchableOpacity>
            <Text style={s.formTitle}>Create account</Text>

            <Text style={s.sectionHdr}>Store info</Text>
            <View style={s.card}>
              <Text style={s.label}>Store / vendor name</Text>
              <TextInput
                style={s.inp}
                value={storeName}
                onChangeText={setStoreName}
                placeholder="e.g. GoldFish TCG"
                placeholderTextColor={colors.textMuted}
              />
              <Text style={s.label}>Email</Text>
              <TextInput
                style={s.inp}
                value={signupEmail}
                onChangeText={setSignupEmail}
                placeholder="your@email.com"
                placeholderTextColor={colors.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Text style={s.label}>Password</Text>
              <TextInput
                style={s.inp}
                value={signupPass}
                onChangeText={setSignupPass}
                placeholder="Min 8 characters"
                placeholderTextColor={colors.textMuted}
                secureTextEntry
              />
              <Text style={s.label}>Confirm password</Text>
              <TextInput
                style={[s.inp, { marginBottom: 0 }]}
                value={confirmPass}
                onChangeText={setConfirmPass}
                placeholder="Repeat password"
                placeholderTextColor={colors.textMuted}
                secureTextEntry
              />
            </View>

            <Text style={s.sectionHdr}>Guest PIN (optional)</Text>
            <View style={s.card}>
              <Text style={[s.label, { marginBottom: 6 }]}>
                Customer PIN — for buyers at your table (browse + sell)
              </Text>
              <TextInput
                style={[s.inp, { letterSpacing: 6 }]}
                value={vendorPin}
                onChangeText={setVendorPin}
                placeholder="e.g. 482910"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
                maxLength={6}
              />
              <Text style={[s.label, { marginBottom: 6 }]}>
                Partner PIN — for trusted helpers (+ history & P&L)
              </Text>
              <TextInput
                style={[s.inp, { marginBottom: 0, letterSpacing: 6 }]}
                value={partnerPin}
                onChangeText={setPartnerPin}
                placeholder="e.g. 771234 (optional)"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
                maxLength={6}
              />
            </View>

            <Text style={s.sectionHdr}>Plan</Text>
            <View style={s.planRow}>
              {[
                { id: "free", label: "Free", price: "$0", sub: "300 cards · local" },
                { id: "pro", label: "Pro", price: "$14.99/mo", sub: "Unlimited · cloud" },
              ].map((pl) => (
                <TouchableOpacity
                  key={pl.id}
                  style={[s.planCard, plan === pl.id && s.planCardOn]}
                  onPress={() => setPlan(pl.id)}
                  activeOpacity={0.85}
                >
                  <Text
                    style={[s.planLabel, { color: pl.id === "pro" ? colors.yellow : colors.red }]}
                  >
                    {pl.label}
                  </Text>
                  <Text style={s.planPrice}>{pl.price}</Text>
                  <Text style={s.planSub}>{pl.sub}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={[s.btnPrimary, { marginTop: 8 }]}
              onPress={handleSignup}
              disabled={signupLoading}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={gradients.primary}
                style={s.btnGrad}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                {signupLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={s.btnPrimaryTxt}>Create account</Text>
                )}
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              style={s.btnSecondary}
              onPress={() => setView(VIEWS.LOGIN)}
              activeOpacity={0.85}
            >
              <Text style={s.btnSecondaryTxt}>Already have an account? Sign in</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1 },
  landing: { flexGrow: 1, justifyContent: "center", padding: 28 },
  formWrap: { flexGrow: 1, padding: 24 },

  logoWrap: { alignItems: "center", marginBottom: 40 },
  logoIc: { fontSize: 52, marginBottom: 10 },
  logoName: { fontSize: 30, fontWeight: font.heavy, color: colors.text },
  logoSub: { fontSize: 14, color: colors.textSub, marginTop: 4 },

  btnPrimary: { borderRadius: radius.lg, overflow: "hidden", marginBottom: 12 },
  btnGrad: { paddingVertical: 15, alignItems: "center" },
  btnPrimaryTxt: { fontSize: 15, fontWeight: font.bold, color: "#fff" },

  btnSecondary: {
    backgroundColor: colors.bg1,
    borderRadius: radius.lg,
    borderWidth: 0.5,
    borderColor: colors.border,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 12,
  },
  btnSecondaryTxt: { fontSize: 15, fontWeight: font.medium, color: colors.text },

  dividerRow: { flexDirection: "row", alignItems: "center", marginVertical: 20, gap: 10 },
  dividerLine: { flex: 1, height: 0.5, backgroundColor: colors.border },
  dividerTxt: { color: colors.textMuted, fontSize: 12 },

  pinLabel: { color: colors.textSub, fontSize: 12, marginBottom: 8, textAlign: "center" },
  pinRow: { flexDirection: "row", gap: 10, marginBottom: 8 },
  pinInp: { flex: 1, marginBottom: 0, letterSpacing: 6, fontSize: 18, textAlign: "center" },
  pinBtn: { width: 64, borderRadius: radius.md, overflow: "hidden" },
  pinBtnGrad: { flex: 1, alignItems: "center", justifyContent: "center" },
  pinBtnTxt: { fontSize: 15, fontWeight: font.bold, color: "#fff" },
  pinHint: { color: colors.textMuted, fontSize: 11, textAlign: "center" },

  backBtn: { marginBottom: 16 },
  backTxt: { color: colors.red, fontSize: 14, fontWeight: font.medium },
  formTitle: { fontSize: 24, fontWeight: font.heavy, color: colors.text, marginBottom: 24 },

  sectionHdr: {
    fontSize: 12,
    fontWeight: font.bold,
    color: colors.textMuted,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginTop: 16,
    marginBottom: 8,
  },
  card: {
    backgroundColor: colors.bg1,
    borderRadius: radius.lg,
    borderWidth: 0.5,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 6,
  },

  label: { fontSize: 12, color: colors.textSub, marginBottom: 6, marginTop: 2 },
  inp: {
    backgroundColor: colors.bg2,
    borderRadius: radius.md,
    borderWidth: 0.5,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 14,
    marginBottom: 12,
  },

  planRow: { flexDirection: "row", gap: 10 },
  planCard: {
    flex: 1,
    backgroundColor: colors.bg1,
    borderRadius: radius.lg,
    borderWidth: 0.5,
    borderColor: colors.border,
    padding: 14,
    alignItems: "center",
  },
  planCardOn: { borderColor: colors.red, borderWidth: 2 },
  planLabel: { fontSize: 12, fontWeight: font.bold, marginBottom: 4 },
  planPrice: { fontSize: 17, fontWeight: font.heavy, color: colors.text, marginBottom: 2 },
  planSub: { fontSize: 11, color: colors.textSub, textAlign: "center" },
});
