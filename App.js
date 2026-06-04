import React, { useEffect, useState } from 'react';
import { Animated, Easing, Image, StatusBar, StyleSheet, View } from 'react-native';

import { initDatabase } from './src/backend/database';
import { getActiveSession, signOut } from './src/backend/authService';
import AddPaymentScreen from './src/screens/AddPaymentScreen';
import AuctionDetailScreen from './src/screens/AuctionDetailScreen';
import AuctionsScreen from './src/screens/AuctionsScreen';
import FavoritesScreen from './src/screens/FavoritesScreen';
import HomeScreen from './src/screens/HomeScreen';
import LiveAuctionScreen from './src/screens/LiveAuctionScreen';
import LoginScreen from './src/screens/LoginScreen';
import NotificationsScreen from './src/screens/NotificationsScreen';
import PaymentMethodsScreen from './src/screens/PaymentMethodsScreen';
import PenaltiesScreen from './src/screens/PenaltiesScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import PurchasesScreen from './src/screens/PurchasesScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import ResetPasswordScreen from './src/screens/ResetPasswordScreen';
import VerifyAccountScreen from './src/screens/VerifyAccountScreen';
import { colors } from './src/theme';

const splashImage = require('./assets/splash.png');
const SPLASH_DURATION_MS = 3500;

export default function App() {
  const [booting, setBooting] = useState(true);
  const [splashProgress] = useState(() => new Animated.Value(0));
  const [user, setUser] = useState(null);
  const [authView, setAuthView] = useState('login');
  const [appView, setAppView] = useState('home');
  const [detailBackView, setDetailBackView] = useState('auctions');
  const [notificationsBackView, setNotificationsBackView] = useState('home');
  const [paymentBackView, setPaymentBackView] = useState('home');
  const [selectedAuctionId, setSelectedAuctionId] = useState(null);

  useEffect(() => {
    let mounted = true;
    const splashTimeout = setTimeout(() => {
      if (mounted) {
        setBooting(false);
      }
    }, SPLASH_DURATION_MS);

    async function boot() {
      try {
        await initDatabase();
        const sessionUser = await getActiveSession();

        if (mounted) {
          setUser(sessionUser);
          if (sessionUser?.rol === 'invitado' && sessionUser?.estado === 'pendiente') {
            setAppView('verifyAccount');
          }
        }
      } catch (error) {
        console.warn('No se pudo iniciar EliteBid', error);
      }
    }

    boot();

    return () => {
      mounted = false;
      clearTimeout(splashTimeout);
    };
  }, []);

  useEffect(() => {
    if (!booting) {
      return undefined;
    }

    splashProgress.setValue(0);
    const animation = Animated.loop(
      Animated.timing(splashProgress, {
        duration: 1200,
        easing: Easing.inOut(Easing.cubic),
        toValue: 1,
        useNativeDriver: true
      })
    );

    animation.start();

    return () => animation.stop();
  }, [booting, splashProgress]);

  async function handleSignOut() {
    await signOut(user?.sessionToken);
    setUser(null);
    setAuthView('login');
    setAppView('home');
  }

  function handleAuthenticated(sessionUser, nextView = 'home') {
    setUser(sessionUser);
    setAuthView('login');
    setAppView(sessionUser?.rol === 'invitado' && sessionUser?.estado === 'pendiente' ? 'verifyAccount' : nextView);
  }

  function openPayments(fromView) {
    setPaymentBackView(fromView);
    setAppView('payments');
  }

  function navigateTab(tab) {
    if (user?.rol === 'invitado' && ['favorites', 'purchases'].includes(tab)) {
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

  function openNotifications(fromView = appView || 'home') {
    setNotificationsBackView(fromView);
    setAppView('notifications');
  }

  function handleNotificationAction(result) {
    const target = result?.target || '';

    if (target === 'verifyAccount') {
      setAppView('verifyAccount');
      return;
    }
    if (target === 'payments') {
      openPayments('notifications');
      return;
    }
    if (target === 'penalties') {
      setNotificationsBackView('notifications');
      setAppView('penalties');
      return;
    }
    if (target === 'purchases') {
      setAppView('purchases');
      return;
    }
    if (target.startsWith('auction:')) {
      setSelectedAuctionId(Number(target.split(':')[1]));
      setDetailBackView('notifications');
      setAppView('auctionDetail');
      return;
    }
    setAppView('auctions');
  }

  if (booting) {
    return (
      <View style={styles.loading}>
        <StatusBar barStyle="light-content" backgroundColor={colors.surfaceLowest} />
        <Image resizeMode="cover" source={splashImage} style={styles.splashImage} />
        <View style={styles.splashProgressTrack}>
          <Animated.View
            style={[
              styles.splashProgressBar,
              {
                transform: [
                  {
                    translateX: splashProgress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-120, 260]
                    })
                  }
                ]
              }
            ]}
          />
        </View>
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
            onOpenNotifications={() => openNotifications('home')}
            onSignOut={handleSignOut}
            user={user}
          />
        )
      ) : user && appView === 'verifyAccount' ? (
        <VerifyAccountScreen
          onContinueAsGuest={() => setAppView('home')}
          onVerified={(verifiedUser) => {
            setUser(verifiedUser);
            setAppView('registrationPayments');
          }}
          user={user}
        />
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
          onOpenNotifications={() => openNotifications('profile')}
          onOpenPenalties={() => setAppView('penalties')}
          onSignOut={handleSignOut}
          onUserUpdated={setUser}
          user={user}
        />
      ) : user && appView === 'penalties' ? (
        <PenaltiesScreen onBack={() => setAppView(notificationsBackView === 'notifications' ? 'notifications' : 'profile')} user={user} />
      ) : user && appView === 'notifications' ? (
        <NotificationsScreen
          onAction={handleNotificationAction}
          onBack={() => setAppView(notificationsBackView)}
        />
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
          onOpenNotifications={() => openNotifications('auctionDetail')}
          onNavigate={navigateTab}
          user={user}
        />
      ) : user && appView === 'liveRoom' ? (
        <LiveAuctionScreen
          auctionId={selectedAuctionId}
          onBack={() => setAppView('auctionDetail')}
          onNavigate={navigateTab}
          onOpenNotifications={() => openNotifications('liveRoom')}
          user={user}
        />
      ) : user ? (
        <HomeScreen
          onNavigate={navigateTab}
          onOpenAuctionDetail={openAuctionDetail}
          onOpenAuctions={() => setAppView('auctions')}
          onOpenNotifications={() => openNotifications('home')}
          onSignOut={handleSignOut}
          user={user}
        />
      ) : authView === 'register' ? (
        <RegisterScreen
          onBack={() => setAuthView('login')}
          onRegistered={(sessionUser) =>
            handleAuthenticated(
              sessionUser,
              sessionUser.rol === 'invitado' ? 'verifyAccount' : 'registrationPayments'
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
  splashImage: {
    height: '100%',
    width: '100%'
  },
  splashProgressBar: {
    backgroundColor: colors.primary,
    borderRadius: 999,
    height: '100%',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    width: 118
  },
  splashProgressTrack: {
    backgroundColor: 'rgba(204, 193, 255, 0.18)',
    borderRadius: 999,
    bottom: '8.7%',
    height: 7,
    left: '25%',
    overflow: 'hidden',
    position: 'absolute',
    right: '25%'
  }
});
