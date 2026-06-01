// Transaction history + P&L: lists sales/acquisitions with date filters and profit summaries.
import React, { useState, useCallback, useEffect, useMemo, useRef } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  TextInput,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRoute, useNavigation } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import {
  loadTransactions,
  loadAcquisitions,
  deleteTransaction,
  calcStats,
  getInventoryStatus,
} from "../../../backend/src/services/storage";
import { exportTransactionsCSV, exportAcquisitionsCSV } from "../../../backend/src/services/csv";
import { searchCards } from "../../../backend/src/services/scrydex";
import { colors, font, radius, spacing, gradients } from "../utils/theme";
import { useLayoutMetrics } from "../utils/useLayoutMetrics";
import PokeImage from "../components/PokeImage";
import CatalogImage from "../components/CatalogImage";
import Paginator, { usePagination } from "../components/Paginator";

const PAY_COLORS = {
  CA: { bg: "rgba(233,30,99,0.15)", text: "#E91E63" },
  Zelle: { bg: "rgba(255,110,180,0.15)", text: "#FF6EB4" },
  Cash: { bg: "rgba(245,158,11,0.15)", text: "#F59E0B" },
  Venmo: { bg: "rgba(0,140,255,0.15)", text: "#008CFF" },
  PP: { bg: "rgba(0,112,224,0.15)", text: "#0070E0" },
  TR: { bg: "rgba(168,85,247,0.18)", text: "#C4B5FD" },
};
const PAY_LABELS = {
  CA: "Cash App",
  Zelle: "Zelle",
  Cash: "Cash",
  Venmo: "Venmo",
  PP: "PayPal",
  TR: "Trade",
};

// Local calendar YYYY-MM-DD
function localYMD(d) {
  const x = new Date(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const day = String(x.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseLocalYMD(ymd) {
  const [y, mo, da] = String(ymd).split("-").map(Number);
  if (!y || !mo || !da) return new Date(NaN);
  return new Date(y, mo - 1, da, 0, 0, 0, 0);
}

function endLocalYMD(ymd) {
  const [y, mo, da] = String(ymd).split("-").map(Number);
  if (!y || !mo || !da) return new Date(NaN);
  return new Date(y, mo - 1, da, 23, 59, 59, 999);
}

function formatAuditRange(startIso, endIso) {
  if (!startIso) return "";
  const s = parseLocalYMD(startIso);
  const opts = { weekday: "short", month: "short", day: "numeric", year: "numeric" };
  if (!endIso || endIso === startIso) return s.toLocaleDateString(undefined, opts);
  const e = parseLocalYMD(endIso);
  return (
    s.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
    " → " +
    e.toLocaleDateString(undefined, opts)
  );
}

function filterBtnLabel(baseLabel, eventName) {
  const ev = (eventName || "").trim();
  if (!ev) return baseLabel;
  if (!baseLabel || baseLabel === "All time") return ev;
  if (baseLabel.includes(ev)) return baseLabel;
  return baseLabel + " · " + ev;
}

const DATE_PRESETS = [
  { label: "All time", kind: "all" },
  { label: "Today", kind: "single", daysAgo: 0 },
  { label: "Yesterday", kind: "single", daysAgo: 1 },
  { label: "Last 7 days", kind: "range", daysBack: 6 },
  { label: "Last 30 days", kind: "range", daysBack: 29 },
];

function StatBox({ label, value, color }) {
  return (
    <View style={s.stat}>
      <Text style={s.statLbl}>{label}</Text>
      <Text style={[s.statVal, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

export default function HistoryScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const { maxContentWidth } = useLayoutMetrics();

  const [tab, setTab] = useState("transactions");
  const [transactions, setTransactions] = useState([]);
  const [acquisitions, setAcquisitions] = useState([]);
  const [inventory, setInventory] = useState({
    inStock: [],
    empty: [],
    negative: [],
    totalValue: 0,
  });
  const [selected, setSelected] = useState(null);
  const [detailCardId, setDetailCardId] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [invFilter, setInvFilter] = useState("all");

  // Event/date filter
  const [showEventModal, setShowEventModal] = useState(false);
  const [eventName, setEventName] = useState("");
  const [filterDate, setFilterDate] = useState(() => localYMD(new Date()));
  const [filterRangeEnd, setFilterRangeEnd] = useState(null);
  const [filterEventName, setFilterEventName] = useState("");
  const [filterLabel, setFilterLabel] = useState("Today");
  const [customDate, setCustomDate] = useState("");

  const filterModeRef = useRef({ label: "Today", rangeEnd: null });
  useEffect(() => {
    filterModeRef.current = { label: filterLabel, rangeEnd: filterRangeEnd };
  }, [filterLabel, filterRangeEnd]);

  const filteredTxns = useMemo(() => {
    if (!filterDate) return transactions;
    const startT = parseLocalYMD(filterDate).getTime();
    const endY = filterRangeEnd || filterDate;
    const endT = endLocalYMD(endY).getTime();
    return transactions.filter((t) => {
      const x = new Date(t.time).getTime();
      return x >= startT && x <= endT;
    });
  }, [transactions, filterDate, filterRangeEnd]);

  const filteredAcqs = useMemo(() => {
    if (!filterDate) return acquisitions;
    const startT = parseLocalYMD(filterDate).getTime();
    const endY = filterRangeEnd || filterDate;
    const endT = endLocalYMD(endY).getTime();
    return acquisitions.filter((t) => {
      const x = new Date(t.time).getTime();
      return x >= startT && x <= endT;
    });
  }, [acquisitions, filterDate, filterRangeEnd]);

  const txPagination = usePagination(filteredTxns, 20);
  const acqPagination = usePagination(filteredAcqs, 20);
  const invData =
    invFilter === "empty"
      ? inventory.empty || []
      : invFilter === "negative"
        ? inventory.negative || []
        : [...(inventory.inStock || []), ...(inventory.empty || []), ...(inventory.negative || [])];
  const invPagination = usePagination(invData, 20);

  const filteredStats = calcStats(filteredTxns);
  const filteredTrades = useMemo(() => filteredTxns.filter((t) => t.pay === "TR"), [filteredTxns]);
  const tradesPagination = usePagination(filteredTrades, 20);

  const calendarInUseLine = useMemo(() => {
    if (!filterDate) {
      const todayPretty = parseLocalYMD(localYMD(new Date())).toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      });
      return {
        title: "All dates",
        detail: "Lock a day or range in the calendar to audit it. Today is " + todayPretty + ".",
      };
    }
    const title = formatAuditRange(filterDate, filterRangeEnd);
    const isRange = !!(filterRangeEnd && filterRangeEnd !== filterDate);
    return {
      title,
      detail: isRange
        ? "Totals and rows below match this date range (for audit later)."
        : "Totals and rows below match this calendar day (for audit later).",
    };
  }, [filterDate, filterRangeEnd]);

  const pagination =
    tab === "acquisitions" ? acqPagination : tab === "trades" ? tradesPagination : txPagination;
  const displayList =
    tab === "acquisitions" ? filteredAcqs : tab === "trades" ? filteredTrades : filteredTxns;

  const historyListRef = useRef(null);
  const invScrollRef = useRef(null);
  const scrollHistoryListTop = useCallback(() => {
    historyListRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, []);
  const scrollInvTop = useCallback(() => {
    invScrollRef.current?.scrollTo({ y: 0, animated: true });
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadTransactions()
        .then(setTransactions)
        .catch(() => setTransactions([]));
      loadAcquisitions()
        .then(setAcquisitions)
        .catch(() => setAcquisitions([]));
      getInventoryStatus()
        .then(setInventory)
        .catch(() => {});
      const { label, rangeEnd } = filterModeRef.current;
      if (label === "Today" && !rangeEnd) {
        const today = localYMD(new Date());
        setFilterDate(today);
      }
    }, [])
  );

  // Account tab
  useEffect(() => {
    if (!route.params?.openAuditPicker) return;
    setShowEventModal(true);
    setTab("transactions");
    navigation.setParams({ openAuditPicker: undefined });
  }, [route.params?.openAuditPicker, navigation]);

  const openDetail = async (txn) => {
    setSelected(txn);
    setDetailCardId(txn.cardId || null);
    if (!txn.cardId) {
      try {
        const r = await searchCards(txn.name, 1);
        if (r?.length) setDetailCardId(r[0].id);
      } catch {}
    }
  };

  const closeDetail = () => {
    setSelected(null);
    setDetailCardId(null);
  };

  const handleExport = async () => {
    if (tab === "inventory") return;
    const data = tab === "acquisitions" ? acquisitions : transactions;
    if (!data.length) {
      Alert.alert("Nothing to export");
      return;
    }
    setExporting(true);
    try {
      if (tab === "acquisitions") await exportAcquisitionsCSV(acquisitions);
      else await exportTransactionsCSV(transactions);
    } catch (e) {
      Alert.alert("Export failed", e.message);
    } finally {
      setExporting(false);
    }
  };

  const handleDelete = (id) => {
    const row = selected?.id === id ? selected : null;
    const explain =
      row?.dir === "out"
        ? "This removes the sale and puts 1 copy back in your catalog."
        : row?.dir === "in"
          ? "This removes the acquisition log and lowers catalog quantity by 1"
          : "This cannot be undone.";
    Alert.alert("Delete this record?", explain, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            const updated = await deleteTransaction(id);
            setTransactions(updated);
            loadAcquisitions()
              .then(setAcquisitions)
              .catch(() => setAcquisitions([]));
            getInventoryStatus()
              .then(setInventory)
              .catch(() => {});
            if (selected?.id === id) closeDetail();
          } catch (e) {
            Alert.alert("Error", e.message);
          }
        },
      },
    ]);
  };

  // DETAIL VIEW
  const renderDetail = () => {
    const t = selected;
    const d = new Date(t.time);
    const isOut = t.dir === "out";
    const isTrade = t.pay === "TR";
    const pc = PAY_COLORS[t.pay] || { bg: colors.bg1, text: colors.textSub };
    const rows = [
      { label: "Payment", value: PAY_LABELS[t.pay] || String(t.pay || "—"), isPayment: true },
      { label: "Condition", value: String(t.condition || "—") },
      { label: "Direction", value: isOut ? "Sold" : "Acquired" },
      { label: "TCGPlayer", value: t.marketPrice ? "$" + Number(t.marketPrice).toFixed(2) : "—" },
      ...(Number(t.cmPrice) > 0
        ? [{ label: "CardMarket", value: "$" + Number(t.cmPrice).toFixed(2) }]
        : []),
      {
        label: "Date",
        value: d.toLocaleDateString([], {
          weekday: "short",
          month: "short",
          day: "numeric",
          year: "numeric",
        }),
      },
      { label: "Time", value: d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) },
      { label: "Rarity", value: String(t.rarity || "—") },
      { label: "Set", value: String(t.set || "—") },
    ];

    return (
      <SafeAreaView style={s.safe} edges={["top"]}>
        <View style={s.detailHeader}>
          <TouchableOpacity onPress={closeDetail}>
            <Text style={s.backBtn}>{"< History"}</Text>
          </TouchableOpacity>
          <Text style={s.detailTitle}>
            {isTrade ? "Trade detail" : isOut ? "Sale Detail" : "Acquisition"}
          </Text>
          <TouchableOpacity onPress={() => handleDelete(t.id)}>
            <Text style={s.deleteBtn}>{"Delete"}</Text>
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={s.detailContent}>
          <View style={s.detailImgWrap}>
            <PokeImage cardId={detailCardId} size="high" style={s.detailImg} resizeMode="contain" />
          </View>
          <Text style={s.detailName}>{String(t.name || "Unknown")}</Text>
          <Text style={s.detailSetTxt}>{String(t.set || "—")}</Text>
          <View style={s.priceBadgeWrap}>
            <View style={s.priceBadge}>
              <Text
                style={[
                  s.priceBadgeLbl,
                  { color: isTrade ? "#C4B5FD" : isOut ? colors.red : colors.green },
                ]}
              >
                {isTrade ? "TRADE" : isOut ? "SOLD FOR" : "ACQUIRED FOR"}
              </Text>
              <Text style={s.priceBadgeVal}>
                {isTrade && (!Number(t.amount) || Number(t.amount) <= 0)
                  ? "No cash"
                  : "$" + Number(t.amount || 0).toFixed(2) + (isTrade ? " ref." : "")}
              </Text>
            </View>
          </View>
          {isTrade && (
            <View style={s.detailTradeCard}>
              <Text style={s.detailTradeCardLbl}>
                {isOut
                  ? "You gave this card · received in return"
                  : "You acquired this card · traded away / notes"}
              </Text>
              <Text style={s.detailTradeCardBody}>
                {String(t.tradeReceived || "").trim()
                  ? String(t.tradeReceived).trim()
                  : "Nothing was written in the trade note on POS."}
              </Text>
            </View>
          )}
          <View style={s.detailBox}>
            {rows.map((row, i) => (
              <View key={row.label} style={[s.detailRow, i === rows.length - 1 && s.detailRowLast]}>
                <Text style={s.detailRowLbl}>{row.label}</Text>
                {row.isPayment ? (
                  <View style={[s.payBadge, { backgroundColor: pc.bg }]}>
                    <Text style={[s.payBadgeTxt, { color: pc.text }]}>{row.value}</Text>
                  </View>
                ) : (
                  <Text style={s.detailRowVal}>{row.value}</Text>
                )}
              </View>
            ))}
          </View>
          {!!t.desc && (
            <View style={s.detailBox}>
              <View style={[s.detailRow, s.detailRowLast, s.detailRowCol]}>
                <Text style={s.detailRowLbl}>{"Description"}</Text>
                <Text style={s.detailDesc}>{'"' + String(t.desc) + '"'}</Text>
              </View>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  };

  // INVENTORY ITEM
  const renderInvItem = (card, status) => {
    const qty = Number(card.quantity ?? 1);
    const col =
      status === "negative" ? colors.red : status === "empty" ? colors.amber : colors.green;
    const lbl =
      status === "negative"
        ? String(qty) + " oversold"
        : status === "empty"
          ? "OUT"
          : "x" + String(qty);
    return (
      <View key={String(card.id)} style={s.invRow}>
        <View style={s.invThumb} renderToHardwareTextureAndroid>
          <CatalogImage item={card} size="low" style={s.invThumbImg} resizeMode="cover" />
        </View>
        <View style={s.invInfo}>
          <Text style={s.invName} numberOfLines={1}>
            {String(card.name || "Unknown")}
          </Text>
          <Text style={s.invSet} numberOfLines={1}>
            {card.set ? (card.number ? card.set + " · #" + card.number : card.set) : "—"}
          </Text>
          {!!card.rarity && <Text style={s.invRarity}>{String(card.rarity)}</Text>}
        </View>
        <View style={s.invRight}>
          {Number(card.marketPrice) > 0 && (
            <Text style={s.invPrice}>{"$" + Number(card.marketPrice).toFixed(2)}</Text>
          )}
          {Number(card.cmPrice) > 0 && (
            <Text style={[s.invPrice, { fontSize: 10, color: colors.textSub }]}>
              {"$" + Number(card.cmPrice).toFixed(2)}
            </Text>
          )}
          <View style={[s.invBadge, { backgroundColor: col + "22", borderColor: col }]}>
            <Text style={[s.invBadgeTxt, { color: col }]}>{lbl}</Text>
          </View>
        </View>
      </View>
    );
  };

  // INVENTORY VIEW
  const renderInventory = () => {
    const { pageData: invPage } = invPagination;
    return (
      <ScrollView
        ref={invScrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 40 }}
      >
        <View style={s.invSummary}>
          <View style={s.invStat}>
            <Text style={s.invStatLbl}>{"In stock"}</Text>
            <Text style={[s.invStatVal, { color: colors.green }]}>
              {String(inventory.inStock.length)}
            </Text>
          </View>
          <View style={s.invStat}>
            <Text style={s.invStatLbl}>{"Sold out"}</Text>
            <Text style={[s.invStatVal, { color: colors.amber }]}>
              {String(inventory.empty.length)}
            </Text>
          </View>
          <View style={s.invStat}>
            <Text style={s.invStatLbl}>{"Oversold"}</Text>
            <Text style={[s.invStatVal, { color: colors.red }]}>
              {String(inventory.negative.length)}
            </Text>
          </View>
          <View style={s.invStat}>
            <Text style={s.invStatLbl}>{"Value"}</Text>
            <Text style={[s.invStatVal, { color: colors.pink }]}>
              {"$" + inventory.totalValue.toFixed(0)}
            </Text>
          </View>
        </View>
        <View style={s.invFilters}>
          {[
            { key: "all", label: "All" },
            { key: "empty", label: "Sold Out (" + String(inventory.empty.length) + ")" },
            { key: "negative", label: "Oversold (" + String(inventory.negative.length) + ")" },
          ].map((f) => (
            <TouchableOpacity
              key={f.key}
              style={[s.filterPill, invFilter === f.key && s.filterOn]}
              onPress={() => setInvFilter(f.key)}
            >
              <Text style={[s.filterTxt, invFilter === f.key && s.filterTxtOn]}>{f.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {invPage.length > 0 ? (
          <>
            {invPage.map((c) => {
              const status = (inventory.negative || []).some((n) => String(n.id) === String(c.id))
                ? "negative"
                : (inventory.empty || []).some((e) => String(e.id) === String(c.id))
                  ? "empty"
                  : "inStock";
              return renderInvItem(c, status);
            })}
            <Paginator pagination={invPagination} onNavigate={scrollInvTop} />
          </>
        ) : (
          <View style={s.empty}>
            <Text style={s.emptyIc}>{"📦"}</Text>
            <Text style={s.emptyT}>{"No inventory yet"}</Text>
            <Text style={s.emptyS}>{"Import a CSV from the Catalog tab."}</Text>
          </View>
        )}
      </ScrollView>
    );
  };

  // TRANSACTION ROW
  const renderItem = ({ item: t }) => {
    const d = new Date(t.time);
    const date = d.toLocaleDateString([], { month: "short", day: "numeric" });
    const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const isOut = t.dir === "out";
    const isTr = t.pay === "TR";
    const pc = PAY_COLORS[t.pay] || { bg: colors.bg1, text: colors.textSub };
    const recv = String(t.tradeReceived || "").trim();
    return (
      <TouchableOpacity
        style={[s.txRow, isTr && s.txRowTrade]}
        onPress={() => openDetail(t)}
        activeOpacity={0.75}
      >
        <View style={s.txThumb} renderToHardwareTextureAndroid>
          <PokeImage cardId={t.cardId || null} size="low" style={s.txThumbImg} resizeMode="cover" />
        </View>
        <View style={s.txLeft}>
          <Text style={s.txName} numberOfLines={1}>
            {String(t.name || "Unknown")}
          </Text>
          <Text style={s.txSet} numberOfLines={1}>
            {t.set ? (t.rarity ? t.set + " · " + t.rarity : t.set) : "—"}
          </Text>
          <View style={s.txMeta}>
            <Text style={s.txTime}>{date + " · " + time}</Text>
            {!!t.condition && (
              <View style={s.condChip}>
                <Text style={s.condChipTxt}>{String(t.condition)}</Text>
              </View>
            )}
            <View style={[s.payChip, { backgroundColor: pc.bg }]}>
              <Text style={[s.payChipTxt, { color: pc.text }]}>
                {PAY_LABELS[t.pay] || String(t.pay || "—")}
              </Text>
            </View>
          </View>
          {isTr ? (
            <View style={s.tradeRecvBox}>
              <Text style={s.tradeRecvLbl}>{isOut ? "Received" : "Gave / notes"}</Text>
              <Text style={s.tradeRecvTxt} numberOfLines={6}>
                {recv || "No trade details saved — use “Received in trade” on POS when logging."}
              </Text>
            </View>
          ) : (
            !!t.desc && (
              <Text style={s.txDesc} numberOfLines={2}>
                {'"' + String(t.desc) + '"'}
              </Text>
            )
          )}
        </View>
        <View style={s.txRight}>
          <Text style={[s.txAmt, isOut ? s.txOut : s.txIn]}>
            {t.pay === "TR"
              ? Number(t.amount) > 0
                ? "ref $" + Number(t.amount).toFixed(2)
                : "Trade"
              : (isOut ? "-" : "+") + "$" + Number(t.amount || 0).toFixed(2)}
          </Text>
          <Text style={s.txDir}>{isOut ? "sold" : "acquired"}</Text>
        </View>
        <Text style={s.txArrow}>{">"}</Text>
      </TouchableOpacity>
    );
  };

  // MAIN RENDER
  if (selected) return renderDetail();

  const clearDateFilter = () => {
    setFilterDate(null);
    setFilterRangeEnd(null);
    setFilterEventName("");
    setFilterLabel("All time");
  };

  const applyPreset = (p) => {
    if (p.kind === "all") {
      clearDateFilter();
    } else if (p.kind === "range") {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - p.daysBack);
      setFilterDate(localYMD(start));
      setFilterRangeEnd(localYMD(end));
      setFilterEventName("");
      setFilterLabel(p.label);
    } else if (p.kind === "single") {
      const d = new Date();
      d.setDate(d.getDate() - p.daysAgo);
      setFilterDate(localYMD(d));
      setFilterRangeEnd(null);
      setFilterEventName("");
      setFilterLabel(p.label);
    }
    setShowEventModal(false);
  };

  const applyCustomDate = () => {
    const parts = customDate.trim().split("/");
    let d = null;
    if (parts.length === 3 && parts[2].length === 4) {
      d = new Date(parseInt(parts[2], 10), parseInt(parts[0], 10) - 1, parseInt(parts[1], 10));
    } else {
      d = new Date(customDate.trim());
    }
    if (isNaN(d.getTime())) {
      Alert.alert("Invalid date", "Enter a date like 4/21/2026");
      return;
    }
    const iso = localYMD(d);
    setFilterDate(iso);
    setFilterRangeEnd(null);
    setFilterEventName(eventName.trim());
    const short = d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
    setFilterLabel(eventName.trim() ? short + " · " + eventName.trim() : short);
    setShowEventModal(false);
  };

  // Tag the current filter with an event/show name
  const saveEventTagOnly = () => {
    if (!filterDate) {
      Alert.alert(
        "Pick a period first",
        "Choose a date or range above, then save an event name for your audit."
      );
      return;
    }
    const ev = eventName.trim();
    setFilterEventName(ev);
    if (ev && !filterLabel.includes(ev)) {
      setFilterLabel(filterLabel + " · " + ev);
    }
    setShowEventModal(false);
  };

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      {/* Background gradient */}
      <LinearGradient
        colors={gradients.bg}
        style={StyleSheet.absoluteFillObject}
        start={gradients.bgStart}
        end={gradients.bgEnd}
      />

      {/* EVENT FILTER */}
      <Modal
        visible={showEventModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowEventModal(false)}
      >
        <TouchableOpacity
          style={s.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowEventModal(false)}
        >
          <View style={s.eventModal}>
            <Text style={s.eventModalTitle}>{"Filter by date & event"}</Text>
            <Text style={s.eventModalSub}>
              {
                "Audit everything sold in that period. Name a show or event so you remember what the day was."
              }
            </Text>

            {/* Presets */}
            <View style={s.presets}>
              {DATE_PRESETS.map((p) => (
                <TouchableOpacity
                  key={p.label}
                  style={[
                    s.presetBtn,
                    (p.kind === "all"
                      ? !filterDate
                      : filterLabel === p.label || filterLabel.startsWith(p.label + " ·")) &&
                      s.presetBtnOn,
                  ]}
                  onPress={() => applyPreset(p)}
                >
                  <Text
                    style={[
                      s.presetTxt,
                      (p.kind === "all"
                        ? !filterDate
                        : filterLabel === p.label || filterLabel.startsWith(p.label + " ·")) &&
                        s.presetTxtOn,
                    ]}
                  >
                    {p.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={s.divider} />

            {/* Custom date with optional event name */}
            <Text style={s.eventModalLabel}>{"Custom day"}</Text>
            <TextInput
              style={s.eventInput}
              placeholder="Date — e.g. 4/21/2026"
              placeholderTextColor={colors.textMuted}
              value={customDate}
              onChangeText={setCustomDate}
              keyboardType="numbers-and-punctuation"
            />
            <TextInput
              style={[s.eventInput, { marginTop: 8 }]}
              placeholder="Event / show (optional) — e.g. HTOWN CARD SHOW"
              placeholderTextColor={colors.textMuted}
              value={eventName}
              onChangeText={setEventName}
            />
            <TouchableOpacity style={s.applyBtn} onPress={applyCustomDate}>
              <LinearGradient
                colors={[gradients.primary[0], gradients.primary[1]]}
                style={s.applyBtnGrad}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Text style={s.applyBtnTxt}>{"Apply date & event"}</Text>
              </LinearGradient>
            </TouchableOpacity>

            {!!filterDate && (
              <>
                <View style={s.divider} />
                <Text style={s.eventModalLabel}>{"Tag current filter"}</Text>
                <Text style={s.eventModalHint}>
                  {
                    "Already filtered? Enter the show name and save — it appears in the audit card and calendar."
                  }
                </Text>
                <TouchableOpacity style={s.tagBtn} onPress={saveEventTagOnly}>
                  <Text style={s.tagBtnTxt}>{"Save event name only"}</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      <View style={s.tabletCenter}>
        <View style={[s.tabletInner, { maxWidth: maxContentWidth }]}>
          {/* HEADER */}
          <View style={s.topbar}>
            <View style={{ flex: 1 }}>
              <Text style={s.pageTitle}>{"History"}</Text>
              <Text style={s.pageSub}>{"Tap any row to view details"}</Text>
            </View>
            <TouchableOpacity style={s.filterBtn} onPress={() => setShowEventModal(true)}>
              <LinearGradient
                colors={filterDate ? gradients.primary : ["#111119", "#18181F"]}
                style={s.filterBtnGrad}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Text style={s.filterIc}>{"📅"}</Text>
                <Text style={s.filterLbl} numberOfLines={1}>
                  {filterBtnLabel(filterLabel, filterEventName)}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>

          <View style={s.calendarBanner}>
            <Text style={s.calendarBannerLbl}>{"Calendar in use"}</Text>
            <Text style={s.calendarBannerDate}>{calendarInUseLine.title}</Text>
            <Text style={s.calendarBannerHint}>{calendarInUseLine.detail}</Text>
          </View>

          {/* STATS — shows filtered numbers when a date is active */}
          <View style={s.statsRow}>
            <View style={s.stat}>
              <Text style={s.statLbl}>{"Revenue"}</Text>
              <Text style={[s.statVal, { color: colors.red }]}>
                {"$" + filteredStats.revenue.toFixed(2)}
              </Text>
            </View>
            <View style={s.stat}>
              <Text style={s.statLbl}>{"Spent"}</Text>
              <Text style={[s.statVal, { color: colors.blue }]}>
                {"$" + filteredStats.spent.toFixed(2)}
              </Text>
            </View>
            <View style={s.stat}>
              <Text style={s.statLbl}>{"Sold"}</Text>
              <Text style={s.statVal}>{String(filteredStats.soldCount)}</Text>
            </View>
            <View style={s.stat}>
              <Text style={s.statLbl}>{"Acquired"}</Text>
              <Text style={s.statVal}>{String(filteredAcqs.length)}</Text>
            </View>
          </View>
          {filteredTrades.length > 0 && (
            <View style={s.tradeSummaryCard}>
              <Text style={s.tradeSummaryTitle}>
                {"Trades (" + String(filteredTrades.length) + ") — cash revenue excludes these"}
              </Text>
              <Text style={s.tradeSummarySub}>
                {
                  "Each line shows the card in the log and what you typed. Open the Trades tab for the full list."
                }
              </Text>
              {filteredTrades.slice(0, 6).map((tr) => (
                <View key={String(tr.id)} style={s.tradeSummaryRow}>
                  <Text style={s.tradeSummaryRowHdr} numberOfLines={1}>
                    {(tr.dir === "out" ? "↓ " : "↑ ") + String(tr.name || "Card")}
                  </Text>
                  <Text style={s.tradeSummaryRowBody} numberOfLines={4}>
                    {String(tr.tradeReceived || "").trim()
                      ? String(tr.tradeReceived).trim()
                      : "— No counterparty note —"}
                  </Text>
                </View>
              ))}
              {filteredTrades.length > 6 && (
                <Text style={s.tradeSummaryMore}>
                  {"+" + String(filteredTrades.length - 6) + " more — see Trades tab"}
                </Text>
              )}
            </View>
          )}

          {!!filterDate && (
            <View style={s.auditCard}>
              <Text style={s.auditTitle}>{"Period audit"}</Text>
              <Text style={s.auditRange}>{formatAuditRange(filterDate, filterRangeEnd)}</Text>
              {!!filterEventName.trim() && (
                <Text style={s.auditEvent}>{"Event · " + filterEventName.trim()}</Text>
              )}
              <View style={s.auditGrid}>
                <View style={s.auditCell}>
                  <Text style={s.auditCellLbl}>{"Sold (out)"}</Text>
                  <Text style={s.auditCellVal}>{String(filteredStats.soldCount)}</Text>
                </View>
                <View style={s.auditCell}>
                  <Text style={s.auditCellLbl}>{"Cash revenue"}</Text>
                  <Text style={[s.auditCellVal, { color: colors.red }]}>
                    {"$" + filteredStats.revenue.toFixed(2)}
                  </Text>
                </View>
                <View style={s.auditCell}>
                  <Text style={s.auditCellLbl}>{"Trades"}</Text>
                  <Text style={s.auditCellVal}>{String(filteredStats.tradeCount)}</Text>
                </View>
                <View style={s.auditCell}>
                  <Text style={s.auditCellLbl}>{"Acquired"}</Text>
                  <Text style={s.auditCellVal}>{String(filteredAcqs.length)}</Text>
                </View>
              </View>
              <Text style={s.auditFoot}>
                {"Open Sales to scroll every line item in this window. Revenue excludes trades."}
              </Text>
            </View>
          )}

          {tab !== "inventory" && (
            <TouchableOpacity style={s.exportBtn} onPress={handleExport} disabled={exporting}>
              <LinearGradient
                colors={[gradients.primary[0], gradients.primary[1]]}
                style={s.exportBtnGrad}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Text style={s.exportBtnTxt}>{exporting ? "Exporting..." : "Export CSV"}</Text>
              </LinearGradient>
            </TouchableOpacity>
          )}

          <View style={s.tabs}>
            <TouchableOpacity
              style={[s.tab, tab === "transactions" && s.tabOn]}
              onPress={() => setTab("transactions")}
            >
              <Text style={[s.tabTxt, tab === "transactions" && s.tabTxtOn]} numberOfLines={1}>
                {"Sales (" + String(filteredTxns.length) + ")"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.tab, tab === "trades" && s.tabOn]}
              onPress={() => setTab("trades")}
            >
              <Text style={[s.tabTxt, tab === "trades" && s.tabTxtOn]} numberOfLines={1}>
                {"Trades (" + String(filteredTrades.length) + ")"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.tab, tab === "acquisitions" && s.tabOn]}
              onPress={() => setTab("acquisitions")}
            >
              <Text style={[s.tabTxt, tab === "acquisitions" && s.tabTxtOn]} numberOfLines={1}>
                {"Acq (" + String(filteredAcqs.length) + ")"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.tab, tab === "inventory" && s.tabOn]}
              onPress={() => setTab("inventory")}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Text style={[s.tabTxt, tab === "inventory" && s.tabTxtOn]}>{"Inventory"}</Text>
                {inventory.negative.length > 0 && (
                  <View style={s.alertDot}>
                    <Text style={s.alertDotTxt}>{"!"}</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          </View>

          {tab === "inventory" ? (
            renderInventory()
          ) : (
            <FlatList
              ref={historyListRef}
              data={pagination.pageData}
              keyExtractor={(item) => String(item.id)}
              contentContainerStyle={s.list}
              renderItem={renderItem}
              removeClippedSubviews
              maxToRenderPerBatch={10}
              windowSize={5}
              ItemSeparatorComponent={() => <View style={s.sep} />}
              ListFooterComponent={
                displayList.length > 0 ? (
                  <Paginator pagination={pagination} onNavigate={scrollHistoryListTop} />
                ) : null
              }
              ListEmptyComponent={
                <View style={s.empty}>
                  <Text style={s.emptyIc}>{"📋"}</Text>
                  <Text style={s.emptyT}>
                    {filterDate
                      ? "No records for " + filterBtnLabel(filterLabel, filterEventName)
                      : "No " +
                        (tab === "transactions"
                          ? "sales"
                          : tab === "trades"
                            ? "trades"
                            : tab === "acquisitions"
                              ? "acquisitions"
                              : "") +
                        " yet"}
                  </Text>
                  <Text style={s.emptyS}>
                    {filterDate
                      ? "Try another range or tap All time."
                      : tab === "trades"
                        ? "Log a trade on POS (payment = Trade) and describe what you received."
                        : "Record a sale on the POS tab."}
                  </Text>
                  {!!filterDate && (
                    <TouchableOpacity style={s.clearFilterBtn} onPress={clearDateFilter}>
                      <Text style={s.clearFilterTxt}>{"Clear filter"}</Text>
                    </TouchableOpacity>
                  )}
                </View>
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
  topbar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    gap: 10,
  },
  pageTitle: { fontSize: 22, fontWeight: font.heavy, color: colors.text },
  pageSub: { fontSize: 12, color: colors.textSub, marginTop: 2 },

  filterBtn: { flexShrink: 0 },
  filterBtnGrad: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.full,
  },
  filterIc: { fontSize: 13 },
  filterLbl: { fontSize: 12, fontWeight: font.bold, color: "#fff", maxWidth: 120 },

  calendarBanner: {
    marginHorizontal: spacing.lg,
    marginBottom: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    backgroundColor: colors.bg1,
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  calendarBannerLbl: {
    fontSize: 10,
    fontWeight: font.heavy,
    color: colors.textMuted,
    letterSpacing: 0.06,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  calendarBannerDate: { fontSize: 15, fontWeight: font.bold, color: colors.text },
  calendarBannerHint: { fontSize: 11, color: colors.textSub, marginTop: 4, lineHeight: 16 },

  statsRow: { flexDirection: "row", gap: 8, paddingHorizontal: spacing.lg, marginBottom: 8 },
  tradeSummaryCard: {
    marginHorizontal: spacing.lg,
    marginBottom: 12,
    padding: 12,
    borderRadius: radius.lg,
    backgroundColor: "rgba(168,85,247,0.08)",
    borderWidth: 0.5,
    borderColor: "rgba(196,181,253,0.35)",
  },
  tradeSummaryTitle: { fontSize: 13, fontWeight: font.heavy, color: "#E9D5FF", marginBottom: 4 },
  tradeSummarySub: { fontSize: 11, color: colors.textSub, lineHeight: 16, marginBottom: 10 },
  tradeSummaryRow: {
    marginBottom: 10,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  tradeSummaryRowHdr: { fontSize: 12, fontWeight: font.bold, color: colors.text, marginBottom: 4 },
  tradeSummaryRowBody: { fontSize: 12, color: colors.textSub, lineHeight: 18 },
  tradeSummaryMore: { fontSize: 11, color: colors.textMuted, fontStyle: "italic", marginTop: 2 },
  stat: { flex: 1, backgroundColor: colors.bg1, borderRadius: radius.md, padding: 10 },
  statLbl: { fontSize: 9, color: colors.textSub, marginBottom: 3 },
  statVal: { fontSize: 15, fontWeight: font.heavy, color: colors.text },

  exportBtn: {
    marginHorizontal: spacing.lg,
    marginBottom: 8,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  exportBtnGrad: { padding: 11, alignItems: "center" },
  exportBtnTxt: { fontSize: 13, fontWeight: font.bold, color: "#fff" },

  tabs: {
    flexDirection: "row",
    marginHorizontal: spacing.lg,
    backgroundColor: colors.bg1,
    borderRadius: radius.md,
    padding: 3,
    marginBottom: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 7,
    paddingHorizontal: 2,
    borderRadius: radius.md - 2,
    alignItems: "center",
    justifyContent: "center",
  },
  tabOn: { backgroundColor: colors.bg2 },
  tabTxt: { fontSize: 10, fontWeight: font.medium, color: colors.textSub },
  tabTxtOn: { color: colors.text },
  alertDot: {
    backgroundColor: colors.red,
    borderRadius: 9,
    width: 14,
    height: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  alertDotTxt: { fontSize: 9, fontWeight: font.heavy, color: "#fff" },

  list: { paddingHorizontal: spacing.lg, paddingBottom: 20 },
  sep: { height: 0.5, backgroundColor: colors.borderLight },

  txRow: { flexDirection: "row", alignItems: "center", paddingVertical: 11, gap: 10 },
  txRowTrade: { alignItems: "flex-start" },
  tradeRecvBox: {
    marginTop: 8,
    padding: 8,
    borderRadius: radius.md,
    backgroundColor: "rgba(168,85,247,0.10)",
    borderWidth: 0.5,
    borderColor: "rgba(196,181,253,0.25)",
  },
  tradeRecvLbl: {
    fontSize: 9,
    fontWeight: font.heavy,
    color: "#C4B5FD",
    textTransform: "uppercase",
    letterSpacing: 0.06,
    marginBottom: 4,
  },
  tradeRecvTxt: { fontSize: 12, color: colors.text, lineHeight: 17 },
  txThumb: {
    width: 36,
    height: 50,
    borderRadius: 7,
    overflow: "hidden",
    backgroundColor: colors.bg1,
    flexShrink: 0,
  },
  txThumbImg: { width: "100%", height: "100%" },
  txLeft: { flex: 1, minWidth: 0 },
  txName: { fontSize: 13, fontWeight: font.bold, color: colors.text },
  txSet: { fontSize: 10, color: colors.textSub, marginTop: 2 },
  txMeta: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 4, flexWrap: "wrap" },
  txTime: { fontSize: 9, color: colors.textMuted },
  condChip: {
    backgroundColor: colors.redL,
    borderRadius: radius.full,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  condChipTxt: { fontSize: 9, fontWeight: font.medium, color: colors.red },
  payChip: { borderRadius: radius.full, paddingHorizontal: 7, paddingVertical: 2 },
  payChipTxt: { fontSize: 9, fontWeight: font.bold },
  txDesc: { fontSize: 10, color: colors.textMuted, fontStyle: "italic", marginTop: 3 },
  txRight: { alignItems: "flex-end", flexShrink: 0 },
  txAmt: { fontSize: 14, fontWeight: font.bold },
  txOut: { color: colors.red },
  txIn: { color: colors.green },
  txDir: { fontSize: 9, color: colors.textMuted, marginTop: 2 },
  txArrow: { fontSize: 18, color: colors.textMuted, flexShrink: 0 },

  empty: { alignItems: "center", paddingVertical: 60, paddingHorizontal: 40 },
  emptyIc: { fontSize: 40, marginBottom: 12, opacity: 0.25 },
  emptyT: { fontSize: 16, fontWeight: font.bold, color: colors.text, marginBottom: 8 },
  emptyS: { fontSize: 13, color: colors.textSub, textAlign: "center", lineHeight: 20 },
  clearFilterBtn: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: colors.bg1,
    borderRadius: radius.md,
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  clearFilterTxt: { fontSize: 13, color: colors.textSub },

  // Event filter modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  eventModal: {
    backgroundColor: colors.bg1,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  eventModalTitle: { fontSize: 18, fontWeight: font.heavy, color: colors.text, marginBottom: 4 },
  eventModalSub: { fontSize: 13, color: colors.textSub, marginBottom: 20 },
  eventModalLabel: {
    fontSize: 12,
    fontWeight: font.bold,
    color: colors.textSub,
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.05,
  },
  presets: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 20 },
  presetBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: colors.bg2,
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  presetBtnOn: { backgroundColor: colors.red, borderColor: colors.red },
  presetTxt: { fontSize: 13, color: colors.textSub },
  presetTxtOn: { color: "#fff", fontWeight: font.bold },
  divider: { height: 0.5, backgroundColor: colors.border, marginBottom: 20 },
  eventInput: {
    backgroundColor: colors.bg2,
    borderRadius: radius.md,
    borderWidth: 0.5,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 14,
    color: colors.text,
  },
  applyBtn: { marginTop: 16, borderRadius: radius.md, overflow: "hidden" },
  applyBtnGrad: { padding: 14, alignItems: "center" },
  applyBtnTxt: { fontSize: 15, fontWeight: font.bold, color: "#fff" },
  eventModalHint: { fontSize: 12, color: colors.textSub, lineHeight: 17, marginBottom: 12 },
  tagBtn: {
    paddingVertical: 13,
    alignItems: "center",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg2,
  },
  tagBtnTxt: { fontSize: 14, fontWeight: font.bold, color: colors.text },

  auditCard: {
    marginHorizontal: spacing.lg,
    marginBottom: 12,
    padding: 14,
    borderRadius: radius.lg,
    backgroundColor: colors.bg1,
    borderWidth: 0.5,
    borderColor: "rgba(233,30,99,0.25)",
  },
  auditTitle: {
    fontSize: 10,
    fontWeight: font.heavy,
    color: colors.textMuted,
    letterSpacing: 0.08,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  auditRange: { fontSize: 15, fontWeight: font.bold, color: colors.text, marginBottom: 4 },
  auditEvent: { fontSize: 13, fontWeight: font.medium, color: "#FF8FA3", marginBottom: 12 },
  auditGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  auditCell: { width: "47%", backgroundColor: colors.bg2, borderRadius: radius.md, padding: 10 },
  auditCellLbl: {
    fontSize: 9,
    color: colors.textMuted,
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.04,
  },
  auditCellVal: { fontSize: 16, fontWeight: font.heavy, color: colors.text },
  auditFoot: { fontSize: 10, color: colors.textMuted, marginTop: 12, lineHeight: 15 },

  detailHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  backBtn: { fontSize: 16, color: colors.red, fontWeight: font.medium },
  detailTitle: { fontSize: 16, fontWeight: font.bold, color: colors.text },
  deleteBtn: { fontSize: 13, color: colors.red, opacity: 0.6 },
  detailContent: { padding: spacing.lg, paddingBottom: 60 },
  detailImgWrap: { alignItems: "center", marginBottom: 16 },
  detailImg: { width: 200, height: 280, borderRadius: 12 },
  detailName: {
    fontSize: 22,
    fontWeight: font.heavy,
    color: colors.text,
    textAlign: "center",
    marginBottom: 4,
  },
  detailSetTxt: { fontSize: 14, color: colors.textSub, textAlign: "center", marginBottom: 16 },
  priceBadgeWrap: { alignItems: "center", marginBottom: 16 },
  priceBadge: {
    backgroundColor: colors.bg1,
    borderRadius: radius.lg,
    padding: 16,
    alignItems: "center",
    minWidth: 160,
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  priceBadgeLbl: {
    fontSize: 11,
    fontWeight: font.heavy,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  priceBadgeVal: { fontSize: 36, fontWeight: font.heavy, color: colors.text },
  detailTradeCard: {
    backgroundColor: "rgba(168,85,247,0.12)",
    borderRadius: radius.lg,
    padding: 14,
    marginBottom: 14,
    borderWidth: 0.5,
    borderColor: "rgba(196,181,253,0.35)",
  },
  detailTradeCardLbl: {
    fontSize: 11,
    fontWeight: font.heavy,
    color: "#E9D5FF",
    textTransform: "uppercase",
    letterSpacing: 0.06,
    marginBottom: 8,
  },
  detailTradeCardBody: { fontSize: 15, color: colors.text, lineHeight: 22 },
  detailBox: {
    backgroundColor: colors.bg1,
    borderRadius: radius.lg,
    overflow: "hidden",
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.bg,
  },
  detailRowLast: { borderBottomWidth: 0 },
  detailRowCol: { flexDirection: "column", alignItems: "flex-start", gap: 6 },
  detailRowLbl: { fontSize: 14, color: colors.textSub },
  detailRowVal: {
    fontSize: 14,
    fontWeight: font.medium,
    color: colors.text,
    flex: 1,
    textAlign: "right",
    marginLeft: 12,
  },
  detailDesc: { fontSize: 14, color: colors.text, fontStyle: "italic", lineHeight: 22 },
  payBadge: { borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 4 },
  payBadgeTxt: { fontSize: 13, fontWeight: font.bold },

  invSummary: { flexDirection: "row", gap: 7, marginBottom: 10, marginTop: 4 },
  invStat: { flex: 1, backgroundColor: colors.bg1, borderRadius: radius.md, padding: 9 },
  invStatLbl: { fontSize: 8, color: colors.textSub, marginBottom: 2 },
  invStatVal: { fontSize: 15, fontWeight: font.heavy, color: colors.text },
  invFilters: { flexDirection: "row", gap: 6, marginBottom: 12 },
  filterPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: colors.bg1,
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  filterOn: { borderColor: colors.red, backgroundColor: colors.redL },
  filterTxt: { fontSize: 11, fontWeight: font.medium, color: colors.textSub },
  filterTxtOn: { color: colors.red },
  invRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 9,
    gap: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.borderLight,
  },
  invThumb: {
    width: 44,
    height: 62,
    borderRadius: 6,
    backgroundColor: colors.bg1,
    flexShrink: 0,
    overflow: "hidden",
  },
  invThumbImg: { width: "100%", height: "100%" },
  invInfo: { flex: 1, minWidth: 0 },
  invName: { fontSize: 12, fontWeight: font.bold, color: colors.text },
  invSet: { fontSize: 10, color: colors.textSub, marginTop: 2 },
  invRarity: { fontSize: 9, color: colors.textMuted, marginTop: 2 },
  invRight: { alignItems: "flex-end", gap: 4, flexShrink: 0 },
  invPrice: { fontSize: 12, fontWeight: font.bold, color: colors.red },
  invBadge: {
    borderRadius: radius.md,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    alignItems: "center",
  },
  invBadgeTxt: { fontSize: 11, fontWeight: font.heavy },
});
