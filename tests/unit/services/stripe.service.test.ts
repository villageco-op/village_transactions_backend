import { describe, it, expect, vi, beforeEach, Mocked, afterEach } from 'vitest';
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
    getCheckoutGroup: vi.fn(),
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
  const mockGroupId = 'group_abc_123';
  const mockPayload = { groupId: mockGroupId };
  const FAKE_NOW = '2026-04-27T12:00:00.000Z';

  const mockSellerUser = {
    id: 'seller_1',
    stripeAccountId: 'acct_seller123',
    stripeOnboardingComplete: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(FAKE_NOW));

    // Set default envs
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
    process.env.PLATFORM_FEE_PERCENT = '0.02'; // 2%
    process.env.SUBSCRIPTION_DISCOUNT_PERCENT = '10'; // 10%
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should throw 400 if the checkout group is not found or empty', async () => {
    vi.mocked(cartRepository.getCheckoutGroup).mockResolvedValueOnce([]);

    await expect(createCheckoutSession(mockBuyerId, mockPayload)).rejects.toThrow(
      new HTTPException(400, { message: 'Checkout group not found or has expired.' }),
    );
  });

  it('should throw 400 if a product in the group is no longer active', async () => {
    vi.mocked(cartRepository.getCheckoutGroup).mockResolvedValueOnce([
      {
        product: { title: 'Tomatoes', status: 'archived', availableBy: new Date(FAKE_NOW) },
        reservation: { quantityOz: '10' },
        group: { isSubscription: false },
      } as any,
    ]);

    await expect(createCheckoutSession(mockBuyerId, mockPayload)).rejects.toThrow(
      new HTTPException(400, { message: 'Product is no longer available: Tomatoes' }),
    );
  });

  it('should create a ONE-TIME payment session with delivery fees and platform fee amount', async () => {
    // Setup Group Data
    vi.mocked(cartRepository.getCheckoutGroup).mockResolvedValueOnce([
      {
        group: { id: mockGroupId, isSubscription: false, fulfillmentType: 'delivery' },
        seller: { id: 'seller_1' },
        buyer: { lat: 40, lng: -73 },
        product: {
          title: 'Apples',
          status: 'active',
          pricePerOz: '0.50',
          availableBy: new Date(FAKE_NOW),
        },
        reservation: { id: 'res_1', quantityOz: '20' }, // $10.00 total
      } as any,
    ]);

    // Setup Seller
    vi.mocked(userRepository.findById).mockResolvedValueOnce(mockSellerUser as any);

    // Mock delivery fee vars
    process.env.DELIVERY_FEE_BASE = '5.00';
    process.env.DELIVERY_FEE_PER_MILE = '0.00'; // Keep it simple for math

    await createCheckoutSession(mockBuyerId, mockPayload);

    expect(mockStripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'payment',
        line_items: expect.arrayContaining([
          expect.objectContaining({
            price_data: expect.objectContaining({ unit_amount: 50 }),
            quantity: 20,
          }),
          expect.objectContaining({
            price_data: expect.objectContaining({ unit_amount: 500 }), // $5.00 Delivery Fee
            quantity: 1,
          }),
        ]),
        payment_intent_data: {
          application_fee_amount: 30, // 2% of ($10.00 + $5.00) = 0.02 * 1500 = 30 cents
          transfer_data: { destination: 'acct_seller123' },
        },
        metadata: expect.objectContaining({
          groupId: mockGroupId,
          fulfillmentType: 'delivery',
        }),
      }),
    );
  });

  it('should create a SUBSCRIPTION session with discounted prices and platform fee percent', async () => {
    vi.mocked(cartRepository.getCheckoutGroup).mockResolvedValueOnce([
      {
        group: {
          id: mockGroupId,
          isSubscription: true,
          frequencyDays: 7,
          fulfillmentType: 'pickup',
        },
        seller: { id: 'seller_1' },
        buyer: { lat: 40, lng: -73 },
        product: {
          title: 'Kale',
          status: 'active',
          pricePerOz: '1.00',
          availableBy: new Date(FAKE_NOW),
        },
        reservation: { id: 'res_sub_1', quantityOz: '10' },
      } as any,
    ]);

    vi.mocked(userRepository.findById).mockResolvedValueOnce(mockSellerUser as any);

    await createCheckoutSession(mockBuyerId, mockPayload);

    // Calculation: $1.00 - 10% discount = $0.90 (90 cents)
    expect(mockStripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'subscription',
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: { name: 'Kale', description: 'Recurring CSA Subscription' },
              unit_amount: 90,
              recurring: { interval: 'day', interval_count: 7 },
            },
            quantity: 10,
          },
        ],
        subscription_data: {
          application_fee_percent: 2, // 0.02 * 100
          transfer_data: { destination: 'acct_seller123' },
        },
      }),
    );
  });

  it('should set scheduledTime metadata to the furthest future product date', async () => {
    const pastDate = new Date('2026-04-20T10:00:00Z');
    const futureDate1 = new Date('2026-05-01T10:00:00Z');
    const futureDate2 = new Date('2026-05-15T10:00:00Z'); // LATEST DATE

    vi.mocked(cartRepository.getCheckoutGroup).mockResolvedValueOnce([
      {
        group: { id: mockGroupId, isSubscription: false, fulfillmentType: 'pickup' },
        seller: { id: 'seller_1' },
        buyer: { lat: 40, lng: -73 },
        product: {
          title: 'Early Carrots',
          status: 'active',
          pricePerOz: '0.50',
          availableBy: pastDate, // In the past relative to FAKE_NOW
        },
        reservation: { id: 'res_1', quantityOz: '1' },
      } as any,
      {
        group: { id: mockGroupId, isSubscription: false, fulfillmentType: 'pickup' },
        seller: { id: 'seller_1' },
        buyer: { lat: 40, lng: -73 },
        product: {
          title: 'Late Peppers',
          status: 'active',
          pricePerOz: '0.50',
          availableBy: futureDate2, // The latest one
        },
        reservation: { id: 'res_2', quantityOz: '1' },
      } as any,
      {
        group: { id: mockGroupId, isSubscription: false, fulfillmentType: 'pickup' },
        seller: { id: 'seller_1' },
        buyer: { lat: 40, lng: -73 },
        product: {
          title: 'Mid Apples',
          status: 'active',
          pricePerOz: '0.50',
          availableBy: futureDate1, // Intermediate future date
        },
        reservation: { id: 'res_3', quantityOz: '1' },
      } as any,
    ]);

    vi.mocked(userRepository.findById).mockResolvedValueOnce(mockSellerUser as any);

    await createCheckoutSession(mockBuyerId, mockPayload);

    expect(mockStripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          scheduledTime: futureDate2.toISOString(),
        }),
      }),
    );
  });

  it('should set scheduledTime to "now" if all product dates are in the past', async () => {
    const pastDate = new Date('2026-04-10T10:00:00Z');

    vi.mocked(cartRepository.getCheckoutGroup).mockResolvedValueOnce([
      {
        group: { id: mockGroupId, isSubscription: false, fulfillmentType: 'pickup' },
        seller: { id: 'seller_1' },
        buyer: { lat: 40, lng: -73 },
        product: {
          title: 'Old Stock',
          status: 'active',
          pricePerOz: '0.50',
          availableBy: pastDate,
        },
        reservation: { id: 'res_1', quantityOz: '1' },
      } as any,
    ]);

    vi.mocked(userRepository.findById).mockResolvedValueOnce(mockSellerUser as any);

    await createCheckoutSession(mockBuyerId, mockPayload);

    // Should fall back to FAKE_NOW
    expect(mockStripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          scheduledTime: new Date(FAKE_NOW).toISOString(),
        }),
      }),
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
