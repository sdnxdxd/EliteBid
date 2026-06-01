import { apiRequest } from './apiClient';

export async function initDatabase() {
  await apiRequest('/health');
}
