// Lets the user override which TCG print variant (Holo, Reverse, 1st Edition) prices use.
import React from "react";
import { Modal, TouchableOpacity, View, Text } from "react-native";
import { VARIANT_LABELS_FULL } from "../utils/pricing";

export default function VariantPickerModal({
  visible,
  onClose,
  tcgPrices,
  tcgVariantIdx,
  gradeSel,
  setGradedIdx,
  setGradeSel,
  pickTCGVariant,
  styles,
}) {
  const s = styles;
  const variants = tcgPrices?.variants || (tcgPrices ? [tcgPrices] : []);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={s.variantSheetOverlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={s.variantSheet} onPress={() => {}}>
          <Text style={s.variantSheetTitle}>{"Select variant"}</Text>
          <Text style={s.variantSheetSub}>
            {"Pick the printing — sets the market price below."}
          </Text>
          <View style={{ height: 8 }} />
          {variants.map((v, i) => {
            const on = i === tcgVariantIdx && !gradeSel;
            const full = VARIANT_LABELS_FULL[v.variant] || v.variant;
            const mkt = v?.market != null ? "$" + Number(v.market).toFixed(2) : "—";
            return (
              <TouchableOpacity
                key={v.variant || i}
                style={[s.variantSheetRow, on && s.variantSheetRowOn]}
                onPress={() => {
                  setGradedIdx(-1);
                  setGradeSel(null);
                  pickTCGVariant(i);
                  onClose();
                }}
                activeOpacity={0.85}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[s.variantSheetName, on && s.variantSheetNameOn]} numberOfLines={1}>
                    {full}
                  </Text>
                  <Text style={s.variantSheetMkt}>{"Market " + mkt}</Text>
                </View>
                {on && <Text style={s.variantSheetCheck}>{"✓"}</Text>}
              </TouchableOpacity>
            );
          })}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}
