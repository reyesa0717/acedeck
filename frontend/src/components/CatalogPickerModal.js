// Full-screen catalog browser (grid/list + search + pagination) for picking a card into the POS.
import React from "react";
import { Modal, View, Text, TouchableOpacity, TextInput, FlatList } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import CatalogImage from "./CatalogImage";
import Paginator from "./Paginator";
import { colors } from "../utils/theme";

export default function CatalogPickerModal({
  visible,
  onClose,
  catalog,
  catalogQ,
  setCatalogQ,
  filteredCatalog,
  catalogModalViewMode,
  setCatalogModalViewMode,
  catalogGridFlatRef,
  catalogListFlatRef,
  catModalGridRows,
  catPage,
  catPagination,
  catRangeStart,
  catRangeEnd,
  catRangeTotal,
  scanGridLayout,
  scrollCatalogModalTop,
  hydrateCatalogItem,
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
          <Text style={s.modalTtl}>Your Catalog</Text>
          <Text style={s.modalSub2}>{catalog.length + " cards"}</Text>
        </View>
        <View style={s.catSearchWrap}>
          <TextInput
            style={s.catSearchInp}
            placeholder="Search your collection..."
            placeholderTextColor={colors.textMuted}
            value={catalogQ}
            onChangeText={setCatalogQ}
            autoFocus
          />
        </View>
        {catalog.length === 0 ? (
          <Text style={[s.colEmpty, { margin: 30, textAlign: "center" }]}>
            Import a Collectr CSV from the Catalog tab.
          </Text>
        ) : filteredCatalog.length === 0 ? (
          <Text style={[s.colEmpty, { margin: 30, textAlign: "center" }]}>
            {'No cards matching "' + catalogQ + '"'}
          </Text>
        ) : (
          <View style={{ flex: 1 }}>
            <View style={s.scanToolbar}>
              <View style={s.scanSummaryRow}>
                <Text style={s.scanSummaryText} numberOfLines={2}>
                  {String(catRangeStart) +
                    "–" +
                    String(catRangeEnd) +
                    " of " +
                    String(catRangeTotal)}
                </Text>
                <View style={s.scanViewSeg}>
                  <TouchableOpacity
                    onPress={() => setCatalogModalViewMode("grid")}
                    style={[
                      s.scanViewSegBtn,
                      catalogModalViewMode === "grid" && s.scanViewSegBtnOn,
                    ]}
                  >
                    <Text
                      style={[
                        s.scanViewSegTxt,
                        catalogModalViewMode === "grid" && s.scanViewSegTxtOn,
                      ]}
                    >
                      Grid
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setCatalogModalViewMode("list")}
                    style={[
                      s.scanViewSegBtn,
                      catalogModalViewMode === "list" && s.scanViewSegBtnOn,
                    ]}
                  >
                    <Text
                      style={[
                        s.scanViewSegTxt,
                        catalogModalViewMode === "list" && s.scanViewSegTxtOn,
                      ]}
                    >
                      List
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
            {catalogModalViewMode === "grid" ? (
              <FlatList
                ref={catalogGridFlatRef}
                style={{ flex: 1 }}
                data={catModalGridRows}
                keyExtractor={(_, i) => "catgrid" + i}
                contentContainerStyle={{ paddingTop: 8, paddingBottom: 24 }}
                ListFooterComponent={
                  filteredCatalog.length > 0 ? (
                    <Paginator pagination={catPagination} onNavigate={scrollCatalogModalTop} />
                  ) : null
                }
                renderItem={({ item: row }) => {
                  const fg = scanGridLayout;
                  return (
                    <View
                      style={[s.scanGridRow, { paddingHorizontal: fg.pad, marginBottom: fg.gap }]}
                    >
                      {row.map((item) => {
                        const qty = item.quantity ?? 1;
                        const mkt = Number(item.marketPrice) || 0;
                        return (
                          <TouchableOpacity
                            key={item.id}
                            style={{ width: fg.cellW }}
                            onPress={async () => {
                              onClose();
                              setCatalogQ("");
                              await hydrateCatalogItem(item);
                            }}
                            activeOpacity={0.82}
                          >
                            <View style={s.scanGridCard}>
                              <View style={[s.scanGridImgWrap, { height: fg.imgH }]}>
                                <CatalogImage
                                  item={item}
                                  size="low"
                                  style={{ width: "100%", height: "100%" }}
                                  resizeMode="cover"
                                />
                                {qty > 1 ? (
                                  <View style={s.catGridQtyDot}>
                                    <Text style={s.catGridQtyTxt}>{"x" + String(qty)}</Text>
                                  </View>
                                ) : null}
                                {mkt > 0 ? (
                                  <View style={s.catGridPriceDot}>
                                    <Text style={s.catGridPriceTxt}>{"$" + mkt.toFixed(2)}</Text>
                                  </View>
                                ) : null}
                              </View>
                              <Text style={s.scanGridName} numberOfLines={2}>
                                {item.name}
                              </Text>
                              <Text style={s.scanGridMeta} numberOfLines={3}>
                                {item.set
                                  ? item.set + (item.number ? ", #" + item.number : "")
                                  : "—"}
                              </Text>
                              {!!item.condition ? (
                                <Text style={s.scanGridStage} numberOfLines={1}>
                                  {item.condition}
                                </Text>
                              ) : null}
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                      {Array.from({ length: fg.cols - row.length }).map((_, i) => (
                        <View key={"cgp" + i} style={{ width: fg.cellW }} />
                      ))}
                    </View>
                  );
                }}
              />
            ) : (
              <FlatList
                ref={catalogListFlatRef}
                style={{ flex: 1 }}
                data={catPage}
                keyExtractor={(item) => String(item.id)}
                contentContainerStyle={{ paddingBottom: 20 }}
                ItemSeparatorComponent={() => (
                  <View style={{ height: 0.5, backgroundColor: colors.borderLight }} />
                )}
                ListFooterComponent={
                  filteredCatalog.length > 0 ? (
                    <Paginator pagination={catPagination} onNavigate={scrollCatalogModalTop} />
                  ) : null
                }
                renderItem={({ item }) => {
                  const qty = item.quantity ?? 1;
                  const qtyColor = qty <= 0 ? colors.red : qty === 1 ? colors.amber : colors.green;
                  return (
                    <TouchableOpacity
                      style={s.catItem}
                      onPress={async () => {
                        onClose();
                        setCatalogQ("");
                        await hydrateCatalogItem(item);
                      }}
                      activeOpacity={0.75}
                    >
                      <View style={s.catThumb} renderToHardwareTextureAndroid>
                        <CatalogImage
                          item={item}
                          size="low"
                          style={{ width: "100%", height: "100%", borderRadius: 7 }}
                          resizeMode="cover"
                        />
                      </View>
                      <View style={s.catInfo}>
                        <Text style={s.catName}>{item.name}</Text>
                        <Text style={s.catSet}>
                          {item.set ? item.set + (item.number ? " · #" + item.number : "") : "—"}
                        </Text>
                        {!!item.condition && <Text style={s.catCond}>{item.condition}</Text>}
                        {item.marketPrice > 0 && (
                          <Text style={s.catPrice}>{"$" + item.marketPrice.toFixed(2)}</Text>
                        )}
                      </View>
                      <View
                        style={[
                          s.qtyBadge,
                          { backgroundColor: qtyColor + "22", borderColor: qtyColor },
                        ]}
                      >
                        <Text style={[s.qtyTxt, { color: qtyColor }]}>
                          {qty === 0 ? "OUT" : qty < 0 ? String(qty) : "x" + String(qty)}
                        </Text>
                      </View>
                      <Text style={s.catArr}>{">"}</Text>
                    </TouchableOpacity>
                  );
                }}
              />
            )}
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}
