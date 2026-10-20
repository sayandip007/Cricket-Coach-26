import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { LayoutGrid, Users, Trophy, Globe, User } from 'lucide-react';
import { useGame, MainTab } from '../../context/GameContext';
import { sound } from '../../utils/soundEffects';

export const TabBar: React.FC = () => {
  const { activeTab, setActiveTab } = useGame();

  const handleTabClick = (tab: MainTab) => {
    sound.playTap();
    setActiveTab(tab);
  };

  const navItems = [
    { id: 'hub' as MainTab, label: 'Hub', icon: LayoutGrid },
    { id: 'team' as MainTab, label: 'Team', icon: Users },
    { id: 'league' as MainTab, label: 'League', icon: Trophy },
    { id: 'world' as MainTab, label: 'World', icon: Globe },
    { id: 'profile' as MainTab, label: 'Profile', icon: User },
  ];

  return (
    <View style={styles.navBar}>
      <View style={styles.navInner}>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <Pressable
              key={item.id}
              onPress={() => handleTabClick(item.id)}
              style={styles.tabButton}
            >
              <View
                style={[
                  styles.iconPill,
                  isActive ? styles.iconPillActive : styles.iconPillInactive,
                ]}
              >
                <Icon
                  className={`w-5 h-5 ${
                    isActive
                      ? 'text-[#f59e0b] stroke-[2.5]'
                      : 'text-slate-400 stroke-[1.8]'
                  }`}
                />
              </View>
              <Text
                style={[
                  styles.tabLabel,
                  isActive ? styles.tabLabelActive : styles.tabLabelInactive,
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  navBar: {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 40,
    backgroundColor: '#0d1017',
    borderTopWidth: 1,
    borderTopColor: 'rgba(30, 41, 59, 0.85)',
    paddingHorizontal: 8,
  },
  navInner: {
    maxWidth: 1280,
    width: '100%',
    marginHorizontal: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    height: 64,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  iconPill: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 4,
    borderRadius: 16,
  },
  iconPillActive: {
    backgroundColor: '#2b2513',
  },
  iconPillInactive: {
    backgroundColor: 'transparent',
  },
  tabLabel: {
    fontSize: 11,
    marginTop: 2,
  },
  tabLabelActive: {
    color: '#f59e0b',
    fontWeight: '700',
  },
  tabLabelInactive: {
    color: '#94a3b8',
    fontWeight: '500',
  },
});
