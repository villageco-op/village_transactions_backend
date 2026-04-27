import type { OpenAPIHono } from '@hono/zod-openapi';

import * as Availability from '../schemas/availability.schema.js';
import * as Buyer from '../schemas/buyer.schema.js';
import * as Cart from '../schemas/cart.schema.js';
import * as Checkout from '../schemas/checkout.schema.js';
import * as Common from '../schemas/common.schema.js';
import * as Contact from '../schemas/contact.schema.js';
import * as Growers from '../schemas/grower.schema.js';
import * as Messaging from '../schemas/messaging.schema.js';
import * as Orders from '../schemas/order.schema.js';
import * as Produce from '../schemas/produce.schema.js';
import * as Reviews from '../schemas/review.schema.js';
import * as Seller from '../schemas/seller.schema.js';
import * as SourceMap from '../schemas/source-map.schema.js';
import * as Stripe from '../schemas/stripe.schema.js';
import * as Subscriptions from '../schemas/subscription.schema.js';
import * as Users from '../schemas/user.schema.js';

/**
 * Registers shared Zod schemas as OpenAPI Components ($ref).
 * This prevents Orval from generating duplicate inline types.
 * @param app - Open Api Hono instance
 */
export function registerSharedSchemas(app: OpenAPIHono) {
  // Responses & Params
  app.openAPIRegistry.register('ErrorResponse', Common.ErrorResponseSchema);
  app.openAPIRegistry.register('SuccessResponse', Common.SuccessResponseSchema);
  app.openAPIRegistry.register('SuccessWithEntity', Common.SuccessWithEntitySchema);
  app.openAPIRegistry.register('EntityParam', Common.EntityParamSchema);
  app.openAPIRegistry.register('UserParam', Common.UserParamSchema);

  // Enums
  app.openAPIRegistry.register('ProduceStatus', Common.ProduceStatusSchema);
  app.openAPIRegistry.register('OrderStatus', Common.OrderStatusSchema);
  app.openAPIRegistry.register('FulfillmentType', Common.FulfillmentTypeSchema);
  app.openAPIRegistry.register('SubscriptionStatus', Common.SubscriptionStatusSchema);
  app.openAPIRegistry.register('ProduceType', Common.ProduceTypeSchema);

  // Scalars & Specific Fields
  app.openAPIRegistry.register('UserId', Common.UserIdSchema);
  app.openAPIRegistry.register('ResourceId', Common.ResourceIdSchema);
  app.openAPIRegistry.register('EntityId', Common.EntityIdField);
  app.openAPIRegistry.register('Latitude', Common.LatitudeSchema);
  app.openAPIRegistry.register('Longitude', Common.LongitudeSchema);
  app.openAPIRegistry.register('WeightOz', Common.WeightOzSchema);
  app.openAPIRegistry.register('PriceDollars', Common.PriceDollarsSchema);
  app.openAPIRegistry.register('ImageUrl', Common.ImageUrlSchema);
  app.openAPIRegistry.register('Location', Common.LocationSchema);
  app.openAPIRegistry.register('IsoDateTime', Common.IsoDateTimeSchema);
  app.openAPIRegistry.register('IsoDate', Common.IsoDateSchema);
  app.openAPIRegistry.register('PaginationMetadata', Common.PaginationMetadataSchema);

  app.openAPIRegistry.register('UserBasicInfo', Common.UserBasicInfoSchema);

  // Produce Request Payloads
  app.openAPIRegistry.register('CreateProducePayload', Produce.CreateProduceSchema);
  app.openAPIRegistry.register('UpdateProducePayload', Produce.UpdateProduceSchema);

  // Produce Responses
  app.openAPIRegistry.register('ProduceListResponse', Produce.ProduceListResponseSchema);
  app.openAPIRegistry.register('ProduceOrderListResponse', Produce.ProduceOrderListResponseSchema);
  app.openAPIRegistry.register('SellerMapGroupList', Produce.SellerMapGroupListSchema);
  app.openAPIRegistry.register('ProduceAnalytics', Produce.ProduceAnalyticsSchema);
  app.openAPIRegistry.register('SellerProduceListing', Produce.SellerProduceListingSchema);
  app.openAPIRegistry.register(
    'SellerProduceListResponse',
    Produce.SellerProduceListResponseSchema,
  );
  app.openAPIRegistry.register('ProduceDetails', Produce.ProduceDetailSchema);

  // Produce Nested Entities
  app.openAPIRegistry.register('ProduceOrderBuyer', Produce.ProduceOrderBuyerSchema);
  app.openAPIRegistry.register('ProduceListItem', Produce.ProduceListItemSchema);
  app.openAPIRegistry.register('ProduceMapItem', Produce.ProduceMapItemSchema);
  app.openAPIRegistry.register('SellerMapGroup', Produce.SellerMapGroupSchema);

  // Produce Database Models
  app.openAPIRegistry.register('Produce', Produce.ProduceSchema);

  // Order Entities
  app.openAPIRegistry.register('Order', Orders.OrderSchema);
  app.openAPIRegistry.register('OrderDetailResponse', Orders.OrderDetailResponseSchema);
  app.openAPIRegistry.register('OrderItemDetail', Orders.OrderItemDetailSchema);
  app.openAPIRegistry.register('OrdersListResponse', Orders.OrdersListResponseSchema);

  // Order Payloads & Params
  app.openAPIRegistry.register('GetOrderParams', Orders.GetOrderParamsSchema);
  app.openAPIRegistry.register('CancelOrderPayload', Orders.CancelOrderBodySchema);
  app.openAPIRegistry.register('RescheduleOrderPayload', Orders.RescheduleOrderBodySchema);

  // Order Queries
  app.openAPIRegistry.register('GetOrdersQuery', Orders.GetOrdersQuerySchema);

  // User Entities
  app.openAPIRegistry.register('User', Users.UserProfileSchema);
  app.openAPIRegistry.register('PublicUserProfile', Users.PublicUserProfileSchema);
  app.openAPIRegistry.register(
    'ReviewBreakdown',
    Users.PublicUserProfileSchema.shape.reviewBreakdown,
  );
  app.openAPIRegistry.register('AvailabilityWindow', Users.WindowSchema);

  // User Payloads
  app.openAPIRegistry.register('UpdateUserPayload', Users.UpdateUserSchema);
  app.openAPIRegistry.register('UpdateScheduleRulesPayload', Users.UpdateScheduleRulesSchema);
  app.openAPIRegistry.register('RegisterFcmTokenPayload', Users.RegisterFcmTokenSchema);

  // Subscriptions
  app.openAPIRegistry.register('UpdateSubscriptionPayload', Subscriptions.UpdateSubscriptionSchema);
  app.openAPIRegistry.register(
    'SubscriptionDetailResponse',
    Subscriptions.SubscriptionDetailResponseSchema,
  );
  app.openAPIRegistry.register('GetSubscriptionsQuery', Subscriptions.GetSubscriptionsQuerySchema);
  app.openAPIRegistry.register(
    'SubscriptionsListResponse',
    Subscriptions.SubscriptionsListResponseSchema,
  );
  app.openAPIRegistry.register(
    'SubscriptionsPaginationMetadata',
    Subscriptions.SubscriptionsPaginationMetadataSchema,
  );

  // Stripe
  app.openAPIRegistry.register('StripeOnboardingResponse', Stripe.StripeOnboardingResponseSchema);

  // Contact
  app.openAPIRegistry.register('ContactPayload', Contact.ContactRequestSchema);

  // Cart
  app.openAPIRegistry.register('AddToCartPayload', Cart.AddToCartSchema);
  app.openAPIRegistry.register('CartItem', Cart.CartItemSchema);
  app.openAPIRegistry.register('CartSeller', Cart.CartCheckoutGroupSchema.shape.seller);
  app.openAPIRegistry.register('CartCheckoutGroup', Cart.CartCheckoutGroupSchema);
  app.openAPIRegistry.register('GetCartResponse', Cart.GetCartResponseSchema);
  app.openAPIRegistry.register('UpdateCartPayload', Cart.UpdateCartSchema);

  // Checkout
  app.openAPIRegistry.register(
    'CreateCheckoutSessionPayload',
    Checkout.CreateCheckoutSessionSchema,
  );
  app.openAPIRegistry.register('CheckoutSessionResponse', Checkout.CheckoutSessionResponseSchema);
  app.openAPIRegistry.register('InitiateSnapCheckoutPayload', Checkout.InitiateSnapCheckoutSchema);

  // Availability
  app.openAPIRegistry.register('AvailabilityResponse', Availability.AvailabilityResponseSchema);

  // Reviews
  app.openAPIRegistry.register('CreateReviewPayload', Reviews.CreateReviewSchema);
  app.openAPIRegistry.register('ReviewBuyer', Reviews.ReviewBuyerSchema);
  app.openAPIRegistry.register('SellerReviewItem', Reviews.SellerReviewItemSchema);
  app.openAPIRegistry.register('PaginatedReviewsResponse', Reviews.PaginatedReviewsResponseSchema);

  // Messaging
  app.openAPIRegistry.register('Conversation', Messaging.ConversationSchema);
  app.openAPIRegistry.register('Message', Messaging.MessageSchema);
  app.openAPIRegistry.register('SendMessagePayload', Messaging.SendMessageBodySchema);
  app.openAPIRegistry.register('ConversationsResponse', Messaging.ConversationsResponseSchema);
  app.openAPIRegistry.register('MessagesResponse', Messaging.MessagesResponseSchema);

  // Buyer Dashboard
  app.openAPIRegistry.register('Grower', Buyer.GrowerSchema);
  app.openAPIRegistry.register('GrowersResponse', Buyer.GrowersResponseSchema);
  app.openAPIRegistry.register('BillingSummaryResponse', Buyer.BillingSummaryResponseSchema);
  app.openAPIRegistry.register('ActiveSubscription', Buyer.ActiveSubscriptionSchema);
  app.openAPIRegistry.register('BuyerDashboardResponse', Buyer.BuyerDashboardResponseSchema);

  // Seller Dashboard
  app.openAPIRegistry.register('Payout', Seller.PayoutSchema);
  app.openAPIRegistry.register('PayoutHistoryResponse', Seller.PayoutHistoryResponseSchema);
  app.openAPIRegistry.register('ProduceSales', Seller.ProduceSalesSchema);
  app.openAPIRegistry.register('SellerEarningsResponse', Seller.SellerEarningsResponseSchema);
  app.openAPIRegistry.register('EarningsByProduce', Seller.EarningsByProduceSchema);
  app.openAPIRegistry.register('SellerDashboardResponse', Seller.SellerDashboardResponseSchema);

  // Growers Map
  app.openAPIRegistry.register('MapGrowersQuery', Growers.MapGrowersQuerySchema);
  app.openAPIRegistry.register('MapGrower', Growers.MapGrowerSchema);
  app.openAPIRegistry.register('MapGrowersResponse', Growers.MapGrowersResponseSchema);

  // Source Map
  app.openAPIRegistry.register('SourceMapQuery', SourceMap.SourceMapQuerySchema);
  app.openAPIRegistry.register('SourceMapNode', SourceMap.SourceMapNodeSchema);
  app.openAPIRegistry.register('SourceMapNodesResponse', SourceMap.SourceMapNodesResponseSchema);
  app.openAPIRegistry.register(
    'SourceMapAnalyticsResponse',
    SourceMap.SourceMapAnalyticsResponseSchema,
  );
}
