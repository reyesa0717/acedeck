// Graded-price matrix: company tabs (PSA/BGS/CGC/...) and per-grade cells, using live API - well it's an attempt
// prices when available and PSA multiplier estimates otherwise.
import React from "react";
import { View, Text, ScrollView, TouchableOpacity } from "react-native";
import {
  PSA_DEFAULT_GRADES,
  PSA_MULTIPLIERS,
  COMPANY_ORDER,
  COMPANY_COLORS,
} from "../utils/pricing";

function buildGradeCells({ activeCo, byCompany }) {
  const apiList = byCompany[activeCo] || [];
  if (activeCo === "PSA") {
    const grades = new Set([
      ...PSA_DEFAULT_GRADES,
      ...apiList.map((g) => String(g.grade || "").trim()).filter(Boolean),
    ]);
    return [...grades]
      .sort((a, b) => (parseFloat(b) || 0) - (parseFloat(a) || 0))
      .map((grade) => ({
        company: activeCo,
        grade,
        api: apiList.find((g) => String(g.grade || "").trim() === grade) || null,
      }));
  }
  return apiList
    .slice()
    .sort((a, b) => (parseFloat(b.grade) || 0) - (parseFloat(a.grade) || 0))
    .map((api) => ({ company: activeCo, grade: String(api.grade || "").trim(), api }));
}

function formatGradePrice(market) {
  if (market == null) return "—";
  if (market >= 1000) return "$" + Math.round(market).toLocaleString();
  return "$" + Number(market).toFixed(2);
}

export default function GradePicker({
  width,
  gradedPrices,
  basePrice,
  gradeSel,
  gradeCompany,
  setGradeCompany,
  pickGradeCell,
  styles,
}) {
  const byCompany = {};
  for (const g of gradedPrices) {
    const co = String(g.company || "").toUpperCase();
    if (!co) continue;
    (byCompany[co] = byCompany[co] || []).push(g);
  }
  const companies = COMPANY_ORDER.filter(
    (co) => co === "PSA" || (byCompany[co] && byCompany[co].length)
  );
  if (!companies.length) return null;

  const activeCo = companies.includes(gradeCompany) ? gradeCompany : companies[0];
  const cells = buildGradeCells({ activeCo, byCompany });
  const hasAnyApi = cells.some((c) => !!c.api);
  const accent = COMPANY_COLORS[activeCo] || "#FACC15";

  return (
    <View style={[styles.gradeMatrix, { width }]}>
      <View style={styles.gradeTabRow}>
        {companies.map((co) => {
          const on = co === activeCo;
          const col = COMPANY_COLORS[co] || "#FACC15";
          return (
            <TouchableOpacity
              key={co}
              onPress={() => setGradeCompany(co)}
              style={[styles.gradeTab, on && { borderColor: col, backgroundColor: col + "22" }]}
              activeOpacity={0.8}
            >
              <Text style={[styles.gradeTabTxt, on && { color: col }]}>{co}</Text>
            </TouchableOpacity>
          );
        })}
        <View style={{ flex: 1 }} />
        <Text style={styles.gradeCoHint}>{hasAnyApi ? "Live" : "Estimate"}</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.gradeCellRow}
        style={{ flexGrow: 0 }}
      >
        {cells.map((cell) => {
          const on = gradeSel?.company === cell.company && gradeSel?.grade === cell.grade;
          const apiMarket = cell.api?.market;
          const estMarket =
            activeCo === "PSA" && basePrice != null
              ? basePrice * (PSA_MULTIPLIERS[cell.grade] || 0)
              : null;
          const market = apiMarket != null ? apiMarket : estMarket;
          const isEst = apiMarket == null;
          return (
            <TouchableOpacity
              key={cell.company + "-" + cell.grade}
              style={[
                styles.gradeCell,
                on && { borderColor: accent, backgroundColor: accent + "22" },
              ]}
              onPress={() => pickGradeCell(cell)}
              activeOpacity={0.85}
            >
              <Text style={[styles.gradeCellGrade, on && { color: accent }]} numberOfLines={1}>
                {cell.grade}
              </Text>
              <Text
                style={[styles.gradeCellPrice, on && { color: accent }, isEst && { opacity: 0.55 }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.65}
              >
                {formatGradePrice(market)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}
