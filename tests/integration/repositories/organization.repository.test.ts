import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import {
  truncateTables,
  getTestDb,
  closeTestDbConnection,
} from '../../test-utils/testcontainer-db.js';
import { organizationRepository } from '../../../src/repositories/organization.repository.js';
import { organizations } from '../../../src/db/schema.js';

describe('OrganizationRepository - Integration', { timeout: 120_000 }, () => {
  let testDb: any;

  beforeAll(() => {
    testDb = getTestDb();
    organizationRepository.setDb(testDb);
  });

  afterAll(async () => {
    await closeTestDbConnection();
  });

  beforeEach(async () => {
    await truncateTables(testDb);
  });

  describe('create', () => {
    it('should successfully create a new organization with PostGIS spatial location', async () => {
      const orgData = {
        name: 'Madison Food Pantry',
        type: 'pantry' as const,
        subdomain: 'madison-pantry',
        email: 'contact@madisonpantry.org',
        website: 'https://madisonpantry.org',
        phone: '+16085550199',
        address: '123 Main St',
        city: 'Madison',
        state: 'WI',
        country: 'United States',
        zip: '53703',
        lat: 43.0731,
        lng: -89.4012,
      };

      const created = await organizationRepository.create(orgData);

      expect(created).toBeDefined();
      expect(created.id).toBeDefined();
      expect(created.name).toBe(orgData.name);
      expect(created.subdomain).toBe(orgData.subdomain);
      expect(created.createdAt).toBeInstanceOf(Date);
      expect(created.updatedAt).toBeInstanceOf(Date);

      const [dbRow] = await testDb
        .select()
        .from(organizations)
        .where(eq(organizations.id, created.id));

      expect(dbRow).toBeDefined();
      expect(dbRow.location).toBeDefined();
    });
  });

  describe('findById', () => {
    it('should return null if organization does not exist', async () => {
      const result = await organizationRepository.findById('00000000-0000-0000-0000-000000000000');
      expect(result).toBeNull();
    });

    it('should retrieve the correct organization by ID', async () => {
      const [seeded] = await testDb
        .insert(organizations)
        .values({
          name: 'Downtown Harvest',
          type: 'restaurant',
          subdomain: 'downtown-harvest',
          city: 'Madison',
          state: 'WI',
          country: 'USA',
        })
        .returning();

      const found = await organizationRepository.findById(seeded.id);

      expect(found).not.toBeNull();
      expect(found?.id).toBe(seeded.id);
      expect(found?.name).toBe('Downtown Harvest');
    });
  });

  describe('findBySubdomain', () => {
    it('should return null if subdomain does not match any organization', async () => {
      const result = await organizationRepository.findBySubdomain('non-existent');
      expect(result).toBeNull();
    });

    it('should retrieve the correct organization by its unique subdomain', async () => {
      await testDb.insert(organizations).values({
        name: 'Unique Bistro',
        type: 'restaurant',
        subdomain: 'unique-bistro',
        city: 'Madison',
        state: 'WI',
        country: 'USA',
      });

      const found = await organizationRepository.findBySubdomain('unique-bistro');

      expect(found).not.toBeNull();
      expect(found?.name).toBe('Unique Bistro');
    });
  });

  describe('updateById', () => {
    it('should return null if trying to update a non-existent organization', async () => {
      const result = await organizationRepository.updateById(
        '00000000-0000-0000-0000-000000000000',
        {
          name: 'Ghost Org',
        },
      );
      expect(result).toBeNull();
    });

    it('should update textual fields without affecting geolocation if coordinates are omitted', async () => {
      const [seeded] = await testDb
        .insert(organizations)
        .values({
          name: 'Original Name',
          type: 'pantry',
          subdomain: 'orig-sub',
          city: 'Madison',
          state: 'WI',
          country: 'USA',
          lat: 43.0,
          lng: -89.4,
          location: sql`ST_SetSRID(ST_MakePoint(-89.4, 43.0), 4326)`,
        })
        .returning();

      const updated = await organizationRepository.updateById(seeded.id, {
        name: 'Brand New Name',
        phone: '+16085551111',
      });

      expect(updated).not.toBeNull();
      expect(updated?.name).toBe('Brand New Name');
      expect(updated?.phone).toBe('+16085551111');
      expect(updated?.subdomain).toBe('orig-sub'); // Unchanged
    });

    it('should dynamically update the spatial location feature when lat/lng are supplied', async () => {
      const [seeded] = await testDb
        .insert(organizations)
        .values({
          name: 'Moving Vendor',
          type: 'restaurant',
          subdomain: 'moving-vendor',
          lat: 43.0,
          lng: -89.4,
          location: sql`ST_SetSRID(ST_MakePoint(-89.4, 43.0), 4326)`,
        })
        .returning();

      const updated = await organizationRepository.updateById(seeded.id, {
        lat: 44.0,
        lng: -90.0,
      });

      expect(updated).not.toBeNull();

      const [dbRow] = await testDb
        .select()
        .from(organizations)
        .where(eq(organizations.id, seeded.id));

      expect(dbRow.lat).toBe(44.0);
      expect(dbRow.lng).toBe(-90.0);
      expect(dbRow.location).toBeDefined();
    });
  });

  describe('deleteById', () => {
    it('should return false if organization to delete does not exist', async () => {
      const result = await organizationRepository.deleteById(
        '00000000-0000-0000-0000-000000000000',
      );
      expect(result).toBe(false);
    });

    it('should return true and remove the entry when successfully deleted', async () => {
      const [seeded] = await testDb
        .insert(organizations)
        .values({
          name: 'To Be Deleted',
          type: 'pantry',
          subdomain: 'delete-me',
        })
        .returning();

      const deleteResult = await organizationRepository.deleteById(seeded.id);
      expect(deleteResult).toBe(true);

      const [dbRow] = await testDb
        .select()
        .from(organizations)
        .where(eq(organizations.id, seeded.id));

      expect(dbRow).toBeUndefined();
    });
  });
});
