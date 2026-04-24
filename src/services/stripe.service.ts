import { HTTPException } from 'hono/http-exception';
import Stripe from 'stripe';
import type { Mocked } from 'vitest';

import { cartRepository } from '../repositories/cart.repository.js';
import { orderRepository } from '../repositories/order.repository.js';
import { subscriptionRepository } from '../repositories/subscription.repository.js';
import { userRepository } from '../repositories/user.repository.js';

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
 * @returns The Stripe Account Link URL
 */
export async function generateStripeOnboardLink(userId: string) {
  const user = await userRepository.findById(userId);

  if (!user) {
    throw new HTTPException(404, { message: 'User not found' });
  }

  let stripeAccountId = user.stripeAccountId;

  if (!stripeAccountId) {
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
 * @param payload.sellerId - the unique seller id
 * @param payload.fulfillmentType - pickup or delivery
 * @param payload.scheduledTime - the datatime the order will be picked up or delivered
 * @returns The checkout session url
 */
export async function createCheckoutSession(
  buyerId: string,
  payload: { sellerId: string; fulfillmentType: string; scheduledTime: string },
) {
  const activeCartGroups = await cartRepository.getActiveCart(buyerId);

  const sellerItems = activeCartGroups.filter((item) => item.seller.id === payload.sellerId);

  if (sellerItems.length === 0) {
    throw new HTTPException(400, { message: 'No active reservations found for this seller.' });
  }

  const isSubscription = sellerItems.some((item) => item.reservation.isSubscription);

  let totalCartAmountCents = 0;

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = sellerItems.map((item) => {
    if (item.product.status !== 'active') {
      throw new HTTPException(400, {
        message: `Product is no longer available: ${item.product.title}`,
      });
    }

    const priceCents = Math.round(Number(item.product.pricePerOz) * 100);
    const qty = Math.round(Number(item.reservation.quantityOz));

    totalCartAmountCents += priceCents * qty;

    const isItemSub = item.reservation.isSubscription;

    return {
      price_data: {
        currency: 'usd',
        product_data: {
          name: item.product.title,
          description: isItemSub ? 'Recurring CSA Subscription' : 'One-time order',
        },
        unit_amount: priceCents,
        ...(isItemSub && item.product.harvestFrequencyDays
          ? {
              recurring: {
                interval: 'day',
                interval_count: item.product.harvestFrequencyDays,
              },
            }
          : {}),
      },
      quantity: qty,
    };
  });

  const seller = await userRepository.findById(payload.sellerId);
  if (!seller || !seller.stripeAccountId || !seller.stripeOnboardingComplete) {
    throw new HTTPException(400, {
      message: 'Seller is not properly configured to receive payments.',
    });
  }

  const reservationIds = sellerItems.map((item) => item.reservation.id).join(',');
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  const PLATFORM_FEE_PERCENT = 0.02;

  const sessionConfig: Stripe.Checkout.SessionCreateParams = {
    payment_method_types: ['card'],
    line_items: lineItems,
    mode: isSubscription ? 'subscription' : 'payment',
    success_url: `${appUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/cart`,
    metadata: {
      buyerId,
      sellerId: payload.sellerId,
      reservationIds,
      fulfillmentType: payload.fulfillmentType,
      scheduledTime: payload.scheduledTime,
    },
  };

  if (isSubscription) {
    sessionConfig.subscription_data = {
      transfer_data: { destination: seller.stripeAccountId },
      application_fee_percent: PLATFORM_FEE_PERCENT * 100,
    };
  } else {
    const calculatedFeeCents = Math.round(totalCartAmountCents * PLATFORM_FEE_PERCENT);
    sessionConfig.payment_intent_data = {
      application_fee_amount: calculatedFeeCents,
      transfer_data: { destination: seller.stripeAccountId },
    };
  }

  const session = await stripe.checkout.sessions.create(sessionConfig);

  if (!session.url) {
    throw new HTTPException(500, { message: 'Failed to create checkout session URL.' });
  }

  return session.url;
}

/**
 * Handles incoming webhooks securely verified by Stripe.
 * @param event - The verified Stripe Event object
 */
export async function processStripeWebhookEvent(event: Stripe.Event) {
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
      const subscription = event.data.object as Stripe.Subscription;
      await subscriptionRepository.updateSubscriptionDataByStripeId(subscription.id, {
        status: 'canceled',
        cancelReason: 'Canceled by billing provider',
      });
      break;
    }
    default:
      console.log(`Unhandled Stripe event type: ${event.type}`);
  }
}

/**
 * Creates an order for a paid invoice if associated with a subscription.
 * @param invoice - The Stripe invoice
 */
export async function handleInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
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
  } catch (error) {
    console.error(`Error fulfilling recurring invoice ${invoice.id}:`, error);
  }
}

/**
 * Processes a successful Stripe Checkout session by fulfilling the order in the database.
 * This handler extracts metadata (buyer, seller, reservations), creates the internal
 * order record, and notifies the seller of the new purchase.
 * @param session - The completed Stripe Checkout Session object containing metadata and payment totals.
 * @returns A promise that resolves when the order fulfillment and notification process is complete.
 */
async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const metadata = session.metadata;
  if (!metadata) return;

  const { buyerId, sellerId, reservationIds, fulfillmentType, scheduledTime } = metadata;
  const rIds = reservationIds?.split(',') || [];

  if (!buyerId || !sellerId || rIds.length === 0) {
    console.error('Checkout Session missing required metadata.', session.id);
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

    const buyer = await userRepository.findById(buyerId);
    const buyerName = buyer?.name ? buyer.name.split(' ')[0] : 'a customer';

    await sendPushNotification(
      sellerId,
      'New Order Received! 🥬',
      `New order from ${buyerName}! Open the app to view details.`,
    );
  } catch (error) {
    console.error(`Error fulfilling checkout session ${session.id}:`, error);
  }
}

/**
 * Updates a user's local onboarding status based on changes to their Stripe Express account.
 * This ensures the application knows when a seller is eligible to receive payments
 * based on Stripe's `details_submitted` and `charges_enabled` requirements.
 * @param account - The Stripe Account object containing updated verification and capability status.
 * @returns A promise that resolves once the local user record has been updated.
 */
async function handleAccountUpdated(account: Stripe.Account) {
  const isComplete = account.details_submitted && account.charges_enabled;
  await userRepository.updateStripeOnboardingStatus(account.id, isComplete);
}

/**
 * Updates the remote Stripe subscription status (Pause, Resume, Cancel).
 * @param stripeSubscriptionId - The ID of the subscription in Stripe.
 * @param status - The new status intent.
 */
export async function updateStripeSubscriptionStatus(
  stripeSubscriptionId: string,
  status: 'active' | 'paused' | 'canceled',
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
}

/**
 * Updates the quantity of a subscription in Stripe.
 * Disables proration so the buyer isn't charged immediately mid-cycle.
 * @param stripeSubscriptionId - The Stripe subscription ID
 * @param newQuantityOz - The new quantity
 */
export async function updateStripeSubscriptionQuantity(
  stripeSubscriptionId: string,
  newQuantityOz: number,
) {
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
 */
export async function refundCheckoutSession(stripeSessionId: string) {
  const session = await stripe.checkout.sessions.retrieve(stripeSessionId);

  if (!session.payment_intent) {
    throw new HTTPException(400, { message: 'No payment intent found for this session.' });
  }

  await stripe.refunds.create({
    payment_intent: session.payment_intent as string,
  });
}
