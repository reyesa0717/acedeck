import React, { useState, useCallback, useEffect, useMemo, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Alert,
  ActivityIndicator,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useRoute } from "@react-navigation/native";
import { useAuth } from "../context/AuthContext";
import * as ImagePicker from "expo-image-picker";

import {
  searchCards,
  getCard,
  extractTCGPrices,
  extractCMPrices,
  extractCardInfo,
  extractGradedPrices,
  fetchPricesForCard,
  syncCatalogPrices,
  fetchSetPrices,
  buildSetPriceMap,
  getSetCodeById,
  normalizeCardNumberKey,
  fetchPriceHistory,
  extractHistorySummary,
  extractHistorySeries,
  fetchListings,
  bestCardmarketTrend,
  PREMIUM_ILLUSTRATION_RARITY_RE,
} from "../../../backend/src/services/scrydex";
import {
  saveTransaction,
  saveAcquisition,
  loadCatalog,
  deductFromCatalog,
  addToCatalog,
  searchCatalog,
  isPriceStale,
  updateCardPrice,
} from "../../../backend/src/services/storage";
import { colors, font, radius, spacing, gradients } from "../utils/theme";
import { useLayoutMetrics } from "../utils/useLayoutMetrics";
import { LinearGradient } from "expo-linear-gradient";
import PokeImage from "../components/PokeImage";
import { getCachedCardId, prewarmPage } from "../components/CatalogImage";
import { usePagination } from "../components/Paginator";
import GradePicker from "../components/GradePicker";
import PricePanel from "../components/PricePanel";
import VariantPickerModal from "../components/VariantPickerModal";
import PriceHistoryModal from "../components/PriceHistoryModal";
import DrawerModal from "../components/DrawerModal";
import ScanModal from "../components/ScanModal";
import CatalogPickerModal from "../components/CatalogPickerModal";
import CartModal from "../components/CartModal";
import { isSealedCatalogRow } from "../utils/sealedInventory";
import { PSA_MULTIPLIERS, COMPANY_COLORS, tcgMarketSuspiciousVsSignals } from "../utils/pricing";

const CONDITIONS = [
  { label: "Poor", short: "PR", mult: 0.35, col: "#EF4444" },
  { label: "Good", short: "GD", mult: 0.55, col: "#F97316" },
  { label: "Played", short: "PL", mult: 0.7, col: "#EAB308" },
  { label: "LP", short: "LP", mult: 0.85, col: "#84CC16" },
  { label: "Near Mint", short: "NM", mult: 1.0, col: "#22C55E" },
  { label: "PSA 9", short: "P9", mult: 2.78, col: "#14B8A6" },
  { label: "PSA 10", short: "P10", mult: 9.82, col: "#A855F7" },
];

const PAY_FULL = {
  CA: "Cash App",
  Zelle: "Zelle",
  Cash: "Cash",
  Venmo: "Venmo",
  PP: "PayPal",
  TR: "Trade",
};
const PAY_ORDER = ["CA", "Zelle", "Cash", "Venmo", "PP", "TR"];

import {
  mergeSearchById,
  filterCatalogRowsForPosQuery,
  catalogRowToScanResult,
  cardMatchesScanStageFilter,
  cardMatchesScanLangFilter,
  cardMatchesScanRarityFilter,
  cardNameMatchesPosQuery,
  buildCatalogPwLookup,
  cardMatchesScanCatalogFilter,
  buildPosSearchQueries,
  sortPosScanResults,
  shouldSupplementEnglishForSingleResult,
  englishSupplementQueries,
  resolveTCGVariantIdx,
  maxTcgMarketAcrossVariants,
  mergeTcgPreferHigher,
} from "../utils/posSearch";

export default function POSScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const { isDebug, isTrusted, isGuest, guestPerms } = useAuth();
  const canLogAcquisition = !isGuest || !!guestPerms?.canAcquire;
  const layout = useLayoutMetrics();
  const { COL_L, COL_R, COL_C, CARD_H } = useMemo(() => {
    const W = layout.width;
    const H = layout.height;
    const tabletLayout = layout.isTablet;
    const colL = layout.isTabletWide ? 168 : tabletLayout ? 152 : 104;
    const colR = layout.isTabletWide ? 180 : tabletLayout ? 162 : 132;
    const colC = Math.max(200, W - colL - colR - 32);
    const cardH = Math.min(Math.floor(colC / 0.716), Math.floor(H * (tabletLayout ? 0.52 : 0.48)));
    return { COL_L: colL, COL_R: colR, COL_C: colC, CARD_H: cardH };
  }, [layout.width, layout.height, layout.isTablet, layout.isTabletWide]);

  // State
  const [card, setCard] = useState(null);
  const [cardInfo, setCardInfo] = useState(null);
  const [catalogImportImage, setCatalogImportImage] = useState(null);
  const [tcgPrices, setTcgPrices] = useState(null);
  const [cmPrices, setCmPrices] = useState(null);
  const [showPriceHistory, setShowPriceHistory] = useState(false);
  const [priceHistory, setPriceHistory] = useState(null);
  const [priceHistorySeries, setPriceHistorySeries] = useState([]);
  const [historyPeriodDays, setHistoryPeriodDays] = useState(30);
  const [phLoading, setPhLoading] = useState(false);
  const [listings, setListings] = useState([]);
  const [listingsLoading, setListingsLoading] = useState(false);
  const [basePriceOverride, setBasePriceOverride] = useState(null);
  const [tcgDataSuspect, setTcgDataSuspect] = useState(false);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");

  const [scanResults, setScanResults] = useState([]);
  const [showScanModal, setShowScanModal] = useState(false);
  const [scanQuery, setScanQuery] = useState("");
  const [scanModalHint, setScanModalHint] = useState("");
  const [scanStageFilter, setScanStageFilter] = useState("all");
  const [scanLangFilter, setScanLangFilter] = useState("eng");
  const [scanRarityFilter, setScanRarityFilter] = useState("all");
  const [scanCatalogFilter, setScanCatalogFilter] = useState("all");
  const [scanFiltersExpanded, setScanFiltersExpanded] = useState(false);
  const [scanViewMode, setScanViewMode] = useState("grid");

  const [tcgVariantIdx, setTcgVariantIdx] = useState(0);
  const [gradedPrices, setGradedPrices] = useState([]);
  const [gradedIdx, setGradedIdx] = useState(-1);
  const [gradeSel, setGradeSel] = useState(null);
  const [gradeCompany, setGradeCompany] = useState("PSA");
  const [condIdx, setCondIdx] = useState(4);
  const [dir, setDir] = useState("out");
  const [price, setPrice] = useState("");
  const [pay, setPay] = useState("CA");
  const [tradeNote, setTradeNote] = useState("");
  const [tradeAffectsInventory, setTradeAffectsInventory] = useState(true);
  const [desc, setDesc] = useState("");
  const [saving, setSaving] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [variantPickerOpen, setVariantPickerOpen] = useState(false);

  const [catalog, setCatalog] = useState([]);
  const [showCatalog, setShowCatalog] = useState(false);
  const [catalogQ, setCatalogQ] = useState("");
  const [catalogModalViewMode, setCatalogModalViewMode] = useState("grid");
  const catalogGridFlatRef = useRef(null);
  const catalogListFlatRef = useRef(null);
  const scrollCatalogModalTop = useCallback(() => {
    catalogGridFlatRef.current?.scrollToOffset({ offset: 0, animated: true });
    catalogListFlatRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, []);

  const scanCatalogLookup = useMemo(() => buildCatalogPwLookup(catalog), [catalog]);

  const filteredScanResults = useMemo(
    () =>
      (scanResults || []).filter(
        (c) =>
          cardMatchesScanStageFilter(c, scanStageFilter) &&
          cardMatchesScanLangFilter(c, scanLangFilter) &&
          cardMatchesScanRarityFilter(c, scanRarityFilter) &&
          cardMatchesScanCatalogFilter(c, scanCatalogFilter, scanCatalogLookup)
      ),
    [
      scanResults,
      scanStageFilter,
      scanLangFilter,
      scanRarityFilter,
      scanCatalogFilter,
      scanCatalogLookup,
    ]
  );

  const scanGridLayout = useMemo(() => {
    const pad = 16;
    const w = Math.max(260, layout.width - pad * 2);
    const cols = layout.width >= 640 ? 3 : 2;
    const gap = 10;
    const cellW = (w - gap * (cols - 1)) / cols;
    const imgH = Math.round(cellW / 0.716);
    return { cols, gap, cellW, imgH, pad };
  }, [layout.width]);

  const scanGridRows = useMemo(() => {
    const { cols } = scanGridLayout;
    const items = filteredScanResults;
    const rows = [];
    for (let i = 0; i < items.length; i += cols) rows.push(items.slice(i, i + cols));
    return rows;
  }, [filteredScanResults, scanGridLayout.cols]);

  const scanActiveFilterCount =
    (scanStageFilter !== "all" ? 1 : 0) +
    (scanLangFilter !== "eng" ? 1 : 0) +
    (scanRarityFilter !== "all" ? 1 : 0) +
    (scanCatalogFilter !== "all" ? 1 : 0);

  const [todaySold, setTodaySold] = useState(0);
  const [todayAcq, setTodayAcq] = useState(0);
  const [todayRev, setTodayRev] = useState(0);
  const [offline, setOffline] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const [cart, setCart] = useState([]);
  const [showCart, setShowCart] = useState(false);

  const cartTotal = cart.reduce((s, i) => s + i.price, 0);

  const parsedLogPrice = pay === "TR" && price.trim() === "" ? 0 : parseFloat(price);
  const logPriceValid =
    Number.isFinite(parsedLogPrice) && parsedLogPrice >= 0 && (pay === "TR" || parsedLogPrice > 0);

  useFocusEffect(
    useCallback(() => {
      loadCatalog()
        .then(setCatalog)
        .catch(() => setCatalog([]));
    }, [])
  );

  useEffect(() => {
    if (!showCatalog) return;
    const slice = searchCatalog(catalogQ) || [];
    const head = slice.slice(0, 48);
    if (head.length) prewarmPage(head);
  }, [showCatalog, catalogQ, catalog]);

  useEffect(() => {
    if (pay === "TR") setTradeAffectsInventory(true);
  }, [pay]);

  useEffect(() => {
    if (!showPriceHistory || !card?.id) return;
    setPhLoading(true);
    setPriceHistory(null);
    setPriceHistorySeries([]);
    fetchPriceHistory(card.id)
      .then((hist) => {
        setPriceHistory(extractHistorySummary(hist));
        setPriceHistorySeries(extractHistorySeries(hist));
      })
      .catch(() => {
        setPriceHistory(null);
        setPriceHistorySeries([]);
      })
      .finally(() => setPhLoading(false));
    setListingsLoading(true);
    setListings([]);
    fetchListings(card.id, 30)
      .then((l) => setListings(l || []))
      .catch(() => setListings([]))
      .finally(() => setListingsLoading(false));
  }, [showPriceHistory, card?.id]);

  const activeVariant = tcgPrices?.variants?.[tcgVariantIdx] ?? tcgPrices;
  const basePrice = basePriceOverride || activeVariant?.market || 0;
  const condPrice = (i) => (basePrice ? "$" + (basePrice * CONDITIONS[i].mult).toFixed(2) : "—");
  const csvSealedActive = !!(cardInfo && isSealedCatalogRow(cardInfo) && !card?.id);

  const pickCond = (i) => {
    setCondIdx(i);
    setGradedIdx(-1);
    setGradeSel(null);
    if (basePrice) setPrice((basePrice * CONDITIONS[i].mult).toFixed(2));
  };

  const pickGradeCell = ({ company, grade, api }) => {
    const co = String(company || "").toUpperCase();
    const gr = String(grade || "").trim();
    const apiIdx = api ? gradedPrices.findIndex((x) => x === api) : -1;
    let market = api?.market ?? null;
    let isEstimate = false;
    if (market == null && co === "PSA" && basePrice) {
      const mult = PSA_MULTIPLIERS[gr];
      if (mult != null) {
        market = basePrice * mult;
        isEstimate = true;
      }
    }
    const col = COMPANY_COLORS[co] || "#FACC15";
    const label = co + " " + gr;
    setGradeSel({ company: co, grade: gr, label, col, market, isEstimate, apiIdx });
    setGradedIdx(apiIdx);
    if (market != null) setPrice(Number(market).toFixed(2));
    if (co === "PSA" && gr === "9") setCondIdx(5);
    if (co === "PSA" && gr === "10") setCondIdx(6);
  };

  const pickTCGVariant = (idx) => {
    setTcgVariantIdx(idx);
    setBasePriceOverride(null);
    setTcgDataSuspect(false);
    const v = tcgPrices?.variants?.[idx];
    if (v?.market) setPrice((v.market * CONDITIONS[condIdx].mult).toFixed(2));
  };

  const loadCardById = async (
    id,
    catalogCard = null,
    fallbackTcg = null,
    fallbackCm = null,
    sourceRow = null
  ) => {
    if (!id) {
      console.warn("[POS] loadCardById called with no id");
      return;
    }
    setCatalogImportImage(null);
    console.log("[POS] loadCardById", id);
    try {
      if (catalogCard && !isPriceStale(catalogCard) && catalogCard.cachedTCG) {
        const info = {
          id,
          name: catalogCard.name || "Unknown",
          setName: catalogCard.set || "",
          number: catalogCard.number || "",
          rarity: catalogCard.rarity || "",
          hp: "",
          stage: "",
          cardType: "",
          language: "eng",
          hasTCG: true,
          hasCM: false,
          isEnglish: true,
        };
        setCard({ id });
        setCardInfo(info);
        setTcgPrices(catalogCard.cachedTCG);
        setCmPrices(catalogCard.cachedCM || null);
        setGradedPrices(catalogCard.cachedGraded || []);
        setGradedIdx(-1);
        setGradeSel(null);
        const cvi = resolveTCGVariantIdx(catalogCard, null, catalogCard.cachedTCG);
        setTcgVariantIdx(cvi);
        const cv = catalogCard.cachedTCG?.variants?.[cvi] ?? catalogCard.cachedTCG;
        const cvMkt = cv?.market || 0;
        const cvCm = bestCardmarketTrend(catalogCard.cachedCM);
        const cvCsv = Number(catalogCard.marketPrice) || 0;
        const cvSusp = tcgMarketSuspiciousVsSignals(cvMkt, cvCm, cvCsv, catalogCard.rarity);
        if (cvMkt && !cvSusp) {
          setBasePriceOverride(null);
          setTcgDataSuspect(false);
          setPrice(cvMkt.toFixed(2));
        } else if (cvCm > 0) {
          setBasePriceOverride(cvCm);
          setTcgDataSuspect(cvSusp);
          setPrice(cvCm.toFixed(2));
        } else if (cvCsv > 0) {
          setBasePriceOverride(cvCsv);
          setTcgDataSuspect(cvSusp);
          setPrice(cvCsv.toFixed(2));
        }
        return;
      }

      let full = await getCard(id, { bypassCache: true });
      if (!full) {
        Alert.alert("Card not found", "Could not load card details.");
        return;
      }

      setCard({ id: full.id || id });
      const info = extractCardInfo(full);
      setCardInfo(info);

      let tcg = mergeTcgPreferHigher(extractTCGPrices(full), fallbackTcg);
      let cm = extractCMPrices(full) || fallbackCm;

      const expansionId = full?.expansion?.id || null;
      const expansionCode = full?.expansion?.code || null;
      const cardNumber = full?.number || null;

      if (!cm && expansionId && cardNumber) {
        const setCode = expansionCode || (await getSetCodeById(expansionId)) || expansionId;
        const setPricesResp = await fetchSetPrices(setCode);
        const priceMap = buildSetPriceMap(setPricesResp);
        const norm = normalizeCardNumberKey(cardNumber);
        let entry = priceMap.get(norm);
        if (!entry) {
          for (const [k, v] of priceMap) {
            if (k.split("/")[0] === norm || norm.split("/")[0] === k.split("/")[0]) {
              entry = v;
              break;
            }
          }
        }
        if (entry) {
          if (!tcg && entry.tcg?.market) {
            tcg = {
              market: entry.tcg.market,
              low: entry.tcg.low,
              mid: entry.tcg.mid,
              high: entry.tcg.high,
              currency: "USD",
            };
          }
          if (entry.cm?.trend) {
            cm = {
              trend: entry.cm.trend,
              avg1: entry.cm.avg1,
              avg7: entry.cm.avg7,
              low: entry.cm.low,
              currency: "EUR",
            };
          }
        }
      }

      let rescuedTcg = null;
      if (expansionId && cardNumber) {
        try {
          const setCodeForRescue =
            expansionCode || (await getSetCodeById(expansionId)) || expansionId;
          if (setCodeForRescue) {
            const setPricesResp = await fetchSetPrices(setCodeForRescue);
            const priceMap = buildSetPriceMap(setPricesResp);
            const norm = normalizeCardNumberKey(cardNumber);
            let entry = priceMap.get(norm);
            if (!entry) {
              for (const [k, v] of priceMap) {
                if (k.split("/")[0] === norm || norm.split("/")[0] === k.split("/")[0]) {
                  entry = v;
                  break;
                }
              }
            }
            const rarityRescue = (full?.rarity || "").toLowerCase();
            const premiumRescue = PREMIUM_ILLUSTRATION_RARITY_RE.test(rarityRescue);
            const tcgMaxM = maxTcgMarketAcrossVariants(tcg);
            const cmTr = bestCardmarketTrend(cm);
            const premiumBeatWrongTcg =
              entry?.tcg?.market &&
              premiumRescue &&
              Number.isFinite(cmTr) &&
              cmTr > 35 &&
              tcgMaxM > 0 &&
              tcgMaxM < cmTr / 10 &&
              entry.tcg.market > tcgMaxM * 1.12 &&
              entry.tcg.market > 18;
            if (
              entry?.tcg?.market &&
              (!tcg?.market ||
                (entry.tcg.market > (tcg?.market || 0) * 2 && entry.tcg.market > 5) ||
                premiumBeatWrongTcg)
            ) {
              rescuedTcg = {
                market: entry.tcg.market,
                low: entry.tcg.low,
                mid: entry.tcg.mid,
                high: entry.tcg.high,
                currency: "USD",
                variants: [
                  {
                    variant: entry.tcg.variant || "Holofoil",
                    market: entry.tcg.market,
                    low: entry.tcg.low,
                    mid: entry.tcg.mid,
                    high: entry.tcg.high,
                  },
                ],
              };
            }
          }
        } catch {}
      }
      if (rescuedTcg) tcg = rescuedTcg;

      setTcgPrices(tcg);
      setCmPrices(cm);
      const graded = extractGradedPrices(full);
      setGradedPrices(graded);
      setGradedIdx(-1);
      setGradeSel(null);
      const vi = resolveTCGVariantIdx(catalogCard, info, tcg);
      setTcgVariantIdx(vi);
      const selV = tcg?.variants?.[vi] ?? tcg;
      const tcgMkt = selV?.market || 0;
      const cmTrend = bestCardmarketTrend(cm);
      const csvMkt = Number(catalogCard?.marketPrice) || 0;
      const rarityHint = (catalogCard?.rarity || info?.rarity || "").toLowerCase();
      const tcgDataSuspect = tcgMarketSuspiciousVsSignals(tcgMkt, cmTrend, csvMkt, rarityHint);
      // Price source priority: TCGplayer market -> CardMarket trend -> imported CSV price.
      if (tcgMkt && !tcgDataSuspect) {
        setBasePriceOverride(null);
        setTcgDataSuspect(false);
        setPrice(tcgMkt.toFixed(2));
      } else if (cmTrend) {
        setBasePriceOverride(cmTrend);
        setTcgDataSuspect(tcgDataSuspect);
        setPrice(cmTrend.toFixed(2));
      } else if (csvMkt > 0) {
        setBasePriceOverride(csvMkt);
        setTcgDataSuspect(tcgDataSuspect);
        setPrice(csvMkt.toFixed(2));
      }

      if (catalogCard) {
        updateCardPrice(catalogCard.id, tcg, cm).catch(() => {});
      }
    } catch (e) {
      Alert.alert("Error loading card", e.message);
    }
  };

  const hydrateCatalogItem = async (item) => {
    if (!item) return;
    setQuery(item.name || "");
    setCard(null);
    setCardInfo(null);
    setTcgPrices(null);
    setCmPrices(null);
    setPrice("");
    setTcgVariantIdx(0);
    setGradedPrices([]);
    setGradedIdx(-1);
    setGradeSel(null);
    setGradeCompany("PSA");
    setBasePriceOverride(null);
    setTcgDataSuspect(false);
    if (isSealedCatalogRow(item)) {
      setSearching(true);
      const uri = (item.image || "").trim();
      setCatalogImportImage(uri || null);
      setCard({ id: null });
      const mp = Number(item.marketPrice) || 0;
      const sk = (item.sealedKind || "").trim();
      setCardInfo({
        id: null,
        name: item.name || "",
        setName: item.set || "",
        number: item.number || "",
        rarity: item.rarity || "Sealed",
        hp: "",
        stage: "",
        cardType: "",
        productKind: item.productKind || "sealed",
        sealedKind: sk,
        language: "eng",
        hasTCG: false,
        hasCM: false,
        isEnglish: true,
      });
      if (mp > 0) {
        setTcgPrices({
          market: mp,
          low: mp,
          mid: mp,
          high: mp,
          variants: [{ variant: "Normal", market: mp, low: mp, mid: mp, high: mp }],
        });
        setPrice(mp.toFixed(2));
      } else {
        setTcgPrices(null);
        setPrice("");
      }
      setCmPrices(null);
      setSearching(false);
      return;
    }
    setCatalogImportImage(null);
    setSearching(true);
    try {
      const cachedId = getCachedCardId(item);
      if (cachedId) {
        try {
          const { tcg, cm } = await fetchPricesForCard(item.name, item.number, item.set, item);
          await loadCardById(cachedId, item, tcg, cm);
        } catch {
          await loadCardById(cachedId, item, null, null);
        }
      } else {
        const { tcg, cm, cardId } = await fetchPricesForCard(
          item.name,
          item.number,
          item.set,
          item
        );
        if (cardId) {
          await loadCardById(cardId, item, tcg, cm);
          updateCardPrice(item.id, tcg, cm).catch(() => {});
        } else {
          setCard({ id: null });
          setCardInfo({
            id: null,
            name: item.name,
            setName: item.set,
            number: item.number,
            rarity: item.rarity,
            hp: "",
            stage: "",
            cardType: "",
          });
          setTcgPrices(tcg);
          setCmPrices(cm);
          const cmBest = bestCardmarketTrend(cm);
          if (tcg?.market) setPrice(tcg.market.toFixed(2));
          else if (cmBest > 0) setPrice(cmBest.toFixed(2));
          else if (item.marketPrice > 0) setPrice(item.marketPrice.toFixed(2));
        }
      }
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setSearching(false);
    }
  };

  useEffect(() => {
    const item = route?.params?.catalogCard;
    if (!item) return;
    hydrateCatalogItem(item);
  }, [route?.params?.catalogCard]);

  const doSearch = async (overrideQuery) => {
    const q = (overrideQuery || query).trim();
    if (!q) return;
    setSearching(true);
    setCatalogImportImage(null);
    setCard(null);
    setCardInfo(null);
    setTcgPrices(null);
    setCmPrices(null);
    setPrice("");
    setTcgVariantIdx(0);
    setGradedPrices([]);
    setGradedIdx(-1);
    setGradeSel(null);
    setGradeCompany("PSA");
    try {
      const queries = buildPosSearchQueries(q);
      const PER_QUERY = 40;
      let merged = [];
      for (const sq of queries) {
        try {
          const batch = await searchCards(sq, PER_QUERY);
          merged = mergeSearchById(merged, batch || []);
        } catch {}
      }

      let sorted = sortPosScanResults(merged, q);

      const onlyNonEnglishHits =
        sorted.length > 0 && sorted.every((r) => shouldSupplementEnglishForSingleResult(r));
      if (onlyNonEnglishHits) {
        for (const sq of englishSupplementQueries(q, sorted[0])) {
          const batch = await searchCards(sq, PER_QUERY);
          sorted = sortPosScanResults(mergeSearchById(sorted, batch || []), q);
        }
        const stillOnlyIntl =
          sorted.length > 0 && sorted.every((r) => shouldSupplementEnglishForSingleResult(r));
        if (stillOnlyIntl) {
          for (const sq of englishSupplementQueries(q, sorted[0])) {
            const batch = await searchCards(sq, PER_QUERY, { bypassCache: true });
            sorted = sortPosScanResults(mergeSearchById(sorted, batch || []), q);
          }
        }
      }

      if (!sorted.length) {
        for (const sq of queries) {
          const batch = await searchCards(sq, PER_QUERY, { bypassCache: true });
          sorted = sortPosScanResults(mergeSearchById(sorted, batch || []), q);
        }
      }

      sorted = sorted.filter((c) => cardNameMatchesPosQuery(c, q));

      const catSup = filterCatalogRowsForPosQuery(catalog, q).map(catalogRowToScanResult);
      sorted = sortPosScanResults([...sorted, ...catSup], q);

      if (!sorted.length) {
        setScanResults([]);
        setScanQuery(q);
        setScanStageFilter("all");
        setScanLangFilter("eng");
        setScanRarityFilter("all");
        setScanCatalogFilter("all");
        setScanFiltersExpanded(false);
        setScanModalHint(
          "Nothing matched search yet. Very new or presale English cards sometimes land in the index a bit later—try again after release, or include the English set name (e.g. Chaos Rising) with the card number."
        );
        setShowScanModal(true);
        return;
      }

      if (sorted.length === 1) {
        const r0 = sorted[0];
        if (r0._catalogRow) {
          await hydrateCatalogItem(r0._catalogRow);
          return;
        }
        await loadCardById(r0.id, null, extractTCGPrices(r0), extractCMPrices(r0), r0);
        return;
      }

      setScanResults(sorted);
      setScanQuery(q);
      setScanStageFilter("all");
      setScanLangFilter("eng");
      setScanRarityFilter("all");
      setScanCatalogFilter("all");
      setScanFiltersExpanded(false);
      const anyEnTcg = sorted.some((r) => {
        const i = extractCardInfo(r);
        return i.isEnglish && i.hasTCG;
      });
      setScanModalHint(
        anyEnTcg
          ? "English listings (with USD prices) are listed first when available. Tap the correct print."
          : "These hits may all be non-English prints. If the English print is presale or very new, it may not be in search yet—try set name + number, or again after release."
      );
      setShowScanModal(true);
    } catch (e) {
      Alert.alert("Search failed", e.message);
    } finally {
      setSearching(false);
    }
  };

  const pickScanResult = async (result) => {
    setShowScanModal(false);
    setScanModalHint("");
    setScanStageFilter("all");
    setScanLangFilter("eng");
    setScanRarityFilter("all");
    setScanCatalogFilter("all");
    setScanFiltersExpanded(false);
    setSearching(true);
    try {
      if (result?._catalogRow) {
        await hydrateCatalogItem(result._catalogRow);
        return;
      }
      await loadCardById(
        result.id,
        null,
        extractTCGPrices(result),
        extractCMPrices(result),
        result
      );
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setSearching(false);
    }
  };

  const clearCard = () => {
    setCatalogImportImage(null);
    setCard(null);
    setCardInfo(null);
    setTcgPrices(null);
    setCmPrices(null);
    setTcgVariantIdx(0);
    setGradedPrices([]);
    setGradedIdx(-1);
    setGradeSel(null);
    setGradeCompany("PSA");
    setPriceHistory(null);
    setPriceHistorySeries([]);
    setListings([]);
    setBasePriceOverride(null);
    setTcgDataSuspect(false);
    setPrice("");
    setQuery("");
    setTradeNote("");
    setTradeAffectsInventory(true);
  };

  // Handlers
  const addToCart = () => {
    const numPrice = parseFloat(price);
    if (!card || !cardInfo) {
      Alert.alert("No card loaded");
      return;
    }
    if (!Number.isFinite(numPrice) || numPrice < 0) {
      Alert.alert("Enter a valid price");
      return;
    }
    if (numPrice <= 0 && pay !== "TR") {
      Alert.alert("Enter a price", "Or choose Trade as payment, then add with $0 if needed.");
      return;
    }
    setCart((prev) => [
      ...prev,
      {
        _key: Date.now() + Math.random(),
        cardId: card.id,
        cardInfo,
        price: numPrice,
        condIdx,
        condLabel: gradeSel?.label || null,
        condCol: gradeSel?.col || null,
        tcgPrices,
        importImage: catalogImportImage || null,
      },
    ]);
    clearCard();
  };

  const removeFromCart = (key) => setCart((prev) => prev.filter((i) => i._key !== key));

  const checkoutCart = async () => {
    if (!cart.length) return;
    if (pay !== "TR" && cart.some((i) => !i.price || i.price <= 0)) {
      Alert.alert(
        "Missing price",
        "Every line needs a cash price, or pick Trade for the whole cart."
      );
      return;
    }
    setSaving(true);
    try {
      const tn = tradeNote.trim();
      const inventoryAdjusted = pay !== "TR" || tradeAffectsInventory;
      for (const item of cart) {
        const txnData = {
          name: item.cardInfo.name,
          set: item.cardInfo.setName,
          number: item.cardInfo.number,
          rarity: item.cardInfo.rarity,
          condition: item.condLabel || CONDITIONS[item.condIdx].label,
          cardId: item.cardId,
          image:
            item.importImage ||
            (item.cardId
              ? "https://images.scrydex.com/pokemon/" + encodeURIComponent(item.cardId) + "/small"
              : ""),
          amount: item.price,
          marketPrice: item.tcgPrices?.market || null,
          pay,
          dir: "out",
          desc: desc.trim(),
          inventoryAdjusted,
          ...(pay === "TR" && tn ? { tradeReceived: tn } : {}),
        };
        await saveTransaction(txnData);
        if (inventoryAdjusted) await deductFromCatalog(txnData);
        setTodaySold((s) => s + 1);
        if (pay !== "TR") setTodayRev((r) => r + item.price);
      }
      const total = cart.reduce((s, i) => s + i.price, 0);
      Alert.alert(
        "Sale recorded 🎉",
        pay === "TR"
          ? cart.length + " card trade logged" + (tn ? " · " + tn : "")
          : cart.length +
              " card" +
              (cart.length > 1 ? "s" : "") +
              " · $" +
              total.toFixed(2) +
              " total via " +
              (PAY_FULL[pay] || pay)
      );
      setCart([]);
      setShowCart(false);
      setDesc("");
      setTradeNote("");
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleScan = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Camera access needed");
      return;
    }
    await ImagePicker.launchCameraAsync({ quality: 0.8 });
    Alert.alert("Tip", "Type the card name or number to search for now. ML Kit OCR coming soon.");
  };

  const handleSync = async () => {
    if (offline) {
      setOffline(false);
      Alert.alert("Online", "Using live prices.");
      return;
    }
    if (!catalog.length) {
      Alert.alert("No catalog", "Import cards from the Catalog tab first.");
      return;
    }
    Alert.alert(
      "Sync prices for offline use?",
      catalog.length +
        " cards will be cached.\n\n" +
        "Free plan (~100/hr): may take several hours.\n" +
        "Coffee/Pro plan: much faster.\n\nBest done the night before the show on WiFi.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Start sync",
          onPress: async () => {
            setSyncing(true);
            try {
              const result = await syncCatalogPrices(catalog, (done, total) => {
                if (done % 10 === 0) console.log(`Sync: ${done}/${total}`);
              });
              setOffline(true);
              Alert.alert(
                "Sync complete",
                `${result.synced} synced · ${result.skipped} already cached · ${result.errors} errors`
              );
            } catch (e) {
              Alert.alert("Sync failed", e.message);
            } finally {
              setSyncing(false);
            }
          },
        },
      ]
    );
  };

  const handleRecord = async () => {
    if (!card) {
      Alert.alert("No card loaded");
      return;
    }
    const numPrice = price.trim() === "" && pay === "TR" ? 0 : parseFloat(price);
    if (!Number.isFinite(numPrice) || numPrice < 0) {
      Alert.alert("Enter a valid amount");
      return;
    }
    if (pay !== "TR" && numPrice <= 0) {
      Alert.alert("Enter a price");
      return;
    }
    setSaving(true);
    try {
      const info = cardInfo || extractCardInfo(card);
      const tn = tradeNote.trim();
      const inventoryAdjusted = pay !== "TR" || tradeAffectsInventory;
      const txnData = {
        name: info.name,
        set: info.setName,
        number: info.number,
        rarity: info.rarity,
        condition: gradeSel?.label || CONDITIONS[condIdx].label,
        cardId: card.id,
        image:
          catalogImportImage ||
          (card.id
            ? "https://images.scrydex.com/pokemon/" + encodeURIComponent(card.id) + "/small"
            : ""),
        amount: numPrice,
        marketPrice: basePrice || null,
        pay,
        dir,
        desc: desc.trim(),
        inventoryAdjusted,
        ...(pay === "TR" && tn ? { tradeReceived: tn } : {}),
      };
      await saveTransaction(txnData);

      if (dir === "in") {
        await saveAcquisition(txnData);
        if (inventoryAdjusted) await addToCatalog(txnData);
        setTodayAcq((a) => a + 1);
      } else {
        if (inventoryAdjusted) await deductFromCatalog(txnData);
        setTodaySold((s) => s + 1);
        if (pay !== "TR") setTodayRev((r) => r + numPrice);
      }

      setDesc("");
      setTradeNote("");
      setDrawerOpen(false);
      if (basePrice) setPrice((basePrice * CONDITIONS[condIdx].mult).toFixed(2));
      Alert.alert(
        dir === "out" ? "Sale recorded" : "Acquisition recorded",
        pay === "TR"
          ? info.name +
              " · trade" +
              (numPrice > 0 ? " (ref $" + numPrice.toFixed(2) + ")" : "") +
              (tn ? " · got: " + tn : "")
          : info.name + " for $" + numPrice.toFixed(2) + " via " + (PAY_FULL[pay] || pay)
      );
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setSaving(false);
    }
  };

  const filteredCatalog = searchCatalog(catalogQ) || [];
  const catPagination = usePagination(filteredCatalog, 20);
  const {
    pageData: catPage,
    start: catRangeStart,
    end: catRangeEnd,
    total: catRangeTotal,
  } = catPagination;

  const catModalGridRows = useMemo(() => {
    const { cols } = scanGridLayout;
    const items = catPage || [];
    const rows = [];
    for (let i = 0; i < items.length; i += cols) rows.push(items.slice(i, i + cols));
    return rows;
  }, [catPage, scanGridLayout.cols]);

  // Render
  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <LinearGradient
        colors={gradients.bg}
        style={StyleSheet.absoluteFillObject}
        start={gradients.bgStart}
        end={gradients.bgEnd}
      />

      {offline && (
        <View style={s.offlineBanner}>
          <Text style={s.offlineTxt}>Offline — cached prices</Text>
        </View>
      )}

      {isDebug && (
        <View style={s.debugBanner}>
          <Text style={s.debugTxt}>🛠 DEBUG MODE — debug@acedeck.dev</Text>
        </View>
      )}

      {isTrusted && !isDebug && (
        <View style={s.trustedBanner}>
          <Text style={s.trustedTxt}>🔑 Trusted vendor — full offline access</Text>
        </View>
      )}

      <View style={s.topbar}>
        <TouchableOpacity style={s.catPill} onPress={() => setShowCatalog(true)}>
          <LinearGradient
            colors={gradients.catalog}
            style={s.catPillGrad}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <Text style={s.catPillTxt}>{"📂 " + catalog.length}</Text>
          </LinearGradient>
        </TouchableOpacity>

        {cart.length > 0 && (
          <TouchableOpacity
            style={s.cartPill}
            onPress={() => setShowCart(true)}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={["#16a34a", "#15803d"]}
              style={s.cartPillGrad}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Text style={s.cartPillTxt}>
                {"🛒 " + cart.length + "  $" + cartTotal.toFixed(2)}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        )}
        <View style={s.searchWrap}>
          <Text style={s.searchIc}>🔍</Text>
          <TextInput
            style={s.searchInp}
            placeholder="Search to sell or acquire…"
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => doSearch()}
            returnKeyType="search"
          />
          {!!query ? (
            <TouchableOpacity onPress={clearCard}>
              <Text style={s.clearX}>✕</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={handleScan}>
              <Text style={s.clearX}>📷</Text>
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity onPress={() => doSearch()}>
          <LinearGradient
            colors={gradients.primary}
            style={s.searchBtnGrad}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <Text style={s.searchBtnTxt}>Search</Text>
          </LinearGradient>
        </TouchableOpacity>
        <TouchableOpacity
          style={s.iconBtn}
          onPress={() => navigation.navigate("CustomerBrowse")}
          activeOpacity={0.8}
        >
          <Text style={s.iconEmoji}>👤</Text>
          <Text style={s.iconLabel}>Kiosk</Text>
        </TouchableOpacity>
      </View>

      <View style={s.searchHint}>
        <Text style={s.searchHintTxt}>
          {"Search finds any English card to sell or acquire · 📂 = your catalog"}
        </Text>
      </View>

      <View style={s.countBar}>
        <LinearGradient
          colors={gradients.sold}
          style={s.countChip}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
        >
          <Text style={[s.countTxt, { color: colors.red }]}>{"↓ " + todaySold + " sold"}</Text>
        </LinearGradient>
        <LinearGradient
          colors={gradients.acquired}
          style={s.countChip}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
        >
          <Text style={[s.countTxt, { color: colors.green }]}>{"↑ " + todayAcq + " acq"}</Text>
        </LinearGradient>
        <LinearGradient
          colors={gradients.revenue}
          style={s.countChip}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
        >
          <Text style={[s.countTxt, { color: colors.pink }]}>{"$" + todayRev.toFixed(2)}</Text>
        </LinearGradient>
      </View>

      <View style={s.three}>
        <ScrollView
          style={[s.leftCol, { width: COL_L }]}
          contentContainerStyle={[s.colPad, { minHeight: 0 }]}
          showsVerticalScrollIndicator={false}
        >
          <Text style={s.colTtl}>{"Info"}</Text>
          {!card && !searching && (
            <Text style={s.colEmpty}>{"Search for a card\nto sell or buy"}</Text>
          )}
          {searching && <ActivityIndicator color={colors.red} style={{ marginTop: 20 }} />}
          {!!card && !!cardInfo && (
            <>
              {[
                ["Name", cardInfo.name],
                ["Set", cardInfo.setName],
                ...(cardInfo.sealedKind ? [["Format", cardInfo.sealedKind]] : []),
                ["Rarity", cardInfo.rarity],
                ["HP", cardInfo.hp],
                ["#", cardInfo.number],
              ]
                .filter(([, v]) => !!v)
                .map(([l, v]) => (
                  <View key={l} style={s.infoGroup}>
                    <Text style={s.infoLbl}>{l}</Text>
                    <Text
                      style={[s.infoVal, l === "HP" && { color: colors.red }]}
                      numberOfLines={2}
                    >
                      {v}
                    </Text>
                  </View>
                ))}
              <View style={s.condDivider} />
              <Text style={s.colTtl}>{"Cond."}</Text>
              {tcgDataSuspect && basePriceOverride > 0 && (
                <Text style={s.condBaseHint}>
                  {"Near Mint base follows CardMarket/CSV — TCG row is wrong for this card."}
                </Text>
              )}
              {CONDITIONS.map((c, i) =>
                c.mult > 1 ? null : (
                  <TouchableOpacity
                    key={c.short}
                    style={[
                      s.condRow,
                      condIdx === i && !gradeSel && { borderColor: c.col, borderWidth: 1 },
                    ]}
                    onPress={() => pickCond(i)}
                    activeOpacity={0.8}
                  >
                    {condIdx === i && !gradeSel && (
                      <LinearGradient
                        colors={[c.col + "33", c.col + "11"]}
                        style={StyleSheet.absoluteFillObject}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                      />
                    )}
                    <View style={[s.condDot, { backgroundColor: c.col }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={[s.condLabel, condIdx === i && !gradeSel && { color: c.col }]}>
                        {c.label}
                      </Text>
                      <Text style={s.condPrice}>{condPrice(i)}</Text>
                    </View>
                    {condIdx === i && !gradeSel && (
                      <Text style={{ color: c.col, fontSize: 9 }}>{"✓"}</Text>
                    )}
                  </TouchableOpacity>
                )
              )}
            </>
          )}
        </ScrollView>

        <View style={[s.centerCol, { width: COL_C }]}>
          <View style={[s.cardArea, { width: COL_C, height: CARD_H }]}>
            {searching ? (
              <View style={[s.cardPh, { height: CARD_H }]}>
                <ActivityIndicator color={colors.red} size="large" />
                <Text style={s.cardPhSub}>{"Searching..."}</Text>
              </View>
            ) : catalogImportImage ? (
              <Image
                source={{ uri: catalogImportImage }}
                style={{ width: COL_C, height: CARD_H }}
                resizeMode="contain"
              />
            ) : card && card.id ? (
              <PokeImage
                cardId={card.id}
                size="high"
                style={{ width: COL_C, height: CARD_H }}
                resizeMode="contain"
              />
            ) : (
              <View style={[s.cardPh, { height: CARD_H }]}>
                <Text style={s.cardPhIc}>{csvSealedActive ? "📦" : ""}</Text>
                <Text style={s.cardPhTxt}>
                  {csvSealedActive
                    ? "Sealed import —\nadd an image URL in CSV optional"
                    : "Scan or search —\nthen log sold or acquired"}
                </Text>
              </View>
            )}
          </View>

          {!!card && !!card.id && !csvSealedActive && (
            <GradePicker
              width={COL_C}
              gradedPrices={gradedPrices}
              basePrice={basePrice}
              gradeSel={gradeSel}
              gradeCompany={gradeCompany}
              setGradeCompany={setGradeCompany}
              pickGradeCell={pickGradeCell}
              styles={s}
            />
          )}

          {!!card && !!card.id && (
            <TouchableOpacity
              style={s.phBtn}
              onPress={() => setShowPriceHistory(true)}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={["#1a1f2e", "#0f1419"]}
                style={s.phBtnGrad}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Text style={s.phBtnTxt}>{"📊 Price History"}</Text>
              </LinearGradient>
            </TouchableOpacity>
          )}
        </View>

        <PricePanel
          width={COL_R}
          card={card}
          csvSealedActive={csvSealedActive}
          offline={offline}
          tcgDataSuspect={tcgDataSuspect}
          tcgPrices={tcgPrices}
          tcgVariantIdx={tcgVariantIdx}
          activeVariant={activeVariant}
          gradeSel={gradeSel}
          gradedPrices={gradedPrices}
          onOpenVariantPicker={() => setVariantPickerOpen(true)}
          styles={s}
        />
      </View>

      <View style={[s.logBar, !card && s.logBarEmpty]}>
        {card ? (
          <LinearGradient
            colors={gradients.logbar}
            style={StyleSheet.absoluteFillObject}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          />
        ) : null}
        {card && cardInfo ? (
          <View style={s.logBarInner}>
            <Text style={s.logBarPrice}>{"$" + (price || "—")}</Text>
            <View style={s.logBarCenter}>
              <Text style={s.logBarName} numberOfLines={1}>
                {cardInfo.name}
              </Text>
              <Text style={s.logBarCond}>{gradeSel?.label || CONDITIONS[condIdx].label}</Text>
            </View>
            <TouchableOpacity style={s.cartAddBtn} onPress={addToCart} activeOpacity={0.8}>
              <LinearGradient
                colors={["#16a34a", "#15803d"]}
                style={s.cartAddGrad}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Text style={s.cartAddTxt}>🛒+</Text>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setDrawerOpen(true)} activeOpacity={0.8}>
              <LinearGradient
                colors={gradients.primary}
                style={s.logBarTag}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Text style={s.logBarTagTxt}>Log ↑</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        ) : (
          <Text style={s.logBarEmptyTxt}>Search a card to sell or acquire</Text>
        )}
      </View>

      <VariantPickerModal
        visible={variantPickerOpen}
        onClose={() => setVariantPickerOpen(false)}
        tcgPrices={tcgPrices}
        tcgVariantIdx={tcgVariantIdx}
        gradeSel={gradeSel}
        setGradedIdx={setGradedIdx}
        setGradeSel={setGradeSel}
        pickTCGVariant={pickTCGVariant}
        styles={s}
      />

      <DrawerModal
        visible={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onShow={() => {
          if (!canLogAcquisition && dir === "in") setDir("out");
        }}
        canLogAcquisition={canLogAcquisition}
        dir={dir}
        setDir={setDir}
        cardInfo={cardInfo}
        price={price}
        setPrice={setPrice}
        pay={pay}
        setPay={setPay}
        basePrice={basePrice}
        tcgPrices={tcgPrices}
        tradeNote={tradeNote}
        setTradeNote={setTradeNote}
        tradeAffectsInventory={tradeAffectsInventory}
        setTradeAffectsInventory={setTradeAffectsInventory}
        desc={desc}
        setDesc={setDesc}
        logPriceValid={logPriceValid}
        saving={saving}
        handleRecord={handleRecord}
        payFull={PAY_FULL}
        payOrder={PAY_ORDER}
        styles={s}
      />

      <ScanModal
        visible={showScanModal}
        onClose={() => {
          setShowScanModal(false);
          setScanModalHint("");
          setScanStageFilter("all");
          setScanLangFilter("eng");
          setScanRarityFilter("all");
          setScanCatalogFilter("all");
          setScanFiltersExpanded(false);
        }}
        scanResults={scanResults}
        filteredScanResults={filteredScanResults}
        scanQuery={scanQuery}
        scanModalHint={scanModalHint}
        scanViewMode={scanViewMode}
        setScanViewMode={setScanViewMode}
        scanFiltersExpanded={scanFiltersExpanded}
        setScanFiltersExpanded={setScanFiltersExpanded}
        scanActiveFilterCount={scanActiveFilterCount}
        scanStageFilter={scanStageFilter}
        setScanStageFilter={setScanStageFilter}
        scanLangFilter={scanLangFilter}
        setScanLangFilter={setScanLangFilter}
        scanRarityFilter={scanRarityFilter}
        setScanRarityFilter={setScanRarityFilter}
        scanCatalogFilter={scanCatalogFilter}
        setScanCatalogFilter={setScanCatalogFilter}
        scanGridRows={scanGridRows}
        scanGridLayout={scanGridLayout}
        scanCatalogLookup={scanCatalogLookup}
        cardMatchesScanCatalogFilter={cardMatchesScanCatalogFilter}
        pickScanResult={pickScanResult}
        styles={s}
      />

      <CatalogPickerModal
        visible={showCatalog}
        onClose={() => setShowCatalog(false)}
        catalog={catalog}
        catalogQ={catalogQ}
        setCatalogQ={setCatalogQ}
        filteredCatalog={filteredCatalog}
        catalogModalViewMode={catalogModalViewMode}
        setCatalogModalViewMode={setCatalogModalViewMode}
        catalogGridFlatRef={catalogGridFlatRef}
        catalogListFlatRef={catalogListFlatRef}
        catModalGridRows={catModalGridRows}
        catPage={catPage}
        catPagination={catPagination}
        catRangeStart={catRangeStart}
        catRangeEnd={catRangeEnd}
        catRangeTotal={catRangeTotal}
        scanGridLayout={scanGridLayout}
        scrollCatalogModalTop={scrollCatalogModalTop}
        hydrateCatalogItem={hydrateCatalogItem}
        styles={s}
      />

      <PriceHistoryModal
        visible={showPriceHistory}
        onClose={() => setShowPriceHistory(false)}
        cardInfo={cardInfo}
        priceHistory={priceHistory}
        priceHistorySeries={priceHistorySeries}
        historyPeriodDays={historyPeriodDays}
        setHistoryPeriodDays={setHistoryPeriodDays}
        phLoading={phLoading}
        listings={listings}
        listingsLoading={listingsLoading}
        styles={s}
      />

      <CartModal
        visible={showCart}
        onClose={() => setShowCart(false)}
        cart={cart}
        cartTotal={cartTotal}
        pay={pay}
        setPay={setPay}
        tradeNote={tradeNote}
        setTradeNote={setTradeNote}
        tradeAffectsInventory={tradeAffectsInventory}
        setTradeAffectsInventory={setTradeAffectsInventory}
        desc={desc}
        setDesc={setDesc}
        saving={saving}
        checkoutCart={checkoutCart}
        removeFromCart={removeFromCart}
        conditions={CONDITIONS}
        payFull={PAY_FULL}
        payOrder={PAY_ORDER}
        styles={s}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  offlineBanner: {
    backgroundColor: "rgba(245,158,11,0.12)",
    borderBottomWidth: 0.5,
    borderBottomColor: colors.amber,
    paddingVertical: 5,
    paddingHorizontal: 14,
  },
  offlineTxt: { fontSize: 10, color: colors.amber, fontWeight: font.bold },
  debugBanner: {
    backgroundColor: "rgba(220,38,38,0.2)",
    borderBottomWidth: 1,
    borderBottomColor: "#DC2626",
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  debugTxt: { fontSize: 10, color: "#FC8181", fontWeight: font.bold, textAlign: "center" },
  trustedBanner: {
    backgroundColor: "rgba(25,118,210,0.15)",
    borderBottomWidth: 0.5,
    borderBottomColor: colors.blue,
    paddingVertical: 5,
    paddingHorizontal: 14,
  },
  trustedTxt: { fontSize: 10, color: colors.blue, fontWeight: font.bold },

  topbar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    flexShrink: 0,
  },
  catPill: { borderRadius: radius.md, height: 38, overflow: "hidden" },
  catPillTxt: { fontSize: 12, fontWeight: font.bold, color: "#fff" },
  searchWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(15,21,53,0.9)",
    borderRadius: radius.md,
    height: 38,
    paddingHorizontal: 10,
    gap: 6,
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  searchIc: { fontSize: 12, color: colors.textMuted },
  searchInp: { flex: 1, fontSize: 13, color: colors.text, paddingVertical: 0 },
  clearX: { color: colors.textMuted, fontSize: 12, paddingHorizontal: 4 },
  searchBtnTxt: { fontSize: 13, fontWeight: font.bold, color: "#fff" },
  iconBtn: {
    backgroundColor: "rgba(15,21,53,0.9)",
    borderRadius: radius.md,
    width: 46,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  iconEmoji: { fontSize: 15 },
  iconLabel: { fontSize: 8, color: colors.textMuted, marginTop: 1, fontWeight: font.medium },

  searchHint: { paddingHorizontal: spacing.lg, paddingBottom: 6, paddingTop: 2 },
  searchHintTxt: { fontSize: 10, color: colors.textMuted, textAlign: "center" },

  countBar: { flexDirection: "row", gap: 6, paddingHorizontal: spacing.lg, paddingBottom: 6 },
  countChip: {
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    flex: 1,
    alignItems: "center",
    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.08)",
  },
  countTxt: { fontSize: 11, fontWeight: font.bold },

  three: {
    flexDirection: "row",
    paddingHorizontal: spacing.lg,
    gap: 6,
    paddingBottom: 6,
    alignItems: "flex-start",
  },
  leftCol: { borderRightWidth: 0.5, borderRightColor: colors.borderLight },
  centerCol: { alignItems: "center" },
  rightCol: { borderLeftWidth: 0.5, borderLeftColor: colors.borderLight },
  colPad: { paddingTop: 8, paddingHorizontal: 5, paddingBottom: 20 },
  colTtl: {
    fontSize: 8,
    fontWeight: font.heavy,
    letterSpacing: 0.08,
    textTransform: "uppercase",
    color: colors.textMuted,
    marginBottom: 6,
  },
  colEmpty: {
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 14,
    textAlign: "center",
    lineHeight: 18,
  },

  infoGroup: { marginBottom: 9 },
  infoLbl: { fontSize: 9, color: colors.textMuted, marginBottom: 2 },
  infoVal: { fontSize: 12, fontWeight: font.medium, color: colors.text, lineHeight: 16 },
  condDivider: { height: 0.5, backgroundColor: colors.border, marginVertical: 8 },
  condRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    padding: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "transparent",
    marginBottom: 2,
    overflow: "hidden",
  },
  condDot: { width: 6, height: 6, borderRadius: 3, flexShrink: 0 },
  condLabel: { fontSize: 9, fontWeight: font.medium, color: colors.text },
  condPrice: { fontSize: 8, color: colors.textMuted, marginTop: 1 },
  condBaseHint: {
    fontSize: 7,
    color: colors.textMuted,
    lineHeight: 10,
    marginBottom: 6,
    fontStyle: "italic",
  },

  cardArea: { borderRadius: 12, overflow: "hidden", backgroundColor: "transparent" },
  cardPh: { flex: 1, alignItems: "center", justifyContent: "center", padding: 12 },
  cardPhIc: { fontSize: 32, opacity: 0.08, marginBottom: 8 },
  cardPhTxt: { fontSize: 10, fontWeight: font.bold, color: colors.textSub, textAlign: "center" },
  cardPhSub: { fontSize: 8, color: colors.textMuted, textAlign: "center", marginTop: 6 },

  priceSrc: {
    backgroundColor: "rgba(15,21,53,0.85)",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 10,
    marginBottom: 6,
    overflow: "hidden",
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  priceSrcGrad: { ...StyleSheet.absoluteFillObject },
  priceSrcHdr: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
    gap: 4,
  },
  priceSrcName: {
    fontSize: 9,
    fontWeight: font.heavy,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    flexShrink: 1,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.green },
  heroLbl: {
    fontSize: 9,
    color: colors.textMuted,
    fontWeight: font.heavy,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  heroVal: { fontSize: 22, fontWeight: font.heavy, color: colors.text, letterSpacing: -0.3 },
  heroSub: { fontSize: 10, color: colors.textSub, fontWeight: font.medium, marginTop: 2 },
  heroDivider: { height: 0.5, backgroundColor: colors.borderLight, marginTop: 10, marginBottom: 8 },
  heroMetaRow: { flexDirection: "row", marginTop: 8, gap: 6 },
  heroMetaCell: { flex: 1, alignItems: "flex-start" },
  heroMetaLbl: {
    fontSize: 8,
    color: colors.textMuted,
    fontWeight: font.heavy,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  heroMetaVal: { fontSize: 11, color: colors.text, fontWeight: font.bold, marginTop: 1 },
  trendCompactRow: { flexDirection: "row", alignItems: "center", paddingVertical: 3, gap: 6 },
  trendCompactLbl: {
    fontSize: 9,
    color: colors.textMuted,
    fontWeight: font.heavy,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    width: 22,
  },
  trendCompactVal: { fontSize: 11, fontWeight: font.heavy, flex: 1 },
  trendCompactPct: { fontSize: 9, fontWeight: font.medium, opacity: 0.85 },
  gradeMatrix: {
    marginTop: 6,
    alignSelf: "center",
    backgroundColor: "rgba(15,21,53,0.7)",
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 0.5,
    borderColor: colors.border,
    gap: 8,
  },
  gradeTabRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  gradeTab: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 0.5,
    borderColor: colors.borderLight,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  gradeTabTxt: {
    fontSize: 10,
    fontWeight: font.heavy,
    color: colors.textMuted,
    letterSpacing: 0.5,
  },
  gradeCoHint: {
    fontSize: 8,
    color: colors.textMuted,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  gradeCellRow: { gap: 6, paddingRight: 4, alignItems: "flex-start" },
  gradeCell: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 0.5,
    borderColor: colors.border,
    minWidth: 52,
    alignItems: "center",
  },
  gradeCellGrade: { fontSize: 13, fontWeight: font.heavy, color: colors.text, letterSpacing: 0.2 },
  gradeCellPrice: { fontSize: 9, fontWeight: font.medium, color: colors.textSub, marginTop: 2 },
  variantDropdown: {
    backgroundColor: "rgba(255,64,129,0.10)",
    borderRadius: 8,
    borderWidth: 0.5,
    borderColor: "rgba(255,64,129,0.45)",
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginBottom: 10,
  },
  variantDropdownLbl: {
    fontSize: 8,
    fontWeight: font.heavy,
    color: "#FCA5A5",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  variantDropdownRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
  },
  variantDropdownVal: { flex: 1, fontSize: 12, fontWeight: font.heavy, color: "#FF4081" },
  variantDropdownCaret: { fontSize: 12, color: "#FF4081", fontWeight: font.heavy },
  variantSheetOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  variantSheet: {
    backgroundColor: colors.bg1,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  variantSheetTitle: { fontSize: 16, fontWeight: font.heavy, color: colors.text },
  variantSheetSub: { fontSize: 11, color: colors.textSub, marginTop: 2 },
  variantSheetRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 0.5,
    borderColor: "transparent",
    marginTop: 6,
  },
  variantSheetRowOn: { backgroundColor: "rgba(255,64,129,0.16)", borderColor: "#FF4081" },
  variantSheetName: { fontSize: 13, fontWeight: font.bold, color: colors.text },
  variantSheetNameOn: { color: "#FF4081" },
  variantSheetMkt: { fontSize: 10, color: colors.textSub, marginTop: 2 },
  variantSheetCheck: { color: "#FF4081", fontSize: 16, fontWeight: font.heavy },
  priceNA: { fontSize: 9, color: colors.textMuted, paddingVertical: 4 },
  tcgWarnBanner: {
    backgroundColor: "rgba(234,179,8,0.12)",
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 4,
    marginBottom: 4,
    borderWidth: 0.5,
    borderColor: "rgba(234,179,8,0.3)",
  },
  tcgWarnTxt: { fontSize: 8, color: "#eab308", fontWeight: "700", lineHeight: 11 },

  phBtn: {
    marginTop: 5,
    borderRadius: 8,
    overflow: "hidden",
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  phBtnGrad: { paddingVertical: 7, alignItems: "center" },
  phBtnTxt: { fontSize: 10, color: colors.textSub, fontWeight: "600" },

  phRoot: { flex: 1, backgroundColor: colors.bg1 },
  phHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: 20,
    paddingTop: 24,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  phTitle: { fontSize: 18, fontWeight: font.heavy, color: colors.text },
  phSub: { fontSize: 12, color: colors.textSub, marginTop: 2 },
  phCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.bg2,
    alignItems: "center",
    justifyContent: "center",
  },
  phCloseTxt: { color: colors.textSub, fontSize: 14 },
  phHistSection: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 4 },
  phSectionLbl: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.9,
    color: colors.textMuted,
    textTransform: "uppercase",
    marginBottom: 10,
  },
  phSectionDivider: { height: 0.5, backgroundColor: colors.border, marginTop: 16 },
  phHistUnavail: { alignItems: "center", paddingVertical: 20, gap: 4 },
  phHistUnavailIc: { fontSize: 24, opacity: 0.3, marginBottom: 4 },
  phHistUnavailTxt: { fontSize: 13, color: colors.textSub },
  phHistUnavailHint: { fontSize: 11, color: colors.textMuted },
  phHistCard: {
    backgroundColor: "rgba(15,21,53,0.85)",
    borderRadius: 12,
    padding: 14,
    borderWidth: 0.5,
  },
  phHistCardHdr: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  phHistCardSrc: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  phHistCardCur: { fontSize: 18, fontWeight: "800", color: colors.text },
  phHistPeriods: { flexDirection: "row", gap: 12 },
  phHistPeriod: { flex: 1, gap: 4 },
  phHistPeriodLbl: {
    fontSize: 9,
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  phHistPeriodPrice: { fontSize: 13, fontWeight: "700", color: colors.text },
  phChangePill: {
    alignSelf: "flex-start",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 2,
  },
  phChangeTxt: { fontSize: 10, fontWeight: "700" },
  phPeriodRow: { flexDirection: "row", gap: 6, marginBottom: 10, flexWrap: "wrap" },
  phPeriodChip: {
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 0.5,
    borderColor: colors.borderLight,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  phPeriodChipOn: {
    backgroundColor: "rgba(255,64,129,0.18)",
    borderColor: "rgba(255,64,129,0.55)",
  },
  phPeriodTxt: { fontSize: 11, fontWeight: "700", color: colors.textSub, letterSpacing: 0.3 },
  phPeriodTxtOn: { color: "#FF4081" },
  listingHdr: {
    flexDirection: "row",
    paddingBottom: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  listingHdrTxt: {
    fontSize: 9,
    fontWeight: "800",
    color: colors.textMuted,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  listingRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.borderLight,
  },
  listingRowAlt: { backgroundColor: "rgba(255,255,255,0.02)" },
  listingSellerName: { fontSize: 13, fontWeight: "600", color: colors.text },
  listingTitleSub: { fontSize: 10, color: colors.textSub, marginTop: 1 },
  listingRating: { fontSize: 10, color: colors.textMuted, marginTop: 1 },
  listingCond: { fontSize: 12, color: colors.textSub, paddingHorizontal: 4 },
  listingPrice: { fontSize: 15, fontWeight: "800", color: "#4ade80" },
  listingShipping: { fontSize: 10, color: colors.textMuted, marginTop: 1 },

  catPillGrad: {
    borderRadius: radius.md,
    height: 38,
    paddingHorizontal: 10,
    justifyContent: "center",
  },
  searchBtnGrad: {
    borderRadius: radius.md,
    height: 38,
    paddingHorizontal: 14,
    justifyContent: "center",
  },

  logBar: {
    marginHorizontal: spacing.lg,
    marginBottom: 8,
    borderRadius: 14,
    backgroundColor: "rgba(15,21,53,0.95)",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: "rgba(233,30,99,0.5)",
    flexShrink: 0,
    overflow: "hidden",
  },
  logBarEmpty: { borderColor: colors.border, opacity: 0.5 },
  logBarInner: { flexDirection: "row", alignItems: "center", gap: 12 },
  logBarPrice: { fontSize: 28, fontWeight: font.heavy, color: colors.red, flexShrink: 0 },
  logBarCenter: { flex: 1, minWidth: 0 },
  logBarName: { fontSize: 14, fontWeight: font.bold, color: colors.text },
  logBarCond: { fontSize: 10, color: colors.textSub, marginTop: 2 },
  logBarTag: {
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 5,
    flexShrink: 0,
  },
  logBarTagTxt: { fontSize: 12, fontWeight: font.heavy, color: "#fff" },
  logBarEmptyTxt: { fontSize: 12, color: colors.textMuted, textAlign: "center" },

  drawerOverlay: { flex: 1, justifyContent: "flex-end" },
  drawerDismiss: { flex: 1, backgroundColor: "rgba(0,0,0,0.65)" },
  drawer: {
    backgroundColor: "#161929",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: 0.5,
    borderTopColor: colors.border,
    paddingBottom: 30,
  },
  drawerHandle: {
    width: 36,
    height: 4,
    backgroundColor: colors.bg3,
    borderRadius: 2,
    marginTop: 10,
    marginBottom: 5,
    alignSelf: "center",
  },
  drawerHdr: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  drawerTtl: {
    fontSize: 15,
    fontWeight: font.heavy,
    color: colors.text,
    flex: 1,
    paddingRight: 12,
  },
  drawerClose: { fontSize: 13, color: colors.red, fontWeight: font.bold },
  drawerBody: { paddingHorizontal: 14, paddingBottom: 10, gap: 9 },
  drawerSub: {
    fontSize: 11,
    color: colors.textMuted,
    lineHeight: 15,
    marginBottom: 4,
    paddingHorizontal: 2,
  },
  dirRow: { flexDirection: "row", gap: 8 },
  dirBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.bg1,
    alignItems: "center",
    gap: 3,
  },
  dirBtnSold: { backgroundColor: colors.redL, borderColor: colors.red },
  dirBtnAcq: { backgroundColor: "rgba(34,197,94,0.12)", borderColor: colors.green },
  dirBtnDisabled: { opacity: 0.45 },
  dirArrow: { fontSize: 16, fontWeight: font.heavy, color: colors.textSub },
  dirLbl: { fontSize: 13, fontWeight: font.bold, color: colors.textSub },
  priceField: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.bg1,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.red,
    paddingHorizontal: 14,
  },
  priceDollar: { fontSize: 20, fontWeight: font.heavy, color: colors.red },
  priceInp: {
    flex: 1,
    fontSize: 28,
    fontWeight: font.heavy,
    color: colors.text,
    paddingVertical: 10,
    textAlign: "center",
  },
  mktRef: { fontSize: 10, color: colors.textMuted, textAlign: "center", marginTop: -4 },
  payRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
  },
  payPill: {
    width: "33.333%",
    paddingVertical: 11,
    alignItems: "center",
    backgroundColor: colors.bg1,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  payPillOn: { backgroundColor: colors.bg2 },
  payPillTxt: { fontSize: 11, fontWeight: font.bold, color: colors.textSub },
  tradeHint: {
    fontSize: 10,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: 6,
    marginBottom: 2,
    paddingHorizontal: 4,
  },
  tradeNoteField: {
    backgroundColor: colors.bg1,
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: "rgba(168,85,247,0.35)",
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 13,
    color: colors.text,
    minHeight: 64,
    textAlignVertical: "top",
    marginTop: 8,
  },
  tradeInvRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 4,
    gap: 12,
  },
  tradeInvTitle: { fontSize: 14, fontWeight: "700", color: colors.text, flex: 1 },
  tradeInvSub: { fontSize: 11, color: colors.muted, marginTop: 2, lineHeight: 15 },
  descField: {
    backgroundColor: colors.bg1,
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingTop: 11,
    paddingBottom: 11,
    fontSize: 13,
    color: colors.text,
    height: 72,
    textAlignVertical: "top",
  },
  recBtn: {
    paddingVertical: 15,
    borderRadius: 12,
    backgroundColor: colors.bg1,
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  recBtnAcq: { backgroundColor: colors.green, borderColor: colors.green },
  recBtnOff: { opacity: 0.4 },
  recBtnTxt: { fontSize: 14, fontWeight: font.heavy, color: colors.text },

  modalSafe: { flex: 1, backgroundColor: "#0D0F1C" },
  modalHdr: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.lg,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  modalClose: { fontSize: 14, color: colors.red, fontWeight: font.medium, width: 60 },
  modalTtl: { fontSize: 17, fontWeight: font.heavy, color: colors.text },
  modalSub: {
    fontSize: 12,
    color: colors.textSub,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  modalSub2: { fontSize: 12, color: colors.textSub, width: 60, textAlign: "right" },
  scanToolbar: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  scanSummaryRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  scanSummaryText: {
    flex: 1,
    fontSize: 14,
    fontWeight: font.bold,
    color: colors.text,
    lineHeight: 20,
  },
  scanViewSeg: {
    flexDirection: "row",
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
  },
  scanViewSegBtn: { paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.bg1 },
  scanViewSegBtnOn: { backgroundColor: "rgba(59,130,246,0.2)" },
  scanViewSegTxt: { fontSize: 12, fontWeight: font.bold, color: colors.textSub },
  scanViewSegTxtOn: { color: "#93C5FD" },
  scanFilterBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
  },
  scanFiltToggleHit: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingRight: 10,
  },
  scanFiltChev: { fontSize: 12, fontWeight: font.bold, color: "#60A5FA" },
  scanFiltersPill: { fontSize: 12, fontWeight: font.heavy, color: colors.text },
  scanClearTxt: { fontSize: 12, fontWeight: font.bold, color: "#60A5FA" },
  scanFiltRowLabel: {
    fontSize: 10,
    fontWeight: font.bold,
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginTop: 8,
    marginBottom: 5,
  },
  scanFiltScroll: { flexGrow: 0, paddingBottom: 2, alignItems: "center" },
  scanFiltChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg1,
    marginRight: 8,
  },
  scanFiltChipOn: { borderColor: "#3B82F6", backgroundColor: "rgba(59,130,246,0.12)" },
  scanFiltChipTxt: { fontSize: 12, fontWeight: font.bold, color: colors.textSub },
  scanFiltChipTxtOn: { color: "#93C5FD" },
  scanGridRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "stretch" },
  scanGridCard: {
    backgroundColor: colors.bg1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 8,
  },
  scanGridImgWrap: {
    width: "100%",
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: colors.bg2,
    marginBottom: 8,
  },
  scanGridLangDot: {
    position: "absolute",
    top: 6,
    right: 6,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  scanGridLangTxt: { fontSize: 9, fontWeight: font.heavy },
  scanGridYoursDot: {
    position: "absolute",
    bottom: 5,
    left: 5,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    backgroundColor: "rgba(168,85,247,0.92)",
  },
  scanGridYoursTxt: { fontSize: 11, fontWeight: font.heavy, color: "#fff" },
  catGridQtyDot: {
    position: "absolute",
    top: 6,
    left: 6,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
    backgroundColor: "rgba(233,30,99,0.9)",
  },
  catGridQtyTxt: { fontSize: 9, fontWeight: font.heavy, color: "#fff" },
  catGridPriceDot: {
    position: "absolute",
    bottom: 6,
    right: 6,
    backgroundColor: "rgba(0,0,0,0.75)",
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  catGridPriceTxt: { fontSize: 10, fontWeight: font.bold, color: "#fff" },
  scanGridName: { fontSize: 13, fontWeight: font.heavy, color: colors.text, marginBottom: 4 },
  scanGridMeta: { fontSize: 10, color: colors.textSub, lineHeight: 14, marginBottom: 4 },
  scanGridStage: { fontSize: 10, color: colors.textMuted, marginBottom: 4 },
  scanGridFrom: { fontSize: 10, color: colors.textMuted, marginTop: 2 },
  scanGridPriceBig: { fontSize: 18, fontWeight: font.heavy, color: colors.text, marginTop: 2 },
  scanGridMarketRow: { fontSize: 10, color: "#4ADE80", marginTop: 2, fontWeight: font.bold },
  scanListMeta: { fontSize: 11, color: colors.textSub, lineHeight: 16, marginTop: 2 },
  scanListStage: { fontSize: 10, color: colors.textMuted, marginTop: 2 },
  scanListFrom: { fontSize: 9, color: colors.textMuted },
  scanListMarket: { fontSize: 10, color: "#4ADE80", marginTop: 2, fontWeight: font.bold },
  catSearchWrap: { padding: spacing.lg, borderBottomWidth: 0.5, borderBottomColor: colors.border },
  catSearchInp: {
    backgroundColor: colors.bg1,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    color: colors.text,
  },
  scanItem: { flexDirection: "row", alignItems: "center", padding: spacing.lg, gap: 12 },
  scanThumb: {
    width: 44,
    height: 62,
    borderRadius: 7,
    overflow: "hidden",
    backgroundColor: colors.bg1,
    flexShrink: 0,
  },
  scanInfo: { flex: 1, minWidth: 0 },
  scanName: { fontSize: 13, fontWeight: font.bold, color: colors.text },
  scanRight: { alignItems: "flex-end", flexShrink: 0 },
  scanPrice: { fontSize: 14, fontWeight: font.bold, color: colors.red },
  scanArr: { fontSize: 18, color: colors.textMuted },
  langBadge: { borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  langBadgeTxt: { fontSize: 9, fontWeight: font.heavy, letterSpacing: 0.3 },
  catalogTag: {
    borderRadius: 5,
    paddingHorizontal: 7,
    paddingVertical: 2,
    backgroundColor: "rgba(168,85,247,0.22)",
    borderWidth: 0.5,
    borderColor: "rgba(196,181,253,0.45)",
  },
  catalogTagTxt: { fontSize: 11, fontWeight: font.heavy, color: "#d8b4fe" },
  srcBadge: {
    backgroundColor: colors.bg2,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  srcBadgeTxt: { fontSize: 9, fontWeight: font.bold },
  catItem: { flexDirection: "row", alignItems: "center", padding: spacing.lg, gap: 12 },
  catThumb: {
    width: 40,
    height: 56,
    borderRadius: 7,
    overflow: "hidden",
    backgroundColor: colors.bg1,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  catInfo: { flex: 1, minWidth: 0 },
  catName: { fontSize: 14, fontWeight: font.bold, color: colors.text },
  catSet: { fontSize: 11, color: colors.textSub, marginTop: 2 },
  catCond: { fontSize: 10, color: colors.textMuted, marginTop: 2 },
  catPrice: { fontSize: 12, fontWeight: font.bold, color: colors.red, marginTop: 3 },
  qtyBadge: {
    borderRadius: radius.md,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 36,
  },
  qtyTxt: { fontSize: 11, fontWeight: font.heavy },
  catArr: { fontSize: 22, color: colors.textMuted },

  cartPill: { borderRadius: radius.md, height: 38, overflow: "hidden" },
  cartPillGrad: {
    borderRadius: radius.md,
    height: 38,
    paddingHorizontal: 10,
    justifyContent: "center",
  },
  cartPillTxt: { fontSize: 12, fontWeight: font.heavy, color: "#fff" },

  cartAddBtn: { borderRadius: 8, overflow: "hidden", marginRight: 4 },
  cartAddGrad: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  cartAddTxt: { fontSize: 13, fontWeight: font.heavy, color: "#fff" },

  cartRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.lg,
    gap: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  cartThumb: {
    width: 44,
    height: 62,
    borderRadius: 7,
    overflow: "hidden",
    backgroundColor: colors.bg1,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  cartCardName: { fontSize: 14, fontWeight: font.bold, color: colors.text, marginBottom: 2 },
  cartCardSub: { fontSize: 11, color: colors.textSub, marginBottom: 5 },
  cartCondBadge: {
    alignSelf: "flex-start",
    borderRadius: 5,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  cartCondTxt: { fontSize: 10, fontWeight: font.bold },
  cartPrice: { fontSize: 16, fontWeight: font.heavy, color: colors.green },
  cartRemove: { fontSize: 14, color: colors.textMuted },

  cartTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: 4,
  },
  cartTotalLbl: { fontSize: 13, color: colors.textSub, fontWeight: font.bold },
  cartTotalVal: { fontSize: 22, fontWeight: font.heavy, color: colors.green },

  cartCheckoutWrap: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    backgroundColor: colors.bg1,
    borderTopWidth: 0.5,
    borderTopColor: colors.border,
  },
  cartCheckoutBtn: { borderRadius: 14, overflow: "hidden" },
  cartCheckoutGrad: { paddingVertical: 16, alignItems: "center" },
  cartCheckoutTxt: { fontSize: 16, fontWeight: font.heavy, color: "#fff" },

});
