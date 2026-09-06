/**
 * Validates required environment variables at startup.
 * Called AFTER dotenv.config() so values are loaded.
 * Fails fast if critical secrets are missing.
 */
export function validateEnv() {
  const required = [
    'MONGODB_URI',
    'PLAID_CLIENT_ID',
    'PLAID_SECRET',
    'PLAID_ENV',
  ];

  // These are required only if you have the security layer fully set up
  const securityVars = [
    'JWT_ACCESS_SECRET',
    'JWT_REFRESH_SECRET',
    'FIELD_ENCRYPTION_KEY',
  ];

  const errors = [];

  // Check core required vars
  for (const key of required) {
    if (!process.env[key]) {
      errors.push(`Missing required env var: ${key}`);
    }
  }

  // Check security vars — warn but don't crash if missing
  // This allows gradual migration to the secure system
  for (const key of securityVars) {
    if (!process.env[key]) {
      console.warn(`[Security Warning] Missing env var: ${key} — JWT auth will not work`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Environment validation failed:\n${errors.join('\n')}`);
  }

  console.log('[Env] ✅ Environment variables validated');
}
