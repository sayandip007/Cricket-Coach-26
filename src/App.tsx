import React, { useEffect } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  Pressable,
  StatusBar,
  BackHandler,
  StyleSheet,
  Platform,
} from 'react-native';
import { GameProvider, useGame } from './context/GameContext';
import { TabBar } from './components/navigation/TabBar';
import { HubScreen } from './components/hub/HubScreen';
import { TeamManagementScreen } from './components/team/TeamManagementScreen';
import { LeagueScreen } from './components/league/LeagueScreen';
import { WorldScreen } from './components/world/WorldScreen';
import { ProfileScreen } from './components/profile/ProfileScreen';
import { AuctionRoom } from './components/auction/AuctionRoom';
import { LiveMatchEngine } from './components/match/LiveMatchEngine';
import { OpeningLandingScreen } from './components/opening/OpeningLandingScreen';
import { PWAInstallButton, OfflineIndicator } from './components/common/PWAInstallButton';

const MainAppContent: React.FC = () => {
  const { activeTab, setActiveTab, activeSaveSlot, userTeam, auctionSandbox, exitAuctionSandbox } = useGame();

  // Standard React Native Android Hardware Back Button Handler
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (activeTab === 'auction') {
        if (auctionSandbox?.isActive) {
          exitAuctionSandbox();
        } else {
          setActiveTab('hub');
        }
        return true;
      }
      if (activeTab === 'live_match') {
        setActiveTab('hub');
        return true;
      }
      if (activeTab === 'team' || activeTab === 'league' || activeTab === 'world' || activeTab === 'profile') {
        setActiveTab('hub');
        return true;
      }
      if (activeTab === 'hub') {
        setActiveTab('landing');
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  }, [activeTab, setActiveTab, auctionSandbox, exitAuctionSandbox]);

  if (activeTab === 'landing') {
    return (
      <SafeAreaView style={styles.rootContainer}>
        <StatusBar barStyle="light-content" backgroundColor="#070b12" />
        <OfflineIndicator />
        <OpeningLandingScreen />
      </SafeAreaView>
    );
  }

  if (activeTab === 'auction') {
    return (
      <SafeAreaView style={styles.rootContainer}>
        <StatusBar barStyle="light-content" backgroundColor="#070b12" />
        <OfflineIndicator />
        <AuctionRoom />
      </SafeAreaView>
    );
  }

  if (activeTab === 'live_match') {
    return (
      <SafeAreaView style={styles.rootContainer}>
        <StatusBar barStyle="light-content" backgroundColor="#070b12" />
        <OfflineIndicator />
        <LiveMatchEngine />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.rootContainer}>
      <StatusBar barStyle="light-content" backgroundColor="#070b12" />
      <OfflineIndicator />

      {/* Top Browser App Header Bar */}
      <View style={styles.topHeader}>
        <View style={styles.topHeaderInner}>
          <Pressable
            onPress={() => setActiveTab('landing')}
            style={styles.backToTitleBtn}
          >
            <Text style={styles.backToTitleText}>← TITLE SCREEN</Text>
          </Pressable>

          <View style={styles.headerCenterGroup}>
            <Text style={styles.headerBrandText}>CRICKET COACH 26</Text>
          </View>

          <View style={styles.rnBadge}>
            <Text style={styles.rnBadgeText}>SLOT {activeSaveSlot} · {userTeam.shortName}</Text>
          </View>
        </View>
      </View>

      {/* Primary Tab View */}
      <View style={styles.mainContent}>
        {activeTab === 'hub' && <HubScreen />}
        {activeTab === 'team' && <TeamManagementScreen />}
        {activeTab === 'league' && <LeagueScreen />}
        {activeTab === 'world' && <WorldScreen />}
        {activeTab === 'profile' && <ProfileScreen />}
      </View>

      {/* Global Bottom/Browser Tab Navigation */}
      <TabBar />
    </SafeAreaView>
  );
};

export default function App() {
  return (
    <GameProvider>
      <MainAppContent />
    </GameProvider>
  );
}

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
    minHeight: '100vh',
    backgroundColor: '#070b12',
    color: '#f1f5f9',
  },
  topHeader: {
    width: '100%',
    backgroundColor: '#0b101c',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(30, 41, 59, 0.65)',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  topHeaderInner: {
    maxWidth: 1280,
    width: '100%',
    marginHorizontal: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backToTitleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  backToTitleText: {
    fontSize: 11,
    fontFamily: 'monospace',
    fontWeight: '700',
    color: '#fbbf24',
  },
  headerCenterGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerBrandText: {
    fontSize: 11,
    fontFamily: 'monospace',
    letterSpacing: 1.5,
    color: '#94a3b8',
    fontWeight: '700',
  },
  rnBadge: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.35)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  rnBadgeText: {
    fontSize: 10,
    fontFamily: 'monospace',
    fontWeight: '800',
    color: '#fbbf24',
    letterSpacing: 0.6,
  },
  mainContent: {
    flex: 1,
    width: '100%',
  },
});
