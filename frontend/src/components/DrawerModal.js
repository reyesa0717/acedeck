// Bottom sheet for logging a single sale/acquisition: direction, price, payment, and notes.
import React from "react";
import {
  Modal,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  View,
  Text,
  ScrollView,
  TextInput,
  Switch,
  Alert,
} from "react-native";
import { colors } from "../utils/theme";

export default function DrawerModal({
  visible,
  onClose,
  onShow,
  canLogAcquisition,
  dir,
  setDir,
  cardInfo,
  price,
  setPrice,
  pay,
  setPay,
  basePrice,
  tcgPrices,
  tradeNote,
  setTradeNote,
  tradeAffectsInventory,
  setTradeAffectsInventory,
  desc,
  setDesc,
  logPriceValid,
  saving,
  handleRecord,
  payFull,
  payOrder,
  styles,
}) {
  const s = styles;
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onShow={onShow}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={s.drawerOverlay}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 80 : 0}
      >
        <TouchableOpacity style={s.drawerDismiss} onPress={onClose} activeOpacity={1} />
        <View style={s.drawer}>
          <View style={s.drawerHandle} />
          <View style={s.drawerHdr}>
            <Text style={s.drawerTtl} numberOfLines={1}>
              {cardInfo?.name || "Log sale or acquisition"}
            </Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={s.drawerClose}>Done</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={s.drawerBody} keyboardShouldPersistTaps="handled">
            <Text style={s.drawerSub}>
              {canLogAcquisition
                ? "Sold removes from stock · Acquired adds to catalog"
                : "Customer access: log sales only. Partner PIN can log acquisitions."}
            </Text>
            <View style={s.dirRow}>
              <TouchableOpacity
                style={[s.dirBtn, dir === "out" && s.dirBtnSold]}
                onPress={() => setDir("out")}
              >
                <Text style={s.dirArrow}>↓</Text>
                <Text style={[s.dirLbl, dir === "out" && { color: colors.red }]}>Sold</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  s.dirBtn,
                  dir === "in" && s.dirBtnAcq,
                  !canLogAcquisition && s.dirBtnDisabled,
                ]}
                onPress={() => {
                  if (!canLogAcquisition) {
                    Alert.alert(
                      "Acquisitions",
                      "Logging cards you bought requires a Partner PIN. Ask the store owner."
                    );
                    return;
                  }
                  setDir("in");
                }}
              >
                <Text style={s.dirArrow}>↑</Text>
                <Text style={[s.dirLbl, dir === "in" && { color: colors.green }]}>Acquired</Text>
              </TouchableOpacity>
            </View>
            <View style={s.priceField}>
              <Text style={s.priceDollar}>$</Text>
              <TextInput
                style={s.priceInp}
                value={price}
                onChangeText={setPrice}
                keyboardType="decimal-pad"
                placeholder={pay === "TR" ? "0 trade" : "0.00"}
                placeholderTextColor="#222"
              />
            </View>
            {pay === "TR" && (
              <Text style={s.tradeHint}>
                {"Leave $0 for a straight trade, or enter a reference value for your books."}
              </Text>
            )}
            {basePrice > 0 && (
              <Text style={s.mktRef}>
                {"Scrydex: $" + (tcgPrices?.market ? tcgPrices.market.toFixed(2) : "—")}
              </Text>
            )}
            <View style={s.payRow}>
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
                style={s.tradeNoteField}
                placeholder="Received in trade — e.g. Charizard ex 223/197 NM, 2× booster packs…"
                placeholderTextColor={colors.textMuted}
                value={tradeNote}
                onChangeText={setTradeNote}
                multiline
                textAlignVertical="top"
              />
            )}
            {pay === "TR" && (
              <View style={s.tradeInvRow}>
                <View style={{ flex: 1, paddingRight: 10 }}>
                  <Text style={s.tradeInvTitle}>{"Catalog / inventory"}</Text>
                  <Text style={s.tradeInvSub}>
                    {dir === "out"
                      ? "When on, this sale deducts 1 from this card’s quantity in your catalog. Turn off if this trade doesn’t come from your POS inventory (e.g. personal binder)."
                      : "When on, this acquisition adds 1 to catalog stock (or adds the line). Turn off to record the trade without changing quantities."}
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
              style={s.descField}
              placeholder="Description — condition, notes, deal details..."
              placeholderTextColor={colors.textMuted}
              value={desc}
              onChangeText={setDesc}
              multiline
              textAlignVertical="top"
            />
            <TouchableOpacity
              style={[
                s.recBtn,
                dir === "in" && s.recBtnAcq,
                (!logPriceValid || saving) && s.recBtnOff,
              ]}
              onPress={handleRecord}
              disabled={!logPriceValid || saving}
            >
              <Text style={[s.recBtnTxt, dir === "in" && { color: "#000" }]}>
                {saving ? "Recording..." : dir === "out" ? "Record Sale →" : "Record Acquisition →"}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
