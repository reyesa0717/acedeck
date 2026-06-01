// App root: wires up auth, navigation (tabs + stacks gated by role/permissions), and the
// Supabase client, then renders the correct stack for owner vs guest sessions.
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Platform,
  useWindowDimensions,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";

import { AuthProvider, useAuth } from "./frontend/src/context/AuthContext";
import { startNetworkMonitoring } from "./frontend/src/services/offlineManager";
import AuthScreen from "./frontend/src/screens/AuthScreen";
import GuestScreen from "./frontend/src/screens/GuestScreen";
import POSScreen from "./frontend/src/screens/POSScreen";
import ImportScreen from "./frontend/src/screens/ImportScreen";
import HistoryScreen from "./frontend/src/screens/HistoryScreen";
import AccountScreen from "./frontend/src/screens/AccountScreen";
import CardDetailScreen from "./frontend/src/screens/CardDetailScreen";
import PinManagerScreen from "./frontend/src/screens/PinManagerScreen";
import CustomerBrowseScreen from "./frontend/src/screens/CustomerBrowseScreen";
import { colors, font, gradients } from "./frontend/src/utils/theme";
import { clearImageCacheFromAsyncStorage } from "./backend/src/services/storage";

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

// Tab icon
function TabIcon({ focused, icon, label, locked, large }) {
  return (
    <View style={[ts.tab, locked && ts.tabLocked]}>
      <Text style={[ts.tabIcon, focused && ts.tabIconOn, large && ts.tabIconLg]}>
        {locked ? "🔒" : icon}
      </Text>
      <Text
        style={[
          ts.tabLabel,
          focused && ts.tabLabelOn,
          locked && ts.tabLabelLocked,
          large && ts.tabLabelLg,
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

// Catalog stack
function ImportStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Catalog" component={ImportScreen} />
      <Stack.Screen
        name="CardDetail"
        component={CardDetailScreen}
        options={{ animation: "slide_from_right" }}
      />
    </Stack.Navigator>
  );
}

// Account
function AccountStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="AccountHome" component={AccountScreen} />
      <Stack.Screen
        name="PinManager"
        component={PinManagerScreen}
        options={{ animation: "slide_from_right" }}
      />
    </Stack.Navigator>
  );
}

// Main tabs
function MainTabs() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { isGuest, guestPerms } = useAuth();

  const historyLocked = isGuest && !guestPerms?.canHistory;
  const accountLocked = isGuest;

  const shortSide = Math.min(width, height);
  const largeTabBar = shortSide >= 600;
  const bottomPad = Math.max(insets.bottom, Platform.OS === "android" ? 10 : 8);
  const tabBarHeight = (largeTabBar ? 56 : 50) + bottomPad;

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: {
          ...ts.tabBar,
          height: tabBarHeight,
          paddingBottom: bottomPad,
          paddingTop: largeTabBar ? 8 : 5,
        },
      }}
    >
      <Tab.Screen
        name="POS"
        component={POSScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} icon="🛒" label="POS" large={largeTabBar} />
          ),
        }}
      />
      <Tab.Screen
        name="Import"
        component={ImportStack}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} icon="📂" label="Catalog" large={largeTabBar} />
          ),
        }}
      />
      <Tab.Screen
        name="History"
        component={HistoryScreen}
        listeners={historyLocked ? { tabPress: (e) => e.preventDefault() } : {}}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon
              focused={focused}
              icon="📋"
              label="History"
              locked={historyLocked}
              large={largeTabBar}
            />
          ),
        }}
      />
      <Tab.Screen
        name="Account"
        component={AccountStack}
        listeners={accountLocked ? { tabPress: (e) => e.preventDefault() } : {}}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon
              focused={focused}
              icon="👤"
              label="Account"
              locked={accountLocked}
              large={largeTabBar}
            />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

function RootStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MainTabs" component={MainTabs} />
      <Stack.Screen
        name="CustomerBrowse"
        component={CustomerBrowseScreen}
        options={{ animation: "slide_from_bottom", presentation: "fullScreenModal" }}
      />
    </Stack.Navigator>
  );
}
// Auth Gate
function RootNavigator() {
  const { user, isGuest, loading } = useAuth();
  const [guestEntered, setGuestEntered] = useState(false);

  if (loading)
    return (
      <LinearGradient
        colors={gradients.bg}
        style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
        start={gradients.bgStart}
        end={gradients.bgEnd}
      >
        <Text style={{ fontSize: 36, marginBottom: 20 }}>🃏</Text>
        <ActivityIndicator color={colors.red} />
      </LinearGradient>
    );

  if (!user && !isGuest) return <AuthScreen />;

  if (isGuest && !user && !guestEntered) {
    return <GuestScreen onEnter={() => setGuestEntered(true)} />;
  }

  return <RootStack />;
}

// Root
export default function App() {
  useEffect(() => {
    clearImageCacheFromAsyncStorage();
    startNetworkMonitoring();
  }, []);

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <NavigationContainer>
          <StatusBar style="light" />
          <RootNavigator />
        </NavigationContainer>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const ts = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.bg3,
  },
  tab: { alignItems: "center", gap: 2, paddingTop: 2 },
  tabLocked: { opacity: 0.3 },
  tabIcon: { fontSize: 20, opacity: 0.3 },
  tabIconLg: { fontSize: 24 },
  tabIconOn: { opacity: 1 },
  tabLabel: { fontSize: 10, fontWeight: font.medium, color: colors.textMuted },
  tabLabelLg: { fontSize: 11 },
  tabLabelOn: { color: colors.red },
  tabLabelLocked: { color: colors.textMuted },
});
