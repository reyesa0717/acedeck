// Full-screen price history view: trend summary, interactive sparkline, and recent sold listings.
import React from "react";
import {
  Modal,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
} from "react-native";
import InteractiveHistorySparkline from "./InteractiveHistorySparkline";

function formatSoldAt(ymdSlash) {
  if (!ymdSlash) return "";
  const iso = String(ymdSlash).replace(/\//g, "-");
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(ymdSlash);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function listingConditionLabel(l) {
  if (!l) return "—";
  if (l.company && l.grade) {
    const parts = [l.company + " " + l.grade];
    if (l.is_perfect) parts.push("Perfect");
    if (l.is_signed) parts.push("Signed");
    if (l.is_error) parts.push("Error");
    return parts.join(" · ");
  }
  if (l.variant) {
    const v = String(l.variant);
    if (/holo/i.test(v) && !/reverse/i.test(v)) return "Holofoil";
    if (/reverseholo/i.test(v)) return "Reverse Holo";
    if (/normal/i.test(v)) return "Normal";
    return v;
  }
  return "—";
}

export default function PriceHistoryModal({
  visible,
  onClose,
  cardInfo,
  priceHistory,
  priceHistorySeries,
  historyPeriodDays,
  setHistoryPeriodDays,
  phLoading,
  listings,
  listingsLoading,
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
      <View style={s.phRoot}>
        <View style={s.phHeader}>
          <View style={{ flex: 1 }}>
            <Text style={s.phTitle} numberOfLines={1}>
              {cardInfo?.name || "Price History"}
            </Text>
            <Text style={s.phSub} numberOfLines={1}>
              {[cardInfo?.setName, cardInfo?.number].filter(Boolean).join(" · ")}
            </Text>
          </View>
          <TouchableOpacity onPress={onClose} style={s.phCloseBtn}>
            <Text style={s.phCloseTxt}>{"✕"}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
          <View style={s.phHistSection}>
            <Text style={s.phSectionLbl}>PRICE HISTORY</Text>
            {phLoading ? (
              <ActivityIndicator color="#60A5FA" size="small" style={{ marginVertical: 18 }} />
            ) : !priceHistory ? (
              <View style={s.phHistUnavail}>
                <Text style={s.phHistUnavailIc}>📉</Text>
                <Text style={s.phHistUnavailTxt}>History unavailable</Text>
                <Text style={s.phHistUnavailHint}>Price history unavailable</Text>
              </View>
            ) : (
              (() => {
                const series = priceHistorySeries || [];
                const sliced = historyPeriodDays > 0 ? series.slice(-historyPeriodDays) : series;
                const pts = sliced.map((p) => ({ date: p.date, val: p.market }));
                const startVal = pts.length ? pts[0].val : null;
                const endVal = pts.length ? pts[pts.length - 1].val : null;
                const dollarChange =
                  startVal != null && endVal != null ? +(endVal - startVal).toFixed(2) : null;
                const pctChange =
                  startVal != null && endVal != null && startVal > 0
                    ? +(((endVal - startVal) / startVal) * 100).toFixed(2)
                    : null;
                const periods = [
                  { d: 7, l: "7D" },
                  { d: 15, l: "15D" },
                  { d: 30, l: "30D" },
                  { d: 60, l: "60D" },
                  { d: 120, l: "120D" },
                ];
                return (
                  <View style={[s.phHistCard, { borderColor: "rgba(255,64,129,0.25)" }]}>
                    <View style={s.phHistCardHdr}>
                      <Text style={[s.phHistCardSrc, { color: "#FF4081" }]}>Scrydex Market</Text>
                      <Text style={s.phHistCardCur}>
                        {endVal != null ? "$" + endVal.toFixed(2) : "—"}
                      </Text>
                    </View>

                    <View style={s.phPeriodRow}>
                      {periods.map((p) => (
                        <TouchableOpacity
                          key={p.l}
                          style={[s.phPeriodChip, historyPeriodDays === p.d && s.phPeriodChipOn]}
                          onPress={() => setHistoryPeriodDays(p.d)}
                          activeOpacity={0.8}
                        >
                          <Text
                            style={[s.phPeriodTxt, historyPeriodDays === p.d && s.phPeriodTxtOn]}
                          >
                            {p.l}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    {pts.length < 2 ? (
                      <View style={s.phHistUnavail}>
                        <Text style={s.phHistUnavailTxt}>Not enough data for this range</Text>
                        <Text style={s.phHistUnavailHint}>Try a longer period.</Text>
                      </View>
                    ) : (
                      <InteractiveHistorySparkline pts={pts} accent="#FF4081" />
                    )}

                    <View style={{ height: 12 }} />

                    <View style={s.phHistPeriods}>
                      <View style={s.phHistPeriod}>
                        <Text style={s.phHistPeriodLbl}>{"Start"}</Text>
                        <Text style={s.phHistPeriodPrice}>
                          {startVal != null ? "$" + startVal.toFixed(2) : "—"}
                        </Text>
                      </View>
                      <View style={s.phHistPeriod}>
                        <Text style={s.phHistPeriodLbl}>{"Latest"}</Text>
                        <Text style={s.phHistPeriodPrice}>
                          {endVal != null ? "$" + endVal.toFixed(2) : "—"}
                        </Text>
                      </View>
                      <View style={s.phHistPeriod}>
                        <Text style={s.phHistPeriodLbl}>{"Change"}</Text>
                        {dollarChange != null ? (
                          <>
                            <Text
                              style={[
                                s.phHistPeriodPrice,
                                { color: dollarChange >= 0 ? "#4ade80" : "#f87171" },
                              ]}
                            >
                              {(dollarChange >= 0 ? "+$" : "-$") +
                                Math.abs(dollarChange).toFixed(2)}
                            </Text>
                            {pctChange != null && (
                              <View
                                style={[
                                  s.phChangePill,
                                  { backgroundColor: pctChange >= 0 ? "#16a34a33" : "#dc262633" },
                                ]}
                              >
                                <Text
                                  style={[
                                    s.phChangeTxt,
                                    { color: pctChange >= 0 ? "#4ade80" : "#f87171" },
                                  ]}
                                >
                                  {(pctChange >= 0 ? "▲ " : "▼ ") +
                                    Math.abs(pctChange).toFixed(1) +
                                    "%"}
                                </Text>
                              </View>
                            )}
                          </>
                        ) : (
                          <Text style={s.phHistPeriodPrice}>{"—"}</Text>
                        )}
                      </View>
                    </View>
                  </View>
                );
              })()
            )}
          </View>

          <View style={s.phSectionDivider} />
          <View style={[s.phHistSection, { paddingTop: 14 }]}>
            <Text style={s.phSectionLbl}>Recent Sales</Text>
            {listingsLoading ? (
              <ActivityIndicator color="#FF4081" size="small" style={{ marginVertical: 14 }} />
            ) : listings.length === 0 ? (
              <View style={s.phHistUnavail}>
                <Text style={s.phHistUnavailTxt}>No recent sales</Text>
                <Text style={s.phHistUnavailHint}>Try again later</Text>
              </View>
            ) : (
              <View style={{ gap: 8 }}>
                <View style={s.listingHdr}>
                  <Text style={[s.listingHdrTxt, { flex: 2 }]}>SELLER · DATE</Text>
                  <Text style={[s.listingHdrTxt, { flex: 1.4 }]}>CONDITION</Text>
                  <Text style={[s.listingHdrTxt, { flex: 1, textAlign: "right" }]}>PRICE</Text>
                </View>
                {listings.slice(0, 25).map((l, i) => {
                  const itemPrice = Number(l.price ?? 0);
                  const source = l.source ? String(l.source) : "—";
                  const sourceLbl = source.toLowerCase() === "ebay" ? "eBay" : source;
                  const title = l.title || "";
                  const dateLbl = formatSoldAt(l.sold_at);
                  const cond = listingConditionLabel(l);
                  const canOpen = !!l.url;
                  const Row = canOpen ? TouchableOpacity : View;
                  return (
                    <Row
                      key={l.id || i}
                      style={[s.listingRow, i % 2 === 0 && s.listingRowAlt]}
                      activeOpacity={canOpen ? 0.7 : 1}
                      onPress={canOpen ? () => Linking.openURL(l.url).catch(() => {}) : undefined}
                    >
                      <View style={{ flex: 2 }}>
                        <Text style={s.listingSellerName} numberOfLines={1}>
                          {sourceLbl}
                        </Text>
                        {!!title && (
                          <Text style={s.listingTitleSub} numberOfLines={1}>
                            {title}
                          </Text>
                        )}
                        {!!dateLbl && <Text style={s.listingRating}>{dateLbl}</Text>}
                      </View>
                      <Text style={[s.listingCond, { flex: 1.4 }]} numberOfLines={1}>
                        {cond}
                      </Text>
                      <View style={{ flex: 1, alignItems: "flex-end" }}>
                        <Text style={s.listingPrice}>{"$" + itemPrice.toFixed(2)}</Text>
                        {canOpen && <Text style={s.listingShipping}>{"View ›"}</Text>}
                      </View>
                    </Row>
                  );
                })}
              </View>
            )}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}
