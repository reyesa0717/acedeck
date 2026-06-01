// Lets the owner create/revoke guest PINs (customer/partner) within their plan's PIN limit.
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation } from "@react-navigation/native";
import { useAuth, GUEST_ROLES } from "../context/AuthContext";
import { colors, font, radius, spacing, gradients } from "../utils/theme";

const TIERS = [
  {
    role: "customer",
    label: "Customer PIN",
    icon: "👤",
    description:
      "Share with customers at your table. They can browse your catalog, check live prices, and log a sale.",
    perms: [
      { label: "Browse catalog & prices", ok: true },
      { label: "Log a sale at the table", ok: true },
      { label: "View history & sales", ok: false },
      { label: "See today's P&L stats", ok: false },
      { label: "Edit inventory or import CSV", ok: false },
    ],
    accentColor: "#22C55E",
    bgColor: "rgba(34,197,94,0.08)",
    borderColor: "rgba(34,197,94,0.25)",
  },
  {
    role: "partner",
    label: "Partner PIN",
    icon: "🤝",
    description:
      "Share with a trusted friend or co-vendor behind the table. Gets full POS access plus the History tab and P&L reports. Cannot edit inventory.",
    perms: [
      { label: "Browse catalog & prices", ok: true },
      { label: "Log sales & acquisitions", ok: true },
      { label: "View history & sales", ok: true },
      { label: "See today's P&L stats", ok: true },
      { label: "Edit inventory or import CSV", ok: false },
    ],
    accentColor: "#1976D2",
    bgColor: "rgba(25,118,210,0.08)",
    borderColor: "rgba(25,118,210,0.25)",
  },
];

function PinTierCard({ tier, currentPin, onRegenerate, onUpdate }) {
  const [revealed, setRevealed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const displayPin = revealed ? currentPin || "Not set" : currentPin ? "••••••" : "Not set";

  const handleRegen = async () => {
    Alert.alert(
      "Regenerate " + tier.label + "?",
      "The current PIN will stop working immediately. Anyone using it will need the new PIN.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Regenerate",
          style: "destructive",
          onPress: async () => {
            setLoading(true);
            await onRegenerate(tier.role);
            setRevealed(true);
            setLoading(false);
          },
        },
      ]
    );
  };

  const handleSave = async () => {
    if (draft.length < 4) {
      Alert.alert("Too short", "PIN must be at least 4 digits.");
      return;
    }
    if (draft.length > 8) {
      Alert.alert("Too long", "PIN must be 8 digits or fewer.");
      return;
    }
    setLoading(true);
    const { error } = await onUpdate(tier.role, draft);
    if (error) {
      Alert.alert("Error", error.message);
    } else {
      setEditing(false);
      setDraft("");
      setRevealed(true);
    }
    setLoading(false);
  };

  return (
    <View style={[s.tierCard, { backgroundColor: tier.bgColor, borderColor: tier.borderColor }]}>
      {/* Header */}
      <TouchableOpacity
        style={s.tierHeader}
        onPress={() => setExpanded((e) => !e)}
        activeOpacity={0.8}
      >
        <View style={s.row}>
          <Text style={s.tierIcon}>{tier.icon}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[s.tierLabel, { color: tier.accentColor }]}>{tier.label}</Text>
            <Text style={s.tierDesc} numberOfLines={expanded ? undefined : 2}>
              {tier.description}
            </Text>
          </View>
          <Text style={[s.chevron, { color: tier.accentColor }]}>{expanded ? "▲" : "▼"}</Text>
        </View>
      </TouchableOpacity>

      {/* PIN row */}
      <View style={s.pinSection}>
        {editing ? (
          <View style={s.editRow}>
            <TextInput
              style={[s.pinInput, { borderColor: tier.accentColor }]}
              value={draft}
              onChangeText={(t) => setDraft(t.replace(/\D/g, "").slice(0, 8))}
              placeholder="New PIN"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              maxLength={8}
              autoFocus
            />
            <TouchableOpacity
              style={[s.saveBtn, { backgroundColor: tier.accentColor }]}
              onPress={handleSave}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={s.saveBtnTxt}>Save</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={s.cancelBtn}
              onPress={() => {
                setEditing(false);
                setDraft("");
              }}
            >
              <Text style={s.cancelBtnTxt}>✕</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={s.row2}>
            <TouchableOpacity
              style={[s.pinDisplay, { borderColor: tier.borderColor }]}
              onPress={() => setRevealed((r) => !r)}
              activeOpacity={0.7}
            >
              <Text style={[s.pinTxt, { color: tier.accentColor, opacity: revealed ? 1 : 0.7 }]}>
                {displayPin}
              </Text>
              <Text style={[s.pinHint, { color: tier.accentColor }]}>
                {revealed ? "tap to hide" : "tap to reveal"}
              </Text>
            </TouchableOpacity>
            <View style={s.pinActions}>
              <TouchableOpacity
                style={[s.actionBtn, { borderColor: tier.borderColor }]}
                onPress={() => {
                  setEditing(true);
                  setDraft("");
                }}
                activeOpacity={0.8}
              >
                <Text style={[s.actionBtnTxt, { color: tier.accentColor }]}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.actionBtn, { borderColor: tier.borderColor }]}
                onPress={handleRegen}
                disabled={loading}
                activeOpacity={0.8}
              >
                {loading ? (
                  <ActivityIndicator color={tier.accentColor} size="small" />
                ) : (
                  <Text style={[s.actionBtnTxt, { color: tier.accentColor }]}>↺ New</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>

      {/* Expanded permissions */}
      {expanded && (
        <View style={s.permsWrap}>
          <View style={s.permsDivider} />
          {tier.perms.map((p) => (
            <View key={p.label} style={s.permRow}>
              <Text style={[s.permIc, { color: p.ok ? "#22C55E" : "#484F58" }]}>
                {p.ok ? "✓" : "✕"}
              </Text>
              <Text style={[s.permTxt, { color: p.ok ? colors.text : colors.textMuted }]}>
                {p.label}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

export default function PinManagerScreen() {
  const navigation = useNavigation();
  const { getPins, regeneratePin, updatePin, isPro } = useAuth();
  const [pins, setPins] = useState({ customer: null, partner: null });

  useEffect(() => {
    getPins().then(setPins);
  }, []);

  const handleRegenerate = async (role) => {
    const newPin = await regeneratePin(role);
    setPins((p) => ({ ...p, [role]: newPin }));
  };

  const handleUpdate = async (role, newPin) => {
    const result = await updatePin(role, newPin);
    if (!result.error) setPins((p) => ({ ...p, [role]: newPin }));
    return result;
  };

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <LinearGradient
        colors={gradients.bg}
        style={StyleSheet.absoluteFillObject}
        start={gradients.bgStart}
        end={gradients.bgEnd}
      />

      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={s.backTxt}>← Back</Text>
        </TouchableOpacity>
        <Text style={s.title}>Guest PINs</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
      >
        <Text style={s.intro}>
          Create different PINs for different trust levels. Share the right PIN with the right
          person — each one unlocks only what they need.
        </Text>

        {TIERS.map((tier) => (
          <PinTierCard
            key={tier.role}
            tier={tier}
            currentPin={pins[tier.role]}
            onRegenerate={handleRegenerate}
            onUpdate={handleUpdate}
          />
        ))}

        {/* How sharing works */}
        <View style={s.infoCard}>
          <Text style={s.infoTitle}>How it works</Text>
          <View style={s.infoRow}>
            <Text style={s.infoNum}>1</Text>
            <Text style={s.infoTxt}>
              Tap "Edit" to set a PIN for each tier, or tap "↺ New" to generate a random one.
            </Text>
          </View>
          <View style={s.infoRow}>
            <Text style={s.infoNum}>2</Text>
            <Text style={s.infoTxt}>
              Share the Customer PIN with buyers at your table. Share the Partner PIN with your
              helper or co-vendor.
            </Text>
          </View>
          <View style={s.infoRow}>
            <Text style={s.infoNum}>3</Text>
            <Text style={s.infoTxt}>
              Guests enter the PIN on the TCG Collector POS landing screen — no account needed.
            </Text>
          </View>
          <View style={s.infoRow}>
            <Text style={s.infoNum}>4</Text>
            <Text style={s.infoTxt}>
              Tap "↺ New" at any time to cycle the PIN. The old one stops working immediately.
            </Text>
          </View>
        </View>

        {!isPro && (
          <View style={s.upsellCard}>
            <Text style={s.upsellTitle}>Pro — unlock Partner PIN</Text>
            <Text style={s.upsellBody}>
              Free plan includes a Customer PIN. Upgrade to Pro to add a Partner PIN for trusted
              co-vendors.
            </Text>
            <TouchableOpacity style={s.upsellBtn} activeOpacity={0.85}>
              <LinearGradient
                colors={gradients.primary}
                style={s.upsellBtnGrad}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Text style={s.upsellBtnTxt}>Upgrade to Pro</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
  },
  backBtn: {},
  backTxt: { color: colors.red, fontSize: 14, fontWeight: font.medium },
  title: { color: colors.text, fontSize: 17, fontWeight: font.bold },
  scroll: { padding: spacing.lg, paddingBottom: 40 },

  intro: { color: colors.textSub, fontSize: 13, lineHeight: 20, marginBottom: 16 },

  tierCard: { borderRadius: radius.lg, borderWidth: 0.5, padding: 14, marginBottom: 12 },
  tierHeader: { marginBottom: 12 },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  row2: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  tierIcon: { fontSize: 22, marginTop: 1 },
  tierLabel: { fontSize: 14, fontWeight: font.bold, marginBottom: 3 },
  tierDesc: { fontSize: 12, color: colors.textSub, lineHeight: 17 },
  chevron: { fontSize: 12, marginTop: 4 },

  pinSection: {},
  pinDisplay: {
    flex: 1,
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    borderWidth: 0.5,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  pinTxt: { fontSize: 20, fontWeight: font.heavy, letterSpacing: 5 },
  pinHint: { fontSize: 10, opacity: 0.6, marginTop: 2 },
  pinActions: { flexDirection: "row", gap: 7 },
  actionBtn: {
    borderRadius: radius.md,
    borderWidth: 0.5,
    paddingVertical: 9,
    paddingHorizontal: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  actionBtnTxt: { fontSize: 12, fontWeight: font.bold },

  editRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  pinInput: {
    flex: 1,
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    borderWidth: 1.5,
    paddingVertical: 10,
    paddingHorizontal: 14,
    color: colors.text,
    fontSize: 18,
    fontWeight: font.bold,
    letterSpacing: 4,
  },
  saveBtn: {
    borderRadius: radius.md,
    paddingVertical: 10,
    paddingHorizontal: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  saveBtnTxt: { color: "#fff", fontSize: 13, fontWeight: font.bold },
  cancelBtn: { padding: 8 },
  cancelBtnTxt: { color: colors.textSub, fontSize: 16 },

  permsDivider: { height: 0.5, backgroundColor: colors.bg2, marginBottom: 10, marginTop: 4 },
  permsWrap: { marginTop: 4 },
  permRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 },
  permIc: { fontSize: 13, width: 16, textAlign: "center" },
  permTxt: { fontSize: 12 },

  infoCard: {
    backgroundColor: colors.bg1,
    borderRadius: radius.lg,
    borderWidth: 0.5,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 12,
  },
  infoTitle: { color: colors.text, fontSize: 13, fontWeight: font.bold, marginBottom: 10 },
  infoRow: { flexDirection: "row", gap: 10, marginBottom: 8 },
  infoNum: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.red,
    color: "#fff",
    fontSize: 11,
    fontWeight: font.bold,
    textAlign: "center",
    lineHeight: 20,
    flexShrink: 0,
  },
  infoTxt: { flex: 1, color: colors.textSub, fontSize: 12, lineHeight: 18 },

  upsellCard: {
    backgroundColor: colors.redL,
    borderRadius: radius.lg,
    borderWidth: 0.5,
    borderColor: "rgba(233,30,99,0.3)",
    padding: 14,
    marginBottom: 12,
  },
  upsellTitle: { color: colors.red, fontSize: 13, fontWeight: font.bold, marginBottom: 4 },
  upsellBody: { color: colors.textSub, fontSize: 12, lineHeight: 17, marginBottom: 12 },
  upsellBtn: { borderRadius: radius.md, overflow: "hidden" },
  upsellBtnGrad: { paddingVertical: 11, alignItems: "center" },
  upsellBtnTxt: { color: "#fff", fontSize: 13, fontWeight: font.bold },
});
