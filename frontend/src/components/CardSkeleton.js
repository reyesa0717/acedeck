// Pulsing placeholder shown while a card image loads.
import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet } from "react-native";

export default function CardSkeleton({ style }) {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.7, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 700, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return <Animated.View style={[s.skeleton, style, { opacity }]} />;
}

const s = StyleSheet.create({
  skeleton: { backgroundColor: "#30363D", borderRadius: 6 },
});
