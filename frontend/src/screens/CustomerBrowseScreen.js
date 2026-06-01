// Customer-facing catalog grid: browse, search, and filter inventory without seller controls.
import React, { useState, useRef, useCallback, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  StatusBar,
  Modal,
  Pressable,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { useAuth } from "../context/AuthContext";
import { loadCatalog } from "../../../backend/src/services/storage";
import CatalogImage, { prewarmPage } from "../components/CatalogImage";
import { colors, font, radius, spacing, gradients } from "../utils/theme";
import { useLayoutMetrics } from "../utils/useLayoutMetrics";

const PAGE_SIZE = 30;

function fmtPrice(price) {
  if (price <= 0) return null;
  if (price < 1) return "$" + price.toFixed(2);
  if (price < 10) return "$" + price.toFixed(2);
  return "$" + price.toFixed(0);
}

function parseCondition(condition) {
  if (!condition) return null;
  const m = condition.trim().match(/^(PSA|BGS|CGC|SGC|HGA)\s*(\d+(?:\.\d+)?)$/i);
  if (m)
    return {
      isGraded: true,
      grader: m[1].toUpperCase(),
      gradeNum: m[2],
      label: m[1].toUpperCase() + " " + m[2],
    };
  return { isGraded: false, label: condition.trim() };
}

export default function CustomerBrowseScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { maxContentWidth, catalogGridColumns } = useLayoutMetrics();
  const gridPad = spacing.lg;
  const gridGap = spacing.sm;
  const COLS = catalogGridColumns;
  const CARD_W = Math.max(
    120,
    Math.floor((maxContentWidth - gridPad * 2 - gridGap * (COLS - 1)) / COLS)
  );
  const CARD_H = Math.floor(CARD_W * 1.4);
  const listBatch = useMemo(() => (COLS >= 3 ? 18 : PAGE_SIZE), [COLS]);

  const [catalog, setCatalog] = useState([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState(null);
  const listRef = useRef(null);

  useFocusEffect(
    useCallback(() => {
      loadCatalog()
        .then((c) => {
          const cats = c || [];
          setCatalog(cats);
          setPage(0);
          prewarmPage(cats.slice(0, PAGE_SIZE * 3));
        })
        .catch(() => {});
    }, [])
  );

  const filtered = search.trim()
    ? catalog.filter(
        (c) =>
          c.name?.toLowerCase().includes(search.toLowerCase()) ||
          c.set?.toLowerCase().includes(search.toLowerCase()) ||
          c.number?.toLowerCase().includes(search.toLowerCase())
      )
    : catalog;

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageData = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const renderCard = useCallback(
    ({ item }) => {
      const price = Number(item.marketPrice) || 0;
      const qty = Number(item.quantity) || 1;
      const inStock = qty > 0;
      const priceLabel = fmtPrice(price);
      const cond = parseCondition(item.condition);

      const subLine = item.set
        ? item.number
          ? item.set + " #" + item.number
          : item.set
        : item.rarity || "—";

      return (
        <TouchableOpacity
          style={[s.gridCard, { width: CARD_W }]}
          activeOpacity={0.85}
          onPress={() => setSelected(item)}
        >
          <View style={[s.imgWrap, { width: CARD_W, height: CARD_H }]}>
            <CatalogImage item={item} size="low" style={s.cardImg} resizeMode="cover" />

            {/* Qty badge */}
            {qty > 1 && (
              <View style={s.qtyBadge}>
                <Text style={s.qtyBadgeTxt}>{"x" + qty}</Text>
              </View>
            )}

            {/* Grade badge */}
            {cond?.isGraded && (
              <View style={s.gradeBadge}>
                <Text style={s.graderTxt}>{cond.grader}</Text>
                <Text style={s.gradeNumTxt}>{cond.gradeNum}</Text>
              </View>
            )}

            {/* Price badge */}
            {!!priceLabel && (
              <View style={s.priceBadge}>
                <Text style={s.priceBadgeTxt}>{priceLabel}</Text>
              </View>
            )}

            {/* Out of stock overlay */}
            {!inStock && (
              <View style={s.outOverlay}>
                <Text style={s.outTxt}>Out of Stock</Text>
              </View>
            )}
          </View>

          <View style={s.cardMeta}>
            <Text style={s.cardName} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={s.cardSub} numberOfLines={1}>
              {subLine}
            </Text>
            {cond && !cond.isGraded && (
              <Text style={s.condTxt} numberOfLines={1}>
                {cond.label}
              </Text>
            )}
            <View style={s.stockRow}>
              <View
                style={[s.stockDot, { backgroundColor: inStock ? colors.green : colors.red }]}
              />
              <Text style={[s.stockTxt, { color: inStock ? colors.green : colors.red }]}>
                {inStock ? (qty === 1 ? "1 in stock" : qty + " in stock") : "Out of stock"}
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      );
    },
    [CARD_W, CARD_H]
  );

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />
      <LinearGradient
        colors={gradients.bg}
        style={StyleSheet.absoluteFillObject}
        start={gradients.bgStart}
        end={gradients.bgEnd}
      />

      {/* fullScreenModal stacks */}
      <View
        style={[
          s.safeShell,
          {
            paddingTop: Math.max(insets.top, spacing.sm),
            paddingBottom: Math.max(insets.bottom, spacing.sm),
          },
        ]}
      >
        <View style={s.tabletCenter}>
          <View style={[s.tabletInner, { maxWidth: maxContentWidth }]}>
            {/* Header */}
            <View style={s.header}>
              <View style={{ flex: 1 }}>
                <Text style={s.headerTitle}>Browse Cards</Text>
                {!!user?.storeName && <Text style={s.headerSub}>{user.storeName}</Text>}
              </View>
              <TouchableOpacity
                style={s.exitBtn}
                onPress={() => navigation.goBack()}
                activeOpacity={0.8}
              >
                <Text style={s.exitTxt}>✕ Exit</Text>
              </TouchableOpacity>
            </View>

            {/* Stats bar */}
            <View style={s.statsBar}>
              <Text style={s.statsText}>{catalog.length} cards available</Text>
              {filtered.length !== catalog.length && (
                <Text style={s.statsText}>{filtered.length} shown</Text>
              )}
            </View>

            {/* Search */}
            <View style={s.searchWrap}>
              <Text style={s.searchIc}>🔍</Text>
              <TextInput
                style={s.searchInp}
                placeholder="Search by name, set, or number..."
                placeholderTextColor={colors.textMuted}
                value={search}
                onChangeText={(t) => {
                  setSearch(t);
                  setPage(0);
                  listRef.current?.scrollToOffset({ offset: 0, animated: false });
                }}
                returnKeyType="search"
                clearButtonMode="while-editing"
              />
            </View>

            {/* Grid */}
            {filtered.length === 0 ? (
              <View style={s.empty}>
                <Text style={s.emptyIcon}>🃏</Text>
                <Text style={s.emptyTxt}>
                  {catalog.length === 0 ? "No cards in catalog yet" : "No cards match your search"}
                </Text>
              </View>
            ) : (
              <>
                <FlatList
                  key={"browse-" + String(COLS) + "-" + String(CARD_W)}
                  ref={listRef}
                  data={pageData}
                  keyExtractor={(item, i) => (item.id || item.name || "") + String(page) + i}
                  renderItem={renderCard}
                  numColumns={COLS}
                  contentContainerStyle={s.grid}
                  columnWrapperStyle={s.row}
                  getItemLayout={(_, index) => ({
                    length: CARD_H + 60,
                    offset: (CARD_H + 60) * Math.floor(index / COLS),
                    index,
                  })}
                  showsVerticalScrollIndicator={false}
                  removeClippedSubviews
                  initialNumToRender={listBatch}
                  maxToRenderPerBatch={listBatch}
                  windowSize={COLS >= 3 ? 5 : 3}
                />
                {/* Page controls */}
                {totalPages > 1 && (
                  <View style={s.pageBar}>
                    <TouchableOpacity
                      style={[s.pageBtn, page === 0 && s.pageBtnDisabled]}
                      onPress={() => {
                        if (page === 0) return;
                        const next = page - 1;
                        setPage(next);
                        prewarmPage(filtered.slice(next * PAGE_SIZE, (next + 2) * PAGE_SIZE));
                        listRef.current?.scrollToOffset({ offset: 0, animated: false });
                      }}
                      disabled={page === 0}
                    >
                      <Text style={s.pageBtnTxt}>‹ Prev</Text>
                    </TouchableOpacity>
                    <Text style={s.pageCount}>
                      {page + 1} / {totalPages}
                    </Text>
                    <TouchableOpacity
                      style={[s.pageBtn, page === totalPages - 1 && s.pageBtnDisabled]}
                      onPress={() => {
                        if (page === totalPages - 1) return;
                        const next = page + 1;
                        setPage(next);
                        prewarmPage(filtered.slice(next * PAGE_SIZE, (next + 2) * PAGE_SIZE));
                        listRef.current?.scrollToOffset({ offset: 0, animated: false });
                      }}
                      disabled={page === totalPages - 1}
                    >
                      <Text style={s.pageBtnTxt}>Next ›</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </>
            )}
            {/* Card detail */}
            <CardDetailModal item={selected} onClose={() => setSelected(null)} />
          </View>
        </View>
      </View>
    </View>
  );
}

function CardDetailModal({ item, onClose }) {
  if (!item) return null;

  const price = Number(item.marketPrice) || 0;
  const cmPrice = Number(item.cmPrice) || 0;
  const qty = Number(item.quantity) || 1;
  const inStock = qty > 0;
  const cond = parseCondition(item.condition);

  const subLine = item.set
    ? item.number
      ? item.set + " #" + item.number
      : item.set
    : item.rarity || null;

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.modalOverlay} onPress={onClose}>
        <Pressable style={s.modalCard} onPress={() => {}}>
          {/* Large image */}
          <View style={s.modalImgWrap}>
            <CatalogImage item={item} size="high" style={s.modalImg} resizeMode="contain" />
            {cond?.isGraded && (
              <View style={s.modalGradeBadge}>
                <Text style={s.modalGraderTxt}>{cond.grader}</Text>
                <Text style={s.modalGradeNumTxt}>{cond.gradeNum}</Text>
              </View>
            )}
          </View>

          {/* Details */}
          <ScrollView
            style={s.modalBody}
            contentContainerStyle={{ gap: 4 }}
            showsVerticalScrollIndicator={false}
          >
            <Text style={s.modalName}>{item.name}</Text>
            {!!subLine && <Text style={s.modalSub}>{subLine}</Text>}
            {cond && !cond.isGraded && !!cond.label && (
              <Text style={s.modalCond}>{cond.label}</Text>
            )}

            {/* Price rows */}
            {price > 0 && (
              <View style={s.modalPriceRow}>
                <Text style={s.modalPriceLabel}>TCGPlayer</Text>
                <Text style={s.modalPrice}>{"$" + price.toFixed(price < 10 ? 2 : 0)}</Text>
              </View>
            )}
            {cmPrice > 0 && (
              <View style={[s.modalPriceRow, { marginTop: 6 }]}>
                <Text style={s.modalPriceLabel}>CardMarket</Text>
                <Text style={s.modalPrice}>{"$" + cmPrice.toFixed(cmPrice < 10 ? 2 : 0)}</Text>
              </View>
            )}

            {/* Stock */}
            <View style={s.modalStockRow}>
              <View
                style={[s.stockDot, { backgroundColor: inStock ? colors.green : colors.red }]}
              />
              <Text style={[s.modalStockTxt, { color: inStock ? colors.green : colors.red }]}>
                {inStock ? (qty === 1 ? "1 in stock" : qty + " in stock") : "Out of stock"}
              </Text>
            </View>

            {!!item.rarity && !!item.set && <Text style={s.modalMeta}>Rarity: {item.rarity}</Text>}
          </ScrollView>

          <TouchableOpacity style={s.modalClose} onPress={onClose}>
            <Text style={s.modalCloseTxt}>Close</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safeShell: { flex: 1 },
  tabletCenter: { flex: 1, alignItems: "center", alignSelf: "stretch" },
  tabletInner: { flex: 1, width: "100%" },

  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: spacing.lg,
    paddingTop: 4,
    paddingBottom: 8,
    gap: 10,
  },
  headerTitle: { fontSize: 22, fontWeight: font.heavy, color: colors.text },
  headerSub: { fontSize: 12, color: colors.textSub, marginTop: 1 },

  exitBtn: {
    backgroundColor: colors.bg2,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 0.5,
    borderColor: colors.border,
    marginTop: 2,
  },
  exitTxt: { color: colors.textSub, fontSize: 13, fontWeight: font.medium },

  statsBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingBottom: 8,
  },
  statsText: { fontSize: 12, color: colors.textMuted },

  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.bg2,
    marginHorizontal: spacing.lg,
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 12,
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  searchIc: { fontSize: 14, marginRight: 6 },
  searchInp: { flex: 1, color: colors.text, fontSize: 14 },

  grid: { paddingHorizontal: spacing.lg, paddingBottom: 30 },
  row: { gap: spacing.sm, marginBottom: spacing.sm },

  gridCard: { backgroundColor: colors.bg1, borderRadius: radius.md, overflow: "hidden" },
  imgWrap: { backgroundColor: colors.bg2 },
  cardImg: { width: "100%", height: "100%" },

  qtyBadge: {
    position: "absolute",
    top: 6,
    left: 6,
    backgroundColor: "rgba(233,30,99,0.9)",
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  qtyBadgeTxt: { fontSize: 11, fontWeight: font.bold, color: "#fff" },

  gradeBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    backgroundColor: "rgba(30,100,233,0.93)",
    borderRadius: radius.sm,
    paddingHorizontal: 7,
    paddingVertical: 3,
    alignItems: "center",
  },
  graderTxt: {
    fontSize: 8,
    fontWeight: font.bold,
    color: "#fff",
    letterSpacing: 0.5,
    lineHeight: 10,
  },
  gradeNumTxt: { fontSize: 14, fontWeight: font.heavy, color: "#fff", lineHeight: 16 },

  priceBadge: {
    position: "absolute",
    bottom: 6,
    right: 6,
    backgroundColor: "rgba(0,0,0,0.75)",
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  priceBadgeTxt: { fontSize: 11, fontWeight: font.bold, color: "#fff" },

  outOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  outTxt: { color: "#fff", fontSize: 12, fontWeight: font.bold },

  cardMeta: { padding: 8 },
  cardName: { fontSize: 12, fontWeight: font.bold, color: colors.text },
  cardSub: { fontSize: 10, color: colors.textSub, marginTop: 2 },
  condTxt: { fontSize: 10, color: colors.textMuted, marginTop: 1 },
  stockRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 5 },
  stockDot: { width: 6, height: 6, borderRadius: 3 },
  stockTxt: { fontSize: 10, fontWeight: font.bold },

  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  emptyIcon: { fontSize: 48 },
  emptyTxt: { color: colors.textSub, fontSize: 15 },

  pageBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    borderTopWidth: 0.5,
    borderTopColor: colors.border,
  },
  pageBtn: {
    backgroundColor: colors.bg2,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  pageBtnDisabled: { opacity: 0.35 },
  pageBtnTxt: { color: colors.text, fontSize: 13, fontWeight: font.bold },
  pageCount: { color: colors.textSub, fontSize: 13 },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.72)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    backgroundColor: colors.bg1,
    borderRadius: radius.lg,
    width: "100%",
    maxWidth: 380,
    overflow: "hidden",
  },
  modalImgWrap: { width: "100%", aspectRatio: 0.72, backgroundColor: colors.bg2 },
  modalImg: { width: "100%", height: "100%" },
  modalGradeBadge: {
    position: "absolute",
    top: 10,
    right: 10,
    backgroundColor: "rgba(30,100,233,0.93)",
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignItems: "center",
  },
  modalGraderTxt: {
    fontSize: 10,
    fontWeight: font.bold,
    color: "#fff",
    letterSpacing: 0.5,
    lineHeight: 12,
  },
  modalGradeNumTxt: { fontSize: 22, fontWeight: font.heavy, color: "#fff", lineHeight: 26 },
  modalBody: { padding: 16, maxHeight: 200 },
  modalName: { fontSize: 17, fontWeight: font.heavy, color: colors.text },
  modalSub: { fontSize: 12, color: colors.textSub },
  modalCond: { fontSize: 12, color: colors.textMuted },
  modalPriceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
    backgroundColor: colors.bg2,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  modalPriceLabel: { fontSize: 13, color: colors.textSub, fontWeight: font.medium },
  modalPrice: { fontSize: 24, fontWeight: font.heavy, color: colors.text },
  modalStockRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
  modalStockTxt: { fontSize: 13, fontWeight: font.bold },
  modalMeta: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  modalClose: {
    margin: 12,
    backgroundColor: colors.bg2,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  modalCloseTxt: { color: colors.text, fontSize: 15, fontWeight: font.bold },
});
