// Landing screen for an active guest session: shows the role badge and routes to allowed tabs.
import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useAuth, GUEST_ROLES } from "../context/AuthContext";
import { colors, font, radius, gradients } from "../utils/theme";

export default function GuestScreen({ onEnter }) {
  const { vendorInfo, guestPerms, signOut } = useAuth();
  const role = guestPerms || GUEST_ROLES.customer;

  const perms = [
    { label: "Browse catalog & check live prices", ok: true },
    { label: "Log a sale at the table", ok: role.canSell },
    { label: "Log an acquisition", ok: role.canAcquire },
    { label: "View history & sales", ok: role.canHistory },
    { label: "See P&L reports", ok: role.canHistory },
    { label: "Edit inventory or import CSV", ok: false },
    { label: "Account & billing settings", ok: false },
  ].filter((p, i) => p.ok || i < 5);

  return (
    <LinearGradient
      colors={gradients.bg}
      style={s.fill}
      start={gradients.bgStart}
      end={gradients.bgEnd}
    >
      <SafeAreaView style={s.fill} edges={["top", "bottom"]}>
        <View style={s.wrap}>
          <Text style={s.wave}>👋</Text>
          <Text style={s.title}>Welcome!</Text>
          <Text style={s.sub}>Signed in as guest at</Text>
          <View style={s.storePill}>
            <Text style={s.storeNm}>🃏 {vendorInfo?.storeName || "Vendor Store"}</Text>
          </View>

          {/* Role badge */}
          <View
            style={[s.roleBadge, { backgroundColor: role.bgColor, borderColor: role.borderColor }]}
          >
            <View style={[s.roleDot, { backgroundColor: role.color }]} />
            <Text style={[s.roleLabel, { color: role.color }]}>{role.label} access</Text>
            <Text style={[s.roleSub, { color: role.color }]}> · {role.badge}</Text>
          </View>

          <View style={s.card}>
            <Text style={s.cardHdr}>What you can do</Text>
            {perms.map((p) => (
              <View key={p.label} style={s.permRow}>
                <Text style={[s.permIc, { color: p.ok ? colors.green : "#484F58" }]}>
                  {p.ok ? "✓" : "✕"}
                </Text>
                <Text style={[s.permTxt, { color: p.ok ? colors.text : colors.textMuted }]}>
                  {p.label}
                </Text>
              </View>
            ))}
          </View>

          <TouchableOpacity style={s.enterBtn} onPress={onEnter} activeOpacity={0.85}>
            <LinearGradient
              colors={gradients.primary}
              style={s.enterGrad}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Text style={s.enterTxt}>Enter store →</Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity style={s.switchBtn} onPress={signOut} activeOpacity={0.85}>
            <Text style={s.switchTxt}>Switch account</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1 },
  wrap: { flex: 1, justifyContent: "center", padding: 26 },
  wave: { fontSize: 42, textAlign: "center", marginBottom: 8 },
  title: { fontSize: 24, fontWeight: font.heavy, color: colors.text, textAlign: "center" },
  sub: { fontSize: 13, color: colors.textSub, textAlign: "center", marginTop: 4 },
  storePill: {
    alignSelf: "center",
    backgroundColor: colors.purpleL,
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginTop: 8,
    marginBottom: 14,
  },
  storeNm: { fontSize: 14, fontWeight: font.bold, color: colors.purple },
  roleBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    borderRadius: radius.full,
    borderWidth: 0.5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 16,
    gap: 6,
  },
  roleDot: { width: 7, height: 7, borderRadius: 4 },
  roleLabel: { fontSize: 13, fontWeight: font.bold },
  roleSub: { fontSize: 12, opacity: 0.75 },
  card: {
    backgroundColor: colors.bg1,
    borderRadius: radius.lg,
    borderWidth: 0.5,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 14,
  },
  cardHdr: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: font.bold,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 10,
  },
  permRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 },
  permIc: { fontSize: 14, width: 18, textAlign: "center" },
  permTxt: { fontSize: 13, flex: 1 },
  enterBtn: { borderRadius: radius.lg, overflow: "hidden", marginBottom: 10 },
  enterGrad: { paddingVertical: 14, alignItems: "center" },
  enterTxt: { fontSize: 15, fontWeight: font.bold, color: "#fff" },
  switchBtn: {
    backgroundColor: colors.bg1,
    borderRadius: radius.lg,
    borderWidth: 0.5,
    borderColor: colors.border,
    paddingVertical: 13,
    alignItems: "center",
  },
  switchTxt: { fontSize: 14, fontWeight: font.medium, color: colors.text },
});
