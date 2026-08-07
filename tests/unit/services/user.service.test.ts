import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HTTPException } from 'hono/http-exception';
import { del } from '@vercel/blob';

import {
  getCurrentUser,
  getPublicUserProfile,
  updateCurrentUser,
  updateInternalStripeAccountId,
  updateScheduleRules,
  deleteAccount,
  removeOrganizationFromUsers,
  assignOrganizationToUser,
  leaveOrganization,
} from '../../../src/services/user.service.js';
import { userRepository } from '../../../src/repositories/user.repository.js';
import { scheduleRuleRepository } from '../../../src/repositories/schedule-rule.repository.js';
import { orderRepository } from '../../../src/repositories/order.repository.js';
import { reviewRepository } from '../../../src/repositories/review.repository.js';
import { accountRepository } from '../../../src/repositories/account.repository.js';
import { fcmRepository } from '../../../src/repositories/fcm.repository.js';
import { organizationRepository } from '../../../src/repositories/organization.repository.js';
import { produceRepository } from '../../../src/repositories/produce.repository.js';
import { sessionRepository } from '../../../src/repositories/session.repository.js';
import {
  batchCancelPendingOrders,
  batchCancelAllPendingOrdersPlacedByUser,
} from '../../../src/services/order.service.js';
import { batchCancelProductSubscriptions } from '../../../src/services/subscription.service.js';

vi.mock('@vercel/blob', () => ({
  del: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../src/repositories/user.repository.js', () => ({
  userRepository: {
    findById: vi.fn(),
    updateById: vi.fn(),
    updateStripeAccountId: vi.fn(),
    anonymize: vi.fn(),
    updateOrgAndRole: vi.fn(),
    clearOrganizationFromUsers: vi.fn(),
    removeFromOrganization: vi.fn(),
    findByOrganizationId: vi.fn(),
  },
}));

vi.mock('../../../src/repositories/schedule-rule.repository.js', () => ({
  scheduleRuleRepository: {
    replaceSellerRules: vi.fn(),
    deleteBySellerId: vi.fn(),
  },
}));

vi.mock('../../../src/repositories/review.repository.js', () => ({
  reviewRepository: {
    getReviewStatsBySellerId: vi.fn(),
  },
}));

vi.mock('../../../src/repositories/order.repository.js', () => ({
  orderRepository: {
    getActiveBuyerCount: vi.fn(),
  },
}));

vi.mock('../../../src/repositories/produce.repository.js', () => ({
  produceRepository: {
    findAllBySellerId: vi.fn(),
    markAllAsDeletedBySellerId: vi.fn(),
  },
}));

vi.mock('../../../src/repositories/account.repository.js', () => ({
  accountRepository: { deleteByUserId: vi.fn() },
}));

vi.mock('../../../src/repositories/session.repository.js', () => ({
  sessionRepository: { deleteByUserId: vi.fn() },
}));

vi.mock('../../../src/repositories/fcm.repository.js', () => ({
  fcmRepository: { deleteByUserId: vi.fn() },
}));

vi.mock('../../../src/repositories/organization.repository.js', () => ({
  organizationRepository: { deleteById: vi.fn() },
}));

vi.mock('../../../src/services/order.service.js', () => ({
  batchCancelPendingOrders: vi.fn(),
  batchCancelAllPendingOrdersPlacedByUser: vi.fn(),
}));

vi.mock('../../../src/services/subscription.service.js', () => ({
  batchCancelProductSubscriptions: vi.fn(),
}));

describe('getCurrentUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should throw a 404 HTTPException if the user is not found', async () => {
    vi.mocked(userRepository.findById).mockResolvedValueOnce(null);

    await expect(getCurrentUser('missing_user_id')).rejects.toThrow(HTTPException);
    await expect(getCurrentUser('missing_user_id')).rejects.toMatchObject({ status: 404 });

    expect(userRepository.findById).toHaveBeenCalledWith('missing_user_id');
  });

  it('should return a user object if the user is found', async () => {
    const mockDbUser = {
      id: 'user_123',
      name: 'Alice',
      organization: 'Alice Farms',
      email: 'alice@example.com',
      address: '456 Seller Ave',
      stripeAccountId: 'acct_999',
      stripeOnboardingComplete: false,
    };

    vi.mocked(userRepository.findById).mockResolvedValueOnce(mockDbUser as any);

    const result = await getCurrentUser('user_123');

    expect(result).toEqual({
      id: 'user_123',
      name: 'Alice',
      organization: 'Alice Farms',
      email: 'alice@example.com',
      address: '456 Seller Ave',
      stripeAccountId: 'acct_999',
      stripeOnboardingComplete: false,
      isOnboardingComplete: false,
    });

    expect(userRepository.findById).toHaveBeenCalledWith('user_123');
  });
});

describe('updateCurrentUser', () => {
  beforeEach(() => {
    vi.resetAllMocks();

    vi.mocked(del).mockReturnValue(Promise.resolve());
  });

  it('should throw a 404 HTTPException if the user is not found during update', async () => {
    vi.mocked(userRepository.updateById).mockResolvedValueOnce(null);

    const updateData = { name: 'New Name' };

    await expect(updateCurrentUser('missing_user_id', updateData)).rejects.toThrow(HTTPException);
    await expect(updateCurrentUser('missing_user_id', updateData)).rejects.toMatchObject({
      status: 404,
    });

    expect(userRepository.findById).toHaveBeenCalledWith('missing_user_id');
    expect(userRepository.updateById).not.toHaveBeenCalled();
  });

  it('should update the user and return a user object', async () => {
    const updateData = {
      name: 'Updated Alice',
      organization: 'Updated Alice Farms',
      address: '789 New St',
      deliveryRangeMiles: 20,
    };

    const mockDbUser = {
      id: 'user_123',
      name: 'Alice',
      organization: 'Alice Farms',
      email: 'alice@example.com',
      address: '788 Old St',
      deliveryRangeMiles: '5',
    };

    const mockDbUpdatedUser = {
      id: 'user_123',
      name: 'Updated Alice',
      organization: 'Updated Alice Farms',
      email: 'alice@example.com',
      address: '789 New St',
      deliveryRangeMiles: '20',
    };

    vi.mocked(userRepository.findById).mockResolvedValueOnce(mockDbUser as any);
    vi.mocked(userRepository.updateById).mockResolvedValueOnce(mockDbUpdatedUser as any);

    const result = await updateCurrentUser('user_123', updateData);

    expect(result).toEqual({
      id: 'user_123',
      name: 'Updated Alice',
      organization: 'Updated Alice Farms',
      email: 'alice@example.com',
      address: '789 New St',
      deliveryRangeMiles: '20',
    });

    expect(userRepository.updateById).toHaveBeenCalledWith('user_123', updateData);
  });

  it('should update the user and NOT call del if no image is changed', async () => {
    const mockUser = { id: 'user_123', name: 'Alice', image: 'old-url.jpg' };
    vi.mocked(userRepository.findById).mockResolvedValueOnce(mockUser as any);
    vi.mocked(userRepository.updateById).mockResolvedValueOnce({ ...mockUser, name: 'Bob' } as any);

    await updateCurrentUser('user_123', { name: 'Bob' });

    expect(del).not.toHaveBeenCalled();
  });

  it('should delete the old image when a new image URL is provided', async () => {
    const userId = 'user_123';
    const oldImageUrl = 'https://blob.vercel.com/old-image.png';
    const newImageUrl = 'https://blob.vercel.com/new-image.png';

    const existingUser = {
      id: userId,
      name: 'Alice',
      image: oldImageUrl,
    };

    const updateData = {
      image: newImageUrl,
    };

    const updatedUser = {
      ...existingUser,
      image: newImageUrl,
    };

    vi.mocked(userRepository.findById).mockResolvedValueOnce(existingUser as any);
    vi.mocked(userRepository.updateById).mockResolvedValueOnce(updatedUser as any);

    const result = await updateCurrentUser(userId, updateData);

    expect(result?.image).toBe(newImageUrl);
    expect(userRepository.updateById).toHaveBeenCalledWith(userId, updateData);

    expect(del).toHaveBeenCalledWith(oldImageUrl);
  });

  it('should not call del if the user had no previous image', async () => {
    const userId = 'user_123';
    const newImageUrl = 'https://blob.vercel.com/first-image.png';

    vi.mocked(userRepository.findById).mockResolvedValueOnce({
      id: userId,
      image: null,
    } as any);
    vi.mocked(userRepository.updateById).mockResolvedValueOnce({
      id: userId,
      image: newImageUrl,
    } as any);

    await updateCurrentUser(userId, { image: newImageUrl });

    expect(del).not.toHaveBeenCalled();
  });
});

describe('updateInternalStripeAccountId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should throw a 404 HTTPException if the user is not found during update', async () => {
    vi.mocked(userRepository.updateStripeAccountId).mockResolvedValueOnce(null);

    await expect(updateInternalStripeAccountId('missing_user_id', 'acct_123')).rejects.toThrow(
      HTTPException,
    );
    await expect(
      updateInternalStripeAccountId('missing_user_id', 'acct_123'),
    ).rejects.toMatchObject({
      status: 404,
    });

    expect(userRepository.updateStripeAccountId).toHaveBeenCalledWith(
      'missing_user_id',
      'acct_123',
    );
  });

  it('should update the user internal stripe account ID and return the user', async () => {
    const mockDbUpdatedUser = {
      id: 'user_123',
      stripeAccountId: 'acct_123',
    };

    vi.mocked(userRepository.updateStripeAccountId).mockResolvedValueOnce(mockDbUpdatedUser as any);

    const result = await updateInternalStripeAccountId('user_123', 'acct_123');

    expect(result).toEqual(mockDbUpdatedUser);
    expect(userRepository.updateStripeAccountId).toHaveBeenCalledWith('user_123', 'acct_123');
  });
});

describe('updateScheduleRules', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should throw a 404 HTTPException if the user is not found', async () => {
    vi.mocked(userRepository.findById).mockResolvedValueOnce(null);

    const payload = {
      pickupWindows: [{ day: 'Monday', start: '09:00', end: '17:00' }],
      deliveryWindows: [], // Added to satisfy new schema
    };

    await expect(updateScheduleRules('missing_user_id', payload)).rejects.toThrow(HTTPException);
    await expect(updateScheduleRules('missing_user_id', payload)).rejects.toMatchObject({
      status: 404,
    });

    expect(userRepository.findById).toHaveBeenCalledWith('missing_user_id');
    expect(scheduleRuleRepository.replaceSellerRules).not.toHaveBeenCalled();
  });

  it('should map payload correctly and call repository replace method', async () => {
    const mockDbUser = { id: 'seller_123', email: 'seller@example.com' };
    vi.mocked(userRepository.findById).mockResolvedValueOnce(mockDbUser as any);
    vi.mocked(scheduleRuleRepository.replaceSellerRules).mockResolvedValueOnce();

    const payload = {
      pickupWindows: [{ day: 'Monday', start: '09:00', end: '12:00' }],
      deliveryWindows: [{ day: 'Wednesday', start: '13:00', end: '17:00' }],
    };

    await updateScheduleRules('seller_123', payload);

    expect(userRepository.findById).toHaveBeenCalledWith('seller_123');
    expect(scheduleRuleRepository.replaceSellerRules).toHaveBeenCalledWith('seller_123', [
      { dayOfWeek: 'Monday', startTime: '09:00', endTime: '12:00', type: 'pickup' },
      { dayOfWeek: 'Wednesday', startTime: '13:00', endTime: '17:00', type: 'delivery' },
    ]);
  });
});

describe('getPublicUserProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should throw a 404 HTTPException if the user is not found', async () => {
    vi.mocked(userRepository.findById).mockResolvedValueOnce(null);

    await expect(getPublicUserProfile('missing_user_id')).rejects.toThrow(HTTPException);
    expect(userRepository.findById).toHaveBeenCalledWith('missing_user_id');
  });

  it('should return default zeroed stats if user has no reviews or buyers', async () => {
    vi.mocked(userRepository.findById).mockResolvedValueOnce({
      id: 'user_123',
      name: 'Alice',
    } as any);
    vi.mocked(reviewRepository.getReviewStatsBySellerId).mockResolvedValueOnce([]);
    vi.mocked(orderRepository.getActiveBuyerCount).mockResolvedValueOnce(0);

    const result = await getPublicUserProfile('user_123');

    expect(result).toMatchObject({
      id: 'user_123',
      name: 'Alice',
      starRating: 0,
      totalReviews: 0,
      reviewBreakdown: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 },
      activeBuyerCount: 0,
    });
  });

  it('should correctly calculate star rating, total reviews, and map breakdown', async () => {
    vi.mocked(userRepository.findById).mockResolvedValueOnce({
      id: 'user_123',
      name: 'Alice',
      city: 'Seattle',
    } as any);

    // 10 total reviews: (5 * 4 stars = 20) + (3 * 5 stars = 15) + (2 * 1 star = 2) = 37 total stars
    // Average: 37 / 10 = 3.7
    vi.mocked(reviewRepository.getReviewStatsBySellerId).mockResolvedValueOnce([
      { rating: 4, count: 5 },
      { rating: 5, count: 3 },
      { rating: 1, count: 2 },
    ]);
    vi.mocked(orderRepository.getActiveBuyerCount).mockResolvedValueOnce(12);

    const result = await getPublicUserProfile('user_123');

    expect(result).toMatchObject({
      id: 'user_123',
      name: 'Alice',
      city: 'Seattle',
      starRating: 3.7,
      totalReviews: 10,
      reviewBreakdown: { '1': 2, '2': 0, '3': 0, '4': 5, '5': 3 },
      activeBuyerCount: 12,
    });
  });
});

describe('deleteAccount', () => {
  const mockUserId = 'user_del_777';

  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should throw 404 HTTPException if user profile does not exist', async () => {
    vi.mocked(userRepository.findById).mockResolvedValueOnce(null);

    await expect(deleteAccount(mockUserId, mockLogger)).rejects.toThrow(HTTPException);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Attempted to delete non-existent user'),
    );
    expect(userRepository.anonymize).not.toHaveBeenCalled();
  });

  it('should anonymize profile, delete blob images, drop inventory items, and purge active system sessions', async () => {
    vi.mocked(userRepository.findById).mockResolvedValueOnce({
      id: mockUserId,
      image: 'https://blob.vercel-storage.com/avatars/user-777.png',
    } as any);

    const mockProducts = [{ id: 'prod_1' }, { id: 'prod_2' }];
    vi.mocked(produceRepository.findAllBySellerId).mockResolvedValueOnce(mockProducts as any);

    await deleteAccount(mockUserId, mockLogger);

    expect(del).toHaveBeenCalledWith('https://blob.vercel-storage.com/avatars/user-777.png');

    expect(userRepository.anonymize).toHaveBeenCalledWith(mockUserId);
    expect(produceRepository.markAllAsDeletedBySellerId).toHaveBeenCalledWith(mockUserId);

    expect(batchCancelProductSubscriptions).toHaveBeenCalledTimes(2);
    expect(batchCancelPendingOrders).toHaveBeenCalledTimes(2);
    expect(batchCancelPendingOrders).toHaveBeenNthCalledWith(
      1,
      'prod_1',
      'The seller closed their account.',
      mockUserId,
      mockLogger,
    );

    expect(batchCancelAllPendingOrdersPlacedByUser).toHaveBeenCalledWith(
      mockUserId,
      'User deleted their account',
      mockLogger,
    );

    expect(scheduleRuleRepository.deleteBySellerId).toHaveBeenCalledWith(mockUserId);
    expect(accountRepository.deleteByUserId).toHaveBeenCalledWith(mockUserId);
    expect(sessionRepository.deleteByUserId).toHaveBeenCalledWith(mockUserId);
    expect(fcmRepository.deleteByUserId).toHaveBeenCalledWith(mockUserId);

    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('successfully anonymized'),
    );
  });

  it('should gracefully continue the cleanup lifecycle even if blob deletion rejects', async () => {
    vi.mocked(userRepository.findById).mockResolvedValueOnce({
      id: mockUserId,
      image: 'https://blob.vercel-storage.com/broken-url.jpg',
    } as any);

    vi.mocked(produceRepository.findAllBySellerId).mockResolvedValueOnce([]);

    vi.mocked(del).mockRejectedValueOnce(new Error('Vercel API Timeout Error'));

    await expect(deleteAccount(mockUserId, mockLogger)).resolves.toBeUndefined();

    expect(userRepository.anonymize).toHaveBeenCalledWith(mockUserId);

    await vi.waitFor(() => {
      expect(mockLogger.error).toHaveBeenCalledWith(
        {
          error: 'Vercel API Timeout Error',
          blobUrl: 'https://blob.vercel-storage.com/broken-url.jpg',
        },
        'Failed to delete orphaned blob image during account deletion',
      );
    });
  });
});

describe('assignOrganizationToUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should successfully update and return the user when the user exists', async () => {
    const USER_ID = 'user_abc';
    const ORG_ID = 'org_123';
    const ROLE = 'admin';
    const mockUpdatedUser = { id: USER_ID, organizationId: ORG_ID, orgRole: ROLE };

    vi.mocked(userRepository.updateOrgAndRole).mockResolvedValueOnce(mockUpdatedUser as any);

    const mockLogger = { info: vi.fn(), warn: vi.fn() } as any;

    const result = await assignOrganizationToUser(USER_ID, ORG_ID, ROLE, mockLogger);

    expect(result).toEqual(mockUpdatedUser);
    expect(userRepository.updateOrgAndRole).toHaveBeenCalledWith(USER_ID, ORG_ID, ROLE);
    expect(mockLogger.info).toHaveBeenCalledWith(
      { userId: USER_ID, organizationId: ORG_ID, role: ROLE },
      expect.any(String),
    );
  });

  it('should log a warning and throw a 404 HTTPException if the repository returns null', async () => {
    const USER_ID = 'ghost_user';
    const ORG_ID = 'org_123';
    const ROLE = 'member';

    vi.mocked(userRepository.updateOrgAndRole).mockResolvedValueOnce(null);

    const mockLogger = { info: vi.fn(), warn: vi.fn() } as any;

    await expect(assignOrganizationToUser(USER_ID, ORG_ID, ROLE, mockLogger)).rejects.toThrow(
      HTTPException,
    );

    await expect(assignOrganizationToUser(USER_ID, ORG_ID, ROLE, mockLogger)).rejects.toMatchObject(
      { status: 404, message: 'User not found' },
    );

    expect(userRepository.updateOrgAndRole).toHaveBeenCalledWith(USER_ID, ORG_ID, ROLE);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      { userId: USER_ID, organizationId: ORG_ID },
      expect.any(String),
    );
  });

  it('should run fine with the default noop logger when no logger is passed', async () => {
    const USER_ID = 'user_abc';
    const ORG_ID = 'org_123';
    const mockUpdatedUser = { id: USER_ID, organizationId: ORG_ID, orgRole: 'member' };

    vi.mocked(userRepository.updateOrgAndRole).mockResolvedValueOnce(mockUpdatedUser as any);

    await expect(assignOrganizationToUser(USER_ID, ORG_ID, 'member')).resolves.toBeDefined();
  });
});

describe('removeOrganizationFromUsers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should invoke clearOrganizationFromUsers and log the action', async () => {
    const ORG_ID = 'org_to_wipe';
    vi.mocked(userRepository.clearOrganizationFromUsers).mockResolvedValueOnce();

    const mockLogger = { info: vi.fn() } as any;

    await removeOrganizationFromUsers(ORG_ID, mockLogger);

    expect(userRepository.clearOrganizationFromUsers).toHaveBeenCalledWith(ORG_ID);
    expect(mockLogger.info).toHaveBeenCalledWith({ organizationId: ORG_ID }, expect.any(String));
  });

  it('should run fine with the default noop logger when no logger is passed', async () => {
    const ORG_ID = 'org_to_wipe';
    vi.mocked(userRepository.clearOrganizationFromUsers).mockResolvedValueOnce();

    await expect(removeOrganizationFromUsers(ORG_ID)).resolves.not.toThrow();
  });
});

describe('leaveOrganization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should throw 404 if user does not exist', async () => {
    vi.mocked(userRepository.findById).mockResolvedValueOnce(null);

    await expect(leaveOrganization('ghost_user')).rejects.toMatchObject({
      status: 404,
      message: 'User not found',
    });
  });

  it('should throw 400 if user is not in an organization', async () => {
    vi.mocked(userRepository.findById).mockResolvedValueOnce({
      id: 'user_1',
      organizationId: null,
    } as any);

    await expect(leaveOrganization('user_1')).rejects.toMatchObject({
      status: 400,
      message: 'User is not part of an organization',
    });
  });

  it('should delete organization if user is the last member', async () => {
    const USER_ID = 'user_sole';
    const ORG_ID = crypto.randomUUID();

    vi.mocked(userRepository.findById).mockResolvedValueOnce({
      id: USER_ID,
      organizationId: ORG_ID,
      orgRole: 'admin',
    } as any);

    vi.mocked(userRepository.findByOrganizationId).mockResolvedValueOnce([
      { id: USER_ID, organizationId: ORG_ID, orgRole: 'admin' },
    ] as any);

    vi.mocked(userRepository.removeFromOrganization).mockResolvedValueOnce({
      id: USER_ID,
      organizationId: null,
      orgRole: null,
    } as any);

    await leaveOrganization(USER_ID);

    expect(userRepository.removeFromOrganization).toHaveBeenCalledWith(USER_ID);
    expect(organizationRepository.deleteById).toHaveBeenCalledWith(ORG_ID);
  });

  it('should promote another member to admin if leaving user is the sole admin', async () => {
    const LEAVING_USER_ID = 'user_admin';
    const MEMBER_USER_ID = 'user_member';
    const ORG_ID = crypto.randomUUID();

    vi.mocked(userRepository.findById).mockResolvedValueOnce({
      id: LEAVING_USER_ID,
      organizationId: ORG_ID,
      orgRole: 'admin',
    } as any);

    vi.mocked(userRepository.findByOrganizationId).mockResolvedValueOnce([
      { id: LEAVING_USER_ID, organizationId: ORG_ID, orgRole: 'admin' },
      { id: MEMBER_USER_ID, organizationId: ORG_ID, orgRole: 'member' },
    ] as any);

    vi.mocked(userRepository.removeFromOrganization).mockResolvedValueOnce({
      id: LEAVING_USER_ID,
      organizationId: null,
      orgRole: null,
    } as any);

    await leaveOrganization(LEAVING_USER_ID);

    expect(userRepository.updateOrgAndRole).toHaveBeenCalledWith(MEMBER_USER_ID, ORG_ID, 'admin');
    expect(userRepository.removeFromOrganization).toHaveBeenCalledWith(LEAVING_USER_ID);
  });
});
