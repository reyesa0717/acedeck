// CSV helpers: quote-aware line parser, Collectr/manual column mapping, and export-to-file.
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

function parseCSVLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function csvVal(value) {
  const str = value == null ? "" : String(value);
  return /[,"\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function csvRow(values) {
  return values.map(csvVal).join(",");
}

export async function importCollectrCSV() {
  // Use */* so iOS Files / Safari downloads are selectable. Narrow CSV UTIs often gray out
  // real .csv files because their declared type is public.data or another generic UTI.
  const result = await DocumentPicker.getDocumentAsync({
    type: "*/*",
    copyToCacheDirectory: true,
  });

  if (result.canceled || !result.assets?.length) return null;

  const file = result.assets[0];
  const text = await FileSystem.readAsStringAsync(file.uri, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  return parseCollectrText(text);
}

export function parseCollectrText(text) {
  const lines = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((l) => l.trim());

  if (lines.length < 2) throw new Error("CSV appears empty or has no data rows.");

  const headers = parseCSVLine(lines[0]).map((h) =>
    h
      .trim()
      .toLowerCase()
      .replace(/^\uFEFF/, "")
      .replace(/^"|"$/g, "")
  );

  const get = (row, ...keys) => {
    for (const key of keys) {
      let idx = -1;
      if (key.endsWith("~")) {
        const prefix = key.slice(0, -1).toLowerCase();
        idx = headers.findIndex((h) => h.startsWith(prefix));
      } else {
        idx = headers.indexOf(key.toLowerCase());
      }
      if (idx >= 0 && idx < row.length && row[idx] != null) {
        return row[idx].toString().trim().replace(/^"|"$/g, "");
      }
    }
    return "";
  };

  const parsePrice = (str) => {
    if (!str) return 0;
    const num = parseFloat(str.replace(/[$,\s]/g, "").replace(",", "."));
    return isNaN(num) ? 0 : num;
  };

  const cards = [];

  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVLine(lines[i]);
    const name = get(row, "product name", "name", "card name", "title");
    if (!name) continue;

    const qty = parseInt(get(row, "quantity", "qty", "count"), 10) || 1;

    const gradingService = get(
      row,
      "grading service",
      "gradingservice",
      "grader",
      "grading company"
    );
    const gradeNum = get(row, "grade", "grade number", "grade #");
    const rawCondition = get(row, "card condition", "condition");
    let condition = rawCondition;
    if (gradingService && gradeNum) {
      condition = gradingService.trim().toUpperCase() + " " + gradeNum.trim();
    } else if (gradingService) {
      condition = gradingService.trim().toUpperCase();
    }

    const myPrice = parsePrice(
      get(row, "my price", "list price", "listing price", "asking price", "ask price", "sale price")
    );
    const marketPriceRef = parsePrice(
      get(row, "market price~", "market price", "market value", "value", "price")
    );
    const cmPrice = parsePrice(
      get(row, "cardmarket price", "card market price", "cm price", "cardmarket", "cm")
    );
    const productKind = get(row, "product kind", "productkind", "item type").toLowerCase().trim();
    const sealedKindRaw = get(row, "sealed kind", "sealedkind", "sealed type", "product format");
    const sealedKind = sealedKindRaw ? sealedKindRaw.trim() : "";
    const portfolio = get(row, "portfolio name", "portfolio", "binder", "folder").trim();

    let variance = get(row, "variance", "variant");
    const rarity = get(row, "rarity", "card rarity");
    if (!variance && rarity) {
      const ro = rarity.toLowerCase();
      if (ro.includes("reverse") && ro.includes("holo")) variance = "Reverse Holofoil";
      else if (
        /\bholo\s*rare\b/i.test(rarity) ||
        (/\bholofoil\b/i.test(ro) && !ro.includes("reverse"))
      )
        variance = "Holofoil";
    }

    const card = {
      id: `collectr_${i}_${Date.now()}`,
      name,
      set: get(row, "set", "set name", "expansion", "series"),
      number: get(row, "card number", "number", "card #", "#"),
      condition,
      marketPrice: myPrice > 0 ? myPrice : marketPriceRef,
      marketRef: marketPriceRef,
      cmPrice,
      buyPrice: parsePrice(
        get(row, "average cost paid", "price paid", "cost", "buy price", "paid")
      ),
      image: get(row, "image", "image url", "img"),
      rarity,
      variance,
      grade: gradeNum,
      quantity: qty,
      source: "collectr",
      ...(portfolio ? { portfolio } : {}),
      ...(productKind ? { productKind } : {}),
      ...(sealedKind ? { sealedKind } : {}),
    };

    cards.push(card);
  }

  if (!cards.length) throw new Error("No cards found. Headers: " + headers.slice(0, 6).join(", "));
  return cards;
}

export async function exportTransactionsCSV(transactions) {
  if (!transactions?.length) throw new Error("No sales to export.");
  const header = csvRow([
    "Date",
    "Time",
    "Card Name",
    "Set",
    "Number",
    "Condition",
    "Direction",
    "Amount",
    "Payment",
    "Description",
    "Received in trade",
    "Market Price",
    "Card ID",
  ]);
  const rows = transactions.map((t) => {
    const d = new Date(t.time);
    return csvRow([
      d.toLocaleDateString(),
      d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      t.name || "",
      t.set || "",
      t.number || "",
      t.condition || "",
      t.dir === "out" ? "Sold" : "Acquired",
      t.amount != null && t.amount !== "" ? "$" + Number(t.amount).toFixed(2) : "",
      payLabel(t.pay),
      t.desc || "",
      t.tradeReceived || "",
      t.marketPrice ? "$" + Number(t.marketPrice).toFixed(2) : "",
      t.cardId || "",
    ]);
  });
  const date = new Date().toISOString().slice(0, 10);
  return shareCSV([header, ...rows].join("\n"), `AceDeck_Sales_${date}.csv`);
}

export async function exportAcquisitionsCSV(acquisitions) {
  if (!acquisitions?.length) throw new Error("No acquisitions to export.");
  const header = csvRow([
    "Date",
    "Time",
    "Card Name",
    "Set",
    "Number",
    "Rarity",
    "Condition",
    "Price Paid",
    "Payment",
    "Description",
    "Traded away / notes",
    "Market Price",
    "Card ID",
  ]);
  const rows = acquisitions.map((a) => {
    const d = new Date(a.time);
    return csvRow([
      d.toLocaleDateString(),
      d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      a.name || "",
      a.set || "",
      a.number || "",
      a.rarity || "",
      a.condition || "",
      a.amount != null && a.amount !== "" ? "$" + Number(a.amount).toFixed(2) : "",
      payLabel(a.pay),
      a.desc || "",
      a.tradeReceived || "",
      a.marketPrice ? "$" + Number(a.marketPrice).toFixed(2) : "",
      a.cardId || "",
    ]);
  });
  const date = new Date().toISOString().slice(0, 10);
  return shareCSV([header, ...rows].join("\n"), `AceDeck_Acquisitions_${date}.csv`);
}

async function shareCSV(csv, filename) {
  const path = FileSystem.documentDirectory + filename;
  await FileSystem.writeAsStringAsync(path, csv, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(path, {
      mimeType: "text/csv",
      dialogTitle: "Export " + filename,
      UTI: "public.comma-separated-values-text",
    });
  }
  return filename;
}

function payLabel(pay) {
  return (
    { CA: "Cash App", Zelle: "Zelle", Cash: "Cash", Venmo: "Venmo", PP: "PayPal", TR: "Trade" }[
      pay
    ] ||
    pay ||
    ""
  );
}
