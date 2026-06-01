// Card image by Scrydex card id, fetched as base64 through the image queue and memoized in-process.
import React, { useState, useEffect, useRef, useCallback } from "react";
import { Image, View, Text, StyleSheet } from "react-native";
import { fetchImageAsBase64, extractCardImageUrl } from "../../../backend/src/services/scrydex";
import { enqueueImageTask } from "../services/imageQueue";
import CardSkeleton from "./CardSkeleton";

const memCache = {};

export default function PokeImage({ cardId, size = "low", style, resizeMode = "contain" }) {
  const key = cardId ? cardId + "_" + size : null;

  const [uri, setUri] = useState(key && memCache[key] ? memCache[key] : null);
  const [loading, setLoading] = useState(!!(key && !memCache[key]));
  const queued = useRef(false);

  useEffect(() => {
    if (!key || memCache[key] || queued.current) {
      if (memCache[key]) {
        setUri(memCache[key]);
        setLoading(false);
      }
      return;
    }

    queued.current = true;
    let cancelled = false;

    enqueueImageTask(async () => {
      if (cancelled) return;

      const dataUri = await fetchImageAsBase64(cardId, size);
      if (cancelled) return;

      if (dataUri) {
        memCache[key] = dataUri;
        setUri(dataUri);
      }
      setLoading(false);
    }, size === "high").catch(() => {
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [key]);

  const [imgErr, setImgErr] = useState(false);

  if (loading) return <CardSkeleton style={style} />;
  if (uri && !imgErr)
    return (
      <Image
        source={{ uri }}
        style={style}
        resizeMode={resizeMode}
        fadeDuration={100}
        onError={() => setImgErr(true)}
      />
    );

  return (
    <View style={[s.ph, style]}>
      <Text style={s.phTxt}>{"🃏"}</Text>
    </View>
  );
}

const PREFERRED_LOAD_MS = 3200;

export function CardImageWithFallback({ card, cardId, size = "low", style, resizeMode = "cover" }) {
  const preferredRaw = card ? extractCardImageUrl(card) : null;
  const preferred =
    preferredRaw && String(preferredRaw).trim().startsWith("http")
      ? String(preferredRaw).trim()
      : null;
  const [preferFailed, setPreferFailed] = useState(false);
  const slowTimer = useRef(null);

  const clearSlow = useCallback(() => {
    if (slowTimer.current) {
      clearTimeout(slowTimer.current);
      slowTimer.current = null;
    }
  }, []);

  useEffect(() => {
    setPreferFailed(false);
    clearSlow();
    if (!preferred) return;
    slowTimer.current = setTimeout(() => setPreferFailed(true), PREFERRED_LOAD_MS);
    return clearSlow;
  }, [cardId, preferred, clearSlow]);

  const onPreferLoad = useCallback(() => {
    clearSlow();
  }, [clearSlow]);

  if (preferred && !preferFailed) {
    return (
      <Image
        source={{ uri: preferred }}
        style={style}
        resizeMode={resizeMode}
        fadeDuration={80}
        onError={() => setPreferFailed(true)}
        onLoad={onPreferLoad}
      />
    );
  }

  return <PokeImage cardId={cardId} size={size} style={style} resizeMode={resizeMode} />;
}

const s = StyleSheet.create({
  ph: { alignItems: "center", justifyContent: "center", backgroundColor: "#161B22" },
  phTxt: { fontSize: 22, opacity: 0.2 },
});
