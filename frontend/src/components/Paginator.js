// Reusable pagination: usePagination hook slices data into pages; Paginator renders the controls.
import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { colors, font, radius, spacing } from "../utils/theme";

const PAGE_SIZES = [10, 20, 50, 100];

export function usePagination(data, defaultPageSize = 20) {
  const safeData = data || [];
  const [page, setPage] = React.useState(0);
  const [pageSize, setPageSize] = React.useState(defaultPageSize);

  const totalPages = Math.max(1, Math.ceil(safeData.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const start = safePage * pageSize;
  const pageData = safeData.slice(start, start + pageSize);

  const goNext = () => setPage((p) => Math.min(p + 1, totalPages - 1));
  const goPrev = () => setPage((p) => Math.max(p - 1, 0));
  const goFirst = () => setPage(0);
  const goLast = () => setPage(totalPages - 1);

  const changePageSize = (size) => {
    setPageSize(size);
    setPage(0);
  };

  React.useEffect(() => {
    setPage(0);
  }, [safeData.length]);

  return {
    pageData,
    page: safePage,
    pageSize,
    totalPages,
    total: safeData.length,
    start: start + 1,
    end: Math.min(start + pageSize, safeData.length),
    goNext,
    goPrev,
    goFirst,
    goLast,
    changePageSize,
    hasPrev: safePage > 0,
    hasNext: safePage < totalPages - 1,
  };
}

export default function Paginator({ pagination, onNavigate }) {
  const {
    page,
    pageSize,
    totalPages,
    total,
    start,
    end,
    goNext,
    goPrev,
    goFirst,
    goLast,
    hasPrev,
    hasNext,
    changePageSize,
  } = pagination;

  const afterNav = typeof onNavigate === "function" ? onNavigate : null;
  const wrap = React.useCallback(
    (fn) => () => {
      fn();
      afterNav?.();
    },
    [afterNav]
  );

  if (total === 0 || totalPages <= 1) return null;

  const rangeLabel = String(start) + " - " + String(end) + " of " + String(total);
  const pageLabel = "Page " + String(page + 1) + " of " + String(totalPages);

  return (
    <View style={s.wrap}>
      <View style={s.sizeRow}>
        <Text style={s.sizeLabel}>{"Per page:"}</Text>
        {PAGE_SIZES.map((size) => (
          <TouchableOpacity
            key={String(size)}
            style={[s.sizeBtn, pageSize === size && s.sizeBtnOn]}
            onPress={() => {
              changePageSize(size);
              afterNav?.();
            }}
          >
            <Text style={[s.sizeBtnTxt, pageSize === size && s.sizeBtnTxtOn]}>{String(size)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={s.navRow}>
        <TouchableOpacity
          style={[s.navBtn, !hasPrev && s.navBtnOff]}
          onPress={wrap(goFirst)}
          disabled={!hasPrev}
        >
          <Text style={[s.navTxt, !hasPrev && s.navTxtOff]}>{"<<"}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[s.navBtn, !hasPrev && s.navBtnOff]}
          onPress={wrap(goPrev)}
          disabled={!hasPrev}
        >
          <Text style={[s.navTxt, !hasPrev && s.navTxtOff]}>{"<"}</Text>
        </TouchableOpacity>

        <View style={s.pageInfo}>
          <Text style={s.pageInfoTxt}>{rangeLabel}</Text>
          <Text style={s.pageInfoSub}>{pageLabel}</Text>
        </View>

        <TouchableOpacity
          style={[s.navBtn, !hasNext && s.navBtnOff]}
          onPress={wrap(goNext)}
          disabled={!hasNext}
        >
          <Text style={[s.navTxt, !hasNext && s.navTxtOff]}>{">"}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[s.navBtn, !hasNext && s.navBtnOff]}
          onPress={wrap(goLast)}
          disabled={!hasNext}
        >
          <Text style={[s.navTxt, !hasNext && s.navTxtOff]}>{">>"}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    borderTopWidth: 0.5,
    borderTopColor: colors.border,
  },
  sizeRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 12 },
  sizeLabel: { fontSize: 11, color: colors.textSub },
  sizeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: colors.bg1,
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  sizeBtnOn: { backgroundColor: colors.red, borderColor: colors.red },
  sizeBtnTxt: { fontSize: 12, fontWeight: font.medium, color: colors.textSub },
  sizeBtnTxtOn: { color: "#fff", fontWeight: font.bold },
  navRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  navBtn: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: colors.bg1,
    borderWidth: 0.5,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  navBtnOff: { opacity: 0.3 },
  navTxt: { fontSize: 13, fontWeight: font.bold, color: colors.text },
  navTxtOff: { color: colors.textMuted },
  pageInfo: { flex: 1, alignItems: "center" },
  pageInfoTxt: { fontSize: 13, fontWeight: font.bold, color: colors.text },
  pageInfoSub: { fontSize: 10, color: colors.textSub, marginTop: 2 },
});
