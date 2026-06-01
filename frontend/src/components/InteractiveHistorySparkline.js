// Touch-draggable price sparkline drawn with plain Views (no chart lib); shows a date/price tooltip.
import React, { useState, useMemo, useRef } from "react";
import { View, Text, StyleSheet, useWindowDimensions, PanResponder } from "react-native";
import { colors } from "../utils/theme";

export const PH_SPARK_XL_H = 18;

export function formatHistoryDateLabel(ymd) {
  if (!ymd) return "—";
  const d = new Date(ymd);
  if (isNaN(d.getTime())) return String(ymd);
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatHistoryDateShort(ymd) {
  if (!ymd) return "—";
  const d = new Date(ymd);
  if (isNaN(d.getTime())) return String(ymd);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function historyBucketToDateHint(label) {
  if (label === "Now") {
    const d = new Date();
    return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  }
  const days = { "7D": 7, "14D": 14, "30D": 30, "60D": 60, "120D": 120 };
  const n = days[label];
  if (n == null) return label;
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function InteractiveHistorySparkline({ pts, accent }) {
  const [activeIdx, setActiveIdx] = useState(null);
  const { width: winW } = useWindowDimensions();
  const cW = Math.min(winW - 40, 520);
  const cH = 140;
  const padV = 10;
  const padH = 8;
  const plotW = Math.max(1, cW - 2 * padH);
  const plotH = cH - padV * 2 - PH_SPARK_XL_H;
  const ptHasDates = (pts || []).some((p) => !!p?.date);

  const geom = useMemo(() => {
    if (pts.length < 2) return null;
    const vals = pts.map((p) => p.val);
    const minV = Math.min(...vals);
    const maxV = Math.max(...vals);
    const range = maxV - minV || 1;
    const n = pts.length - 1;
    const mapped = pts.map((p, i) => ({
      x: padH + (n ? (i / n) * plotW : plotW / 2),
      y: padV + plotH - ((p.val - minV) / range) * plotH,
      label: p.label,
      date: p.date || null,
      val: p.val,
    }));
    const trending = mapped[mapped.length - 1].val >= mapped[0].val;
    const lineColor = trending ? "#4ade80" : "#f87171";
    const segs = mapped.slice(0, -1).map((p1, i) => {
      const p2 = mapped[i + 1];
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      const ang = Math.atan2(dy, dx) * (180 / Math.PI);
      return { cx: (p1.x + p2.x) / 2, cy: (p1.y + p2.y) / 2, len, ang };
    });
    return { mapped, lineColor, minV, maxV, segs, trending };
  }, [pts, plotW, plotH, padH]);

  const mappedRef = useRef([]);
  mappedRef.current = geom?.mapped ?? [];

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => {
          const lx = e.nativeEvent.locationX;
          const m = mappedRef.current;
          if (!m.length) return;
          let best = 0,
            bd = Infinity;
          m.forEach((p, i) => {
            const d = Math.abs(p.x - lx);
            if (d < bd) {
              bd = d;
              best = i;
            }
          });
          setActiveIdx(best);
        },
        onPanResponderMove: (e) => {
          const lx = e.nativeEvent.locationX;
          const m = mappedRef.current;
          if (!m.length) return;
          let best = 0,
            bd = Infinity;
          m.forEach((p, i) => {
            const d = Math.abs(p.x - lx);
            if (d < bd) {
              bd = d;
              best = i;
            }
          });
          setActiveIdx(best);
        },
        onPanResponderRelease: () => setActiveIdx(null),
        onPanResponderTerminate: () => setActiveIdx(null),
      }),
    []
  );

  if (!geom) return null;
  const { mapped, lineColor, minV, maxV, segs, trending } = geom;
  const ap = activeIdx != null ? mapped[activeIdx] : null;
  const tooltipW = 128;
  const tipLeft = ap ? Math.max(4, Math.min(cW - tooltipW - 4, ap.x - tooltipW / 2)) : 0;

  return (
    <View style={{ width: cW, height: cH, position: "relative", marginBottom: 6 }}>
      <View {...panResponder.panHandlers} style={{ width: cW, height: cH, position: "relative" }}>
        {[0.25, 0.5, 0.75].map((t) => (
          <View
            key={t}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: padV + plotH * (1 - t),
              height: StyleSheet.hairlineWidth,
              backgroundColor: "rgba(255,255,255,0.06)",
            }}
          />
        ))}
        {segs.map((seg, i) => (
          <View
            key={i}
            style={{
              position: "absolute",
              left: seg.cx - seg.len / 2,
              top: seg.cy - 1.5,
              width: seg.len,
              height: 3,
              borderRadius: 2,
              backgroundColor: lineColor,
              transform: [{ rotate: `${seg.ang}deg` }],
            }}
          />
        ))}
        <View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: PH_SPARK_XL_H,
            height: cH * 0.22,
            backgroundColor: lineColor,
            opacity: 0.06,
            borderRadius: 4,
          }}
        />
        {mapped.length <= 12 &&
          mapped.map((p, i) => (
            <View
              key={i}
              style={{
                position: "absolute",
                left: p.x - 4,
                top: p.y - 4,
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: i === mapped.length - 1 ? accent : lineColor,
                borderWidth: 1.5,
                borderColor: colors.bg1,
                opacity: activeIdx != null && activeIdx !== i ? 0.45 : 1,
              }}
            />
          ))}
        {mapped.length > 12 && (
          <View
            style={{
              position: "absolute",
              left: mapped[mapped.length - 1].x - 5,
              top: mapped[mapped.length - 1].y - 5,
              width: 10,
              height: 10,
              borderRadius: 5,
              backgroundColor: accent,
              borderWidth: 1.5,
              borderColor: colors.bg1,
            }}
          />
        )}
        {activeIdx != null && mapped.length > 12 && (
          <View
            style={{
              position: "absolute",
              left: mapped[activeIdx].x - 4,
              top: mapped[activeIdx].y - 4,
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: accent,
              borderWidth: 1.5,
              borderColor: colors.bg1,
            }}
          />
        )}
        {ap != null && (
          <>
            <View
              style={{
                position: "absolute",
                left: ap.x - 0.5,
                top: padV,
                width: 1,
                height: plotH,
                backgroundColor: accent,
                opacity: 0.9,
              }}
            />
            <View
              style={{
                position: "absolute",
                left: tipLeft,
                top: 0,
                paddingHorizontal: 10,
                paddingVertical: 7,
                borderRadius: 10,
                backgroundColor: "rgba(12,14,28,0.94)",
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: "rgba(255,255,255,0.14)",
                width: tooltipW,
              }}
            >
              <Text style={{ fontSize: 9, color: colors.textMuted }}>
                {ap.date ? formatHistoryDateLabel(ap.date) : historyBucketToDateHint(ap.label)}
              </Text>
              <Text style={{ fontSize: 14, fontWeight: "800", color: accent, marginTop: 2 }}>
                {"$" + Number(ap.val).toFixed(2)}
              </Text>
              <Text style={{ fontSize: 8, color: colors.textMuted, marginTop: 3 }}>
                {activeIdx === mapped.length - 1 ? "Latest" : "Market"}
              </Text>
            </View>
          </>
        )}
        <Text
          style={{
            position: "absolute",
            left: 0,
            top: padV - 10,
            fontSize: 8,
            color: trending ? "#f87171" : "#4ade80",
          }}
        >
          {"$" + maxV.toFixed(2)}
        </Text>
        <Text
          style={{
            position: "absolute",
            left: 0,
            top: padV + plotH - 2,
            fontSize: 8,
            color: trending ? "#4ade80" : "#f87171",
          }}
        >
          {"$" + minV.toFixed(2)}
        </Text>
        {(() => {
          if (ptHasDates) {
            const want = Math.min(4, mapped.length);
            const xs = [];
            for (let k = 0; k < want; k++) {
              const idx = Math.round((k / Math.max(1, want - 1)) * (mapped.length - 1));
              if (!xs.includes(idx)) xs.push(idx);
            }
            return xs.map((idx) => {
              const p = mapped[idx];
              return (
                <Text
                  key={"xl" + idx}
                  style={{
                    position: "absolute",
                    top: cH - PH_SPARK_XL_H + 2,
                    fontSize: 8,
                    color: colors.textMuted,
                    left: idx === 0 ? padH : undefined,
                    right: idx === mapped.length - 1 ? padH : undefined,
                    ...(idx > 0 && idx < mapped.length - 1 ? { left: p.x - 18 } : {}),
                  }}
                  numberOfLines={1}
                >
                  {p.date ? formatHistoryDateShort(p.date) : p.label}
                </Text>
              );
            });
          }
          return mapped.map((p, i) => (
            <Text
              key={"xl" + i}
              style={{
                position: "absolute",
                top: cH - PH_SPARK_XL_H + 2,
                fontSize: 8,
                color: colors.textMuted,
                left: i === 0 ? padH : undefined,
                right: i === mapped.length - 1 ? padH : undefined,
                ...(i > 0 && i < mapped.length - 1 ? { left: p.x - 12 } : {}),
              }}
            >
              {p.label}
            </Text>
          ));
        })()}
      </View>
      <Text style={{ fontSize: 8, color: colors.textMuted, marginTop: 2, opacity: 0.85 }}>
        Drag chart to see date & price
      </Text>
    </View>
  );
}
