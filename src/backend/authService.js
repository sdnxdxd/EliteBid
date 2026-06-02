import { apiRequest, setSessionToken } from './apiClient';

export async function login(email, password) {
  const user = await apiRequest('/auth/login', {
    body: JSON.stringify({ email, password }),
    method: 'POST'
  });
  setSessionToken(user.sessionToken);
  return user;
}

export async function registerUser(form) {
  const user = await apiRequest('/auth/register-guest', {
    body: JSON.stringify(form),
    method: 'POST'
  });
  setSessionToken(user.sessionToken);
  return user;
}

export async function getActiveSession() {
  const user = await apiRequest('/auth/session');
  if (user?.sessionToken) {
    setSessionToken(user.sessionToken);
  }
  return user;
}

export async function resendVerificationEmail(email) {
  return apiRequest('/auth/resend-verification', {
    body: JSON.stringify({ email }),
    method: 'POST'
  });
}

export async function completeVerification(payload) {
  const user = await apiRequest('/auth/complete-verification', {
    body: JSON.stringify(payload),
    method: 'POST'
  });
  setSessionToken(user.sessionToken);
  return user;
}

export async function signOut() {
  await apiRequest('/auth/session', { method: 'DELETE' });
  setSessionToken(null);
}

export async function resetPassword(identifier, password, confirmPassword) {
  await apiRequest('/auth/reset-password', {
    body: JSON.stringify({ identifier, password, confirmPassword }),
    method: 'POST'
  });
}
