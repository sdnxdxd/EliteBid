import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import { getAuctionDetail, placeBid } from '../backend/auctionService';
import { getPaymentMethods } from '../backend/paymentService';
import AppToast from '../components/AppToast';
import BottomNav, { bottomNavHeight } from '../components/BottomNav';
import { colors, radii } from '../theme';

const SHIPPING_COST = 25000;
const BID_RANGE_LIMIT_CATEGORIES = new Set(['comun', 'especial', 'plata']);
const AUCTION_POLL_INTERVAL_MS = 800;

export default function LiveAuctionScreen({ auctionId, onBack, onNavigate, onOpenNotifications, user }) {
  const [auction, setAuction] = useState(null);
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [payments, setPayments] = useState([]);
  const [selectedPaymentId, setSelectedPaymentId] = useState(null);
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const [toast, setToast] = useState(null);
  const [winnerCelebration, setWinnerCelebration] = useState(null);
  const amountRef = useRef('');
  const userEditedAmountRef = useRef(false);
  const leadingItemIdRef = useRef(null);
  const celebratedWinIdsRef = useRef(new Set());
  const leadingActive = Boolean(
    auction?.closure?.winner?.isCurrentUser &&
      auction?.closureStatus === 'en_cuenta' &&
      auction?.status !== 'cerrada' &&
      Number(secondsRemaining || 0) > 0
  );

  async function load() {
    const detail = await getAuctionDetail(auctionId, user.clienteId);

    applyAuctionDetail(detail);
    setLoading(false);
  }

  useEffect(() => {
    let mounted = true;

    async function run() {
      try {
        const [detail, userPayments] = await Promise.all([
          getAuctionDetail(auctionId, user.clienteId),
          getPaymentMethods(user.clienteId)
        ]);
        const verifiedPayments = userPayments.filter((payment) => payment.verified === 'si');

        if (mounted) {
          applyAuctionDetail(detail, { forceSuggestedBid: true });
          setPayments(verifiedPayments);
          setSelectedPaymentId((current) => current ?? verifiedPayments[0]?.id ?? null);
        }
      } catch (loadError) {
        if (mounted) {
          setError(loadError.message);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    run();

    return () => {
      mounted = false;
    };
  }, [auctionId, user.clienteId]);

  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsRemaining((current) => Math.max(0, current - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const poll = setInterval(async () => {
      try {
        const detail = await getAuctionDetail(auctionId, user.clienteId);
        applyAuctionDetail(detail);
      } catch (pollError) {
        setError(pollError.message);
      }
    }, AUCTION_POLL_INTERVAL_MS);

    return () => clearInterval(poll);
  }, [auctionId, user.clienteId]);

  const rules = useMemo(() => {
    if (!auction) {
      return {
        bidStep: 0,
        canBypassRange: false,
        currentBid: 0,
        maxBid: 0,
        minBid: 0,
        typedAmount: 0
      };
    }

    const currentBid = Number(auction.currentBid || auction.basePrice || 0);
    const basePrice = Number(auction.basePrice || 0);
    const bidStep = Math.max(100, Math.ceil((basePrice * 0.01) / 100) * 100);
    const hasBidRangeLimit = BID_RANGE_LIMIT_CATEGORIES.has(String(auction.category || '').toLowerCase());
    const minBid = hasBidRangeLimit ? currentBid + basePrice * 0.01 : currentBid + 1;
    const maxBid = currentBid + basePrice * 0.2;

    return {
      bidStep,
      canBypassRange: !hasBidRangeLimit,
      currentBid,
      hasBidRangeLimit,
      maxBid,
      minBid,
      typedAmount: parseCurrency(amount)
    };
  }, [amount, auction]);

  function adjustBid(direction) {
    const startingAmount = Number.isFinite(rules.typedAmount) && rules.typedAmount > 0
      ? rules.typedAmount
      : rules.minBid;
    let nextAmount = startingAmount + rules.bidStep * direction;

    nextAmount = Math.max(rules.minBid, nextAmount);

    if (!rules.canBypassRange) {
      nextAmount = Math.min(rules.maxBid, nextAmount);
    }

    const formattedAmount = formatInputAmount(nextAmount);
    amountRef.current = formattedAmount;
    userEditedAmountRef.current = true;
    setAmount(formattedAmount);
    setError('');
    setMessage('');
    setToast(null);
  }

  async function submitBid() {
    setError('');
    setMessage('');
    setToast(null);
    setSending(true);

    try {
      if (!selectedPaymentId) {
        throw new Error('Selecciona un medio de pago verificado para pujar.');
      }
      if (leadingActive) {
        throw new Error('Ya vas primero. No podes salir de la sala hasta que te superen o cierre el contador.');
      }

      const result = await placeBid(user.clienteId, auctionId, parseCurrency(amount), selectedPaymentId);

      applyAuctionDetail(result.auction, { forceSuggestedBid: true });
      setMessage('Puja confirmada. El contador volvio a 20 segundos.');
      setToast({ message: 'Puja registrada. Vas liderando este lote.', tone: 'success' });
      await load();
    } catch (bidError) {
      setError(bidError.message);
      setToast({ message: bidError.message, tone: 'danger' });
    } finally {
      setSending(false);
    }
  }

  function showLeadingLock() {
    setToast({
      message: 'Vas primero: no podes salir de la sala hasta que te superen o ganes la pieza.',
      tone: 'danger'
    });
  }

  function guardRoomExit(callback) {
    if (leadingActive) {
      showLeadingLock();
      return;
    }

    callback?.();
  }

  function applyAuctionDetail(detail, { forceSuggestedBid = false } = {}) {
    setAuction(detail);
    setSecondsRemaining(Number(detail.closure?.secondsRemaining ?? detail.timerSecondsRemaining ?? 0));
    if (detail?.lockedPaymentMethodId) {
      setSelectedPaymentId(Number(detail.lockedPaymentMethodId));
    }
    if (
      detail?.closure?.winner?.isCurrentUser &&
      detail?.closureStatus === 'en_cuenta' &&
      detail?.status !== 'cerrada'
    ) {
      leadingItemIdRef.current = Number(detail.itemId);
    }

    const recentWin = detail?.recentWin;
    if (
      recentWin &&
      Number(recentWin.itemId) === Number(leadingItemIdRef.current) &&
      !celebratedWinIdsRef.current.has(Number(recentWin.itemId))
    ) {
      celebratedWinIdsRef.current.add(Number(recentWin.itemId));
      leadingItemIdRef.current = null;
      setWinnerCelebration({
        amount: Number(recentWin.amount || 0),
        commission: Number(recentWin.commission || 0),
        itemTitle: recentWin.itemTitle || 'la pieza',
        paid: recentWin.paymentStatus === 'pagada',
        total: Number(recentWin.amount || 0) + Number(recentWin.commission || 0) + SHIPPING_COST
      });
    }

    syncAmountWithAuction(detail, forceSuggestedBid);
  }

  function syncAmountWithAuction(detail, forceSuggestedBid = false) {
    const currentUserLeads = Boolean(
      detail?.closure?.winner?.isCurrentUser &&
        detail?.closureStatus === 'en_cuenta' &&
        detail?.status !== 'cerrada' &&
        Number(detail?.closure?.secondsRemaining ?? detail?.timerSecondsRemaining ?? 0) > 0
    );

    const currentAmount = parseCurrency(amountRef.current);
    const currentBid = Number(detail?.currentBid || detail?.basePrice || 0);
    if (forceSuggestedBid || (!currentUserLeads && (!userEditedAmountRef.current || currentAmount <= currentBid))) {
      const suggested = formatInputAmount(getSuggestedBid(detail));
      amountRef.current = suggested;
      userEditedAmountRef.current = false;
      setAmount(suggested);
    }
  }

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!auction) {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>{error || 'No se pudo abrir la sala.'}</Text>
      </View>
    );
  }

  const bidButtonLabel = Number.isFinite(rules.typedAmount) && rules.typedAmount > 0
    ? `Pujar ${formatMoney(rules.typedAmount)}`
    : 'Pujar';
  const finalized = auction.status === 'cerrada' || auction.closureStatus === 'finalizada';
  const counting = auction.closureStatus === 'en_cuenta' && !finalized;
  const waitingForFirstBid = auction.closureStatus === 'esperando_puja' && !finalized && secondsRemaining > 0;
  const bidDisabled = sending || finalized || !selectedPaymentId || leadingActive;
  const lockedPaymentMethodId = auction.lockedPaymentMethodId ? Number(auction.lockedPaymentMethodId) : null;

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[colors.surfaceLowest, colors.surface, colors.surfaceLow]}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.topBar}>
        <Pressable onPress={() => guardRoomExit(onBack)} style={styles.iconButton}>
          <MaterialCommunityIcons color={colors.primary} name="arrow-left" size={25} />
        </Pressable>
        <View style={styles.brandBlock}>
          <Text style={styles.brand}>Elite Bid</Text>
          <View style={styles.liveBadge}>
            <View style={[styles.liveDot, finalized && styles.liveDotClosed]} />
            <Text style={[styles.liveBadgeText, finalized && styles.liveBadgeTextClosed]}>
              {finalized ? 'Finalizada' : counting ? 'En cuenta' : 'En vivo'}
            </Text>
          </View>
        </View>
        <Pressable onPress={() => guardRoomExit(onOpenNotifications)} style={styles.iconButton}>
          <MaterialCommunityIcons color={colors.primary} name="bell-outline" size={24} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.stage}>
          <Image source={{ uri: auction.imageUrl }} style={styles.stageImage} />
          <LinearGradient
            colors={['rgba(20, 5, 43, 0.08)', 'rgba(20, 5, 43, 0.32)', 'rgba(20, 5, 43, 0.95)']}
            locations={[0, 0.48, 1]}
            style={StyleSheet.absoluteFill}
          />

          <View style={styles.floatingFeed}>
            {auction.bidFeed?.slice(0, 3).map((bid) => (
              <View key={bid.id} style={styles.feedChip}>
                <Text style={styles.feedChipAlias}>{bid.bidderAlias}</Text>
                <Text style={styles.feedChipAmount}>{formatMoney(bid.amount)}</Text>
              </View>
            ))}
          </View>

          <View style={styles.stageCopy}>
            <Text style={styles.stageMeta}>
              Objeto {auction.lotPosition || 1} de {auction.lotItemCount || 1}
            </Text>
            <Text numberOfLines={2} style={styles.stageTitle}>
              {auction.itemTitle || auction.title}
            </Text>
            <Text numberOfLines={2} style={styles.stageDescription}>
              {auction.description}
            </Text>
          </View>
        </View>

        <View style={styles.bidSurface}>
          <Text style={styles.panelLabel}>Puja actual</Text>
          <Text style={styles.currentBid}>{formatMoney(rules.currentBid)}</Text>
          <View style={[styles.timerBox, finalized && styles.timerBoxClosed]}>
            <MaterialCommunityIcons
              color={finalized ? '#73E6A2' : colors.primary}
              name={finalized ? 'check-decagram' : 'timer-outline'}
              size={22}
            />
            <View style={styles.timerCopy}>
              <Text style={styles.timerLabel}>
                {finalized
                  ? 'Lote finalizado'
                  : counting
                    ? 'Cierra si nadie mejora en'
                    : waitingForFirstBid
                      ? 'Primera oferta antes de'
                      : 'Esperando el siguiente lote'}
              </Text>
              <Text style={[styles.timerValue, finalized && styles.timerValueClosed]}>
                {finalized
                  ? getClosureCopy(auction)
                  : counting || waitingForFirstBid
                    ? formatCountdown(secondsRemaining)
                    : 'Preparando sala'}
              </Text>
            </View>
          </View>
          <View style={styles.auctioneerRow}>
            <MaterialCommunityIcons color={colors.secondary} name="account-voice" size={17} />
            <Text style={styles.auctioneerText}>{auction.auctioneer}</Text>
            <View style={styles.roomPill}>
              <MaterialCommunityIcons color="#73E6A2" name="broadcast" size={14} />
              <Text style={styles.roomPillText}>{finalized ? 'Cerrada' : 'Sala abierta'}</Text>
            </View>
          </View>

          {finalized ? (
            <View style={styles.resultBox}>
              <Text style={styles.resultTitle}>{auction.closure?.winner?.isCurrentUser ? 'Ganaste la pieza' : 'Subasta finalizada'}</Text>
              <Text style={styles.resultText}>{getFinalResultText(auction)}</Text>
            </View>
          ) : null}

          <View style={styles.stepper}>
            <Pressable disabled={sending || finalized || leadingActive} onPress={() => adjustBid(-1)} style={styles.stepButton}>
              <MaterialCommunityIcons color={colors.onPrimaryFixed} name="minus" size={24} />
            </Pressable>
            <View style={styles.amountBox}>
              <Text style={styles.amountLabel}>Tu puja</Text>
              <TextInput
                editable={!finalized && !sending && !leadingActive}
                keyboardType="numeric"
                onChangeText={(value) => {
                  amountRef.current = value;
                  userEditedAmountRef.current = true;
                  setAmount(value);
                  setError('');
                  setMessage('');
                  setToast(null);
                }}
                placeholder="Monto"
                placeholderTextColor="rgba(201, 196, 211, 0.55)"
                style={styles.amountInput}
                value={amount}
              />
            </View>
            <Pressable disabled={sending || finalized || leadingActive} onPress={() => adjustBid(1)} style={styles.stepButton}>
              <MaterialCommunityIcons color={colors.onPrimaryFixed} name="plus" size={24} />
            </Pressable>
          </View>

          <View style={styles.paymentPanel}>
            <Text style={styles.paymentLabel}>Medio de pago para esta puja</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.paymentOptions}>
                {payments.map((payment) => {
                  const selected = Number(selectedPaymentId) === Number(payment.id);
                  return (
                    <Pressable
                      disabled={finalized || sending || leadingActive || Boolean(lockedPaymentMethodId)}
                      key={payment.id}
                      onPress={() => setSelectedPaymentId(payment.id)}
                      style={[styles.paymentChip, selected && styles.paymentChipSelected]}
                    >
                      <MaterialCommunityIcons
                        color={selected ? colors.onPrimaryFixed : colors.primary}
                        name={getPaymentIcon(payment.type)}
                        size={16}
                      />
                      <Text style={[styles.paymentChipText, selected && styles.paymentChipTextSelected]}>
                        {getPaymentLabel(payment)}
                      </Text>
                    </Pressable>
                  );
                })}
                {payments.length === 0 ? (
                  <Text style={styles.noPaymentText}>No hay medios verificados.</Text>
                ) : null}
              </View>
            </ScrollView>
            {leadingActive ? (
              <Text style={styles.paymentLockedText}>Tu oferta lider quedo asociada a este unico medio de pago.</Text>
            ) : lockedPaymentMethodId ? (
              <Text style={styles.paymentLockedText}>Entraste a esta subasta con este medio de pago. Las siguientes pujas usan el mismo.</Text>
            ) : null}
          </View>

          <View style={styles.rangeRow}>
            <Text style={styles.rangeText}>Min. {formatMoney(rules.minBid)}</Text>
            <Text style={styles.rangeText}>
              {rules.canBypassRange ? 'Rango flexible' : `Max. ${formatMoney(rules.maxBid)}`}
            </Text>
          </View>
          {rules.hasBidRangeLimit ? (
            <Text style={styles.rangeHint}>
              Limites para comun, especial y plata: ultima oferta + 1% a 20% del valor base.
            </Text>
          ) : null}

          <Pressable
            disabled={bidDisabled}
            onPress={submitBid}
            style={[styles.bidButton, bidDisabled && styles.bidButtonDisabled]}
          >
            {sending ? (
              <ActivityIndicator color={colors.onPrimaryFixed} />
            ) : (
              <Text numberOfLines={1} style={styles.bidButtonText}>
                {leadingActive ? 'Esperando que te superen' : bidButtonLabel}
              </Text>
            )}
          </Pressable>

          <Pressable onPress={() => guardRoomExit(onBack)} style={[styles.watchButton, leadingActive && styles.watchButtonLocked]}>
            <Text style={[styles.watchButtonText, leadingActive && styles.watchButtonTextLocked]}>
              {leadingActive ? 'No podes salir mientras lideras' : 'Solo ver subasta'}
            </Text>
          </Pressable>

          {message ? <Text style={styles.message}>{message}</Text> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>

        <View style={styles.feedPanel}>
          <View style={styles.feedHeader}>
            <Text style={styles.sectionTitle}>Actividad reciente</Text>
            <MaterialCommunityIcons color={colors.primary} name="history" size={20} />
          </View>
          {auction.bidFeed?.length ? (
            <View style={styles.feedList}>
              {auction.bidFeed.map((bid) => (
                <FeedRow bid={bid} key={bid.id} />
              ))}
            </View>
          ) : (
            <View style={styles.emptyFeed}>
              <Text style={styles.emptyFeedTitle}>Aun no hay pujas nuevas</Text>
              <Text style={styles.emptyFeedText}>Tu oferta va a aparecer aca al confirmarse.</Text>
            </View>
          )}
        </View>
      </ScrollView>

      <BottomNav activeTab="auctions" onNavigate={(tab) => guardRoomExit(() => onNavigate?.(tab))} />
      <AppToast
        bottom={bottomNavHeight + 12}
        message={toast?.message}
        onDone={() => setToast(null)}
        tone={toast?.tone}
        visible={Boolean(toast)}
      />
      <WinnerCelebration celebration={winnerCelebration} onClose={() => setWinnerCelebration(null)} />
    </View>
  );
}

function WinnerCelebration({ celebration, onClose }) {
  if (!celebration) return null;

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible>
      <View style={styles.winnerOverlay}>
        <View style={styles.winnerCard}>
          <View style={styles.winnerStars}>
            <MaterialCommunityIcons color="#F4C56A" name="star-four-points" size={25} />
            <MaterialCommunityIcons color="#73E6A2" name="trophy" size={54} />
            <MaterialCommunityIcons color="#F4C56A" name="star-four-points" size={25} />
          </View>
          <Text style={styles.winnerTitle}>Ganaste</Text>
          <Text style={styles.winnerItem}>{celebration.itemTitle}</Text>
          <Text style={styles.winnerText}>
            {celebration.paid
              ? `Se debito ${formatMoney(celebration.total)}: puja, comision y envio incluidos.`
              : `Ganaste la pieza. El total es ${formatMoney(celebration.total)} y quedo pendiente de cobro.`}
          </Text>
          <Pressable onPress={onClose} style={styles.winnerButton}>
            <Text style={styles.winnerButtonText}>Continuar</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function FeedRow({ bid }) {
  const leading = bid.winner === 'si';

  return (
    <View style={[styles.feedRow, leading && styles.feedRowLeading]}>
      <View style={styles.bidder}>
        <MaterialCommunityIcons
          color={leading ? '#73E6A2' : colors.primary}
          name={leading ? 'trophy-outline' : 'account-circle-outline'}
          size={24}
        />
        <View>
          <Text style={styles.bidderAlias}>{bid.bidderAlias}</Text>
          <Text style={styles.bidTime}>{formatTime(bid.createdAt)}</Text>
        </View>
      </View>
      <Text style={styles.feedAmount}>{formatMoney(bid.amount)}</Text>
    </View>
  );
}

function getSuggestedBid(auction) {
  return Number(auction.currentBid || auction.basePrice || 0) + Number(auction.basePrice || 0) * 0.01;
}

function formatCountdown(seconds) {
  const safeSeconds = Math.max(0, Number(seconds || 0));
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

function getClosureCopy(auction) {
  if (auction.closure?.reason === 'compra_empresa_sin_pujas') return 'Compra empresa';
  return auction.closure?.winner?.bidderAlias ?? 'Finalizada';
}

function getFinalResultText(auction) {
  if (auction.closure?.reason === 'compra_empresa_sin_pujas') {
    return `No se recibieron ofertas dentro del plazo. La empresa compra el objeto por el valor base de ${formatMoney(auction.basePrice)}.`;
  }
  if (auction.closure?.winner?.isCurrentUser) {
    const amount = auction.closure.winner.amount;
    const total = Number(amount || 0) + Number(auction.commission || 0) + SHIPPING_COST;
    return `Se registro la venta. Total a pagar: puja ${formatMoney(amount)}, comision ${formatMoney(auction.commission)} y envio ${formatMoney(SHIPPING_COST)}. Total ${formatMoney(total)}.`;
  }
  return `${auction.closure?.winner?.bidderAlias ?? 'El ultimo postor'} se queda con la pieza por ${formatMoney(auction.closure?.winner?.amount ?? auction.currentBid)}.`;
}

function getPaymentIcon(type) {
  if (type === 'tarjeta') return 'credit-card-outline';
  if (type === 'cheque') return 'file-document-check-outline';
  return 'bank-outline';
}

function getPaymentLabel(payment) {
  const detail = payment.parsedDetail || {};
  const currency = payment.currency ? ` ${payment.currency}` : '';
  if (payment.type === 'tarjeta') return `${detail.brand || 'Tarjeta'} ${detail.cardNumberLast4 || ''}${currency}`.trim();
  if (payment.type === 'cheque') return `Cheque ${detail.checkNumberLast4 || ''}${currency}`.trim();
  return `${detail.bank || 'Cuenta'} ${detail.cbuLast4 || detail.alias || ''}${currency}`.trim();
}

function parseCurrency(value) {
  return Number(String(value).replace(/\./g, '').replace(',', '.'));
}

function formatInputAmount(value) {
  return Number(value || 0).toLocaleString('es-AR', {
    maximumFractionDigits: 0
  });
}

function formatMoney(value) {
  return `$ ${Number(value || 0).toLocaleString('es-AR', {
    maximumFractionDigits: 0
  })}`;
}

function formatTime(value) {
  if (!value) return 'Ahora';

  return new Intl.DateTimeFormat('es-AR', {
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value.replace(' ', 'T')));
}

const styles = StyleSheet.create({
  amountBox: {
    alignItems: 'center',
    backgroundColor: 'rgba(20, 5, 43, 0.72)',
    borderColor: 'rgba(204, 193, 255, 0.24)',
    borderRadius: radii.md,
    borderWidth: 1,
    flex: 1,
    height: 58,
    justifyContent: 'center',
    paddingHorizontal: 8
  },
  amountInput: {
    color: colors.onSurface,
    fontSize: 21,
    fontWeight: '900',
    height: 30,
    minWidth: 120,
    padding: 0,
    textAlign: 'center'
  },
  amountLabel: {
    color: colors.onSurfaceVariant,
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase'
  },
  auctioneerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
    marginTop: 10
  },
  auctioneerText: {
    color: colors.onSurfaceVariant,
    fontSize: 12,
    fontWeight: '800'
  },
  bidButton: {
    alignItems: 'center',
    backgroundColor: colors.primaryContainer,
    borderRadius: radii.full,
    height: 52,
    justifyContent: 'center',
    marginTop: 12,
    paddingHorizontal: 16
  },
  bidButtonDisabled: {
    opacity: 0.48
  },
  bidButtonText: {
    color: colors.onPrimaryFixed,
    fontSize: 14,
    fontWeight: '900',
    textTransform: 'uppercase'
  },
  bidder: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 9
  },
  bidderAlias: {
    color: colors.onSurface,
    fontSize: 13,
    fontWeight: '900'
  },
  bidSurface: {
    backgroundColor: 'rgba(38, 24, 62, 0.95)',
    borderColor: 'rgba(204, 193, 255, 0.16)',
    borderRadius: radii.lg,
    borderWidth: 1,
    marginHorizontal: 4,
    marginTop: 10,
    padding: 14
  },
  bidTime: {
    color: colors.onSurfaceVariant,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2
  },
  brand: {
    color: colors.primary,
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 0,
    textTransform: 'uppercase'
  },
  brandBlock: {
    alignItems: 'center',
    gap: 5
  },
  container: {
    backgroundColor: colors.surfaceLowest,
    flex: 1
  },
  content: {
    padding: 16,
    paddingBottom: bottomNavHeight + 34,
    paddingTop: 16
  },
  currentBid: {
    color: colors.primary,
    fontSize: 36,
    fontWeight: '900',
    letterSpacing: 0,
    lineHeight: 41,
    marginTop: 4,
    textAlign: 'center'
  },
  emptyFeed: {
    alignItems: 'center',
    borderColor: 'rgba(72, 69, 81, 0.24)',
    borderRadius: radii.md,
    borderStyle: 'dashed',
    borderWidth: 1,
    padding: 18
  },
  emptyFeedText: {
    color: colors.onSurfaceVariant,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4
  },
  emptyFeedTitle: {
    color: colors.onSurface,
    fontSize: 14,
    fontWeight: '900'
  },
  error: {
    color: colors.error,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
    marginTop: 10,
    textAlign: 'center'
  },
  feedAmount: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '900'
  },
  feedChip: {
    backgroundColor: 'rgba(20, 5, 43, 0.78)',
    borderColor: 'rgba(204, 193, 255, 0.24)',
    borderRadius: radii.full,
    borderWidth: 1,
    maxWidth: 190,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  feedChipAlias: {
    color: colors.onSurface,
    fontSize: 11,
    fontWeight: '900'
  },
  feedChipAmount: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '900',
    marginTop: 1
  },
  feedHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12
  },
  feedList: {
    gap: 10
  },
  feedPanel: {
    backgroundColor: colors.surfaceContainer,
    borderColor: 'rgba(72, 69, 81, 0.24)',
    borderRadius: radii.md,
    borderWidth: 1,
    marginTop: 14,
    padding: 16
  },
  feedRow: {
    alignItems: 'center',
    backgroundColor: colors.surfaceLow,
    borderRadius: radii.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 12
  },
  feedRowLeading: {
    borderColor: 'rgba(115, 230, 162, 0.2)',
    borderWidth: 1
  },
  floatingFeed: {
    gap: 8,
    left: 14,
    position: 'absolute',
    top: 14
  },
  iconButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44
  },
  liveBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 180, 171, 0.1)',
    borderColor: 'rgba(255, 180, 171, 0.22)',
    borderRadius: radii.full,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 4
  },
  liveBadgeText: {
    color: colors.error,
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase'
  },
  liveBadgeTextClosed: {
    color: '#73E6A2'
  },
  liveDot: {
    backgroundColor: colors.error,
    borderRadius: radii.full,
    height: 7,
    width: 7
  },
  liveDotClosed: {
    backgroundColor: '#73E6A2'
  },
  loading: {
    alignItems: 'center',
    backgroundColor: colors.surfaceLowest,
    flex: 1,
    justifyContent: 'center'
  },
  message: {
    color: '#73E6A2',
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
    marginTop: 10,
    textAlign: 'center'
  },
  panelLabel: {
    color: colors.onSurfaceVariant,
    fontSize: 11,
    fontWeight: '900',
    textAlign: 'center',
    textTransform: 'uppercase'
  },
  noPaymentText: {
    color: colors.error,
    fontSize: 12,
    fontWeight: '800',
    paddingVertical: 8
  },
  paymentChip: {
    alignItems: 'center',
    borderColor: 'rgba(204, 193, 255, 0.22)',
    borderRadius: radii.full,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 12
  },
  paymentChipSelected: {
    backgroundColor: colors.primaryContainer,
    borderColor: colors.primaryContainer
  },
  paymentChipText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '900'
  },
  paymentChipTextSelected: {
    color: colors.onPrimaryFixed
  },
  paymentLabel: {
    color: colors.onSurfaceVariant,
    fontSize: 11,
    fontWeight: '900',
    marginBottom: 9,
    textTransform: 'uppercase'
  },
  paymentLockedText: {
    color: colors.onSurfaceVariant,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 16,
    marginTop: 8
  },
  paymentOptions: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: 6
  },
  paymentPanel: {
    marginTop: 12
  },
  rangeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8
  },
  rangeText: {
    color: colors.onSurfaceVariant,
    fontSize: 11,
    fontWeight: '800'
  },
  rangeHint: {
    color: colors.onSurfaceVariant,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 16,
    marginTop: 6,
    textAlign: 'center'
  },
  roomPill: {
    alignItems: 'center',
    backgroundColor: 'rgba(115, 230, 162, 0.1)',
    borderColor: 'rgba(115, 230, 162, 0.2)',
    borderRadius: radii.full,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5
  },
  roomPillText: {
    color: '#73E6A2',
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase'
  },
  resultBox: {
    backgroundColor: 'rgba(115, 230, 162, 0.1)',
    borderColor: 'rgba(115, 230, 162, 0.24)',
    borderRadius: radii.md,
    borderWidth: 1,
    marginTop: 12,
    padding: 12
  },
  resultText: {
    color: colors.onSurfaceVariant,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
    marginTop: 4,
    textAlign: 'center'
  },
  resultTitle: {
    color: '#73E6A2',
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'center',
    textTransform: 'uppercase'
  },
  sectionTitle: {
    color: colors.onSurface,
    fontSize: 18,
    fontWeight: '900'
  },
  stage: {
    backgroundColor: colors.surfaceHighest,
    borderColor: 'rgba(204, 193, 255, 0.14)',
    borderRadius: radii.lg,
    borderWidth: 1,
    height: 260,
    overflow: 'hidden'
  },
  stageCopy: {
    bottom: 0,
    left: 0,
    padding: 16,
    position: 'absolute',
    right: 0
  },
  stageDescription: {
    color: colors.onSurfaceVariant,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
    marginTop: 6
  },
  stageImage: {
    height: '100%',
    width: '100%'
  },
  stageMeta: {
    color: colors.tertiary,
    fontSize: 10,
    fontWeight: '900',
    marginBottom: 6,
    textTransform: 'uppercase'
  },
  stageTitle: {
    color: colors.onSurface,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 0,
    lineHeight: 26
  },
  stepButton: {
    alignItems: 'center',
    backgroundColor: colors.primaryContainer,
    borderRadius: radii.full,
    height: 50,
    justifyContent: 'center',
    width: 50
  },
  stepper: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    marginTop: 12
  },
  timerBox: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: 'rgba(208, 188, 255, 0.1)',
    borderColor: 'rgba(208, 188, 255, 0.22)',
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  timerBoxClosed: {
    backgroundColor: 'rgba(115, 230, 162, 0.1)',
    borderColor: 'rgba(115, 230, 162, 0.22)'
  },
  timerCopy: {
    alignItems: 'flex-start'
  },
  timerLabel: {
    color: colors.onSurfaceVariant,
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase'
  },
  timerValue: {
    color: colors.primary,
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 25,
    marginTop: 1
  },
  timerValueClosed: {
    color: '#73E6A2',
    fontSize: 16
  },
  topBar: {
    alignItems: 'center',
    backgroundColor: 'rgba(26, 11, 49, 0.95)',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 8,
    paddingHorizontal: 18,
    paddingTop: 34
  },
  watchButton: {
    alignItems: 'center',
    height: 34,
    justifyContent: 'center',
    marginTop: 6
  },
  watchButtonLocked: {
    opacity: 0.85
  },
  watchButtonText: {
    color: colors.onSurfaceVariant,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase'
  },
  watchButtonTextLocked: {
    color: colors.error
  },
  winnerButton: {
    alignItems: 'center',
    backgroundColor: colors.primaryContainer,
    borderRadius: radii.full,
    height: 50,
    justifyContent: 'center',
    marginTop: 20
  },
  winnerButtonText: {
    color: colors.onPrimaryFixed,
    fontSize: 13,
    fontWeight: '900',
    textTransform: 'uppercase'
  },
  winnerCard: {
    backgroundColor: colors.surfaceContainer,
    borderColor: 'rgba(244, 197, 106, 0.5)',
    borderRadius: radii.lg,
    borderWidth: 1,
    maxWidth: 380,
    padding: 26,
    width: '88%'
  },
  winnerItem: {
    color: colors.onSurface,
    fontSize: 16,
    fontWeight: '900',
    lineHeight: 22,
    marginTop: 8,
    textAlign: 'center'
  },
  winnerOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(10, 2, 23, 0.82)',
    flex: 1,
    justifyContent: 'center',
    padding: 24
  },
  winnerStars: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 15,
    justifyContent: 'center'
  },
  winnerText: {
    color: colors.onSurfaceVariant,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
    marginTop: 12,
    textAlign: 'center'
  },
  winnerTitle: {
    color: '#F4C56A',
    fontSize: 28,
    fontWeight: '900',
    marginTop: 14,
    textAlign: 'center'
  }
});

