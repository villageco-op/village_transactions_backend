import { HTTPException } from 'hono/http-exception';
import Stripe from 'stripe';
import type { Mocked } from 'vitest';

import { type AppLogger, noopLogger } from '../interfaces/logger.interface.js';
import { cartRepository } from '../repositories/cart.repository.js';
import { orderRepository } from '../repositories/order.repository.js';
import { subscriptionRepository } from '../repositories/subscription.repository.js';
import { userRepository } from '../repositories/user.repository.js';
import { calculateDistanceMiles } from '../utils.js';

import { sendPushNotification } from './notification.service.js';
import { updateInternalStripeAccountId } from './user.service.js';

type StripeClient = Pick<
  Stripe,
  'accounts' | 'accountLinks' | 'checkout' | 'subscriptions' | 'subscriptionItems' | 'refunds'
>;

let stripe: StripeClient = new Stripe(process.env.STRIPE_SECRET_KEY as string);

/**
 * Allows overriding the stripe client for testing.
 * @param mock A partial mocked stripe client with accounts and account links.
 */
export const __setStripeClient = (mock: Mocked<StripeClient>) => {
  stripe = mock as StripeClient;
};

/**
 * Generates an onboarding link for a seller. Creates a connected Express account if one does not exist.
 * @param userId - The ID of the authenticated user
 * @param log - App logger that defaults to a blank logger
 * @returns The Stripe Account Link URL
 */
export async function generateStripeOnboardLink(userId: string, log: AppLogger = noopLogger) {
  const user = await userRepository.findById(userId);

  if (!user) {
    throw new HTTPException(404, { message: 'User not found' });
  }

  let stripeAccountId = user.stripeAccountId;

  if (!stripeAccountId) {
    log.info('Creating new Stripe Express account for seller');
    const account = await stripe.accounts.create({
      type: 'express',
      country: 'US',
      capabilities: {
        transfers: { requested: true },
      },
    });

    stripeAccountId = account.id;

    await updateInternalStripeAccountId(userId, stripeAccountId);
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  const accountLink = await stripe.accountLinks.create({
    account: stripeAccountId,
    refresh_url: `${appUrl}/onboarding/refresh`,
    return_url: `${appUrl}/dashboard`,
    type: 'account_onboarding',
  });

  return accountLink.url;
}

/**
 * Creates a Stripe Checkout session for a specific seller's produce.
 * @param buyerId - the unique buyer id
 * @param payload - checkout specific information
 * @param payload.groupId - the unique group id
 * @param log - App logger that defaults to a blank logger
 * @returns The checkout session url
 */
export async function createCheckoutSession(
  buyerId: string,
  payload: { groupId: string },
  log: AppLogger = noopLogger,
) {
  const groupRows = await cartRepository.getCheckoutGroup(buyerId, payload.groupId);

  if (groupRows.length === 0) {
    log.warn('Checkout failed: group not found or expired');
    throw new HTTPException(400, { message: 'Checkout group not found or has expired.' });
  }

  const { group, seller, buyer } = groupRows[0];
  const isSub = group.isSubscription;
  const freq = group.frequencyDays;

  log.setBindings({ sellerId: seller?.id, isSubscription: group.isSubscription });

  const now = new Date();
  const latestAvailableBy = new Date(
    Math.max(...groupRows.map((r) => r.product.availableBy.getTime())),
  );
  const scheduledTime = latestAvailableBy > now ? latestAvailableBy : now;

  const SUBSCRIPTION_DISCOUNT_PERCENT = parseFloat(
    process.env.SUBSCRIPTION_DISCOUNT_PERCENT || '10',
  );
  let totalCartAmountCents = 0;

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = groupRows.map((row) => {
    const { product, reservation } = row;

    if (product.status !== 'active') {
      throw new HTTPException(400, { message: `Product is no longer available: ${product.title}` });
    }

    let priceCents = Math.round(Number(product.pricePerOz) * 100);
    const qty = Math.round(Number(reservation.quantityOz));

    if (isSub) {
      priceCents = Math.round(priceCents * (1 - SUBSCRIPTION_DISCOUNT_PERCENT / 100));
    }

    totalCartAmountCents += priceCents * qty;

    return {
      price_data: {
        currency: 'usd',
        product_data: {
          name: product.title,
          description: isSub ? 'Recurring CSA Subscription' : 'One-time order',
        },
        unit_amount: priceCents,
        ...(isSub && freq ? { recurring: { interval: 'day', interval_count: freq } } : {}),
      },
      quantity: qty,
    };
  });

  if (group.fulfillmentType === 'delivery') {
    const DELIVERY_FEE_BASE = parseFloat(process.env.DELIVERY_FEE_BASE || '5.00');
    const DELIVERY_FEE_PER_MILE = parseFloat(process.env.DELIVERY_FEE_PER_MILE || '1.50');

    let fee = DELIVERY_FEE_BASE;
    if (buyer.lat && buyer.lng && seller.lat && seller.lng) {
      const miles = calculateDistanceMiles(buyer.lat, buyer.lng, seller.lat, seller.lng);
      fee += miles * DELIVERY_FEE_PER_MILE;
    }

    const deliveryFeeCents = Math.round(fee * 100);
    totalCartAmountCents += deliveryFeeCents;

    lineItems.push({
      price_data: {
        currency: 'usd',
        product_data: {
          name: 'Delivery Fee',
          description: isSub
            ? 'Recurring distance-based delivery estimate'
            : 'Distance-based delivery estimate',
        },
        unit_amount: deliveryFeeCents,
        ...(isSub && freq ? { recurring: { interval: 'day', interval_count: freq } } : {}),
      },
      quantity: 1,
    });
  }

  const sellerUser = await userRepository.findById(seller.id);
  if (!sellerUser || !sellerUser.stripeAccountId || !sellerUser.stripeOnboardingComplete) {
    throw new HTTPException(400, {
      message: 'Seller is not properly configured to receive payments.',
    });
  }

  const reservationIds = groupRows.map((r) => r.reservation.id).join(',');
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const PLATFORM_FEE_PERCENT = Number(process.env.PLATFORM_FEE_PERCENT) || 0.01;

  const sessionConfig: Stripe.Checkout.SessionCreateParams = {
    payment_method_types: ['card'],
    line_items: lineItems,
    mode: isSub ? 'subscription' : 'payment',
    success_url: `${appUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/cart`,
    metadata: {
      buyerId,
      sellerId: seller.id,
      groupId: group.id,
      reservationIds,
      fulfillmentType: group.fulfillmentType,
      scheduledTime: scheduledTime.toISOString(),
    },
  };

  if (isSub) {
    sessionConfig.subscription_data = {
      transfer_data: { destination: sellerUser.stripeAccountId },
      application_fee_percent: PLATFORM_FEE_PERCENT * 100,
    };
  } else {
    const calculatedFeeCents = Math.round(totalCartAmountCents * PLATFORM_FEE_PERCENT);
    sessionConfig.payment_intent_data = {
      application_fee_amount: calculatedFeeCents,
      transfer_data: { destination: sellerUser.stripeAccountId },
    };
  }

  if (group.fulfillmentType === 'delivery') {
    log.info('Adding distance-based delivery fee to checkout session');
  }

  const session = await stripe.checkout.sessions.create(sessionConfig);

  if (!session.url) {
    throw new HTTPException(500, { message: 'Failed to create checkout session URL.' });
  }

  log.info({ sessionId: session.id }, 'Stripe session created successfully');

  return session.url;
}

/**
 * Handles incoming webhooks securely verified by Stripe.
 * @param event - The verified Stripe Event object
 * @param log - App logger that defaults to a blank logger
 */
export async function processStripeWebhookEvent(event: Stripe.Event, log: AppLogger = noopLogger) {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      await handleCheckoutCompleted(session);
      break;
    }
    case 'account.updated': {
      const account = event.data.object as Stripe.Account;
      await handleAccountUpdated(account);
      break;
    }
    case 'invoice.paid': {
      const invoice = event.data.object as Stripe.Invoice;
      await handleInvoicePaid(invoice);
      break;
    }
    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      log.warn(
        { invoiceId: invoice.id },
        'Subscription payment failed; pausing local subscription',
      );

      const stripeSubscriptionId = invoice.lines.data[0]?.subscription;

      if (typeof stripeSubscriptionId === 'string') {
        await subscriptionRepository.updateSubscriptionDataByStripeId(stripeSubscriptionId, {
          status: 'paused',
          cancelReason: 'Payment failed',
        });
      }
      break;
    }
    case 'customer.subscription.deleted': {
      log.info('External subscription cancellation received from Stripe');

      const subscription = event.data.object as Stripe.Subscription;
      await subscriptionRepository.updateSubscriptionDataByStripeId(subscription.id, {
        status: 'canceled',
        cancelReason: 'Canceled by billing provider',
      });
      break;
    }
    default:
      log.info({ eventType: event.type }, 'Unhandled Stripe event type');
  }
}

/**
 * Creates an order for a paid invoice if associated with a subscription.
 * @param invoice - The Stripe invoice
 * @param log - App logger that defaults to a blank logger
 */
export async function handleInvoicePaid(
  invoice: Stripe.Invoice,
  log: AppLogger = noopLogger,
): Promise<void> {
  const stripeSubscriptionId = invoice.lines.data[0]?.subscription;

  if (!stripeSubscriptionId || typeof stripeSubscriptionId !== 'string') return;

  if (invoice.billing_reason === 'subscription_create') {
    return;
  }

  const totalAmount = invoice.amount_paid / 100;
  const stripeReceiptUrl = invoice.hosted_invoice_url || '';

  try {
    await orderRepository.fulfillRecurringSubscription({
      stripeSubscriptionId,
      stripeInvoiceId: invoice.id,
      stripeReceiptUrl,
      totalAmount,
    });
    log.info(
      { stripeInvoiceId: invoice.id },
      'Successfully fulfilled recurring subscription invoice',
    );
  } catch (error) {
    log.error(
      { error: error instanceof Error ? error.message : error, invoiceId: invoice.id },
      'Failed to fulfill recurring invoice',
    );
  }
}

/**
 * Processes a successful Stripe Checkout session by fulfilling the order in the database.
 * This handler extracts metadata (buyer, seller, reservations), creates the internal
 * order record, and notifies the seller of the new purchase.
 * @param session - The completed Stripe Checkout Session object containing metadata and payment totals.
 * @param log - App logger that defaults to a blank logger.
 * @returns A promise that resolves when the order fulfillment and notification process is complete.
 */
async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session,
  log: AppLogger = noopLogger,
) {
  const metadata = session.metadata;
  if (!metadata) return;

  const { buyerId, sellerId, reservationIds, fulfillmentType, scheduledTime } = metadata;
  const rIds = reservationIds?.split(',') || [];

  log.setBindings({ buyerId, sellerId, stripeSessionId: session.id });

  if (!buyerId || !sellerId || rIds.length === 0) {
    log.warn({ sessionId: session.id }, 'Checkout Session missing required metadata');
    return;
  }

  const expandedSession = await stripe.checkout.sessions.retrieve(session.id, {
    expand: ['payment_intent.latest_charge'],
  });

  const paymentIntent = expandedSession.payment_intent as Stripe.PaymentIntent | null;
  const latestCharge = paymentIntent?.latest_charge as Stripe.Charge | null;
  const stripeReceiptUrl = latestCharge?.receipt_url || '';

  const totalAmount = session.amount_total ? session.amount_total / 100 : 0;

  const stripeSubscriptionId =
    typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;

  try {
    await orderRepository.fulfillCheckoutSession({
      buyerId,
      sellerId,
      stripeSessionId: session.id,
      stripeSubscriptionId,
      stripeReceiptUrl,
      totalAmount,
      fulfillmentType: fulfillmentType as 'pickup' | 'delivery',
      scheduledTime: new Date(scheduledTime),
      reservationIds: rIds,
    });

    log.info('Successfully fulfilled order from checkout session');

    const buyer = await userRepository.findById(buyerId);
    const buyerName = buyer?.name ? buyer.name.split(' ')[0] : 'a customer';

    log.info({ recipientName: buyerName }, 'Triggering push notification for new order');

    await sendPushNotification(
      sellerId,
      'New Order Received! 🥬',
      `New order from ${buyerName}! Open the app to view details.`,
    );
  } catch (error) {
    log.error(
      { error: error instanceof Error ? error.message : error },
      'Fulfillment failed during checkout completion',
    );
  }
}

/**
 * Updates a user's local onboarding status based on changes to their Stripe Express account.
 * This ensures the application knows when a seller is eligible to receive payments
 * based on Stripe's `details_submitted` and `charges_enabled` requirements.
 * @param account - The Stripe Account object containing updated verification and capability status.
 * @param log - App logger that defaults to a blank logger.
 * @returns A promise that resolves once the local user record has been updated.
 */
async function handleAccountUpdated(account: Stripe.Account, log: AppLogger = noopLogger) {
  const isComplete = account.details_submitted && account.charges_enabled;
  await userRepository.updateStripeOnboardingStatus(account.id, isComplete);
  log.info(
    { stripeAccountId: account.id, isComplete },
    'Updated user onboarding status from Stripe',
  );
}

/**
 * Updates the remote Stripe subscription status (Pause, Resume, Cancel).
 * @param stripeSubscriptionId - The ID of the subscription in Stripe.
 * @param status - The new status intent.
 * @param log - App logger that defaults to a blank logger.
 */
export async function updateStripeSubscriptionStatus(
  stripeSubscriptionId: string,
  status: 'active' | 'paused' | 'canceled',
  log: AppLogger = noopLogger,
) {
  if (status === 'canceled') {
    await stripe.subscriptions.cancel(stripeSubscriptionId);
  } else if (status === 'paused') {
    await stripe.subscriptions.update(stripeSubscriptionId, {
      pause_collection: { behavior: 'void' },
    });
  } else if (status === 'active') {
    await stripe.subscriptions.update(stripeSubscriptionId, {
      pause_collection: '',
    });
  }
  log.info({ stripeSubscriptionId, status }, 'Transitioning subscription state');
}

/**
 * Updates the quantity of a subscription in Stripe.
 * Disables proration so the buyer isn't charged immediately mid-cycle.
 * @param stripeSubscriptionId - The Stripe subscription ID
 * @param newQuantityOz - The new quantity
 * @param log - App logger that defaults to a blank logger
 */
export async function updateStripeSubscriptionQuantity(
  stripeSubscriptionId: string,
  newQuantityOz: number,
  log: AppLogger = noopLogger,
) {
  log.info({ stripeSubscriptionId, newQuantityOz }, 'Updating Stripe subscription quantity');
  const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);

  // One product per subscription
  const subscriptionItemId = subscription.items.data[0].id;

  const safeQuantity = Math.round(newQuantityOz);

  await stripe.subscriptionItems.update(subscriptionItemId, {
    quantity: safeQuantity,
    proration_behavior: 'none', // Prevents immediate fractional billing mid-week
  });
}

/**
 * Issues a full refund for a given Checkout Session.
 * @param stripeSessionId - The ID of the Stripe Checkout Session
 * @param log - App logger that defaults to a blank logger
 */
export async function refundCheckoutSession(stripeSessionId: string, log: AppLogger = noopLogger) {
  const session = await stripe.checkout.sessions.retrieve(stripeSessionId);

  if (!session.payment_intent) {
    throw new HTTPException(400, { message: 'No payment intent found for this session.' });
  }

  await stripe.refunds.create({
    payment_intent: session.payment_intent as string,
  });

  log.info({ stripeSessionId, reason: 'user_request' }, 'Issuing full refund for checkout session');
}
