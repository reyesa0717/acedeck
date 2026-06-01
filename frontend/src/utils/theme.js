// Central design tokens: color palette, gradients, font weights, radii, and spacing.
// Blue:   #1976D2
// Pink:   #E91E63
// Purple: #8E24AA
// Yellow: #FBC02D
// Dark:   #0D1117

export const colors = {
  bg: "#0D1117",
  bg1: "#161B22",
  bg2: "#1C2128",
  bg3: "#21262D",

  text: "#F0F6FC",
  textSub: "#8B949E",
  textMuted: "#484F58",

  border: "#30363D",
  borderLight: "#21262D",

  red: "#E91E63",
  redL: "rgba(233,30,99,0.15)",

  blue: "#1976D2",
  blueL: "rgba(25,118,210,0.15)",

  purple: "#8E24AA",
  purpleL: "rgba(142,36,170,0.15)",

  yellow: "#FBC02D",
  yellowL: "rgba(251,192,45,0.15)",

  pink: "#E91E63",
  pinkL: "rgba(233,30,99,0.15)",

  green: "#22C55E",
  greenL: "rgba(34,197,94,0.12)",
  amber: "#F59E0B",
  amberL: "rgba(245,158,11,0.12)",

  gold: "#FBC02D",
  goldL: "rgba(251,192,45,0.15)",

  teal: "#1976D2",
  tealLight: "rgba(25,118,210,0.15)",
};

// Blue→Purple, Pink→Purple, Yellow→Pink
export const gradients = {
  // Background: very dark, subtle violet bleed top-left → near black
  bg: ["#0f0d1a", "#0D1117", "#0D1117"],
  bgStart: { x: 0, y: 0 },
  bgEnd: { x: 1, y: 1 },

  // Primary action: Pink → Purple
  primary: ["#E91E63", "#8E24AA"],
  primaryH: { x: 0, y: 0 },
  primaryV: { x: 1, y: 0 },

  // Gold/Yellow accent: Yellow → warm orange
  gold: ["#FBC02D", "#F59E0B"],
  goldH: { x: 0, y: 0 },
  goldV: { x: 1, y: 0 },

  // Catalog pill: Blue → Purple
  catalog: ["#1976D2", "#8E24AA"],

  // Stat chips with thin background tints
  sold: ["rgba(233,30,99,0.20)", "rgba(142,36,170,0.08)"],
  acquired: ["rgba(34,197,94,0.20)", "rgba(22,163,74,0.06)"],
  revenue: ["rgba(251,192,45,0.20)", "rgba(233,30,99,0.06)"],

  // Panel overlays
  panelRed: ["rgba(233,30,99,0.12)", "rgba(142,36,170,0.03)"],
  panelBlue: ["rgba(25,118,210,0.12)", "rgba(142,36,170,0.03)"],

  // Log bar: Pink → Purple glow
  logbar: ["rgba(233,30,99,0.14)", "rgba(142,36,170,0.08)"],

  // Section: subtle blue wash
  section: ["rgba(25,118,210,0.14)", "rgba(142,36,170,0.04)"],
};

export const font = {
  regular: "400",
  medium: "500",
  bold: "700",
  heavy: "800",
};

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 18,
  full: 999,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
};
