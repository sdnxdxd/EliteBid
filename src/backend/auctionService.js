import { apiRequest } from './apiClient';

function clientQuery(clienteId) {
  return clienteId ? `?clienteId=${clienteId}` : '';
}

export async function getHomeAuctions(clienteId) {
  return apiRequest(`/auctions/home${clientQuery(clienteId)}`);
}

export async function getAuctionList(clienteId) {
  return apiRequest(`/auctions${clientQuery(clienteId)}`);
}

export async function getAuctionDetail(auctionId, clienteId) {
  return apiRequest(`/auctions/${auctionId}${clientQuery(clienteId)}`);
}

export async function getUserSummary(clienteId) {
  return apiRequest(`/users/${clienteId}/summary`);
}

export async function enterAuctionRoom(clienteId, auctionId) {
  return apiRequest(`/auctions/${auctionId}/enter`, {
    body: JSON.stringify({ clienteId }),
    method: 'POST'
  });
}

export async function placeBid(clienteId, auctionId, rawAmount, paymentMethodId) {
  return apiRequest(`/auctions/${auctionId}/bids`, {
    body: JSON.stringify({ amount: rawAmount, clienteId, paymentMethodId }),
    method: 'POST'
  });
}

export async function getUserPurchases(clienteId) {
  return apiRequest(`/users/${clienteId}/purchases`);
}

export async function getUserPayments(clienteId) {
  return apiRequest(`/users/${clienteId}/payments`);
}

export async function settlePurchase(clienteId, bidId) {
  return apiRequest(`/users/${clienteId}/purchases/${bidId}/settle`, {
    method: 'POST'
  });
}

export async function savePurchaseDeliveryAddress(clienteId, bidId, deliveryAddress) {
  return apiRequest(`/users/${clienteId}/purchases/${bidId}/delivery`, {
    body: JSON.stringify({ deliveryAddress }),
    method: 'PUT'
  });
}

export async function getFavoriteAuctionIds(clienteId) {
  return apiRequest(`/users/${clienteId}/favorites/ids`);
}

export async function getFavoriteAuctions(clienteId) {
  return apiRequest(`/users/${clienteId}/favorites`);
}

export async function toggleFavoriteAuction(clienteId, auctionId) {
  return apiRequest(`/users/${clienteId}/favorites/${auctionId}/toggle`, {
    method: 'POST'
  });
}
