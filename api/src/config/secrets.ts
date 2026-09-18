// src/config/secrets.ts
//
// WHY this has to run and finish BEFORE config/env.ts is ever imported:
// env.ts parses process.env exactly once, at its own module-load time, and
// every other module (prisma/client.ts, lib/jwt.ts, lib/logger.ts) imports
// the already-parsed `env` object rather than reading process.env itself.
// There is no later hook to "re-parse env after all". So the only place
// this can plug in is server.ts, the one file that's guaranteed to run
// before anything else in a real deployment (and the one file tests never
// import - see app.ts's top comment) - it must call loadSecretsIntoEnv()
// and await it BEFORE its own `import('./app.js')`, which is what
// transitively pulls in config/env.ts for the first time.
//
// WHY Key Vault + managed identity, not a connection string with a
// username/password: a Container App's system-assigned managed identity is
// a credential Azure AD manages for the app's lifetime - nothing to
// rotate, store, or leak in an env var. DefaultAzureCredential
// transparently picks the right auth mechanism for wherever this code
// runs: the Container App's managed identity in Azure, or `az login`'s
// local login when a developer runs this same code path locally to test
// it. Either way, no Key Vault credential ever appears in code or in an
// env var - only the Key Vault's URL does, which is not a secret.
//
// This is fully inert for local Docker Compose dev: with AZURE_KEY_VAULT_URL
// unset, loadSecretsIntoEnv() returns immediately and every secret keeps
// coming from api/.env exactly as before this file existed.
import { SecretClient } from '@azure/keyvault-secrets';
import { DefaultAzureCredential } from '@azure/identity';

// The specific secrets this app needs at boot. Each Key Vault secret NAME
// uses hyphens (Key Vault's own naming rule forbids underscores), mapped
// back to the process.env KEY our own env.ts schema actually expects.
const SECRET_NAME_TO_ENV_VAR: Record<string, string> = {
  'jwt-access-secret': 'JWT_ACCESS_SECRET',
  'jwt-refresh-secret': 'JWT_REFRESH_SECRET',
  'database-url': 'DATABASE_URL',
};

export async function loadSecretsIntoEnv(): Promise<void> {
  const vaultUrl = process.env.AZURE_KEY_VAULT_URL;
  if (!vaultUrl) return; // not running against Azure Key Vault - env vars/.env are the source of truth, unchanged

  // Deliberately not wrapped in try/catch: if a Key Vault URL was
  // explicitly configured, a failure to reach it means the deployment is
  // genuinely misconfigured (wrong URL, missing role assignment, no
  // managed identity) - the app should fail loudly at boot, the same way
  // env.ts itself exits on invalid config, rather than silently falling
  // back to (likely absent) plain env vars and failing confusingly later
  // on the first request that needs a JWT secret or DATABASE_URL.
  const credential = new DefaultAzureCredential();
  const client = new SecretClient(vaultUrl, credential);

  await Promise.all(
    Object.entries(SECRET_NAME_TO_ENV_VAR).map(async ([secretName, envVar]) => {
      const secret = await client.getSecret(secretName);
      if (!secret.value) throw new Error(`Key Vault secret "${secretName}" has no value.`);
      process.env[envVar] = secret.value;
    }),
  );
}
