import { NativeModules, Platform } from 'react-native';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://127.0.0.1:3001/api';
const TOKEN_KEY = 'elitebid.sessionToken';
const LOCAL_HOSTS = ['127.0.0.1', 'localhost', '0.0.0.0', '::1'];

let memoryToken = null;

export function setSessionToken(token) {
  memoryToken = token || null;

  if (typeof localStorage !== 'undefined') {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  }
}

export function getSessionToken() {
  if (memoryToken) {
    return memoryToken;
  }

  if (typeof localStorage !== 'undefined') {
    memoryToken = localStorage.getItem(TOKEN_KEY);
  }

  return memoryToken;
}

export async function apiRequest(path, options = {}) {
  const token = getSessionToken();
  const apiUrl = resolveApiUrl();
  let response;

  try {
    response = await fetch(`${apiUrl}${path}`, {
      ...options,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {})
      }
    });
  } catch {
    throw new Error('No pudimos conectarnos con EliteBid en este momento. Intenta nuevamente en unos instantes.');
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(payload?.message || 'No pudimos completar la operacion. Intenta nuevamente.');
  }

  return payload;
}

function resolveApiUrl() {
  if (Platform.OS === 'web') {
    return API_URL;
  }

  const configuredUrl = API_URL.replace(/\/$/, '');
  const configuredHost = getHostFromUrl(configuredUrl);

  if (configuredHost && !isLocalHost(configuredHost)) {
    return configuredUrl;
  }

  const sourceCode = NativeModules.SourceCode;
  const scriptUrl = sourceCode?.scriptURL || sourceCode?.getConstants?.().scriptURL || '';
  const lanHost = getHostFromUrl(scriptUrl);

  if (lanHost && !isLocalHost(lanHost)) {
    return `http://${lanHost}:3001/api`;
  }

  return configuredUrl;
}

function getHostFromUrl(url) {
  return String(url).match(/^[a-z][a-z0-9+.-]*:\/\/\[?([^/:\\]]+)/i)?.[1];
}

function isLocalHost(host) {
  return LOCAL_HOSTS.includes(String(host).toLowerCase());
}
