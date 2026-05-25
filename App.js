import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StatusBar, StyleSheet, Text, View } from 'react-native';

import { initDatabase } from './src/backend/database';
import { getActiveSession, signOut } from './src/backend/authService';
import HomeScreen from './src/screens/HomeScreen';
import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import { colors } from './src/theme';

export default function App() {
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState(null);
  const [authView, setAuthView] = useState('login');

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
  }

  function handleAuthenticated(sessionUser) {
    setUser(sessionUser);
    setAuthView('login');
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
      {user ? (
        <HomeScreen user={user} onSignOut={handleSignOut} />
      ) : authView === 'register' ? (
        <RegisterScreen onBack={() => setAuthView('login')} onRegistered={handleAuthenticated} />
      ) : (
        <LoginScreen onLogin={handleAuthenticated} onRegister={() => setAuthView('register')} />
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
