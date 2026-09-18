# Deploying to Azure

This folder contains a Bicep template (`main.bicep`) that provisions everything the Meeting Room Booking POC needs to run on Azure: Container Apps for the API and frontend, Key Vault for secrets, a system-assigned managed identity so the API never holds a Key Vault credential, Application Insights + Log Analytics for telemetry, and Azure Database for PostgreSQL Flexible Server.

**Nothing here runs automatically.** This is scaffolding — you deploy it yourself, when you've decided you want a real Azure environment, using the command at the bottom of this file.

## What's free vs. what costs money

| Resource | Cost at this POC's scale |
|---|---|
| Azure Container Apps (api + web) | **Free** — within Container Apps' always-free monthly grant (180k vCPU-seconds, 360k GiB-seconds, 2M requests/month). `main.bicep` also scales both apps to zero replicas when idle. |
| Key Vault | **Free** — billed per secret operation (a few cents per 10,000 operations); a POC's traffic won't come close to a billable amount. |
| Managed Identity | **Free** — no separate charge; it's an Azure AD feature, not a metered resource. |
| Application Insights + Log Analytics | **Free** — within the 5GB/month free data allowance. A POC's log volume is far below this. |
| **Azure Database for PostgreSQL Flexible Server** | **Not free.** No meaningful free tier exists for this service. The cheapest continuously-running SKU (Burstable B1ms, used in `main.bicep`) costs a small amount per month for as long as the server exists — roughly single-digit dollars, but it is a real, recurring charge, not a one-time or usage-gated cost. |

If you want to try the rest of this stack (Container Apps, Key Vault, managed identity, App Insights) at zero cost, you have two options for the database:
1. **Deploy this template, but delete the `postgres`/`postgresDb`/`postgresFirewallAllowAzure` resources first**, and instead point `DATABASE_URL` at a free-tier Postgres from another provider (e.g. Neon or Supabase both have a free tier) or your existing local Postgres — the app only cares about the connection string (see CLAUDE.md's "Raw SQL" section), not which provider hosts it.
2. **Deploy the full template**, understanding the Postgres server will bill until you delete it (`az group delete` removes everything, including the database).

## Prerequisites

- An Azure subscription (a free trial includes $200 of credit for 30 days, which comfortably covers even the paid Postgres piece during evaluation).
- [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli) installed, then `az login`.
- A resource group to deploy into: `az group create --name booking-poc --location eastus`.
- Container images for `api` and `web` pushed somewhere Container Apps can pull from (Azure Container Registry, Docker Hub, etc.) — the existing `api/Dockerfile` and `web/Dockerfile` build these images unchanged; nothing about them needs to be Azure-specific. Until you've pushed real images, the template defaults `apiImage`/`webImage` to a Microsoft quickstart placeholder so the deployment itself succeeds — the app won't actually work until you redeploy with your real image URLs.

## What the API code does differently on Azure

Everything described below is a no-op locally — `docker compose up` behaves exactly as it did before this section existed. Each piece only activates when its corresponding environment variable is set, which only happens when running on the infrastructure this template provisions.

- **`api/src/config/secrets.ts`**: if `AZURE_KEY_VAULT_URL` is set, fetches `jwt-access-secret`, `jwt-refresh-secret`, and `database-url` from Key Vault at boot (via the Container App's system-assigned managed identity — `DefaultAzureCredential` picks this up automatically, no credential in code or config) and overrides the corresponding env vars before the rest of the app starts. Unset, `api/.env`'s plain values are used exactly as before.
- **`api/src/lib/telemetry.ts`**: if `APPLICATIONINSIGHTS_CONNECTION_STRING` is set, starts Application Insights' auto-collection (HTTP requests, outgoing Postgres queries, uncaught exceptions) and forwards every pino log line as an App Insights trace, so the same structured business-event logs described in CLAUDE.md's "Structured logging" section also show up in App Insights' Logs blade, searchable by the same `requestId`/`correlationId`/`outcome` fields.

## Deploying

```bash
az deployment group create \
  --resource-group booking-poc \
  --template-file azure/main.bicep \
  --parameters \
      namePrefix=roombooking \
      postgresAdminUsername=bookingapp \
      postgresAdminPassword='<a strong password>' \
      jwtAccessSecret="$(node -e 'console.log(require("crypto").randomBytes(48).toString("hex"))')" \
      jwtRefreshSecret="$(node -e 'console.log(require("crypto").randomBytes(48).toString("hex"))')" \
      apiImage=<your-registry>/booking-api:latest \
      webImage=<your-registry>/booking-web:latest
```

The deployment outputs the API and web URLs, the Key Vault URI, and the App Insights connection string. After the first successful deploy, run `prisma migrate deploy` against the new database (the existing `api/Dockerfile`'s `CMD` already does this automatically on every container start, matching how it works locally).

To tear everything down (stops all billing, including the Postgres server): `az group delete --name booking-poc`.
