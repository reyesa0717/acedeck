// Full card detail view: image, raw/graded prices, variant + grade pickers, price history, and sale logging.
import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  useWindowDimensions
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useRoute, useNavigation } from "@react-navigation/native";
import CatalogImage, { ensureResolvedCardId } from "../components/CatalogImage";
import {
  fetchPricesForCard,
  fetchPriceHistory,
  extractHistorySummary,
  getCard,
  extractTCGPrices,
  extractCMPrices,
  extractCardInfo,
} from "../../../backend/src/services/scrydex";
import { useAuth } from "../context/AuthContext";
import { colors, font, radius, spacing, gradients } from "../utils/theme";

// Standard card

const CARD_WH_RATIO = 63 / 88;
const TABS = ["Prices", "History"];

const COND_SPECS = [
  { short: "NM", mult: 1.0, name: "Near Mint" },
  { short: "LP", mult: 0.85, name: "Lightly Played" },
  { short: "MP", mult: 0.7, name: "Moderately Played" },
  { short: "HP", mult: 0.5, name: "Heavily Played" },
];
const CONDS = COND_SPECS.map((c) => c.short);

function conditionIdxFromCatalog(condStr) {
  if (!condStr || typeof condStr !== "string") return 0;
  const s = condStr.toLowerCase();
  if (/\b(psa|bgs|cgc|sgc)\b/.test(s)) return 0;
  if (/\bhp\b|heavily|poor|damaged/.test(s)) return 3;
  if (/\blp\b|lightly/.test(s)) return 1;
  if (/\bmp\b|moderately/.test(s)) return 2;
  if (/\bnm\b|near\s*mint|\bmint\b/.test(s)) return 0;
  return 0;
}

function fmtUsd(n) {
  if (n == null || !Number.isFinite(n)) return "—";
  return "$" + n.toFixed(2);
}

function Sparkline({ data, color = colors.red }) {
  if (!data?.length) return null;
  const max = Math.max(...data);
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 3, height: 44 }}>
      {data.map((v, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            borderRadius: 2,
            height: Math.max(4, (v / max) * 44),
            backgroundColor: color,
            opacity: 0.4 + (i / data.length) * 0.6,
          }}
        />
      ))}
    </View>
  );
}

export default function CardDetailScreen() {
  const { width: W } = useWindowDimensions();
  const imgMaxW = useMemo(() => Math.min(W - spacing.lg * 2, W * 0.72, 440), [W]);
  const route = useRoute();
  const navigation = useNavigation();
  const { isPro, limits } = useAuth();

  const item = route.params?.item || {};

  const [tab, setTab] = useState(0);
  const [cond, setCond] = useState(() => conditionIdxFromCatalog(item?.condition));
  const [prices, setPrices] = useState(null);
  const [history, setHistory] = useState(null);
  const [priceLoad, setPriceLoad] = useState(false);

  const historyData = [280, 295, 310, 305, 320, 335, 350, 380, 410, 430, 450, 465, 480, 499];

  useEffect(() => {
    if (!item?.name && !item?.cardId) return;
    let cancelled = false;
    setPriceLoad(true);

    (async () => {
      try {
        const id = item.cardId || (item.name ? await ensureResolvedCardId(item) : null);
        if (!cancelled && id) {
          const full = await getCard(id, { bypassCache: true });
          if (!cancelled && full) {
            let tcg = extractTCGPrices(full);
            let cm = extractCMPrices(full);
            if (!tcg && !cm && item.name) {
              const p = await fetchPricesForCard(item.name, item.number, item.set, item);
              if (!cancelled && p) {
                tcg = tcg || p.tcg;
                cm = cm || p.cm;
              }
            }
            const cid = full.id || id;
            setPrices({ tcg, cm, cardId: cid, info: extractCardInfo(full) });
            fetchPriceHistory(cid)
              .then((h) => {
                if (!cancelled) setHistory(extractHistorySummary(h));
              })
              .catch(() => {});
            return;
          }
        }
        if (!cancelled && item.name) {
          const p = await fetchPricesForCard(item.name, item.number, item.set, item);
          if (!cancelled) {
            setPrices(p);
            if (p?.cardId) {
              fetchPriceHistory(p.cardId)
                .then((h) => setHistory(extractHistorySummary(h)))
                .catch(() => {});
            }
          }
        }
      } catch {
        if (!cancelled) setPrices(null);
      } finally {
        if (!cancelled) setPriceLoad(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [item?.name, item?.number, item?.set, item?.cardId]);

  useEffect(() => {
    setCond(conditionIdxFromCatalog(item?.condition));
  }, [item?.condition]);

  const tcg = prices?.tcg;
  const cm = prices?.cm;
  const [tcgVariantIdx, setTcgVariantIdx] = useState(0);

  useEffect(() => {
    setTcgVariantIdx(0);
  }, [prices?.cardId]);
  const tcgVariants = tcg?.variants || (tcg ? [tcg] : []);
  const activeTCGVar = tcgVariants[tcgVariantIdx] ?? tcg;
  const cmVariants = cm?.variants || (cm ? [cm] : []);

  const condEst = useMemo(() => {
    const spec = COND_SPECS[cond] ?? COND_SPECS[0];
    const mult = spec.mult;
    const tcgM = activeTCGVar?.market;
    const cmT = cmVariants[0]?.trend;
    const cat = Number(item.marketPrice);
    const catOk = Number.isFinite(cat) && cat > 0;
    let base = null;
    let source = "";
    if (tcgM != null && Number.isFinite(tcgM) && tcgM > 0) {
      base = tcgM;
      source = "Scaled from TCGPlayer market (Near Mint reference).";
    } else if (cmT != null && Number.isFinite(cmT) && cmT > 0) {
      base = cmT;
      source = "Scaled from CardMarket trend (NM reference).";
    } else if (catOk) {
      base = cat;
      source = "Scaled from your catalog market price.";
    }
    const scaled = base != null ? base * mult : null;
    return { spec, mult, base, scaled, source };
  }, [cond, activeTCGVar, cmVariants, item.marketPrice]);

  const TCG_SHORT = {
    "1st Edition": "1st Ed",
    Shadowless: "Shadow",
    Unlimited: "Unltd",
    Holofoil: "Holo",
    "Reverse Holofoil": "Rev Holo",
    Normal: "Normal",
  };

  const sendToPOS = () => {
    navigation.navigate("POS", { catalogCard: { ...item, cardId: prices?.cardId } });
  };

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <LinearGradient
        colors={gradients.bg}
        style={StyleSheet.absoluteFillObject}
        start={gradients.bgStart}
        end={gradients.bgEnd}
      />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={s.backTxt}>← Back</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle} numberOfLines={1}>
          {item.name || "Card Detail"}
        </Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Card image */}
        <View style={s.imgWrap}>
          <CatalogImage
            item={{ ...item, cardId: prices?.cardId }}
            size="high"
            style={[s.cardImg, { width: imgMaxW }]}
            resizeMode="contain"
          />
        </View>

        {/* Name + set + rarity */}
        <View style={s.cardMeta}>
          <Text style={s.cardName}>{item.name}</Text>
          <Text style={s.cardSet}>
            {item.set ? item.set + (item.number ? " · #" + item.number : "") : ""}
          </Text>
          {!!item.rarity && (
            <View style={s.rarityPill}>
              <Text style={s.rarityTxt}>{item.rarity}</Text>
            </View>
          )}
        </View>

        <View style={s.body}>
          {/* Condition picker */}
          <View style={s.section}>
            <Text style={s.sectionLbl}>Condition</Text>
            <View style={s.condRow}>
              {CONDS.map((c, i) => (
                <TouchableOpacity
                  key={c}
                  style={[s.condBtn, cond === i && s.condBtnOn]}
                  onPress={() => setCond(i)}
                  activeOpacity={0.8}
                >
                  <Text style={[s.condTxt, cond === i && { color: colors.purple }]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {priceLoad ? (
              <ActivityIndicator color={colors.purple} style={{ marginTop: 14 }} />
            ) : (
              <View style={s.condEstCard}>
                <Text style={s.condEstTitle}>{"Price at " + condEst.spec.name}</Text>
                <Text style={s.condEstAmt}>{fmtUsd(condEst.scaled)}</Text>
                {condEst.scaled != null ? (
                  <Text style={s.condEstHint}>
                    {(condEst.mult >= 1 ? "×1.00" : "×" + String(condEst.mult)) +
                      " · " +
                      condEst.source}
                  </Text>
                ) : (
                  <Text style={s.condEstHint}>
                    {
                      "Choose a grade above. We’ll show a dollar amount when TCGPlayer, CardMarket, or your catalog has a base price."
                    }
                  </Text>
                )}
              </View>
            )}
          </View>

          {/* Price tabs */}
          <View style={s.section}>
            <View style={s.tabBar}>
              {TABS.map((t, i) => (
                <TouchableOpacity
                  key={t}
                  style={[s.tabBtn, tab === i && s.tabBtnOn]}
                  onPress={() => setTab(i)}
                  activeOpacity={0.8}
                >
                  <Text style={[s.tabTxt, tab === i && s.tabTxtOn]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* TAB 0: Prices */}
            {tab === 0 && (
              <View>
                {priceLoad && (
                  <ActivityIndicator color={colors.red} style={{ marginVertical: 16 }} />
                )}
                {!priceLoad && (
                  <>
                    <View style={[s.pricePanel, { borderLeftColor: colors.red }]}>
                      <View style={s.panelHdr}>
                        <Text style={[s.panelName, { color: colors.red }]}>TCGPLAYER</Text>
                        <View style={[s.dot, { backgroundColor: colors.green }]} />
                      </View>
                      {tcg ? (
                        <>
                          {tcgVariants.length > 1 && (
                            <View style={s.variantRow}>
                              {tcgVariants.map((v, i) => (
                                <TouchableOpacity
                                  key={v.variant}
                                  style={[s.variantPill, i === tcgVariantIdx && s.variantPillOn]}
                                  onPress={() => setTcgVariantIdx(i)}
                                  activeOpacity={0.8}
                                >
                                  <Text
                                    style={[s.variantTxt, i === tcgVariantIdx && s.variantTxtOn]}
                                  >
                                    {TCG_SHORT[v.variant] || v.variant}
                                  </Text>
                                </TouchableOpacity>
                              ))}
                            </View>
                          )}
                          <View style={[s.priceRow, { borderBottomColor: colors.bg3 }]}>
                            <Text style={s.priceLbl}>At {condEst.spec.short}</Text>
                            <Text style={[s.priceVal, { color: colors.red }]}>
                              {fmtUsd(
                                activeTCGVar?.market != null &&
                                  Number.isFinite(activeTCGVar.market) &&
                                  activeTCGVar.market > 0
                                  ? activeTCGVar.market * condEst.mult
                                  : null
                              )}
                            </Text>
                          </View>
                          {[
                            ["Market", activeTCGVar?.market, colors.red],
                            ["Low", activeTCGVar?.low, colors.green],
                            ["Mid", activeTCGVar?.mid, colors.text],
                            ["High", activeTCGVar?.high, colors.text],
                          ].map(([l, v, c]) => (
                            <View key={l} style={s.priceRow}>
                              <Text style={s.priceLbl}>{l}</Text>
                              <Text style={[s.priceVal, { color: c }]}>
                                {v != null && Number.isFinite(v) ? "$" + Number(v).toFixed(2) : "—"}
                              </Text>
                            </View>
                          ))}
                        </>
                      ) : (
                        <Text style={s.noData}>No TCGPlayer data</Text>
                      )}
                    </View>

                    <View style={[s.pricePanel, { borderLeftColor: colors.blue, marginTop: 8 }]}>
                      <View style={s.panelHdr}>
                        <Text style={[s.panelName, { color: colors.blue }]}>CARDMARKET</Text>
                        <View style={[s.dot, { backgroundColor: colors.green }]} />
                      </View>
                      {cm ? (
                        cmVariants.map((v, i) => (
                          <View key={v.variant + i}>
                            {cmVariants.length > 1 && (
                              <Text style={s.cmVariantLbl}>
                                {v.variant === "holo" ? "Holo" : "Normal"}
                              </Text>
                            )}
                            <View style={s.priceRow}>
                              <Text style={s.priceLbl}>At {condEst.spec.short}</Text>
                              <Text style={[s.priceVal, { color: colors.blue }]}>
                                {fmtUsd(
                                  v.trend != null && Number.isFinite(v.trend) && v.trend > 0
                                    ? v.trend * condEst.mult
                                    : null
                                )}
                              </Text>
                            </View>
                            {[
                              ["Trend", v.trend, colors.red],
                              ["1d avg", v.avg1, colors.text],
                              ["7d avg", v.avg7, colors.text],
                              ["Low", v.low, colors.green],
                            ].map(([l, val, c]) =>
                              val != null && Number.isFinite(val) ? (
                                <View key={l} style={s.priceRow}>
                                  <Text style={s.priceLbl}>{l}</Text>
                                  <Text style={[s.priceVal, { color: c }]}>
                                    {"$" + Number(val).toFixed(2)}
                                  </Text>
                                </View>
                              ) : null
                            )}
                          </View>
                        ))
                      ) : (
                        <Text style={s.noData}>No CardMarket data</Text>
                      )}
                    </View>

                  </>
                )}
              </View>
            )}

            {/* History  */}
            {tab === 1 && (
              <View>
                {!isPro && (
                  <View style={s.proGate}>
                    <Text style={s.proGateTxt}>
                      Upgrade to Pro for full 30/60/120-day price history
                    </Text>
                  </View>
                )}
                <View style={s.histHdr}>
                  <Text style={s.salesHdrTitle}>Price history</Text>
                  {history && (
                    <View
                      style={[
                        s.saleDot,
                        { backgroundColor: colors.green, width: 6, height: 6, borderRadius: 3 },
                      ]}
                    />
                  )}
                </View>

                {/* TCGPlayer history */}
                {history?.tcg ? (
                  <View style={[s.pricePanel, { borderLeftColor: colors.red, marginBottom: 8 }]}>
                    <Text style={[s.panelName, { color: colors.red, marginBottom: 6 }]}>
                      TCGPLAYER
                    </Text>
                    <View style={s.priceRow}>
                      <Text style={s.priceLbl}>Current market</Text>
                      <Text style={[s.priceVal, { color: colors.red }]}>
                        {history.tcg.current ? "$" + history.tcg.current.toFixed(2) : "—"}
                      </Text>
                    </View>
                    <View style={s.priceRow}>
                      <Text style={s.priceLbl}>7 days ago</Text>
                      <Text style={s.priceVal}>
                        {history.tcg.price7d ? "$" + history.tcg.price7d.toFixed(2) : "—"}
                      </Text>
                    </View>
                    <View style={s.priceRow}>
                      <Text style={s.priceLbl}>30 days ago</Text>
                      <Text style={s.priceVal}>
                        {history.tcg.price30d ? "$" + history.tcg.price30d.toFixed(2) : "—"}
                      </Text>
                    </View>
                    <View style={s.priceRow}>
                      <Text style={s.priceLbl}>7d change</Text>
                      <Text
                        style={[
                          s.priceVal,
                          {
                            color: history.tcg.change7d?.startsWith("+")
                              ? colors.green
                              : colors.red,
                          },
                        ]}
                      >
                        {history.tcg.change7d || "—"}
                      </Text>
                    </View>
                    <View style={s.priceRow}>
                      <Text style={s.priceLbl}>30d change</Text>
                      <Text
                        style={[
                          s.priceVal,
                          {
                            color: history.tcg.change30d?.startsWith("+")
                              ? colors.green
                              : colors.red,
                          },
                        ]}
                      >
                        {history.tcg.change30d || "—"}
                      </Text>
                    </View>
                  </View>
                ) : (
                  <View style={[s.pricePanel, { borderLeftColor: colors.red, marginBottom: 8 }]}>
                    <Text style={[s.panelName, { color: colors.red, marginBottom: 6 }]}>
                      TCGPLAYER
                    </Text>

                    <Sparkline data={historyData} color={colors.red} />
                    <View style={s.sparkLabels}>
                      <Text style={s.sparkLbl}>30d ago</Text>
                      <Text style={[s.sparkLbl, { color: colors.red }]}>
                        {tcg?.market ? "$" + tcg.market.toFixed(2) + " today" : "today"}
                      </Text>
                    </View>
                    <Text style={s.noData}>
                      {isPro ? "History loading..." : "Pro required for history"}
                    </Text>
                  </View>
                )}

                {/* CardMarket history */}
                {history?.cm && (
                  <View style={[s.pricePanel, { borderLeftColor: colors.blue }]}>
                    <Text style={[s.panelName, { color: colors.blue, marginBottom: 6 }]}>
                      CARDMARKET
                    </Text>
                    <View style={s.priceRow}>
                      <Text style={s.priceLbl}>Trend now</Text>
                      <Text style={[s.priceVal, { color: colors.blue }]}>
                        {history.cm.current ? "$" + history.cm.current.toFixed(2) : "—"}
                      </Text>
                    </View>
                    <View style={s.priceRow}>
                      <Text style={s.priceLbl}>7d avg</Text>
                      <Text style={s.priceVal}>
                        {history.cm.avg7d ? "$" + history.cm.avg7d.toFixed(2) : "—"}
                      </Text>
                    </View>
                    <View style={s.priceRow}>
                      <Text style={s.priceLbl}>30d avg</Text>
                      <Text style={s.priceVal}>
                        {history.cm.avg30d ? "$" + history.cm.avg30d.toFixed(2) : "—"}
                      </Text>
                    </View>
                    <View style={s.priceRow}>
                      <Text style={s.priceLbl}>7d change</Text>
                      <Text
                        style={[
                          s.priceVal,
                          {
                            color: history.cm.change7d?.startsWith("+") ? colors.green : colors.red,
                          },
                        ]}
                      >
                        {history.cm.change7d || "—"}
                      </Text>
                    </View>
                  </View>
                )}
              </View>
            )}
          </View>

          {/* Action buttons */}
          <TouchableOpacity style={s.posBtn} onPress={sendToPOS} activeOpacity={0.85}>
            <LinearGradient
              colors={gradients.primary}
              style={s.posBtnGrad}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Text style={s.posBtnTxt}>Use in POS →</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
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
  headerTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: font.bold,
    flex: 1,
    textAlign: "center",
  },

  imgWrap: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
    paddingTop: 4,
    overflow: "hidden",
  },
  cardImg: { aspectRatio: CARD_WH_RATIO },

  cardMeta: { alignItems: "center", marginBottom: 12, paddingHorizontal: spacing.xl },
  cardName: { fontSize: 22, fontWeight: font.heavy, color: colors.text },
  cardSet: { fontSize: 13, color: colors.textSub, marginTop: 3 },
  rarityPill: {
    backgroundColor: colors.yellowL,
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginTop: 8,
  },
  rarityTxt: { color: colors.yellow, fontSize: 12, fontWeight: font.bold },

  body: { paddingHorizontal: spacing.lg },
  section: { marginBottom: 14 },
  sectionLbl: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: font.bold,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 8,
  },

  toggleRow: {
    flexDirection: "row",
    backgroundColor: colors.bg2,
    borderRadius: radius.md,
    padding: 3,
    gap: 2,
  },
  toggleBtn: { flex: 1, paddingVertical: 6, borderRadius: radius.sm, alignItems: "center" },
  toggleBtnOn: { backgroundColor: colors.bg1, borderWidth: 0.5, borderColor: colors.border },
  toggleTxt: { fontSize: 11, color: colors.textSub },

  condRow: { flexDirection: "row", gap: 8 },
  condBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: radius.md,
    borderWidth: 0.5,
    borderColor: colors.border,
    alignItems: "center",
  },
  condBtnOn: { borderColor: colors.purple, backgroundColor: colors.purpleL },
  condTxt: { fontSize: 13, color: colors.textSub },

  condEstCard: {
    marginTop: 12,
    backgroundColor: colors.bg2,
    borderRadius: radius.md,
    padding: 14,
    borderWidth: 0.5,
    borderColor: "rgba(168,85,247,0.35)",
  },
  condEstTitle: {
    fontSize: 10,
    color: colors.textMuted,
    fontWeight: font.bold,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  condEstAmt: { fontSize: 28, fontWeight: font.heavy, color: colors.text, marginTop: 4 },
  condEstHint: { fontSize: 11, color: colors.textSub, marginTop: 8, lineHeight: 16 },

  tabBar: {
    flexDirection: "row",
    backgroundColor: colors.bg2,
    borderRadius: radius.md,
    padding: 3,
    marginBottom: 12,
  },
  tabBtn: { flex: 1, paddingVertical: 6, borderRadius: radius.sm, alignItems: "center" },
  tabBtnOn: { backgroundColor: colors.bg1, borderWidth: 0.5, borderColor: colors.border },
  tabTxt: { fontSize: 12, color: colors.textSub },
  tabTxtOn: { color: colors.text, fontWeight: font.bold },

  pricePanel: {
    backgroundColor: colors.bg1,
    borderRadius: radius.md,
    padding: 12,
    borderLeftWidth: 2,
  },
  panelHdr: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  panelName: { fontSize: 11, fontWeight: font.bold, letterSpacing: 0.5 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  priceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 5,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.bg3,
  },
  priceLbl: { fontSize: 13, color: colors.textSub },
  priceVal: { fontSize: 13, fontWeight: font.bold },
  noData: { color: colors.textMuted, fontSize: 12, marginVertical: 8 },

  // TCG variant pills
  variantRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 10 },
  variantPill: {
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: colors.bg2,
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  variantPillOn: { backgroundColor: "rgba(233,30,99,0.15)", borderColor: colors.red },
  variantTxt: { fontSize: 11, color: colors.textMuted },
  variantTxtOn: { color: colors.red, fontWeight: font.bold },

  // CM variant section label
  cmVariantLbl: {
    fontSize: 10,
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 8,
    marginBottom: 2,
  },

  proGate: {
    backgroundColor: colors.yellowL,
    borderRadius: radius.md,
    padding: 10,
    marginBottom: 12,
    borderWidth: 0.5,
    borderColor: colors.yellow,
  },
  proGateTxt: { color: colors.yellow, fontSize: 12 },

  salesHdr: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  salesHdrTitle: { color: colors.text, fontSize: 13, fontWeight: font.bold },
  salesHdrSub: { color: colors.textSub, fontSize: 11, marginTop: 2 },
  salesAvg: { color: colors.yellow, fontSize: 20, fontWeight: font.heavy },
  salesAvgLbl: { color: colors.textSub, fontSize: 10 },

  sparkLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
    marginTop: 3,
  },
  sparkLbl: { color: colors.textMuted, fontSize: 10 },

  statRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
  statBox: {
    flex: 1,
    backgroundColor: colors.bg1,
    borderRadius: radius.md,
    padding: 10,
    alignItems: "center",
  },
  statLbl: { color: colors.textSub, fontSize: 10, marginBottom: 3 },
  statVal: { fontSize: 15, fontWeight: font.bold },

  saleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 7,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.bg2,
  },
  saleDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  saleCond: { fontSize: 12, color: colors.text, fontWeight: font.medium },
  saleDate: { fontSize: 10, color: colors.textMuted, marginTop: 2 },
  salePrice: { fontSize: 13, fontWeight: font.bold, color: colors.text },

  legend: { flexDirection: "row", gap: 14, marginTop: 10 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendDot: { width: 7, height: 7, borderRadius: 4 },
  legendTxt: { color: colors.textSub, fontSize: 10 },

  histHdr: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  rangeRow: { flexDirection: "row", gap: 4 },
  rangeBtn: {
    backgroundColor: colors.bg1,
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  rangeTxt: { color: colors.textSub, fontSize: 11 },

  posBtn: { borderRadius: radius.lg, overflow: "hidden", marginBottom: 10, marginTop: 8 },
  posBtnGrad: { paddingVertical: 14, alignItems: "center" },
  posBtnTxt: { fontSize: 14, fontWeight: font.bold, color: "#fff" },

});
