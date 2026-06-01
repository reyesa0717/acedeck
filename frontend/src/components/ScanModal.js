// Search-results picker: grid/list of matches with stage/language/rarity/catalog filters.
import React from "react";
import { Modal, View, Text, TouchableOpacity, ScrollView, FlatList } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { extractCardInfo, extractTCGPrices } from "../../../backend/src/services/scrydex";
import { CardImageWithFallback } from "./PokeImage";
import { colors } from "../utils/theme";

const SCAN_STAGE_OPTIONS = [
  { id: "all", label: "All" },
  { id: "basic", label: "Basic" },
  { id: "stage1", label: "Stage 1" },
  { id: "stage2", label: "Stage 2" },
  { id: "evolve", label: "Evolves" },
];

const SCAN_LANG_OPTIONS = [
  { id: "all", label: "All" },
  { id: "eng", label: "English" },
  { id: "intl", label: "Other" },
];

const SCAN_RARITY_OPTIONS = [
  { id: "all", label: "All rarities" },
  { id: "premium", label: "IR / SIR+" },
];

const SCAN_CATALOG_OPTIONS = [
  { id: "all", label: "All cards" },
  { id: "in", label: "In catalog" },
  { id: "out", label: "Not in catalog" },
];

function formatCardNumberOfDisplay(raw) {
  const s = String(raw || "")
    .trim()
    .replace(/\s/g, "");
  if (!s) return "";
  const m = s.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (!m) return "#" + s;
  const a = parseInt(m[1], 10);
  const b = parseInt(m[2], 10);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return "#" + s;
  return "#" + a + " of " + b;
}

function formatScanSetMetaLine(info) {
  const parts = [];
  if (info.setName) parts.push(info.setName);
  if (info.rarity) parts.push(info.rarity);
  const n = formatCardNumberOfDisplay(info.number);
  if (n) parts.push(n);
  return parts.join(", ");
}

export default function ScanModal({
  visible,
  onClose,
  scanResults,
  filteredScanResults,
  scanQuery,
  scanModalHint,
  scanViewMode,
  setScanViewMode,
  scanFiltersExpanded,
  setScanFiltersExpanded,
  scanActiveFilterCount,
  scanStageFilter,
  setScanStageFilter,
  scanLangFilter,
  setScanLangFilter,
  scanRarityFilter,
  setScanRarityFilter,
  scanCatalogFilter,
  setScanCatalogFilter,
  scanGridRows,
  scanGridLayout,
  scanCatalogLookup,
  cardMatchesScanCatalogFilter,
  pickScanResult,
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
      <SafeAreaView style={s.modalSafe}>
        <View style={s.modalHdr}>
          <TouchableOpacity onPress={onClose}>
            <Text style={s.modalClose}>Close</Text>
          </TouchableOpacity>
          <Text style={s.modalTtl}>Card search</Text>
          <View style={{ width: 56 }} />
        </View>
        {scanResults.length === 0 ? (
          <Text style={s.modalSub}>
            {scanModalHint || "Try a different spelling or the English set name."}
          </Text>
        ) : (
          <>
            <View style={s.scanToolbar}>
              <View style={s.scanSummaryRow}>
                <Text style={s.scanSummaryText} numberOfLines={3}>
                  {filteredScanResults.length} results for: &quot;{scanQuery}&quot;
                </Text>
                <View style={s.scanViewSeg}>
                  <TouchableOpacity
                    onPress={() => setScanViewMode("grid")}
                    style={[s.scanViewSegBtn, scanViewMode === "grid" && s.scanViewSegBtnOn]}
                  >
                    <Text style={[s.scanViewSegTxt, scanViewMode === "grid" && s.scanViewSegTxtOn]}>
                      Grid
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setScanViewMode("list")}
                    style={[s.scanViewSegBtn, scanViewMode === "list" && s.scanViewSegBtnOn]}
                  >
                    <Text style={[s.scanViewSegTxt, scanViewMode === "list" && s.scanViewSegTxtOn]}>
                      List
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
              <View style={s.scanFilterBar}>
                <TouchableOpacity
                  style={s.scanFiltToggleHit}
                  onPress={() => setScanFiltersExpanded((e) => !e)}
                  activeOpacity={0.75}
                >
                  <Text style={s.scanFiltersPill}>
                    {"Filters" +
                      (scanActiveFilterCount > 0 ? " (" + scanActiveFilterCount + ")" : "")}
                  </Text>
                  <Text style={s.scanFiltChev}>{scanFiltersExpanded ? "Hide" : "Show"}</Text>
                </TouchableOpacity>
                {scanFiltersExpanded ? (
                  <TouchableOpacity
                    onPress={() => {
                      setScanStageFilter("all");
                      setScanLangFilter("eng");
                      setScanRarityFilter("all");
                      setScanCatalogFilter("all");
                    }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={s.scanClearTxt}>Clear</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              {scanFiltersExpanded ? (
                <>
                  <Text style={s.scanFiltRowLabel}>Catalog</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={s.scanFiltScroll}
                  >
                    {SCAN_CATALOG_OPTIONS.map((opt) => (
                      <TouchableOpacity
                        key={opt.id}
                        onPress={() => setScanCatalogFilter(opt.id)}
                        style={[s.scanFiltChip, scanCatalogFilter === opt.id && s.scanFiltChipOn]}
                        activeOpacity={0.75}
                      >
                        <Text
                          style={[
                            s.scanFiltChipTxt,
                            scanCatalogFilter === opt.id && s.scanFiltChipTxtOn,
                          ]}
                        >
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  <Text style={s.scanFiltRowLabel}>Language</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={s.scanFiltScroll}
                  >
                    {SCAN_LANG_OPTIONS.map((opt) => (
                      <TouchableOpacity
                        key={opt.id}
                        onPress={() => setScanLangFilter(opt.id)}
                        style={[s.scanFiltChip, scanLangFilter === opt.id && s.scanFiltChipOn]}
                        activeOpacity={0.75}
                      >
                        <Text
                          style={[
                            s.scanFiltChipTxt,
                            scanLangFilter === opt.id && s.scanFiltChipTxtOn,
                          ]}
                        >
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  <Text style={s.scanFiltRowLabel}>Rarity</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={s.scanFiltScroll}
                  >
                    {SCAN_RARITY_OPTIONS.map((opt) => (
                      <TouchableOpacity
                        key={opt.id}
                        onPress={() => setScanRarityFilter(opt.id)}
                        style={[s.scanFiltChip, scanRarityFilter === opt.id && s.scanFiltChipOn]}
                        activeOpacity={0.75}
                      >
                        <Text
                          style={[
                            s.scanFiltChipTxt,
                            scanRarityFilter === opt.id && s.scanFiltChipTxtOn,
                          ]}
                        >
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  <Text style={s.scanFiltRowLabel}>Stage</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={s.scanFiltScroll}
                  >
                    {SCAN_STAGE_OPTIONS.map((opt) => (
                      <TouchableOpacity
                        key={opt.id}
                        onPress={() => setScanStageFilter(opt.id)}
                        style={[s.scanFiltChip, scanStageFilter === opt.id && s.scanFiltChipOn]}
                        activeOpacity={0.75}
                      >
                        <Text
                          style={[
                            s.scanFiltChipTxt,
                            scanStageFilter === opt.id && s.scanFiltChipTxtOn,
                          ]}
                        >
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </>
              ) : null}
            </View>
            {!!scanModalHint && <Text style={s.modalSub}>{scanModalHint}</Text>}
          </>
        )}
        {scanViewMode === "grid" && scanResults.length > 0 ? (
          <FlatList
            key="scan-grid"
            data={scanGridRows}
            keyExtractor={(_, i) => "scanrow" + i}
            contentContainerStyle={{ paddingTop: 8, paddingBottom: 36 }}
            ListEmptyComponent={
              scanResults.length === 0 ? null : (
                <Text
                  style={[
                    s.colEmpty,
                    { marginHorizontal: 24, marginTop: 16, textAlign: "center", lineHeight: 22 },
                  ]}
                >
                  No prints match these filters. Clear filters or pick another option.
                </Text>
              )
            }
            renderItem={({ item: row }) => {
              const fg = scanGridLayout;
              return (
                <View style={[s.scanGridRow, { paddingHorizontal: fg.pad, marginBottom: fg.gap }]}>
                  {row.map((item) => {
                    const info = extractCardInfo(item);
                    const tcg = extractTCGPrices(item);
                    const lang = info.language;
                    const langBadge = {
                      eng: { label: "EN", bg: "rgba(34,197,94,0.92)", color: "#fff" },
                      jap: { label: "JP", bg: "rgba(233,30,99,0.92)", color: "#fff" },
                      ger: { label: "DE", bg: "rgba(251,192,45,0.92)", color: "#111" },
                      fra: { label: "FR", bg: "rgba(25,118,210,0.92)", color: "#fff" },
                      other: { label: "INT", bg: "rgba(142,36,170,0.92)", color: "#fff" },
                    }[lang] || { label: "?", bg: "rgba(80,80,90,0.9)", color: "#fff" };
                    const hasTCG = info.hasTCG;
                    const price = tcg?.market || null;
                    const inYourCatalog = cardMatchesScanCatalogFilter(
                      item,
                      "in",
                      scanCatalogLookup
                    );
                    return (
                      <TouchableOpacity
                        key={item.id}
                        style={{ width: fg.cellW }}
                        onPress={() => pickScanResult(item)}
                        activeOpacity={0.82}
                      >
                        <View style={s.scanGridCard}>
                          <View style={[s.scanGridImgWrap, { height: fg.imgH }]}>
                            <CardImageWithFallback
                              card={item}
                              cardId={item._catalogPwId || item.id}
                              size="low"
                              style={{ width: "100%", height: "100%" }}
                              resizeMode="cover"
                            />
                            <View style={[s.scanGridLangDot, { backgroundColor: langBadge.bg }]}>
                              <Text style={[s.scanGridLangTxt, { color: langBadge.color }]}>
                                {langBadge.label}
                              </Text>
                            </View>
                            {inYourCatalog ? (
                              <View style={s.scanGridYoursDot}>
                                <Text style={s.scanGridYoursTxt}>Own</Text>
                              </View>
                            ) : null}
                          </View>
                          <Text style={s.scanGridName} numberOfLines={2}>
                            {info.name}
                          </Text>
                          <Text style={s.scanGridMeta} numberOfLines={4}>
                            {formatScanSetMetaLine(info)}
                          </Text>
                          {info.stage ? (
                            <Text style={s.scanGridStage} numberOfLines={1}>
                              {info.stage}
                            </Text>
                          ) : null}
                          <Text style={s.scanGridFrom}>From</Text>
                          <Text style={s.scanGridPriceBig}>
                            {price ? "$" + price.toFixed(2) : "—"}
                          </Text>
                          <Text style={s.scanGridMarketRow}>
                            {price
                              ? "Market · $" + price.toFixed(2) + (hasTCG ? " · Scrydex" : "")
                              : "No price yet"}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                  {Array.from({ length: fg.cols - row.length }).map((_, i) => (
                    <View key={"gsp" + i} style={{ width: fg.cellW }} />
                  ))}
                </View>
              );
            }}
          />
        ) : (
          <FlatList
            key="scan-list"
            data={filteredScanResults}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={
              filteredScanResults.length
                ? { paddingBottom: 40 }
                : { flexGrow: 1, paddingBottom: 40 }
            }
            ListEmptyComponent={
              scanResults.length === 0 ? (
                <Text
                  style={[
                    s.colEmpty,
                    { marginHorizontal: 24, marginTop: 16, textAlign: "center", lineHeight: 22 },
                  ]}
                >
                  {scanModalHint || "Try a different spelling or the English set name."}
                </Text>
              ) : (
                <Text
                  style={[
                    s.colEmpty,
                    { marginHorizontal: 24, marginTop: 16, textAlign: "center", lineHeight: 22 },
                  ]}
                >
                  No prints match these filters. Clear filters or pick another option.
                </Text>
              )
            }
            ItemSeparatorComponent={() => (
              <View style={{ height: 0.5, backgroundColor: colors.borderLight }} />
            )}
            renderItem={({ item }) => {
              const info = extractCardInfo(item);
              const tcg = extractTCGPrices(item);
              const lang = info.language;
              const langBadge = {
                eng: { label: "EN", bg: "rgba(34,197,94,0.15)", color: "#22C55E" },
                jap: { label: "JP", bg: "rgba(233,30,99,0.15)", color: "#E91E63" },
                ger: { label: "DE", bg: "rgba(251,192,45,0.15)", color: "#FBC02D" },
                fra: { label: "FR", bg: "rgba(25,118,210,0.15)", color: "#1976D2" },
                other: { label: "INT", bg: "rgba(142,36,170,0.15)", color: "#8E24AA" },
              }[lang] || {
                label: lang?.toUpperCase() || "?",
                bg: "rgba(139,148,158,0.15)",
                color: "#8B949E",
              };
              const hasTCG = info.hasTCG;
              const price = tcg?.market || null;
              const inYourCatalog = cardMatchesScanCatalogFilter(item, "in", scanCatalogLookup);
              return (
                <TouchableOpacity
                  style={s.scanItem}
                  onPress={() => pickScanResult(item)}
                  activeOpacity={0.75}
                >
                  <View style={s.scanThumb} renderToHardwareTextureAndroid>
                    <CardImageWithFallback
                      card={item}
                      cardId={item._catalogPwId || item.id}
                      size="low"
                      style={{ width: "100%", height: "100%" }}
                      resizeMode="cover"
                    />
                  </View>
                  <View style={s.scanInfo}>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        flexWrap: "wrap",
                        gap: 6,
                        marginBottom: 2,
                      }}
                    >
                      <Text style={s.scanName} numberOfLines={1}>
                        {info.name}
                      </Text>
                      <View style={[s.langBadge, { backgroundColor: langBadge.bg }]}>
                        <Text style={[s.langBadgeTxt, { color: langBadge.color }]}>
                          {langBadge.label}
                        </Text>
                      </View>
                      {inYourCatalog ? (
                        <View style={s.catalogTag}>
                          <Text style={s.catalogTagTxt}>Own</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={s.scanListMeta} numberOfLines={3}>
                      {formatScanSetMetaLine(info)}
                    </Text>
                    {info.stage ? (
                      <Text style={s.scanListStage} numberOfLines={1}>
                        {info.stage}
                      </Text>
                    ) : null}
                    <View style={{ flexDirection: "row", gap: 4, marginTop: 4 }}>
                      {hasTCG && (
                        <View style={s.srcBadge}>
                          <Text style={[s.srcBadgeTxt, { color: colors.red }]}>Scrydex</Text>
                        </View>
                      )}
                    </View>
                  </View>
                  <View style={s.scanRight}>
                    <Text style={s.scanListFrom}>From</Text>
                    {price ? (
                      <Text style={s.scanPrice}>{"$" + price.toFixed(2)}</Text>
                    ) : (
                      <Text style={[s.scanPrice, { color: colors.textMuted }]}>{"—"}</Text>
                    )}
                    <Text style={s.scanListMarket}>
                      {price ? "Market · $" + price.toFixed(2) : ""}
                    </Text>
                  </View>
                  <Text style={s.scanArr}>{">"}</Text>
                </TouchableOpacity>
              );
            }}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}
