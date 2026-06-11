import { Tabs } from 'expo-router';
import { LayoutDashboard, ShoppingCart, Map, BarChart3, Receipt } from 'lucide-react-native';
import { theme } from '../../src/theme';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: theme.colors.card },
        headerTitleStyle: { fontFamily: 'Inter_600SemiBold' },
        headerShadowVisible: false,
        tabBarStyle: {
          backgroundColor: theme.colors.card,
          borderTopColor: theme.colors.border,
          height: 60,
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarActiveTintColor: theme.colors.blue,
        tabBarInactiveTintColor: theme.colors.textSecondary,
        tabBarLabelStyle: {
          fontFamily: 'Inter_500Medium',
          fontSize: 11,
          marginTop: 4,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color, size }) => (
            <LayoutDashboard color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="reorder"
        options={{
          title: 'Reorder',
          tabBarIcon: ({ color, size }) => (
            <ShoppingCart color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="ordervalue"
        options={{
          title: 'Order Value',
          tabBarIcon: ({ color, size }) => (
            <Receipt color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="routes"
        options={{
          title: 'Routes',
          tabBarIcon: ({ color, size }) => (
            <Map color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          title: 'Reports',
          tabBarIcon: ({ color, size }) => (
            <BarChart3 color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
