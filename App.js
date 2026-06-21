import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Platform, StatusBar, StyleSheet, Text, View } from 'react-native';

import { initDatabase } from './src/backend/database';
import { getActiveSession, signOut } from './src/backend/authService';
import { getInitialNetworkStatus, subscribeNetworkStatus } from './src/backend/networkStatus';
import { notifyOfflineConnection } from './src/backend/offlineNotificationService';
import ConfirmDialog from './src/components/ConfirmDialog';
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
import ResendVerificationScreen from './src/screens/ResendVerificationScreen';
import ResetPasswordScreen from './src/screens/ResetPasswordScreen';
import VerifyAccountScreen from './src/screens/VerifyAccountScreen';
import WonBidsScreen from './src/screens/WonBidsScreen';
import { colors } from './src/theme';

const splashImage = require('./assets/splash.png');
const SPLASH_DURATION_MS = 3500;
const publicGuestUser = {
  categoria: 'invitado',
  clienteId: null,
  email: '',
  estado: 'publico',
  guestMode: true,
  nombre: 'Invitado',
  rol: 'invitado'
};

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
  const [guestAccessDialogVisible, setGuestAccessDialogVisible] = useState(false);
  const [guestAccessTarget, setGuestAccessTarget] = useState('esta seccion');
  const [online, setOnline] = useState(getInitialNetworkStatus);
  const previousOnlineRef = useRef(true);

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
        if (!/servidor de EliteBid|Sin conexion/i.test(error?.message || '')) {
          console.warn('No se pudo iniciar EliteBid', error);
        }
      }
    }

    boot();

    return () => {
      mounted = false;
      clearTimeout(splashTimeout);
    };
  }, []);

  useEffect(() => subscribeNetworkStatus(setOnline), []);

  useEffect(() => {
    if (previousOnlineRef.current && !online) {
      notifyOfflineConnection().catch(() => {});
    }
    previousOnlineRef.current = online;
  }, [online]);

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
        useNativeDriver: Platform.OS !== 'web'
      })
    );

    animation.start();

    return () => animation.stop();
  }, [booting, splashProgress]);

  async function handleSignOut() {
    if (!user?.guestMode) {
      await signOut(user?.sessionToken);
    }
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
    const guestOnlyTabs = {
      favorites: 'Favoritos',
      purchases: 'Mis ventas',
      profile: 'Perfil'
    };

    if (user?.guestMode && guestOnlyTabs[tab]) {
      requestGuestAccess(guestOnlyTabs[tab]);
      return;
    }

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
    if (user?.guestMode) {
      requestGuestAccess('la sala de subasta');
      return;
    }
    setSelectedAuctionId(auctionId);
    setAppView('liveRoom');
  }

  function openNotifications(fromView = appView || 'home') {
    if (user?.guestMode) {
      requestGuestAccess('las notificaciones');
      return;
    }

    setNotificationsBackView(fromView);
    setAppView('notifications');
  }

  function browseAsGuest() {
    setUser(publicGuestUser);
    setAuthView('login');
    setAppView('home');
  }

  function registerFromGuest() {
    setUser(null);
    setAppView('home');
    setAuthView('register');
  }

  function requestGuestAccess(target) {
    setGuestAccessTarget(target);
    setGuestAccessDialogVisible(true);
  }

  function loginFromGuest() {
    setGuestAccessDialogVisible(false);
    setUser(null);
    setAppView('home');
    setAuthView('login');
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
    if (target === 'wonBids') {
      setNotificationsBackView('notifications');
      setAppView('wonBids');
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
      {!online ? (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineText}>Sin conexion. Revisa el WiFi o los datos moviles.</Text>
        </View>
      ) : null}
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
            onCreateAccount={user?.guestMode ? registerFromGuest : undefined}
            onOpenAuctionDetail={openAuctionDetail}
            onOpenAuctions={() => setAppView('auctions')}
            onOpenNotifications={() => openNotifications('home')}
            onSignOut={user?.guestMode ? handleSignOut : undefined}
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
          onOpenWonBids={() => {
            setNotificationsBackView('profile');
            setAppView('wonBids');
          }}
          onSignOut={handleSignOut}
          onUserUpdated={setUser}
          user={user}
        />
      ) : user && appView === 'wonBids' ? (
        <WonBidsScreen onBack={() => setAppView(notificationsBackView === 'notifications' ? 'notifications' : 'profile')} onNavigate={navigateTab} user={user} />
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
          onRequireAccount={() => requestGuestAccess('la sala de subasta')}
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
          onCreateAccount={user?.guestMode ? registerFromGuest : undefined}
          onOpenAuctionDetail={openAuctionDetail}
          onOpenAuctions={() => setAppView('auctions')}
          onOpenNotifications={() => openNotifications('home')}
          onSignOut={user?.guestMode ? handleSignOut : undefined}
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
      ) : authView === 'resendVerification' ? (
        <ResendVerificationScreen onBack={() => setAuthView('login')} />
      ) : (
        <LoginScreen
          onForgotPassword={() => setAuthView('reset')}
          onGuestBrowse={browseAsGuest}
          onLogin={handleAuthenticated}
          onRegister={() => setAuthView('register')}
          onResendVerification={() => setAuthView('resendVerification')}
        />
      )}
      <ConfirmDialog
        cancelLabel="Iniciar sesion"
        confirmLabel="Crear cuenta"
        icon="account-plus-outline"
        message={`Estas explorando como invitado. Para acceder a ${guestAccessTarget}, crea una cuenta o inicia sesion.`}
        onCancel={() => setGuestAccessDialogVisible(false)}
        onConfirm={() => {
          setGuestAccessDialogVisible(false);
          registerFromGuest();
        }}
        onSecondary={loginFromGuest}
        title="Seguis como invitado"
        visible={guestAccessDialogVisible}
      />
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
  offlineBanner: {
    alignItems: 'center',
    backgroundColor: colors.error,
    left: 0,
    minHeight: 28,
    paddingHorizontal: 12,
    paddingVertical: 6,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 1000
  },
  offlineText: {
    color: colors.onPrimaryFixed,
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'center'
  },
  splashImage: {
    height: '100%',
    width: '100%'
  },
  splashProgressBar: {
    backgroundColor: colors.primary,
    borderRadius: 999,
    height: '100%',
    ...Platform.select({
      web: {
        boxShadow: `0 0 10px rgba(204, 193, 255, 0.45)`
      },
      default: {
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.45,
        shadowRadius: 10
      }
    }),
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
