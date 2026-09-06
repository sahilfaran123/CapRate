// Set required env vars for tests
process.env.NODE_ENV            = 'test';
process.env.MONGODB_URI         = 'mongodb://localhost:27017/finsync-test';
process.env.JWT_ACCESS_SECRET   = 'test-access-secret-that-is-long-enough-abc';
process.env.JWT_REFRESH_SECRET  = 'test-refresh-secret-that-is-long-enough-xyz';
process.env.FIELD_ENCRYPTION_KEY = 'test-encryption-key-32-characters!!';
process.env.PLAID_CLIENT_ID     = 'test-client-id';
process.env.PLAID_SECRET        = 'test-secret';
process.env.PLAID_ENV           = 'sandbox';
process.env.RENTCAST_API_KEY    = 'test-rentcast-key';
process.env.ANTHROPIC_API_KEY   = 'test-anthropic-key';
process.env.LOG_LEVEL           = 'silent';
