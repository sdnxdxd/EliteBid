const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://127.0.0.1:3001/api';
const TOKEN_KEY = 'elitebid.sessionToken';

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
  let response;

  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {})
      }
    });
  } catch {
    throw new Error('No se pudo conectar con el backend MySQL. Verifica que npm run api este corriendo.');
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(payload?.message || 'No se pudo conectar con el backend.');
  }

  return payload;
}
