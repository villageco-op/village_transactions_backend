import { describe, it, expect, vi, beforeEach, Mocked } from 'vitest';
import { HTTPException } from 'hono/http-exception';
import type Stripe from 'stripe';

import {
  __setStripeClient,
  generateStripeOnboardLink,
  refundCheckoutSession,
  processStripeWebhookEvent,
  updateStripeSubscriptionQuantity,
  createCheckoutSession,
  handleInvoicePaid,
} from '../../../src/services/stripe.service.js';
import { userRepository } from '../../../src/repositories/user.repository.js';
import { updateInternalStripeAccountId } from '../../../src/services/user.service.js';
import { orderRepository } from '../../../src/repositories/order.repository.js';
import { sendPushNotification } from '../../../src/services/notification.service.js';
import { cartRepository } from '../../../src/repositories/cart.repository.js';
import { subscriptionRepository } from '../../../src/repositories/subscription.repository.js';

const mockStripe = {
  accounts: {
    create: vi.fn().mockResolvedValue({ id: 'acct_test' }),
  },
  accountLinks: {
    create: vi.fn().mockResolvedValue({ url: 'test_url' }),
  },
  subscriptions: {
    update: vi.fn(),
    cancel: vi.fn(),
    retrieve: vi.fn().mockResolvedValue({
      items: { data: [{ id: 'si_item_123' }] },
    }),
  },
  subscriptionItems: {
    update: vi.fn(),
  },
  checkout: {
    sessions: {
      retrieve: vi.fn().mockResolvedValue({
        id: 'cs_test',
        payment_intent: {
          id: 'pi_test',
          latest_charge: {
            id: 'ch_test',
            receipt_url: 'https://stripe.com/receipt',
          },
        },
      }),
      create: vi.fn().mockResolvedValue({ url: 'https://stripe.com/checkout/session_123' }),
    },
  },
  refunds: {
    create: vi.fn(),
  },
} as unknown as Mocked<Stripe>;

vi.mock('../../../src/repositories/user.repository.js', () => ({
  userRepository: {
    findById: vi.fn(),
  },
}));

vi.mock('../../../src/services/user.service.js', () => ({
  updateInternalStripeAccountId: vi.fn(),
}));

vi.mock('../../../src/repositories/order.repository.js', () => ({
  orderRepository: {
    fulfillCheckoutSession: vi.fn(),
    fulfillRecurringSubscription: vi.fn(),
  },
}));

vi.mock('../../../src/repositories/cart.repository.js', () => ({
  cartRepository: {
    getActiveCart: vi.fn(),
  },
}));

vi.mock('../../../src/services/notification.service.js', () => ({
  sendPushNotification: vi.fn(),
}));

vi.mock('../../../src/repositories/subscription.repository.js', () => ({
  subscriptionRepository: {
    updateSubscriptionDataByStripeId: vi.fn(),
  },
}));

describe('StripeService - generateStripeOnboardLink', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
    __setStripeClient(mockStripe);
  });

  it('should throw a 404 if the user is not found', async () => {
    vi.mocked(userRepository.findById).mockResolvedValueOnce(null);

    await expect(generateStripeOnboardLink('missing_user')).rejects.toThrow(HTTPException);
  });

  it('should create a Stripe account and link if user does NOT have a stripeAccountId', async () => {
    vi.mocked(userRepository.findById).mockResolvedValueOnce({
      id: 'user_1',
      stripeAccountId: null,
    } as any);

    vi.mocked(mockStripe.accounts.create).mockResolvedValueOnce({
      id: 'acct_new123',
    } as any);

    vi.mocked(mockStripe.accountLinks.create).mockResolvedValueOnce({
      url: 'https://connect.stripe.com/onboard',
    } as any);

    const url = await generateStripeOnboardLink('user_1');

    expect(mockStripe.accounts.create).toHaveBeenCalledWith({
      type: 'express',
      country: 'US',
      capabilities: { transfers: { requested: true } },
    });

    expect(updateInternalStripeAccountId).toHaveBeenCalledWith('user_1', 'acct_new123');

    expect(mockStripe.accountLinks.create).toHaveBeenCalledWith({
      account: 'acct_new123',
      refresh_url: 'http://localhost:3000/onboarding/refresh',
      return_url: 'http://localhost:3000/dashboard',
      type: 'account_onboarding',
    });

    expect(url).toBe('https://connect.stripe.com/onboard');
  });

  it('should skip creating a Stripe account and ONLY generate link if user ALREADY has a stripeAccountId', async () => {
    vi.mocked(userRepository.findById).mockResolvedValueOnce({
      id: 'user_2',
      stripeAccountId: 'acct_existing999',
    } as any);

    vi.mocked(mockStripe.accountLinks.create).mockResolvedValueOnce({
      url: 'https://connect.stripe.com/resume-onboard',
    } as any);

    const url = await generateStripeOnboardLink('user_2');

    expect(mockStripe.accounts.create).not.toHaveBeenCalled();
    expect(updateInternalStripeAccountId).not.toHaveBeenCalled();

    expect(mockStripe.accountLinks.create).toHaveBeenCalledWith({
      account: 'acct_existing999',
      refresh_url: 'http://localhost:3000/onboarding/refresh',
      return_url: 'http://localhost:3000/dashboard',
      type: 'account_onboarding',
    });

    expect(url).toBe('https://connect.stripe.com/resume-onboard');
  });
});

describe('StripeService - processStripeWebhookEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should process account.updated event and update onboarding status', async () => {
    userRepository.updateStripeOnboardingStatus = vi.fn().mockResolvedValue(undefined);

    const event = {
      type: 'account.updated',
      data: {
        object: {
          id: 'acct_123',
          details_submitted: true,
          charges_enabled: true,
        },
      },
    } as unknown as Stripe.Event;

    await processStripeWebhookEvent(event);

    expect(userRepository.updateStripeOnboardingStatus).toHaveBeenCalledWith('acct_123', true);
  });

  it('should process checkout.session.completed event and fulfill order', async () => {
    vi.mocked(userRepository.findById).mockResolvedValueOnce({
      id: 'buyer_1',
      name: 'Alice Smith',
    } as any);

    const event = {
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_123',
          subscription: 'sub_stripe_abc123',
          amount_total: 1500,
          metadata: {
            buyerId: 'buyer_1',
            sellerId: 'seller_1',
            reservationIds: 'res_1,res_2',
            fulfillmentType: 'pickup',
            scheduledTime: '2026-05-15T12:00:00Z',
          },
        },
      },
    } as unknown as Stripe.Event;

    await processStripeWebhookEvent(event);

    expect(orderRepository.fulfillCheckoutSession).toHaveBeenCalledWith({
      buyerId: 'buyer_1',
      sellerId: 'seller_1',
      stripeSessionId: 'cs_test_123',
      stripeSubscriptionId: 'sub_stripe_abc123',
      stripeReceiptUrl: 'https://stripe.com/receipt',
      totalAmount: 15,
      fulfillmentType: 'pickup',
      scheduledTime: new Date('2026-05-15T12:00:00Z'),
      reservationIds: ['res_1', 'res_2'],
    });

    expect(sendPushNotification).toHaveBeenCalledWith(
      'seller_1',
      'New Order Received! 🥬',
      'New order from Alice! Open the app to view details.',
    );
  });

  it('should skip checkout.session.completed if missing essential metadata', async () => {
    const event = {
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_missing_meta',
          metadata: {
            buyerId: 'buyer_1', // Missing sellerId and reservationIds
          },
        },
      },
    } as unknown as Stripe.Event;

    await processStripeWebhookEvent(event);

    expect(orderRepository.fulfillCheckoutSession).not.toHaveBeenCalled();
    expect(sendPushNotification).not.toHaveBeenCalled();
  });

  it('should process invoice.paid and fulfill recurring subscription', async () => {
    const event = {
      type: 'invoice.paid',
      data: {
        object: {
          id: 'in_123',
          amount_paid: 2000,
          hosted_invoice_url: 'https://stripe.com/invoice_url',
          billing_reason: 'subscription_cycle',
          lines: {
            data: [{ subscription: 'sub_test_paid' }],
          },
        },
      },
    } as unknown as Stripe.Event;

    await processStripeWebhookEvent(event);

    expect(orderRepository.fulfillRecurringSubscription).toHaveBeenCalledWith({
      stripeSubscriptionId: 'sub_test_paid',
      stripeInvoiceId: 'in_123',
      stripeReceiptUrl: 'https://stripe.com/invoice_url',
      totalAmount: 20,
    });
  });

  it('should skip invoice.paid if billing reason is subscription_create', async () => {
    const event = {
      type: 'invoice.paid',
      data: {
        object: {
          billing_reason: 'subscription_create',
          lines: { data: [{ subscription: 'sub_test_initial' }] },
        },
      },
    } as unknown as Stripe.Event;

    await processStripeWebhookEvent(event);

    expect(orderRepository.fulfillRecurringSubscription).not.toHaveBeenCalled();
  });

  it('should process invoice.payment_failed and pause subscription', async () => {
    const event = {
      type: 'invoice.payment_failed',
      data: {
        object: {
          lines: {
            data: [{ subscription: 'sub_failed_123' }],
          },
        },
      },
    } as unknown as Stripe.Event;

    await processStripeWebhookEvent(event);

    expect(subscriptionRepository.updateSubscriptionDataByStripeId).toHaveBeenCalledWith(
      'sub_failed_123',
      {
        status: 'paused',
        cancelReason: 'Payment failed',
      },
    );
  });

  it('should process customer.subscription.deleted and cancel subscription', async () => {
    const event = {
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: 'sub_deleted_123',
        },
      },
    } as unknown as Stripe.Event;

    await processStripeWebhookEvent(event);

    expect(subscriptionRepository.updateSubscriptionDataByStripeId).toHaveBeenCalledWith(
      'sub_deleted_123',
      {
        status: 'canceled',
        cancelReason: 'Canceled by billing provider',
      },
    );
  });
});

describe('StripeService - refundCheckoutSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should issue a full refund if payment intent exists', async () => {
    vi.mocked(mockStripe.checkout.sessions.retrieve).mockResolvedValueOnce({
      id: 'cs_123',
      payment_intent: 'pi_123',
    } as any);

    await refundCheckoutSession('cs_123');

    expect(mockStripe.checkout.sessions.retrieve).toHaveBeenCalledWith('cs_123');
    expect(mockStripe.refunds.create).toHaveBeenCalledWith({ payment_intent: 'pi_123' });
  });

  it('should throw an HTTPException if payment intent is missing', async () => {
    vi.mocked(mockStripe.checkout.sessions.retrieve).mockResolvedValueOnce({
      id: 'cs_123',
      payment_intent: null,
    } as any);

    await expect(refundCheckoutSession('cs_123')).rejects.toThrow(HTTPException);
    expect(mockStripe.refunds.create).not.toHaveBeenCalled();
  });
});

describe('StripeService - updateStripeSubscriptionQuantity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should retrieve the subscription, find the item ID, and update quantity safely without proration', async () => {
    await updateStripeSubscriptionQuantity('sub_abc123', 15.6); // 15.6 should round to 16

    expect(mockStripe.subscriptions.retrieve).toHaveBeenCalledWith('sub_abc123');
    expect(mockStripe.subscriptionItems.update).toHaveBeenCalledWith('si_item_123', {
      quantity: 16,
      proration_behavior: 'none',
    });
  });
});

describe('StripeService - createCheckoutSession', () => {
  const mockBuyerId = 'buyer_123';
  const mockPayload = {
    sellerId: 'seller_1',
    fulfillmentType: 'pickup',
    scheduledTime: '2026-05-15T12:00:00Z',
  };

  const mockValidSeller = {
    id: 'seller_1',
    stripeAccountId: 'acct_seller123',
    stripeOnboardingComplete: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
    vi.mocked(userRepository.findById).mockResolvedValue(mockValidSeller as any);
  });

  it('should throw 400 if no active reservations exist for the requested seller', async () => {
    vi.mocked(cartRepository.getActiveCart).mockResolvedValueOnce([
      { seller: { id: 'seller_2' } } as any, // Different seller
    ]);

    await expect(createCheckoutSession(mockBuyerId, mockPayload)).rejects.toThrow(
      new HTTPException(400, { message: 'No active reservations found for this seller.' }),
    );
  });

  it('should throw 400 if an item in the cart is no longer active', async () => {
    vi.mocked(cartRepository.getActiveCart).mockResolvedValueOnce([
      {
        seller: { id: 'seller_1' },
        product: { title: 'Tomatoes', status: 'paused' },
        reservation: { isSubscription: false },
      } as any,
    ]);

    await expect(createCheckoutSession(mockBuyerId, mockPayload)).rejects.toThrow(
      new HTTPException(400, { message: 'Product is no longer available: Tomatoes' }),
    );
  });

  it('should throw 400 if the seller is not fully configured for Stripe payments', async () => {
    vi.mocked(userRepository.findById).mockResolvedValueOnce({
      ...mockValidSeller,
      stripeOnboardingComplete: false,
    } as any);

    vi.mocked(cartRepository.getActiveCart).mockResolvedValueOnce([
      {
        seller: { id: 'seller_1' },
        product: { title: 'Tomatoes', status: 'active', pricePerOz: 1.0 },
        reservation: { id: 'res_1', quantityOz: 10, isSubscription: false },
      } as any,
    ]);

    await expect(createCheckoutSession(mockBuyerId, mockPayload)).rejects.toThrow(
      new HTTPException(400, { message: 'Seller is not properly configured to receive payments.' }),
    );
  });

  it('should create a ONE-TIME payment checkout session correctly calculating platform fees', async () => {
    vi.mocked(cartRepository.getActiveCart).mockResolvedValueOnce([
      {
        seller: { id: 'seller_1' },
        product: { title: 'Apples', status: 'active', pricePerOz: 0.5 }, // $0.50
        reservation: { id: 'res_1', quantityOz: 32, isSubscription: false }, // 32oz = $16.00
      } as any,
    ]);

    const url = await createCheckoutSession(mockBuyerId, mockPayload);

    expect(mockStripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: { name: 'Apples', description: 'One-time order' },
              unit_amount: 50, // 50 cents
            },
            quantity: 32,
          },
        ],
        payment_intent_data: {
          application_fee_amount: 32, // 2% of $16.00 (1600 cents) = 32 cents
          transfer_data: { destination: 'acct_seller123' },
        },
        metadata: {
          buyerId: mockBuyerId,
          sellerId: 'seller_1',
          reservationIds: 'res_1',
          fulfillmentType: 'pickup',
          scheduledTime: '2026-05-15T12:00:00Z',
        },
      }),
    );
    expect(url).toBe('https://stripe.com/checkout/session_123');
  });

  it('should create a SUBSCRIPTION checkout session applying recurring interval and fee percent', async () => {
    vi.mocked(cartRepository.getActiveCart).mockResolvedValueOnce([
      {
        seller: { id: 'seller_1' },
        product: {
          title: 'Weekly Veggie Box',
          status: 'active',
          pricePerOz: 2.0,
          harvestFrequencyDays: 7,
        },
        reservation: { id: 'res_2', quantityOz: 10, isSubscription: true },
      } as any,
    ]);

    await createCheckoutSession(mockBuyerId, mockPayload);

    expect(mockStripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'subscription',
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: 'Weekly Veggie Box',
                description: 'Recurring CSA Subscription',
              },
              unit_amount: 200,
              recurring: { interval: 'day', interval_count: 7 }, // Subscription-specific field
            },
            quantity: 10,
          },
        ],
        subscription_data: {
          application_fee_percent: 2.0, // 2% platform fee
          transfer_data: { destination: 'acct_seller123' },
        },
      }),
    );
  });

  it('should throw a 500 if Stripe fails to return a session URL', async () => {
    vi.mocked(mockStripe.checkout.sessions.create).mockResolvedValueOnce({ url: null } as any);

    vi.mocked(cartRepository.getActiveCart).mockResolvedValueOnce([
      {
        seller: { id: 'seller_1' },
        product: { title: 'Carrots', status: 'active', pricePerOz: 0.75 },
        reservation: { id: 'res_1', quantityOz: 16, isSubscription: false },
      } as any,
    ]);

    await expect(createCheckoutSession(mockBuyerId, mockPayload)).rejects.toThrow(
      new HTTPException(500, { message: 'Failed to create checkout session URL.' }),
    );
  });
});

describe('StripeService - handleInvoicePaid', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should successfully fulfill a recurring subscription for a valid invoice', async () => {
    const mockInvoice = {
      id: 'in_valid_123',
      amount_paid: 5000, // $50.00
      hosted_invoice_url: 'https://stripe.com/invoice/pdf',
      billing_reason: 'subscription_cycle',
      lines: {
        data: [{ subscription: 'sub_stripe_123' }],
      },
    } as unknown as Stripe.Invoice;

    await handleInvoicePaid(mockInvoice);

    expect(orderRepository.fulfillRecurringSubscription).toHaveBeenCalledWith({
      stripeSubscriptionId: 'sub_stripe_123',
      stripeInvoiceId: 'in_valid_123',
      stripeReceiptUrl: 'https://stripe.com/invoice/pdf',
      totalAmount: 50,
    });
  });

  it('should return early and do nothing if billing_reason is subscription_create', async () => {
    const mockInvoice = {
      billing_reason: 'subscription_create',
      lines: { data: [{ subscription: 'sub_initial' }] },
    } as unknown as Stripe.Invoice;

    await handleInvoicePaid(mockInvoice);

    expect(orderRepository.fulfillRecurringSubscription).not.toHaveBeenCalled();
  });

  it('should return early if subscription ID is missing in lines', async () => {
    const mockInvoice = {
      id: 'in_no_sub',
      billing_reason: 'subscription_cycle',
      lines: { data: [] }, // No lines = no subscription
    } as unknown as Stripe.Invoice;

    await handleInvoicePaid(mockInvoice);

    expect(orderRepository.fulfillRecurringSubscription).not.toHaveBeenCalled();
  });

  it('should log an error but not throw if the repository call fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    vi.mocked(orderRepository.fulfillRecurringSubscription).mockRejectedValueOnce(
      new Error('DB Timeout'),
    );

    const mockInvoice = {
      id: 'in_fail_123',
      amount_paid: 1000,
      billing_reason: 'subscription_cycle',
      lines: { data: [{ subscription: 'sub_trigger_error' }] },
    } as unknown as Stripe.Invoice;

    await expect(handleInvoicePaid(mockInvoice)).resolves.not.toThrow();

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Error fulfilling recurring invoice in_fail_123:'),
      expect.any(Error),
    );

    consoleSpy.mockRestore();
  });

  it('should use an empty string for receipt URL if hosted_invoice_url is missing', async () => {
    const mockInvoice = {
      id: 'in_no_url',
      amount_paid: 2000,
      billing_reason: 'subscription_cycle',
      hosted_invoice_url: null,
      lines: { data: [{ subscription: 'sub_123' }] },
    } as unknown as Stripe.Invoice;

    await handleInvoicePaid(mockInvoice);

    expect(orderRepository.fulfillRecurringSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        stripeReceiptUrl: '',
      }),
    );
  });
});
