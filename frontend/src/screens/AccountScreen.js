// Account tab: shows the signed-in user/plan, plan limits, cloud-sync status, and sign-out.
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Share,
  ActivityIndicator,
  Image,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useAuth } from "../context/AuthContext";
import { useNavigation } from "@react-navigation/native";
import { loadCatalog } from "../../../backend/src/services/storage";
import { clearScrydexCaches, syncCatalogPrices } from "../../../backend/src/services/scrydex";
import { clearSetCache } from "../../../backend/src/services/setCache";
import { prewarmPage } from "../components/CatalogImage";
import { colors, font, radius, spacing, gradients } from "../utils/theme";

export default function AccountScreen() {
  const navigation = useNavigation();
  const {
    user,
    isPro,
    signOut,
    restorePurchases,
    getPins,
    regeneratePin,
    setProfileAvatar,
    deleteAccount,
  } = useAuth();
  const [deleting, setDeleting] = useState(false);
  const [pin, setPin] = useState("••••••");
  const [pinVisible, setPinV] = useState(false);
  const [regenLoading, setRL] = useState(false);
  const [catalogCount, setCC] = useState(0);
  const [totalValue, setTV] = useState(0);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    loadPin();
    loadStats();
  }, []);

  const loadPin = async () => {
    const pins = await getPins();
    if (pins?.customer) setPin(pins.customer);
  };

  const loadStats = async () => {
    const catalog = await loadCatalog();
    setCC(catalog.length);
    setTV(catalog.reduce((s, c) => s + (c.marketPrice || 0) * (c.quantity || 1), 0));
  };

  const handleRegenPin = async () => {
    Alert.alert(
      "Regenerate PIN?",
      "Your current PIN will stop working and guests will need the new one.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Regenerate",
          style: "destructive",
          onPress: async () => {
            setRL(true);
            const newPin = await regeneratePin();
            setPin(newPin);
            setPinV(true);
            setRL(false);
          },
        },
      ]
    );
  };

  const handleShareQR = async () => {
    try {
      await Share.share({ message: `Browse my card collection on AceDeck! Use PIN: ${pin}` });
    } catch {}
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const removed = await clearScrydexCaches();
      await clearSetCache();
      const catalog = await loadCatalog();
      let priced = 0;
      if (catalog.length) {
        prewarmPage(catalog.slice(0, 120));
        const result = await syncCatalogPrices(catalog, () => {});
        priced = result?.synced || 0;
      }
      Alert.alert(
        "Synced",
        "Cleared " + removed + " stale cache entries.\nRefreshed prices for " + priced + " cards."
      );
    } catch (e) {
      Alert.alert("Sync failed", e.message || "Unknown error");
    } finally {
      setSyncing(false);
    }
  };

  const pickAvatarFromLibrary = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Photos", "Allow photo access in Settings to choose a profile picture.");
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (res.canceled || !res.assets?.[0]?.uri) return;
    const { error } = await setProfileAvatar(res.assets[0].uri);
    if (error) Alert.alert("Photo", error.message);
  };

  const pickAvatarFromCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Camera", "Allow camera access in Settings to take a profile picture.");
      return;
    }
    const res = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (res.canceled || !res.assets?.[0]?.uri) return;
    const { error } = await setProfileAvatar(res.assets[0].uri);
    if (error) Alert.alert("Photo", error.message);
  };

  const runDeleteAccount = async () => {
    setDeleting(true);
    const { error } = await deleteAccount();
    setDeleting(false);
    if (error) Alert.alert("Delete account", error.message);
    else
      Alert.alert(
        "Account removed",
        "Your catalog, history, and PINs are cleared on this device. You can create a new account anytime."
      );
  };

  const confirmDeleteAccount = () => {
    Alert.alert(
      "Delete account?",
      "This removes your catalog, sales history, acquired, guest PINs, and profile from this device. If you use cloud sync, we will try to delete your data there too (your login may still exist on the server unless an admin removes it).",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Continue",
          style: "destructive",
          onPress: () => {
            Alert.alert("Delete forever?", "You cannot undo this.", [
              { text: "Cancel", style: "cancel" },
              { text: "Delete account", style: "destructive", onPress: runDeleteAccount },
            ]);
          },
        },
      ]
    );
  };

  const openProfilePhotoOptions = () => {
    const buttons = [
      { text: "Choose from library", onPress: () => pickAvatarFromLibrary() },
      { text: "Take photo", onPress: () => pickAvatarFromCamera() },
    ];
    if (user?.avatarUri) {
      buttons.push({
        text: "Remove photo",
        style: "destructive",
        onPress: async () => {
          const { error } = await setProfileAvatar(null);
          if (error) Alert.alert("Photo", error.message);
        },
      });
    }
    buttons.push({ text: "Cancel", style: "cancel", onPress: () => {} });
    Alert.alert("Profile photo", "Show a picture next to your store name.", buttons);
  };

  const planLabel = user?.plan === "team" ? "Team" : user?.plan === "pro" ? "Pro" : "Free";
  const planColor =
    user?.plan === "team" ? colors.purple : user?.plan === "pro" ? colors.yellow : colors.textSub;

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <LinearGradient
        colors={gradients.bg}
        style={StyleSheet.absoluteFillObject}
        start={gradients.bgStart}
        end={gradients.bgEnd}
      />

      <View style={s.topbar}>
        <Text style={s.title}>Account</Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile */}
        <View style={s.card}>
          <View style={s.profileRow}>
            <TouchableOpacity
              style={s.avatarTouch}
              onPress={openProfilePhotoOptions}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Change profile photo"
            >
              {user?.avatarUri ? (
                <Image source={{ uri: user.avatarUri }} style={s.avatarImg} />
              ) : (
                <LinearGradient
                  colors={gradients.primary}
                  style={s.avatar}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <Text style={s.avatarTxt}>{(user?.storeName || "?")[0].toUpperCase()}</Text>
                </LinearGradient>
              )}
              <View style={s.avatarEditBadge}>
                <Text style={s.avatarEditTxt}>{"✎"}</Text>
              </View>
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={s.storeName}>{user?.storeName || "My Store"}</Text>
              <Text style={s.email}>{user?.email || "Local account"}</Text>
              <TouchableOpacity
                onPress={openProfilePhotoOptions}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={s.photoLink}>
                  {user?.avatarUri ? "Change profile photo" : "Add profile photo"}
                </Text>
              </TouchableOpacity>
            </View>
            <View style={[s.planBadge, { borderColor: planColor }]}>
              <Text style={[s.planBadgeTxt, { color: planColor }]}>{planLabel}</Text>
            </View>
          </View>
          <View style={s.divider} />
          <Row label="Cards in catalog" value={String(catalogCount)} />
          <Row
            label="Inventory value"
            value={"$" + totalValue.toFixed(2)}
            valueColor={colors.green}
          />
        </View>

        {/* Sales audit */}
        <TouchableOpacity
          style={s.card}
          onPress={() => navigation.getParent()?.navigate("History", { openAuditPicker: true })}
          activeOpacity={0.85}
        >
          <View style={s.linkRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.cardTitle}>Sales audit</Text>
              <Text style={s.cardSub}>
                Filter by day or date range, tag a show or event, and review what sold (cash vs
                trades).
              </Text>
            </View>
            <Text style={s.linkChev}>›</Text>
          </View>
        </TouchableOpacity>

        {/* Guest PIN */}
        <TouchableOpacity
          style={s.card}
          onPress={() => navigation.navigate("PinManager")}
          activeOpacity={0.85}
        >
          <View style={s.linkRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.cardTitle}>Guest PINs</Text>
              <Text style={s.cardSub}>Manage Customer and Partner PIN access tiers</Text>
              <View style={{ flexDirection: "row", gap: 6, marginTop: 8 }}>
                <View
                  style={{
                    backgroundColor: "rgba(34,197,94,0.12)",
                    borderRadius: 5,
                    borderWidth: 0.5,
                    borderColor: "rgba(34,197,94,0.3)",
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                  }}
                >
                  <Text style={{ color: "#22C55E", fontSize: 11, fontWeight: font.bold }}>
                    Customer PIN
                  </Text>
                </View>
                {isPro && (
                  <View
                    style={{
                      backgroundColor: "rgba(25,118,210,0.12)",
                      borderRadius: 5,
                      borderWidth: 0.5,
                      borderColor: "rgba(25,118,210,0.3)",
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                    }}
                  >
                    <Text style={{ color: "#1976D2", fontSize: 11, fontWeight: font.bold }}>
                      Partner PIN
                    </Text>
                  </View>
                )}
              </View>
            </View>
            <Text style={s.linkChev}>›</Text>
          </View>
        </TouchableOpacity>

        {/* Subscription */}
        {!isPro && (
          <View style={s.card}>
            <Text style={s.cardTitle}>Upgrade to Pro</Text>
            <Text style={s.cardSub}>
              Unlimited catalog, full price history, cloud sync, guest PIN access
            </Text>
            <View style={s.planPriceRow}>
              <View style={s.planOpt}>
                <Text style={s.planOptPrice}>$14.99</Text>
                <Text style={s.planOptPer}>/month</Text>
              </View>
              <View style={[s.planOpt, s.planOptAlt]}>
                <Text style={s.planOptPrice}>$119.99</Text>
                <Text style={s.planOptPer}>/year</Text>
                <Text style={s.planOptSave}>Save 33%</Text>
              </View>
            </View>
            <TouchableOpacity style={s.upgradeBtn} activeOpacity={0.85}>
              <LinearGradient
                colors={gradients.primary}
                style={s.upgradeBtnGrad}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Text style={s.upgradeBtnTxt}>Upgrade to Pro</Text>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity
              style={{ marginTop: 8, alignItems: "center" }}
              onPress={restorePurchases}
            >
              <Text style={s.restoreTxt}>Restore purchases</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* QR Storefront */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Storefront QR</Text>
          <Text style={s.cardSub}>Customers scan to browse your cards & check live prices</Text>
          <View style={s.qrRow}>
            {/* QR placeholder  */}
            <View style={s.qrBox}>
              <View style={s.qrGrid}>
                {Array.from({ length: 36 }).map((_, i) => (
                  <View
                    key={i}
                    style={[
                      s.qrCell,
                      { backgroundColor: i % 3 === 0 || i % 7 === 0 ? colors.bg : "#fff" },
                    ]}
                  />
                ))}
              </View>
            </View>
            <View style={{ flex: 1, gap: 8 }}>
              <Text style={s.qrDesc}>
                Share your QR at conventions to drive customers to your table
              </Text>
              <TouchableOpacity style={s.shareBtn} onPress={handleShareQR} activeOpacity={0.8}>
                <Text style={s.shareBtnTxt}>Share →</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Pre-show sync */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Refresh prices & images</Text>
          <Text style={s.cardSub}>
            Clears the Scrydex cache and re-fetches live prices and images for every card in your
            catalog.
          </Text>
          <View style={s.syncStatus}>
            <View style={[s.syncDot, { backgroundColor: syncing ? colors.amber : colors.green }]} />
            <Text style={s.syncStatusTxt}>{syncing ? "Refreshing…" : "Ready to refresh"}</Text>
          </View>
          <TouchableOpacity
            style={s.syncFullBtn}
            onPress={handleSync}
            disabled={syncing}
            activeOpacity={0.8}
          >
            {syncing ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={s.syncFullBtnTxt}>↺ Refresh now</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Delete account */}
        <TouchableOpacity
          style={s.deleteAccountBtn}
          onPress={confirmDeleteAccount}
          disabled={deleting}
          activeOpacity={0.8}
        >
          {deleting ? (
            <ActivityIndicator color={colors.red} size="small" />
          ) : (
            <Text style={s.deleteAccountTxt}>Delete account</Text>
          )}
        </TouchableOpacity>
        <Text style={s.deleteAccountHint}>
          Permanently erase your data on this device. Cloud rows are deleted if your project allows
          it.
        </Text>

        {/* Sign out */}
        <TouchableOpacity
          style={s.signOutBtn}
          onPress={() =>
            Alert.alert("Sign out?", "You'll need to sign in again.", [
              { text: "Cancel", style: "cancel" },
              { text: "Sign out", style: "destructive", onPress: signOut },
            ])
          }
          activeOpacity={0.8}
        >
          <Text style={s.signOutTxt}>Sign out</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value, valueColor }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 }}>
      <Text style={{ color: colors.textSub, fontSize: 13 }}>{label}</Text>
      <Text style={{ color: valueColor || colors.text, fontSize: 13, fontWeight: font.medium }}>
        {value}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  topbar: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  title: { fontSize: 22, fontWeight: font.heavy, color: colors.text },

  card: {
    backgroundColor: colors.bg1,
    borderRadius: radius.lg,
    borderWidth: 0.5,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 12,
  },
  cardTitle: { fontSize: 14, fontWeight: font.bold, color: colors.text, marginBottom: 4 },
  cardSub: { fontSize: 12, color: colors.textSub, marginBottom: 12, lineHeight: 18 },
  linkRow: { flexDirection: "row", alignItems: "center" },
  linkChev: { color: colors.textMuted, fontSize: 18 },

  profileRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
  avatarTouch: { position: "relative" },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImg: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.bg2 },
  avatarTxt: { fontSize: 18, fontWeight: font.heavy, color: "#fff" },
  avatarEditBadge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.bg1,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarEditTxt: { fontSize: 11, color: colors.textSub },
  storeName: { fontSize: 15, fontWeight: font.bold, color: colors.text },
  email: { fontSize: 12, color: colors.textSub, marginTop: 2 },
  photoLink: { fontSize: 12, color: colors.red, fontWeight: font.medium, marginTop: 6 },
  planBadge: {
    borderRadius: radius.full,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  planBadgeTxt: { fontSize: 12, fontWeight: font.bold },
  divider: { height: 0.5, backgroundColor: colors.border, marginBottom: 10 },

  planPriceRow: { flexDirection: "row", gap: 10, marginBottom: 12 },
  planOpt: {
    flex: 1,
    backgroundColor: colors.bg2,
    borderRadius: radius.md,
    padding: 12,
    alignItems: "center",
  },
  planOptAlt: { borderWidth: 1, borderColor: colors.yellow },
  planOptPrice: { fontSize: 18, fontWeight: font.heavy, color: colors.text },
  planOptPer: { fontSize: 11, color: colors.textSub },
  planOptSave: { fontSize: 10, color: colors.yellow, marginTop: 2, fontWeight: font.bold },
  upgradeBtn: { borderRadius: radius.lg, overflow: "hidden", marginBottom: 4 },
  upgradeBtnGrad: { paddingVertical: 13, alignItems: "center" },
  upgradeBtnTxt: { fontSize: 14, fontWeight: font.bold, color: "#fff" },
  restoreTxt: { fontSize: 12, color: colors.textSub },

  pinRow: { flexDirection: "row", gap: 10, marginBottom: 8 },
  pinDisplay: {
    flex: 1,
    backgroundColor: colors.bg2,
    borderRadius: radius.md,
    borderWidth: 0.5,
    borderColor: colors.border,
    paddingVertical: 12,
    alignItems: "center",
  },
  pinTxt: { fontSize: 22, fontWeight: font.heavy, color: colors.yellow, letterSpacing: 6 },
  regenBtn: {
    backgroundColor: colors.bg2,
    borderRadius: radius.md,
    borderWidth: 0.5,
    borderColor: colors.border,
    paddingHorizontal: 14,
    justifyContent: "center",
  },
  regenTxt: { color: colors.textSub, fontSize: 13 },
  pinHint: { color: colors.textMuted, fontSize: 11 },

  qrRow: { flexDirection: "row", gap: 14, alignItems: "center" },
  qrBox: {
    width: 80,
    height: 80,
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 8,
    flexShrink: 0,
  },
  qrGrid: { flexDirection: "row", flexWrap: "wrap", gap: 2 },
  qrCell: { width: 9, height: 9, borderRadius: 1 },
  qrDesc: { fontSize: 12, color: colors.textSub, lineHeight: 17 },
  shareBtn: {
    backgroundColor: colors.bg2,
    borderRadius: radius.md,
    borderWidth: 0.5,
    borderColor: colors.border,
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignSelf: "flex-start",
  },
  shareBtnTxt: { fontSize: 13, color: colors.text, fontWeight: font.medium },

  syncRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  syncStatus: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  syncDot: { width: 7, height: 7, borderRadius: 4 },
  syncStatusTxt: { fontSize: 12, color: colors.textSub },
  syncFullBtn: {
    marginTop: 14,
    backgroundColor: colors.blue,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: "center",
  },
  syncFullBtnTxt: { color: "#fff", fontSize: 14, fontWeight: font.bold },

  deleteAccountBtn: {
    backgroundColor: colors.bg1,
    borderRadius: radius.lg,
    borderWidth: 0.5,
    borderColor: "rgba(239,68,68,0.35)",
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 8,
  },
  deleteAccountTxt: { color: "#EF4444", fontSize: 14, fontWeight: font.medium },
  deleteAccountHint: {
    fontSize: 11,
    color: colors.textMuted,
    lineHeight: 16,
    marginBottom: 12,
    paddingHorizontal: 4,
  },

  signOutBtn: {
    backgroundColor: colors.bg1,
    borderRadius: radius.lg,
    borderWidth: 0.5,
    borderColor: "rgba(233,30,99,0.3)",
    paddingVertical: 14,
    alignItems: "center",
  },
  signOutTxt: { color: colors.red, fontSize: 14, fontWeight: font.medium },
});
