import React, { useState } from "react";
import { View, StyleSheet, Text, TouchableOpacity, Dimensions } from "react-native";
import PagerView from "react-native-pager-view";

import HomePrincipal from "./HomePrincipal";
import TelaGanhadores from "./TelaGanhadores";
import TelaSorteioCassino from "./TelaSorteioCassino";

const { width } = Dimensions.get("window");

export default function HomeUser() {
  const [page, setPage] = useState(0);
  const pagerRef = React.useRef(null);

  const tabs = [
    { label: "🏠 Início", component: <HomePrincipal /> },
    { label: "🏆 Ganhadores", component: <TelaGanhadores /> },
    { label: "🎰 Sorteio", component: <TelaSorteioCassino /> },
  ];

  const handleTabPress = (index) => {
    setPage(index);
    pagerRef.current.setPage(index);
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#0f172a" }}>
      {/* PagerView para swipe */}
      <PagerView
        style={{ flex: 1 }}
        initialPage={0}
        ref={pagerRef}
        onPageSelected={(e) => setPage(e.nativeEvent.position)}
      >
        {tabs.map((tab, index) => (
          <View key={index} style={{ flex: 1 }}>
            {tab.component}
          </View>
        ))}
      </PagerView>

      {/* Menu embaixo */}
      <View style={styles.tabBar}>
        {tabs.map((tab, index) => (
          <TouchableOpacity
            key={index}
            style={styles.tabItem}
            onPress={() => handleTabPress(index)}
          >
            <Text style={{ color: page === index ? "#f59e0b" : "#6b7280", fontWeight: "bold" }}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: "row",
    justifyContent: "space-around",
    backgroundColor: "#0f172a",
    height: 60,
    alignItems: "center",
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
  },
});
