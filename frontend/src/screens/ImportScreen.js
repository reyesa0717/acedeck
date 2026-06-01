// CSV import flow: pick a Collectr/manual export, map columns, preview rows, and merge into the catalog.
import React, { useState, useCallback, useRef, useMemo, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  FlatList,
  Modal,
  TextInput,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { useNavigation } from "@react-navigation/native";
import { importCollectrCSV } from "../../../backend/src/services/csv";
import { saveCatalog, loadCatalog, clearCatalog } from "../../../backend/src/services/storage";
import { colors, font, radius, spacing, gradients } from "../utils/theme";
import { useLayoutMetrics } from "../utils/useLayoutMetrics";
import { LinearGradient } from "expo-linear-gradient";
import CatalogImage, { prewarmPage, getCachedCardId } from "../components/CatalogImage";
import { catalogMatchesProductFilter } from "../utils/sealedInventory";

const PAGE_SIZE = 40;

const PRODUCT_FILTER_CHIPS = [
  { key: "all", label: "All" },
  { key: "singles", label: "Singles" },
  { key: "sealed", label: "Sealed" },
  { key: "etb", label: "ETB" },
  { key: "booster_bundle", label: "Booster bundle" },
  { key: "booster_box", label: "Booster box" },
  { key: "pack", label: "Packs" },
  { key: "bundle", label: "Bundles" },
  { key: "sealed_other", label: "Other sealed" },
];

const PORTFOLIO_UNASSIGNED = "(Unassigned)";

const GridCard = React.memo(({ item, onPress, cardW, cardH }) => {
  const mkt = Number(item.marketPrice) || 0;
  const qty = Number(item.quantity) || 1;
  const handlePress = useCallback(() => onPress(item), [item, onPress]);

  return (
    <TouchableOpacity
      style={[s.gridCard, { width: cardW }]}
      onPress={handlePress}
      activeOpacity={0.85}
    >
      <View style={[s.imgWrap, { width: cardW, height: cardH }]} renderToHardwareTextureAndroid>
        <CatalogImage item={item} size="low" style={s.cardImg} resizeMode="cover" />

        {qty > 1 && (
          <View style={s.qtyBadge}>
            <Text style={s.qtyBadgeTxt}>{"x" + String(qty)}</Text>
          </View>
        )}

        {mkt > 0 && (
          <View style={s.priceBadge}>
            <Text style={s.priceBadgeTxt}>{"$" + mkt.toFixed(2)}</Text>
          </View>
        )}
      </View>
      <View style={s.cardMeta}>
        <Text style={s.cardName} numberOfLines={1}>
          {String(item.name || "")}
        </Text>
        <Text style={s.cardSub} numberOfLines={1}>
          {item.set ? (item.number ? item.set + " #" + item.number : item.set) : item.rarity || "—"}
        </Text>
      </View>
    </TouchableOpacity>
  );
});

const CatalogListRow = React.memo(({ item, onPress }) => {
  const mkt = Number(item.marketPrice) || 0;
  const qty = item.quantity ?? 1;
  const qtyColor = qty <= 0 ? colors.red : qty === 1 ? colors.amber : colors.green;
  const handlePress = useCallback(() => onPress(item), [item, onPress]);
  return (
    <TouchableOpacity style={s.listRow} onPress={handlePress} activeOpacity={0.75}>
      <View style={s.listThumb} renderToHardwareTextureAndroid>
        <CatalogImage
          item={item}
          size="low"
          style={{ width: "100%", height: "100%", borderRadius: 7 }}
          resizeMode="cover"
        />
      </View>
      <View style={s.listInfo}>
        <Text style={s.listName} numberOfLines={2}>
          {String(item.name || "")}
        </Text>
        <Text style={s.listSet} numberOfLines={2}>
          {item.set ? item.set + (item.number ? " · #" + item.number : "") : "—"}
        </Text>
        {!!item.condition && <Text style={s.listCond}>{item.condition}</Text>}
        {mkt > 0 && <Text style={s.listPrice}>{"$" + mkt.toFixed(2)}</Text>}
      </View>
      <View style={[s.listQtyBadge, { backgroundColor: qtyColor + "22", borderColor: qtyColor }]}>
        <Text style={[s.listQtyTxt, { color: qtyColor }]}>
          {qty === 0 ? "OUT" : qty < 0 ? String(qty) : "x" + String(qty)}
        </Text>
      </View>
      <Text style={s.listArr}>{">"}</Text>
    </TouchableOpacity>
  );
});

export default function ImportScreen() {
  const navigation = useNavigation();
  const { maxContentWidth, catalogGridColumns } = useLayoutMetrics();
  const gridPad = spacing.lg;
  const gridGap = spacing.sm;
  const COLS = catalogGridColumns;
  const CARD_W = Math.max(
    120,
    Math.floor((maxContentWidth - gridPad * 2 - gridGap * (COLS - 1)) / COLS)
  );
  const CARD_H = Math.floor(CARD_W * 1.4);

  const [catalog, setCatalog] = useState([]);
  const [importing, setImporting] = useState(false);
  const [preview, setPreview] = useState(null);
  const [viewerCard, setViewerCard] = useState(null);

  const goToDetail = useCallback(
    (item) => {
      navigation.navigate("CardDetail", { item });
    },
    [navigation]
  );

  const sendToPOS = (item) => {
    setViewerCard(null);
    const cardId = getCachedCardId(item);
    navigation.navigate("POS", { catalogCard: cardId ? { ...item, cardId } : item });
  };
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState("all");
  const [setFilter, setSetFilter] = useState("");
  const [setPickerOpen, setSetPickerOpen] = useState(false);
  const [setPickerQuery, setSetPickerQuery] = useState("");
  const [portfolioFilter, setPortfolioFilter] = useState("");
  const [portfolioPickerOpen, setPortfolioPickerOpen] = useState(false);
  const [portfolioPickerQuery, setPortfolioPickerQuery] = useState("");
  const [page, setPage] = useState(0);
  const [catalogViewMode, setCatalogViewMode] = useState("grid");
  const listRef = useRef(null);

  useFocusEffect(
    useCallback(() => {
      loadCatalog()
        .then((cats) => {
          setCatalog((prev) => {
            const prevLen = prev?.length ?? 0;
            const nextLen = cats?.length ?? 0;
            if (prevLen !== nextLen) setPage(0);
            return cats || [];
          });
          if (cats?.length) prewarmPage(cats.slice(0, PAGE_SIZE));
        })
        .catch(() => {
          setCatalog([]);
          setPage(0);
        });
    }, [])
  );

  const displayCards = preview || catalog || [];
  const isPreview = !!preview;

  const uniqueSets = useMemo(() => {
    const seen = new Map();
    for (const c of displayCards) {
      const st = (c.set || "").trim();
      if (!st) continue;
      const k = st.toLowerCase();
      if (!seen.has(k)) seen.set(k, st);
    }
    return Array.from(seen.values()).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" })
    );
  }, [displayCards]);

  const setsForPicker = useMemo(() => {
    const q = setPickerQuery.trim().toLowerCase();
    if (!q) return uniqueSets;
    return uniqueSets.filter((s) => s.toLowerCase().includes(q));
  }, [uniqueSets, setPickerQuery]);

  const setPickerRows = useMemo(
    () => [
      { key: "__all__", label: "All sets" },
      ...setsForPicker.map((st) => ({ key: "__set__:" + st, label: st })),
    ],
    [setsForPicker]
  );

  const uniquePortfolios = useMemo(() => {
    const seen = new Map();
    let hasEmpty = false;
    for (const c of displayCards) {
      const p = (c.portfolio || "").trim();
      if (!p) {
        hasEmpty = true;
        continue;
      }
      const k = p.toLowerCase();
      if (!seen.has(k)) seen.set(k, p);
    }
    const list = Array.from(seen.values()).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" })
    );
    return { list, hasEmpty };
  }, [displayCards]);

  const portfoliosForPicker = useMemo(() => {
    const q = portfolioPickerQuery.trim().toLowerCase();
    const { list, hasEmpty } = uniquePortfolios;
    const base = hasEmpty ? [PORTFOLIO_UNASSIGNED, ...list] : [...list];
    if (!q) return base;
    return base.filter((p) => p.toLowerCase().includes(q));
  }, [uniquePortfolios, portfolioPickerQuery]);

  const portfolioPickerRows = useMemo(
    () => [
      { key: "__all__", label: "All binders" },
      ...portfoliosForPicker.map((p) => ({ key: "__pf__:" + p, label: p })),
    ],
    [portfoliosForPicker]
  );

  const showPortfolioPicker = uniquePortfolios.list.length > 0 || uniquePortfolios.hasEmpty;

  useEffect(() => {
    setPage(0);
  }, [kindFilter, setFilter, portfolioFilter, search]);

  useEffect(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [catalogViewMode]);

  // Memoize filtered
  const filtered = useMemo(() => {
    let list = displayCards.filter((c) => catalogMatchesProductFilter(c, kindFilter));
    if (setFilter) {
      const sf = setFilter.trim().toLowerCase();
      list = list.filter((c) => (c.set || "").trim().toLowerCase() === sf);
    }
    if (portfolioFilter) {
      if (portfolioFilter === PORTFOLIO_UNASSIGNED) {
        list = list.filter((c) => !(c.portfolio || "").trim());
      } else {
        const pf = portfolioFilter.trim().toLowerCase();
        list = list.filter((c) => (c.portfolio || "").trim().toLowerCase() === pf);
      }
    }
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (c) =>
        c.name?.toLowerCase().includes(q) ||
        c.number?.toLowerCase().includes(q) ||
        c.set?.toLowerCase().includes(q)
    );
  }, [displayCards, kindFilter, setFilter, portfolioFilter, search]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  // Memoize the current page
  const pageData = useMemo(
    () => filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [filtered, page]
  );

  const totalMarket = useMemo(
    () => catalog.reduce((s, c) => s + (Number(c.marketPrice) || 0), 0),
    [catalog]
  );

  const goPage = (p) => {
    const next = Math.max(0, Math.min(p, totalPages - 1));
    setPage(next);
    const start = next * PAGE_SIZE;
    prewarmPage(filtered.slice(start, start + PAGE_SIZE));
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  };

  const handleImport = async () => {
    setImporting(true);
    try {
      const cards = await importCollectrCSV();
      if (!cards) return;
      setPreview(cards);
      prewarmPage(cards.slice(0, PAGE_SIZE));
    } catch (e) {
      Alert.alert("Import failed", e.message);
    } finally {
      setImporting(false);
    }
  };

  const handleConfirm = async () => {
    if (!preview?.length) return;
    await saveCatalog(preview);
    setCatalog(preview);
    setPreview(null);
    setPage(0);
    Alert.alert("Saved", String(preview.length) + " cards imported.");
  };

  const handleClear = () => {
    Alert.alert("Clear catalog?", "Sales history is kept.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear",
        style: "destructive",
        onPress: async () => {
          await clearCatalog();
          setCatalog([]);
          setPreview(null);
          setPage(0);
          setKindFilter("all");
          setSetFilter("");
          setPortfolioFilter("");
        },
      },
    ]);
  };

  const renderCard = useCallback(
    ({ item }) => <GridCard item={item} onPress={goToDetail} cardW={CARD_W} cardH={CARD_H} />,
    [goToDetail, CARD_W, CARD_H]
  );

  const renderListRow = useCallback(
    ({ item }) => <CatalogListRow item={item} onPress={goToDetail} />,
    [goToDetail]
  );

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <LinearGradient
        colors={gradients.bg}
        style={StyleSheet.absoluteFillObject}
        start={gradients.bgStart}
        end={gradients.bgEnd}
      />

      {/* Viewer */}
      <Modal
        visible={setPickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setSetPickerOpen(false);
          setSetPickerQuery("");
        }}
      >
        <View style={s.setPickOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => {
              setSetPickerOpen(false);
              setSetPickerQuery("");
            }}
          />
          <View style={s.setPickBox}>
            <Text style={s.setPickTitle}>Filter by set</Text>
            <TextInput
              style={s.setPickSearch}
              placeholder="Search sets..."
              placeholderTextColor={colors.textMuted}
              value={setPickerQuery}
              onChangeText={setSetPickerQuery}
            />
            <FlatList
              data={setPickerRows}
              keyExtractor={(it) => it.key}
              style={s.setPickList}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={s.setPickRow}
                  onPress={() => {
                    if (item.key === "__all__") setSetFilter("");
                    else setSetFilter(item.label || "");
                    setSetPickerOpen(false);
                    setSetPickerQuery("");
                  }}
                >
                  <Text style={[s.setPickRowTxt, item.key === "__all__" && s.setPickRowAll]}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

      <Modal
        visible={portfolioPickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setPortfolioPickerOpen(false);
          setPortfolioPickerQuery("");
        }}
      >
        <View style={s.setPickOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => {
              setPortfolioPickerOpen(false);
              setPortfolioPickerQuery("");
            }}
          />
          <View style={s.setPickBox}>
            <Text style={s.setPickTitle}>Filter by binder (portfolio)</Text>
            <TextInput
              style={s.setPickSearch}
              placeholder="Search binders..."
              placeholderTextColor={colors.textMuted}
              value={portfolioPickerQuery}
              onChangeText={setPortfolioPickerQuery}
            />
            <FlatList
              data={portfolioPickerRows}
              keyExtractor={(it) => it.key}
              style={s.setPickList}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={s.setPickRow}
                  onPress={() => {
                    if (item.key === "__all__") setPortfolioFilter("");
                    else setPortfolioFilter(item.label || "");
                    setPortfolioPickerOpen(false);
                    setPortfolioPickerQuery("");
                  }}
                >
                  <Text style={[s.setPickRowTxt, item.key === "__all__" && s.setPickRowAll]}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!viewerCard}
        transparent
        animationType="fade"
        onRequestClose={() => setViewerCard(null)}
      >
        <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setViewerCard(null)}>
          <View style={s.viewerBox}>
            {viewerCard && (
              <>
                <CatalogImage
                  item={viewerCard}
                  size="high"
                  style={s.viewerImg}
                  resizeMode="contain"
                />
                <View style={s.viewerInfo}>
                  <Text style={s.viewerName}>{String(viewerCard.name || "")}</Text>
                  <Text style={s.viewerSub}>
                    {viewerCard.set
                      ? viewerCard.set + (viewerCard.number ? " · #" + viewerCard.number : "")
                      : ""}
                  </Text>
                  {!!viewerCard.rarity && (
                    <Text style={s.viewerRar}>{String(viewerCard.rarity)}</Text>
                  )}
                  {Number(viewerCard.marketPrice) > 0 && (
                    <Text style={s.viewerPrice}>
                      {"TCG $" + Number(viewerCard.marketPrice).toFixed(2)}
                    </Text>
                  )}
                  {Number(viewerCard.cmPrice) > 0 && (
                    <Text style={s.viewerPrice}>
                      {"CM $" + Number(viewerCard.cmPrice).toFixed(2)}
                    </Text>
                  )}
                </View>
                <View style={s.viewerBtns}>
                  <TouchableOpacity style={s.closeBtn} onPress={() => setViewerCard(null)}>
                    <Text style={s.closeBtnTxt}>{"Close"}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.posBtn} onPress={() => sendToPOS(viewerCard)}>
                    <LinearGradient
                      colors={["#E91E63", "#8E24AA"]}
                      style={s.posBtnGrad}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                    >
                      <Text style={s.posBtnTxt}>{"Use in POS →"}</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      <View style={s.tabletCenter}>
        <View style={[s.tabletInner, { maxWidth: maxContentWidth }]}>
          {/* Header */}
          <View style={s.header}>
            <View style={s.topRow}>
              <View>
                <Text style={s.pageTitle}>Catalog</Text>
                {catalog.length > 0 && (
                  <Text style={s.pageSub}>
                    {String(catalog.length) + " cards · $" + totalMarket.toFixed(0) + " value"}
                  </Text>
                )}
              </View>
              <View style={s.headerBtns}>
                {!isPreview && catalog.length > 0 && (
                  <TouchableOpacity style={s.clearBtn} onPress={handleClear}>
                    <Text style={s.clearBtnTxt}>Clear</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={s.importBtn} onPress={handleImport} disabled={importing}>
                  <LinearGradient
                    colors={gradients.primary}
                    style={{ borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 8 }}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                  >
                    <Text style={s.importBtnTxt}>{importing ? "Reading..." : "Import CSV"}</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>

            {isPreview && (
              <View style={s.previewBar}>
                <Text style={s.previewTxt}>{"Preview: " + String(preview.length) + " cards"}</Text>
                <View style={s.previewBtns}>
                  <TouchableOpacity style={s.discardBtn} onPress={() => setPreview(null)}>
                    <Text style={s.discardTxt}>Discard</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.saveBtn} onPress={handleConfirm}>
                    <Text style={s.saveTxt}>{"Save " + String(preview.length) + " cards"}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {displayCards.length > 0 && (
              <View style={s.filterBlock}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={s.chipRow}
                >
                  {PRODUCT_FILTER_CHIPS.map((opt) => {
                    const on = kindFilter === opt.key;
                    return (
                      <TouchableOpacity
                        key={opt.key}
                        style={[s.filterChip, on && s.filterChipOn]}
                        onPress={() => setKindFilter(opt.key)}
                      >
                        <Text style={[s.filterChipTxt, on && s.filterChipTxtOn]}>{opt.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
                <View style={s.filterPickRow}>
                  {uniqueSets.length > 0 && (
                    <TouchableOpacity style={s.setPickBtn} onPress={() => setSetPickerOpen(true)}>
                      <Text style={s.setPickBtnTxt} numberOfLines={1}>
                        {setFilter ? "Set: " + setFilter : "Set: All"}
                      </Text>
                      <Text style={s.setPickBtnCaret}>{" ▾"}</Text>
                    </TouchableOpacity>
                  )}
                  {showPortfolioPicker && (
                    <TouchableOpacity
                      style={s.setPickBtn}
                      onPress={() => setPortfolioPickerOpen(true)}
                    >
                      <Text style={s.setPickBtnTxt} numberOfLines={1}>
                        {portfolioFilter
                          ? "Binder: " +
                            (portfolioFilter === PORTFOLIO_UNASSIGNED
                              ? "Unassigned"
                              : portfolioFilter)
                          : "Binder: All"}
                      </Text>
                      <Text style={s.setPickBtnCaret}>{" ▾"}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            )}

            {/* Search bar */}
            {displayCards.length > 0 && (
              <View style={s.searchRow}>
                <Text style={s.searchIc}>🔍</Text>
                <TextInput
                  style={s.searchInp}
                  placeholder="Search name, set, number..."
                  placeholderTextColor={colors.textMuted}
                  value={search}
                  onChangeText={(t) => {
                    setSearch(t);
                    setPage(0);
                  }}
                />
                {!!search && (
                  <TouchableOpacity
                    onPress={() => {
                      setSearch("");
                      setPage(0);
                    }}
                  >
                    <Text style={s.searchX}>✕</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* Page count */}
            {filtered.length > 0 && (
              <View style={s.catToolbar}>
                <Text style={s.catSummaryTxt} numberOfLines={2}>
                  {String(page * PAGE_SIZE + 1) +
                    "–" +
                    String(Math.min((page + 1) * PAGE_SIZE, filtered.length)) +
                    " of " +
                    String(filtered.length)}
                </Text>
                <View style={s.catViewSeg}>
                  <TouchableOpacity
                    onPress={() => setCatalogViewMode("grid")}
                    style={[s.catViewSegBtn, catalogViewMode === "grid" && s.catViewSegBtnOn]}
                  >
                    <Text
                      style={[s.catViewSegTxt, catalogViewMode === "grid" && s.catViewSegTxtOn]}
                    >
                      Grid
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setCatalogViewMode("list")}
                    style={[s.catViewSegBtn, catalogViewMode === "list" && s.catViewSegBtnOn]}
                  >
                    <Text
                      style={[s.catViewSegTxt, catalogViewMode === "list" && s.catViewSegTxtOn]}
                    >
                      List
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>

          {/* Grid */}
          {displayCards.length === 0 ? (
            <View style={s.empty}>
              <Text style={s.emptyIc}>{"📁"}</Text>
              <Text style={s.emptyT}>{"No catalog yet"}</Text>
              <Text style={s.emptyS}>{"Tap Import CSV to load your collection."}</Text>
              <TouchableOpacity
                style={[s.importBtn, { marginTop: 16, paddingHorizontal: 24 }]}
                onPress={handleImport}
                disabled={importing}
              >
                <Text style={s.importBtnTxt}>{importing ? "Reading..." : "Import CSV"}</Text>
              </TouchableOpacity>
            </View>
          ) : filtered.length === 0 ? (
            <View style={s.empty}>
              <Text style={s.emptyIc}>{"🔎"}</Text>
              <Text style={s.emptyT}>{"No matches"}</Text>
              <Text style={s.emptyS}>{"Try another filter, set, or search."}</Text>
              <TouchableOpacity
                style={[s.discardBtn, { marginTop: 16, paddingHorizontal: 20 }]}
                onPress={() => {
                  setKindFilter("all");
                  setSetFilter("");
                  setPortfolioFilter("");
                  setSearch("");
                }}
              >
                <Text style={s.discardTxt}>Clear filters</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              key={"catalog-" + catalogViewMode + "-" + String(COLS) + "-" + String(CARD_W)}
              ref={listRef}
              data={pageData}
              keyExtractor={(item) => String(item.id)}
              numColumns={catalogViewMode === "grid" ? COLS : 1}
              contentContainerStyle={catalogViewMode === "grid" ? s.grid : s.listContent}
              columnWrapperStyle={catalogViewMode === "grid" ? s.row : undefined}
              removeClippedSubviews
              maxToRenderPerBatch={8}
              windowSize={5}
              initialNumToRender={10}
              getItemLayout={
                catalogViewMode === "grid"
                  ? (_, index) => ({
                      length: CARD_H + 52,
                      offset: (CARD_H + 52) * Math.floor(index / COLS),
                      index,
                    })
                  : undefined
              }
              renderItem={catalogViewMode === "grid" ? renderCard : renderListRow}
              ListFooterComponent={
                totalPages > 1 ? (
                  <View style={s.pagination}>
                    <TouchableOpacity
                      style={[s.pageBtn, page === 0 && s.pageBtnOff]}
                      onPress={() => goPage(page - 1)}
                      disabled={page === 0}
                    >
                      <Text style={s.pageBtnTxt}>{"< Prev"}</Text>
                    </TouchableOpacity>
                    <Text style={s.pageNum}>{String(page + 1) + " / " + String(totalPages)}</Text>
                    <TouchableOpacity
                      style={[s.pageBtn, page >= totalPages - 1 && s.pageBtnOff]}
                      onPress={() => goPage(page + 1)}
                      disabled={page >= totalPages - 1}
                    >
                      <Text style={s.pageBtnTxt}>{"Next >"}</Text>
                    </TouchableOpacity>
                  </View>
                ) : null
              }
            />
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  tabletCenter: { flex: 1, alignItems: "center", alignSelf: "stretch" },
  tabletInner: { flex: 1, width: "100%" },

  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  pageTitle: { fontSize: 22, fontWeight: font.heavy, color: colors.text },
  pageSub: { fontSize: 12, color: colors.textSub, marginTop: 2 },

  headerBtns: { flexDirection: "row", gap: 8, alignItems: "center" },
  clearBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.md,
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  clearBtnTxt: { fontSize: 12, color: colors.textSub },
  importBtn: { borderRadius: radius.md, overflow: "hidden" },
  importBtnTxt: { fontSize: 13, fontWeight: font.bold, color: "#fff" },

  previewBar: {
    backgroundColor: colors.blueL,
    borderRadius: radius.md,
    padding: 12,
    borderWidth: 0.5,
    borderColor: colors.blue,
    marginBottom: 8,
  },
  previewTxt: { fontSize: 13, color: colors.blue, marginBottom: 8, fontWeight: font.bold },
  previewBtns: { flexDirection: "row", gap: 8 },
  discardBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: radius.md,
    borderWidth: 0.5,
    borderColor: colors.border,
    alignItems: "center",
  },
  discardTxt: { fontSize: 12, color: colors.textSub },
  saveBtn: {
    flex: 2,
    paddingVertical: 8,
    borderRadius: radius.md,
    backgroundColor: colors.red,
    alignItems: "center",
  },
  saveTxt: { fontSize: 12, fontWeight: font.bold, color: "#fff" },

  filterBlock: { marginBottom: 10, gap: 8 },
  filterPickRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" },
  chipRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 2 },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 0.5,
    borderColor: colors.border,
    backgroundColor: colors.bg1,
  },
  filterChipOn: { borderColor: colors.blue, backgroundColor: colors.blueL },
  filterChipTxt: { fontSize: 12, color: colors.textSub, fontWeight: font.bold },
  filterChipTxtOn: { color: colors.blue },
  setPickBtn: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    maxWidth: "100%",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.md,
    borderWidth: 0.5,
    borderColor: colors.border,
    backgroundColor: colors.bg1,
  },
  setPickBtnTxt: { fontSize: 12, color: colors.text, fontWeight: font.bold, flexShrink: 1 },
  setPickBtnCaret: { fontSize: 12, color: colors.textSub },

  setPickOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.9)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  setPickBox: {
    backgroundColor: colors.bg1,
    borderRadius: 16,
    padding: 16,
    width: "100%",
    maxWidth: 400,
    maxHeight: "75%",
  },
  setPickTitle: { fontSize: 16, fontWeight: font.heavy, color: colors.text, marginBottom: 10 },
  setPickSearch: {
    backgroundColor: colors.bg2,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    height: 40,
    fontSize: 14,
    color: colors.text,
    borderWidth: 0.5,
    borderColor: colors.border,
    marginBottom: 10,
  },
  setPickList: { flexGrow: 1, maxHeight: 340 },
  setPickRow: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  setPickRowTxt: { fontSize: 14, color: colors.text },
  setPickRowAll: { color: colors.blue, fontWeight: font.bold },

  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.bg1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    height: 40,
    borderWidth: 0.5,
    borderColor: colors.border,
    marginBottom: 8,
    gap: 8,
  },
  searchIc: { fontSize: 12, color: colors.textMuted },
  searchInp: { flex: 1, fontSize: 14, color: colors.text, paddingVertical: 0 },
  searchX: { fontSize: 12, color: colors.textMuted, paddingHorizontal: 4 },

  catToolbar: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 8,
    paddingHorizontal: spacing.lg,
  },
  catSummaryTxt: {
    flex: 1,
    fontSize: 12,
    fontWeight: font.bold,
    color: colors.textSub,
    lineHeight: 18,
  },
  catViewSeg: {
    flexDirection: "row",
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
  },
  catViewSegBtn: { paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.bg1 },
  catViewSegBtnOn: { backgroundColor: "rgba(59,130,246,0.2)" },
  catViewSegTxt: { fontSize: 12, fontWeight: font.bold, color: colors.textSub },
  catViewSegTxtOn: { color: "#93C5FD" },

  listContent: { paddingBottom: 40 },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: spacing.lg,
    gap: 12,
    backgroundColor: colors.bg1,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  listThumb: {
    width: 44,
    height: 62,
    borderRadius: 7,
    overflow: "hidden",
    backgroundColor: colors.bg2,
    flexShrink: 0,
  },
  listInfo: { flex: 1, minWidth: 0 },
  listName: { fontSize: 14, fontWeight: font.bold, color: colors.text },
  listSet: { fontSize: 11, color: colors.textSub, marginTop: 3, lineHeight: 16 },
  listCond: { fontSize: 10, color: colors.textMuted, marginTop: 3 },
  listPrice: { fontSize: 13, fontWeight: font.bold, color: colors.red, marginTop: 4 },
  listQtyBadge: {
    borderRadius: radius.md,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 36,
  },
  listQtyTxt: { fontSize: 11, fontWeight: font.heavy },
  listArr: { fontSize: 20, color: colors.textMuted, flexShrink: 0 },
  row: { gap: spacing.sm, marginBottom: spacing.sm },

  gridCard: { backgroundColor: colors.bg1, borderRadius: radius.md, overflow: "hidden" },
  imgWrap: { backgroundColor: colors.bg2 },
  cardImg: { width: "100%", height: "100%" },
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
  cardMeta: { padding: 8 },
  cardName: { fontSize: 12, fontWeight: font.bold, color: colors.text },
  cardSub: { fontSize: 10, color: colors.textSub, marginTop: 2 },

  pagination: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  pageBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.bg1,
    borderRadius: radius.md,
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  pageBtnOff: { opacity: 0.3 },
  pageBtnTxt: { fontSize: 13, fontWeight: font.bold, color: colors.text },
  pageNum: { fontSize: 13, color: colors.textSub },

  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40 },
  emptyIc: { fontSize: 48, marginBottom: 16, opacity: 0.3 },
  emptyT: { fontSize: 18, fontWeight: font.bold, color: colors.text, marginBottom: 8 },
  emptyS: { fontSize: 13, color: colors.textSub, textAlign: "center", lineHeight: 20 },

  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.9)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  viewerBox: {
    backgroundColor: colors.bg1,
    borderRadius: 20,
    padding: 16,
    alignItems: "center",
    width: "100%",
    maxWidth: 340,
  },
  viewerImg: { width: 240, height: 336, borderRadius: 12, marginBottom: 12 },
  viewerInfo: { alignItems: "center", marginBottom: 14, gap: 4, width: "100%" },
  viewerName: { fontSize: 18, fontWeight: font.heavy, color: colors.text, textAlign: "center" },
  viewerSub: { fontSize: 12, color: colors.textSub, textAlign: "center" },
  viewerRar: { fontSize: 11, color: colors.textSub },
  viewerPrice: { fontSize: 16, fontWeight: font.bold, color: colors.red, marginTop: 4 },
  viewerBtns: { flexDirection: "row", gap: 10, marginTop: 4 },
  closeBtn: {
    flex: 1,
    backgroundColor: colors.bg2,
    borderRadius: radius.md,
    paddingVertical: 11,
    alignItems: "center",
  },
  closeBtnTxt: { fontSize: 14, fontWeight: font.bold, color: colors.text },
  posBtn: { flex: 1.5, borderRadius: radius.md, overflow: "hidden" },
  posBtnGrad: { paddingVertical: 11, alignItems: "center" },
  posBtnTxt: { fontSize: 14, fontWeight: font.bold, color: "#fff" },
});
