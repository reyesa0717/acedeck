// Responsive layout helper: derives phone/tablet breakpoints and grid columns from screen size.
import { useMemo } from "react";
import { useWindowDimensions, Platform } from "react-native";

export const TABLET_MIN_SHORT_SIDE = 600;

export const TABLET_WIDE_MIN_SHORT_SIDE = 720;

export function isTabletLayout(width, height) {
  return Math.min(width, height) >= TABLET_MIN_SHORT_SIDE;
}

export function isTabletWideLayout(width, height) {
  return Math.min(width, height) >= TABLET_WIDE_MIN_SHORT_SIDE;
}

export function useLayoutMetrics() {
  const { width, height, fontScale } = useWindowDimensions();
  const shortSide = Math.min(width, height);
  const longSide = Math.max(width, height);
  const isTablet = shortSide >= TABLET_MIN_SHORT_SIDE;
  const isTabletWide = shortSide >= TABLET_WIDE_MIN_SHORT_SIDE;

  const maxContentWidth = useMemo(() => {
    if (!isTablet) return width;
    return Math.min(width, 960);
  }, [width, isTablet]);

  const catalogGridColumns = useMemo(() => {
    if (shortSide >= 900) return 4;
    if (shortSide >= TABLET_WIDE_MIN_SHORT_SIDE) return 3;
    return 2;
  }, [shortSide]);

  return {
    width,
    height,
    shortSide,
    longSide,
    isTablet,
    isTabletWide,
    maxContentWidth,
    catalogGridColumns,
    fontScale: fontScale || 1,
    platform: Platform.OS,
  };
}
