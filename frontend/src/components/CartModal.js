// Multi-card checkout sheet: lists cart lines, total, payment, and records the whole sale at once.
import React from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Image,
  Switch,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import PokeImage from "./PokeImage";
import { isSealedCatalogRow } from "../utils/sealedInventory";
import { colors, font } from "../utils/theme";

export default function CartModal({
  visible,
  onClose,
  cart,
  cartTotal,
  pay,
  setPay,
  tradeNote,
  setTradeNote,
  tradeAffectsInventory,
  setTradeAffectsInventory,
  desc,
  setDesc,
  saving,
  checkoutCart,
  removeFromCart,
  conditions,
  payFull,
  payOrder,
  styles,
}) {
  const s = styles;
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={s.modalSafe}>
        <View style={s.modalHdr}>
          <TouchableOpacity onPress={onClose}>
            <Text style={s.modalClose}>Close</Text>
          </TouchableOpacity>
          <Text style={s.modalTtl}>
            {"Cart  ·  " + cart.length + " card" + (cart.length !== 1 ? "s" : "")}
          </Text>
          <Text style={[s.modalSub2, { color: colors.green, fontWeight: font.heavy }]}>
            {"$" + cartTotal.toFixed(2)}
          </Text>
        </View>

        {cart.length === 0 ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: 40, opacity: 0.2, marginBottom: 12 }}>🛒</Text>
            <Text style={{ color: colors.textSub, fontSize: 14 }}>Cart is empty</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ paddingBottom: 220 }}>
            {cart.map((item, idx) => (
              <View key={item._key} style={s.cartRow}>
                <View style={s.cartThumb}>
                  {item.importImage ? (
                    <Image
                      source={{ uri: item.importImage }}
                      style={{ width: "100%", height: "100%" }}
                      resizeMode="cover"
                    />
                  ) : item.cardId ? (
                    <PokeImage
                      cardId={item.cardId}
                      size="low"
                      style={{ width: "100%", height: "100%" }}
                      resizeMode="cover"
                    />
                  ) : (
                    <Text style={{ fontSize: 18, opacity: 0.3 }}>
                      {isSealedCatalogRow(item.cardInfo) ? "📦" : "🃏"}
                    </Text>
                  )}
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.cartCardName} numberOfLines={1}>
                    {item.cardInfo.name}
                  </Text>
                  <Text style={s.cartCardSub} numberOfLines={1}>
                    {item.cardInfo.setName
                      ? item.cardInfo.setName +
                        (item.cardInfo.number ? " · #" + item.cardInfo.number : "")
                      : ""}
                  </Text>
                  <View
                    style={[
                      s.cartCondBadge,
                      { backgroundColor: (item.condCol || conditions[item.condIdx].col) + "22" },
                    ]}
                  >
                    <Text
                      style={[
                        s.cartCondTxt,
                        { color: item.condCol || conditions[item.condIdx].col },
                      ]}
                    >
                      {item.condLabel || conditions[item.condIdx].label}
                    </Text>
                  </View>
                </View>
                <View style={{ alignItems: "flex-end", gap: 6 }}>
                  <Text style={s.cartPrice}>{"$" + item.price.toFixed(2)}</Text>
                  <TouchableOpacity
                    onPress={() => removeFromCart(item._key)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={s.cartRemove}>✕</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}

            <View style={s.cartTotalRow}>
              <Text style={s.cartTotalLbl}>
                {"Total  ·  " + cart.length + " card" + (cart.length !== 1 ? "s" : "")}
              </Text>
              <Text style={s.cartTotalVal}>{"$" + cartTotal.toFixed(2)}</Text>
            </View>

            <View style={[s.payRow, { margin: 16 }]}>
              {payOrder.map((p) => (
                <TouchableOpacity
                  key={p}
                  style={[s.payPill, pay === p && s.payPillOn]}
                  onPress={() => setPay(p)}
                >
                  <Text style={[s.payPillTxt, pay === p && { color: colors.pink }]}>
                    {payFull[p]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {pay === "TR" && (
              <TextInput
                style={[s.tradeNoteField, { marginHorizontal: 16, marginTop: 0 }]}
                placeholder="What you got back (whole cart) — cards, sealed product…"
                placeholderTextColor={colors.textMuted}
                value={tradeNote}
                onChangeText={setTradeNote}
                multiline
                textAlignVertical="top"
              />
            )}
            {pay === "TR" && (
              <View style={[s.tradeInvRow, { marginHorizontal: 16, marginTop: 10 }]}>
                <View style={{ flex: 1, paddingRight: 10 }}>
                  <Text style={s.tradeInvTitle}>{"Catalog / inventory"}</Text>
                  <Text style={s.tradeInvSub}>
                    {
                      "When on, each cart line deducts 1 from that card’s catalog quantity. Turn off if these cards aren’t from your POS inventory."
                    }
                  </Text>
                </View>
                <Switch
                  value={tradeAffectsInventory}
                  onValueChange={setTradeAffectsInventory}
                  trackColor={{ false: colors.bg3, true: "rgba(168,85,247,0.5)" }}
                  thumbColor={tradeAffectsInventory ? "#C4B5FD" : colors.textMuted}
                />
              </View>
            )}

            <TextInput
              style={[s.descField, { margin: 16, marginTop: pay === "TR" ? 8 : 0 }]}
              placeholder="Notes (optional)..."
              placeholderTextColor={colors.textMuted}
              value={desc}
              onChangeText={setDesc}
              multiline
              textAlignVertical="top"
            />
          </ScrollView>
        )}

        {cart.length > 0 && (
          <View style={s.cartCheckoutWrap}>
            <TouchableOpacity
              style={[s.cartCheckoutBtn, saving && { opacity: 0.5 }]}
              onPress={checkoutCart}
              disabled={saving}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={["#16a34a", "#15803d"]}
                style={s.cartCheckoutGrad}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Text style={s.cartCheckoutTxt}>
                  {saving
                    ? "Recording…"
                    : pay === "TR"
                      ? "✓  Log trade" + (cartTotal > 0 ? "  ·  ref $" + cartTotal.toFixed(2) : "")
                      : "✓  Checkout  ·  $" + cartTotal.toFixed(2)}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}
