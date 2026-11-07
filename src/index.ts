// Public API of @framework/testing.
// Convention: every interface/type lives in `./types`, every constant in
// `./constants`; runtime values (functions) stay in their modules.

export { TEST_DATABASE_PREFIX } from './constants';
export { jsonInit, serveOnEphemeralPort } from './http';
export { createTestDatabase, requireTestDatabaseUrl } from './test-database';
// Grouped conventions: every type in ./types, every constant in ./constants.
export type { EphemeralServer, JsonRequester, TestDatabase, TestDatabaseOptions } from './types';
