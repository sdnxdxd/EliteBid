import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StatusBar, StyleSheet, Text, View } from 'react-native';

import { initDatabase } from './src/backend/database';
import { getActiveSession, signOut } from './src/backend/authService';
import AddPaymentScreen from './src/screens/AddPaymentScreen';
import AuctionDetailScreen from './src/screens/AuctionDetailScreen';
import AuctionsScreen from './src/screens/AuctionsScreen';
import FavoritesScreen from './src/screens/FavoritesScreen';
import HomeScreen from './src/screens/HomeScreen';
import LiveAuctionScreen from './src/screens/LiveAuctionScreen';
import LoginScreen from './src/screens/LoginScreen';
import PaymentMethodsScreen from './src/screens/PaymentMethodsScreen';
import PenaltiesScreen from './src/screens/PenaltiesScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import PurchasesScreen from './src/screens/PurchasesScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import ResetPasswordScreen from './src/screens/ResetPasswordScreen';
import { colors } from './src/theme';

export default function App() {
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState(null);
  const [authView, setAuthView] = useState('login');
  const [appView, setAppView] = useState('home');
  const [detailBackView, setDetailBackView] = useState('auctions');
  const [paymentBackView, setPaymentBackView] = useState('home');
  const [selectedAuctionId, setSelectedAuctionId] = useState(null);

  useEffect(() => {
    let mounted = true;

    async function boot() {
      try {
        await initDatabase();
        const sessionUser = await getActiveSession();

        if (mounted) {
          setUser(sessionUser);
        }
      } catch (error) {
        console.warn('No se pudo iniciar EliteBid', error);
      } finally {
        if (mounted) {
          setBooting(false);
        }
      }
    }

    boot();

    return () => {
      mounted = false;
    };
  }, []);

  async function handleSignOut() {
    await signOut(user?.sessionToken);
    setUser(null);
    setAuthView('login');
    setAppView('home');
  }

  function handleAuthenticated(sessionUser, nextView = 'home') {
    setUser(sessionUser);
    setAuthView('login');
    setAppView(nextView);
  }

  function openPayments(fromView) {
    setPaymentBackView(fromView);
    setAppView('payments');
  }

  function navigateTab(tab) {
    if (user?.rol === 'invitado' && ['favorites', 'purchases'].includes(tab)) {
      setAppView('auctions');
      return;
    }

    setAppView(tab);
  }

  function openAuctionDetail(auctionId, fromView = 'auctions') {
    setSelectedAuctionId(auctionId);
    setDetailBackView(fromView);
    setAppView('auctionDetail');
  }

  function canUseVerifiedFeatures() {
    return user?.rol !== 'invitado';
  }

  function openLiveRoom(auctionId) {
    setSelectedAuctionId(auctionId);
    setAppView('liveRoom');
  }

  if (booting) {
    return (
      <View style={styles.loading}>
        <StatusBar barStyle="light-content" backgroundColor={colors.surfaceLowest} />
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={styles.loadingText}>Elite Bid</Text>
      </View>
    );
  }

  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor={colors.surfaceLowest} />
      {user && appView === 'payments' ? (
        canUseVerifiedFeatures() ? (
        <PaymentMethodsScreen
          onAdd={() => setAppView('addPayment')}
          onBack={() => setAppView(paymentBackView)}
          onUserUpdated={setUser}
          user={user}
        />
        ) : (
          <HomeScreen
            onNavigate={navigateTab}
            onOpenAuctionDetail={openAuctionDetail}
            onOpenAuctions={() => setAppView('auctions')}
            onSignOut={handleSignOut}
            user={user}
          />
        )
      ) : user && appView === 'registrationPayments' ? (
        <PaymentMethodsScreen
          onAdd={() => setAppView('registrationAddPayment')}
          onBack={() => setAppView('home')}
          user={user}
        />
      ) : user && appView === 'addPayment' ? (
        <AddPaymentScreen
          onBack={() => setAppView('payments')}
          onSaved={(updatedUser) => {
            setUser(updatedUser);
            setAppView('payments');
          }}
          user={user}
        />
      ) : user && appView === 'registrationAddPayment' ? (
        <AddPaymentScreen
          onBack={() => setAppView('registrationPayments')}
          onSaved={(updatedUser) => {
            setUser(updatedUser);
            setAppView('home');
          }}
          user={user}
        />
      ) : user && appView === 'profile' ? (
        <ProfileScreen
          onBack={() => setAppView('home')}
          onGoHome={() => setAppView('home')}
          onNavigate={navigateTab}
          onOpenPayments={() => openPayments('profile')}
          onOpenPenalties={() => setAppView('penalties')}
          onSignOut={handleSignOut}
          onUserUpdated={setUser}
          user={user}
        />
      ) : user && appView === 'penalties' ? (
        <PenaltiesScreen onBack={() => setAppView('profile')} user={user} />
      ) : user && appView === 'auctions' ? (
        <AuctionsScreen
          onBack={() => setAppView('home')}
          onNavigate={navigateTab}
          onOpenAuctionDetail={openAuctionDetail}
          user={user}
        />
      ) : user && appView === 'favorites' ? (
        <FavoritesScreen
          onBack={() => setAppView('home')}
          onNavigate={navigateTab}
          onOpenAuctionDetail={openAuctionDetail}
          user={user}
        />
      ) : user && appView === 'purchases' ? (
        <PurchasesScreen onBack={() => setAppView('home')} onNavigate={navigateTab} user={user} />
      ) : user && appView === 'auctionDetail' ? (
        <AuctionDetailScreen
          auctionId={selectedAuctionId}
          onBack={() => setAppView(detailBackView)}
          onEnterRoom={openLiveRoom}
          onNavigate={navigateTab}
          user={user}
        />
      ) : user && appView === 'liveRoom' ? (
        <LiveAuctionScreen
          auctionId={selectedAuctionId}
          onBack={() => setAppView('auctionDetail')}
          onNavigate={navigateTab}
          user={user}
        />
      ) : user ? (
        <HomeScreen
          onNavigate={navigateTab}
          onOpenAuctionDetail={openAuctionDetail}
          onOpenAuctions={() => setAppView('auctions')}
          onSignOut={handleSignOut}
          user={user}
        />
      ) : authView === 'register' ? (
        <RegisterScreen
          onBack={() => setAuthView('login')}
          onRegistered={(sessionUser) =>
            handleAuthenticated(
              sessionUser,
              sessionUser.rol === 'invitado' ? 'home' : 'registrationPayments'
            )
          }
        />
      ) : authView === 'reset' ? (
        <ResetPasswordScreen onBack={() => setAuthView('login')} />
      ) : (
        <LoginScreen
          onForgotPassword={() => setAuthView('reset')}
          onLogin={handleAuthenticated}
          onRegister={() => setAuthView('register')}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  loading: {
    alignItems: 'center',
    backgroundColor: colors.surfaceLowest,
    flex: 1,
    justifyContent: 'center'
  },
  loadingText: {
    color: colors.primaryContainer,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0,
    marginTop: 18,
    textTransform: 'uppercase'
  }
});
