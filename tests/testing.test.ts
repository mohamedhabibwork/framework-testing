import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { createConnection } from '@framework/database';
import { createTestDatabase, requireTestDatabaseUrl } from '../src';

const adminUrl = requireTestDatabaseUrl();

describe('requireTestDatabaseUrl', () => {
  test('fails with setup instructions when TEST_DATABASE_URL is unset', () => {
    try {
      requireTestDatabaseUrl({});
      throw new Error('expected a throw');
    } catch (error) {
      expect((error as Error).message).toContain('TEST_DATABASE_URL is not set');
      expect((error as Error).message).toContain('bun run db:up');
    }
  });

  test('returns the URL when set', () => {
    expect(requireTestDatabaseUrl({ TEST_DATABASE_URL: 'postgres://x' })).toBe('postgres://x');
  });
});

describe('createTestDatabase', () => {
  test('creates an isolated database and drops it idempotently', async () => {
    const database = await createTestDatabase({ adminUrl });
    expect(database.name.startsWith('fw_test_')).toBe(true);
    expect(new URL(database.url).pathname).toBe(`/${database.name}`);
    const connection = createConnection({ url: database.url, maxConnections: 1 });
    const rows = await connection.sql`select 1 as one`;
    expect(rows[0]).toEqual({ one: 1 });
    await connection.close();
    await database.drop();
    await database.drop();
  });

  test('refuses production targets before touching the server', async () => {
    try {
      await createTestDatabase({ adminUrl, environment: 'production' });
      throw new Error('expected a throw');
    } catch (error) {
      expect((error as Error).message).toContain('Refusing to create test databases in production');
    }
  });

  test('refuses the application database URL as a test target', async () => {
    try {
      await createTestDatabase({ adminUrl, applicationUrl: adminUrl });
      throw new Error('expected a throw');
    } catch (error) {
      expect((error as Error).message).toContain('must not be the application DATABASE_URL');
    }
  });

  test('runs migrations into the isolated database only', async () => {
    const database = await createTestDatabase({
      adminUrl,
      migrationsFolder: join(import.meta.dir, '../../../apps/playground/database/migrations'),
    });
    try {
      const connection = createConnection({ url: database.url, maxConnections: 1 });
      const rows = await connection.sql`select to_regclass('public.products') as table`;
      expect(rows[0]?.table).toBe('products');
      await connection.close();
    } finally {
      await database.drop();
    }
  });

  test('drops the database when migration application fails', async () => {
    const admin = createConnection({ url: adminUrl, maxConnections: 1 });
    const before = await countTestDatabases(admin);
    try {
      await createTestDatabase({ adminUrl, migrationsFolder: '/nonexistent/migrations' });
      throw new Error('expected a throw');
    } catch {
      const after = await countTestDatabases(admin);
      expect(after).toBe(before);
    } finally {
      await admin.close();
    }
  });
});

async function countTestDatabases(admin: ReturnType<typeof createConnection>): Promise<number> {
  const rows = await admin.sql`select count(*)::int as count from pg_database where datname like 'fw_test_%'`;
  return Number(rows[0]?.count);
}
