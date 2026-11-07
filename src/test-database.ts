import { randomBytes } from 'node:crypto';
import { FrameworkError } from '@framework/core';
import { createConnection, type DatabaseConnection, runMigrations } from '@framework/database';
import postgres from 'postgres';

export interface TestDatabase {
  readonly name: string;
  readonly url: string;
  /** Drops the database; safe to call more than once. */
  drop(): Promise<void>;
}

export interface TestDatabaseOptions {
  /** Server-level URL used only to CREATE/DROP the throwaway database. */
  readonly adminUrl: string;
  /** Omit to get an empty database (package-level tests create their own tables). */
  readonly migrationsFolder?: string;
  /** The application's normal DATABASE_URL, if any; the test target must differ. */
  readonly applicationUrl?: string;
  readonly environment?: string;
}

const TEST_DATABASE_PREFIX = 'fw_test_';

/** Reads TEST_DATABASE_URL or fails with setup instructions (never silently skips). */
export function requireTestDatabaseUrl(env: Record<string, string | undefined> = process.env): string {
  const url = env.TEST_DATABASE_URL;
  if (!url) {
    throw new FrameworkError(
      'TEST_DATABASE_MISSING',
      'TEST_DATABASE_URL is not set. Start Postgres with `bun run db:up` and set ' +
        'TEST_DATABASE_URL (see .env.test.example). Endpoint tests require a real database.',
    );
  }
  return url;
}

function guardTarget(options: TestDatabaseOptions): void {
  if (options.environment === 'production') {
    throw new FrameworkError('TEST_TARGET_REJECTED', 'Refusing to create test databases in production');
  }
  if (options.applicationUrl && new URL(options.applicationUrl).href === new URL(options.adminUrl).href) {
    throw new FrameworkError(
      'TEST_TARGET_REJECTED',
      'TEST_DATABASE_URL must not be the application DATABASE_URL; use a dedicated test server/admin URL',
    );
  }
}

/**
 * Creates an isolated database, applies migrations only there, and returns a
 * handle whose `drop()` removes it (used in success and failure paths).
 */
export async function createTestDatabase(options: TestDatabaseOptions): Promise<TestDatabase> {
  guardTarget(options);
  const name = `${TEST_DATABASE_PREFIX}${randomBytes(6).toString('hex')}`;
  const admin = postgres(options.adminUrl, { max: 1, onnotice: () => {} });
  let dropped = false;

  const drop = async () => {
    if (dropped) return;
    dropped = true;
    try {
      await admin.unsafe(`drop database if exists "${name}" with (force)`);
    } finally {
      await admin.end({ timeout: 5 });
    }
  };

  const url = new URL(options.adminUrl);
  url.pathname = `/${name}`;
  let connection: DatabaseConnection | undefined;
  try {
    await admin.unsafe(`create database "${name}"`);
    connection = createConnection({ url: url.href, maxConnections: 2 });
    if (options.migrationsFolder) await runMigrations(connection, options.migrationsFolder);
    await connection.close();
  } catch (error) {
    await connection?.close();
    await drop();
    throw error;
  }
  return { name, url: url.href, drop };
}
