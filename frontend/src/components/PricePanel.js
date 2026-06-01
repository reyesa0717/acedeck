// Right-hand price column: shows the active raw/graded market price, low, and trend chips.
import React from "react";
import { View, Text, ScrollView, TouchableOpacity } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors, gradients } from "../utils/theme";
import {
  VARIANT_LABELS_SHORT,
  formatUsdLabel,
  formatTrendDollar,
  formatTrendPercent,
  trendColor,
} from "../utils/pricing";

const TREND_ROWS = [
  { l: "7d", k: "days_7" },
  { l: "30d", k: "days_30" },
];

function TrendRows({ trends, styles }) {
  return TREND_ROWS.map((row) => {
    const d = formatTrendDollar(trends, row.k);
    const p = formatTrendPercent(trends, row.k);
    if (d == null && p == null) return null;
    const col = trendColor(trends, row.k, colors.textSub);
    return (
      <View key={row.l} style={styles.trendCompactRow}>
        <Text style={styles.trendCompactLbl}>{row.l}</Text>
        <Text
          style={[styles.trendCompactVal, { color: col }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
        >
          {d || "—"}
        </Text>
        <Text style={[styles.trendCompactPct, { color: col }]} numberOfLines={1}>
          {p || ""}
        </Text>
      </View>
    );
  });
}

function RawHero({ tcgPrices, tcgVariantIdx, activeVariant, onOpenVariantPicker, styles }) {
  const variants = tcgPrices.variants || [tcgPrices];
  const market = activeVariant?.market;
  const low = activeVariant?.low;
  const variantLabel =
    VARIANT_LABELS_SHORT[variants[tcgVariantIdx]?.variant] ||
    variants[tcgVariantIdx]?.variant ||
    "—";
  return (
    <>
      {variants.length > 1 && (
        <TouchableOpacity
          style={styles.variantDropdown}
          onPress={onOpenVariantPicker}
          activeOpacity={0.8}
        >
          <Text style={styles.variantDropdownLbl}>{"Variant"}</Text>
          <View style={styles.variantDropdownRow}>
            <Text style={styles.variantDropdownVal} numberOfLines={1}>
              {variantLabel}
            </Text>
            <Text style={styles.variantDropdownCaret}>{"▾"}</Text>
          </View>
        </TouchableOpacity>
      )}
      <Text style={styles.heroLbl}>{"Market"}</Text>
      <Text style={styles.heroVal} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>
        {market != null ? formatUsdLabel(market) : "—"}
      </Text>
      {low != null && (
        <Text style={styles.heroSub} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
          {"Low " + formatUsdLabel(low)}
        </Text>
      )}
      <View style={styles.heroDivider} />
      <TrendRows trends={activeVariant?.trends} styles={styles} />
    </>
  );
}

function GradedHero({ gradeSel, gradedPrices, styles }) {
  const apiG = gradeSel.apiIdx >= 0 ? gradedPrices[gradeSel.apiIdx] : null;
  const market = apiG?.market ?? gradeSel.market;
  const low = apiG?.low ?? null;
  const mid = apiG?.mid ?? null;
  const high = apiG?.high ?? null;
  const trends = apiG?.trends || null;
  return (
    <View>
      <Text style={[styles.heroLbl, { color: gradeSel.col }]}>{gradeSel.label}</Text>
      <Text
        style={[styles.heroVal, { color: gradeSel.col }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.5}
      >
        {market != null ? formatUsdLabel(market) : "—"}
      </Text>
      {gradeSel.isEstimate && (
        <Text style={styles.heroSub} numberOfLines={1}>
          {"Estimate"}
        </Text>
      )}
      {(low != null || mid != null || high != null) && (
        <View style={styles.heroMetaRow}>
          {low != null && (
            <View style={styles.heroMetaCell}>
              <Text style={styles.heroMetaLbl}>{"Low"}</Text>
              <Text
                style={styles.heroMetaVal}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
              >
                {formatUsdLabel(low)}
              </Text>
            </View>
          )}
          {mid != null && (
            <View style={styles.heroMetaCell}>
              <Text style={styles.heroMetaLbl}>{"Mid"}</Text>
              <Text
                style={styles.heroMetaVal}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
              >
                {formatUsdLabel(mid)}
              </Text>
            </View>
          )}
          {high != null && (
            <View style={styles.heroMetaCell}>
              <Text style={styles.heroMetaLbl}>{"High"}</Text>
              <Text
                style={styles.heroMetaVal}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
              >
                {formatUsdLabel(high)}
              </Text>
            </View>
          )}
        </View>
      )}
      {trends && (
        <>
          <View style={styles.heroDivider} />
          <TrendRows trends={trends} styles={styles} />
        </>
      )}
    </View>
  );
}

export default function PricePanel({
  width,
  card,
  csvSealedActive,
  offline,
  tcgDataSuspect,
  tcgPrices,
  tcgVariantIdx,
  activeVariant,
  gradeSel,
  gradedPrices,
  onOpenVariantPicker,
  styles,
}) {
  return (
    <ScrollView
      style={[styles.rightCol, { width }]}
      contentContainerStyle={[styles.colPad, { minHeight: 0 }]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.colTtl}>{"Prices"}</Text>
      {!card && <Text style={styles.colEmpty}>{"Search\na card"}</Text>}
      {!!card && (
        <View style={styles.priceSrc}>
          <LinearGradient
            colors={gradients.panelRed}
            style={styles.priceSrcGrad}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          />
          <View style={styles.priceSrcHdr}>
            <Text style={[styles.priceSrcName, { color: "#FF4081" }]} numberOfLines={1}>
              {csvSealedActive ? "Catalog" : "Scrydex"}
            </Text>
            <View style={[styles.dot, offline && { backgroundColor: colors.amber }]} />
          </View>
          {csvSealedActive && (
            <Text style={[styles.priceNA, { marginBottom: 6, opacity: 0.85 }]}>
              Imported row — not matched.
            </Text>
          )}
          {tcgDataSuspect && (
            <View style={styles.tcgWarnBanner}>
              <Text style={styles.tcgWarnTxt}>⚠️ May be wrong variant</Text>
            </View>
          )}
          {tcgPrices && !gradeSel && (
            <RawHero
              tcgPrices={tcgPrices}
              tcgVariantIdx={tcgVariantIdx}
              activeVariant={activeVariant}
              onOpenVariantPicker={onOpenVariantPicker}
              styles={styles}
            />
          )}
          {!csvSealedActive && gradeSel && (
            <GradedHero gradeSel={gradeSel} gradedPrices={gradedPrices} styles={styles} />
          )}
          {!tcgPrices && !gradeSel && <Text style={styles.priceNA}>{"No data"}</Text>}
        </View>
      )}
    </ScrollView>
  );
}
