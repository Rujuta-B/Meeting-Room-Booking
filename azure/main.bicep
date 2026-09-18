// azure/main.bicep
//
// Provisions the Meeting Room Booking POC on Azure Container Apps.
// Nothing in this repo runs this template automatically - it's meant to
// be deployed manually, once you've decided you want a real Azure
// environment (see azure/README.md for cost breakdown and the exact
// `az deployment group create` command).
//
// Resources, and which ones are free at this POC's scale (see README.md
// for the full breakdown):
//   - Container Apps Environment + 2 Container Apps (api, web) - FREE
//     (within Azure Container Apps' always-free monthly grant)
//   - Log Analytics workspace + Application Insights           - FREE
//     (within the 5GB/month free data allowance)
//   - Key Vault                                                 - FREE
//     (billed per secret operation; negligible at this scale)
//   - Azure Database for PostgreSQL Flexible Server            - PAID
//     (no meaningful free tier; this is the one resource below that
//     costs real money for as long as it exists)

@description('Short, globally-unique-ish prefix for resource names, e.g. "roombooking".')
param namePrefix string

@description('Azure region for every resource.')
param location string = resourceGroup().location

@description('Administrator username for the PostgreSQL Flexible Server.')
param postgresAdminUsername string

@secure()
@description('Administrator password for the PostgreSQL Flexible Server. Pass via --parameters at deploy time, never commit it.')
param postgresAdminPassword string

@secure()
@description('JWT access-token signing secret. Stored in Key Vault, never as a plain Container App env var.')
param jwtAccessSecret string

@secure()
@description('JWT refresh-token signing secret. Stored in Key Vault, never as a plain Container App env var.')
param jwtRefreshSecret string

@description('Container image for the api service, e.g. myregistry.azurecr.io/booking-api:latest. Defaults to a placeholder that will need updating before this app actually serves traffic.')
param apiImage string = 'mcr.microsoft.com/k8se/quickstart:latest'

@description('Container image for the web service.')
param webImage string = 'mcr.microsoft.com/k8se/quickstart:latest'

var postgresServerName = '${namePrefix}-pg'
var postgresDbName = 'booking'
var databaseUrl = 'postgresql://${postgresAdminUsername}:${postgresAdminPassword}@${postgresServerName}.postgres.database.azure.com:5432/${postgresDbName}?sslmode=require'

// --- Observability: Log Analytics + Application Insights ---
// Both free at this POC's data volume (5GB/month AI allowance). The
// workspace is a prerequisite Container Apps Environments require for
// their own diagnostics, and App Insights is wired to the api Container
// App via APPLICATIONINSIGHTS_CONNECTION_STRING (see api/src/lib/telemetry.ts,
// which is a complete no-op if this env var is absent).
resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: '${namePrefix}-logs'
  location: location
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
  }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: '${namePrefix}-insights'
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalytics.id
  }
}

// --- Secrets: Key Vault, read via the api Container App's managed identity ---
resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: '${namePrefix}-kv'
  location: location
  properties: {
    sku: { family: 'A', name: 'standard' }
    tenantId: subscription().tenantId
    // RBAC authorization (not the older access-policy model) so the
    // managed identity's permission is granted via a standard Azure role
    // assignment below, not a Key-Vault-specific policy list.
    enableRbacAuthorization: true
  }
}

resource jwtAccessSecretResource 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'jwt-access-secret'
  properties: { value: jwtAccessSecret }
}

resource jwtRefreshSecretResource 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'jwt-refresh-secret'
  properties: { value: jwtRefreshSecret }
}

resource databaseUrlSecretResource 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'database-url'
  properties: { value: databaseUrl }
}

// --- Database: the one paid resource in this template ---
// Burstable B1ms - the cheapest Flexible Server SKU that still gives a
// dedicated (not shared/serverless) instance suitable for continuous use.
resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2023-06-01-preview' = {
  name: postgresServerName
  location: location
  sku: {
    name: 'Standard_B1ms'
    tier: 'Burstable'
  }
  properties: {
    version: '16'
    administratorLogin: postgresAdminUsername
    administratorLoginPassword: postgresAdminPassword
    storage: { storageSizeGB: 32 }
    backup: { backupRetentionDays: 7 }
  }
}

resource postgresDb 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2023-06-01-preview' = {
  parent: postgres
  name: postgresDbName
}

// Allows Azure services (including this Container App) to reach the
// server - Flexible Server firewalls all traffic by default. A real
// production setup would instead use VNet integration; this rule is the
// simplest thing that works for a POC.
resource postgresFirewallAllowAzure 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2023-06-01-preview' = {
  parent: postgres
  name: 'AllowAzureServices'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

// --- Compute: Container Apps Environment + the two apps ---
resource containerAppsEnv 'Microsoft.App/managedEnvironments@2023-05-01' = {
  name: '${namePrefix}-env'
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
  }
}

resource apiApp 'Microsoft.App/containerApps@2023-05-01' = {
  name: '${namePrefix}-api'
  location: location
  identity: {
    // System-assigned managed identity - this is what api/src/config/secrets.ts's
    // DefaultAzureCredential authenticates as when reading Key Vault
    // secrets. No credential for this identity is ever stored anywhere;
    // Azure AD manages it for the Container App's lifetime.
    type: 'SystemAssigned'
  }
  properties: {
    managedEnvironmentId: containerAppsEnv.id
    configuration: {
      ingress: {
        external: true
        targetPort: 3000
      }
    }
    template: {
      containers: [
        {
          name: 'api'
          image: apiImage
          env: [
            { name: 'NODE_ENV', value: 'production' }
            { name: 'PORT', value: '3000' }
            { name: 'AZURE_KEY_VAULT_URL', value: keyVault.properties.vaultUri }
            { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsights.properties.ConnectionString }
            { name: 'WEB_ORIGIN', value: 'https://${namePrefix}-web.${containerAppsEnv.properties.defaultDomain}' }
            { name: 'JWT_ACCESS_EXPIRES_IN', value: '15m' }
            { name: 'JWT_REFRESH_EXPIRES_IN', value: '7d' }
            { name: 'BCRYPT_SALT_ROUNDS', value: '10' }
            { name: 'LOG_LEVEL', value: 'info' }
            // Deliberately NOT set here: DATABASE_URL, JWT_ACCESS_SECRET,
            // JWT_REFRESH_SECRET - all three are fetched from Key Vault at
            // boot via AZURE_KEY_VAULT_URL above (see config/secrets.ts).
            // Setting them here too would defeat the point of Key Vault:
            // whichever value the app actually used would be ambiguous,
            // and the plain env var would still be a secret sitting in
            // this Container App's (visible-to-anyone-with-Reader-access)
            // configuration.
          ]
        }
      ]
      scale: {
        minReplicas: 0 // scales to zero when idle - this is what keeps a POC inside the always-free grant
        maxReplicas: 1
      }
    }
  }
}

resource webApp 'Microsoft.App/containerApps@2023-05-01' = {
  name: '${namePrefix}-web'
  location: location
  properties: {
    managedEnvironmentId: containerAppsEnv.id
    configuration: {
      ingress: {
        external: true
        targetPort: 80
      }
    }
    template: {
      containers: [
        {
          name: 'web'
          image: webImage
        }
      ]
      scale: {
        minReplicas: 0
        maxReplicas: 1
      }
    }
  }
}

// Grants the api Container App's managed identity permission to READ
// secrets from this Key Vault - nothing more (not write/delete/manage).
// "Key Vault Secrets User" is the built-in RBAC role scoped exactly to
// "get secret values", matching the principle of least privilege for what
// config/secrets.ts actually needs to do.
var keyVaultSecretsUserRoleId = '4633458b-17de-408a-b874-0445c86b69e6'

resource apiKeyVaultAccess 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVault.id, apiApp.id, keyVaultSecretsUserRoleId)
  scope: keyVault
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', keyVaultSecretsUserRoleId)
    principalId: apiApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

output apiUrl string = 'https://${apiApp.properties.configuration.ingress.fqdn}'
output webUrl string = 'https://${webApp.properties.configuration.ingress.fqdn}'
output keyVaultUri string = keyVault.properties.vaultUri
output appInsightsConnectionString string = appInsights.properties.ConnectionString
