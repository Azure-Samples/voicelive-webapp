param appName string
param communicationDataLocation string
param communicationServiceName string
@secure()
param executiveProfilesBase64 string
param entraClientId string
@secure()
param entraClientSecret string
param entraTenantId string
param workIqTenantId string
param workIqClientId string
@secure()
param workIqClientSecret string
param location string
param logAnalyticsName string
param managedEnvironmentName string

var workIqConfigured = !empty(workIqTenantId) && !empty(workIqClientId) && !empty(workIqClientSecret)
var containerSecrets = concat([
  {
    name: 'acs-connection-string'
    value: communicationService.listKeys().primaryConnectionString
  }
  {
    name: 'executive-profiles'
    value: executiveProfilesBase64
  }
  {
    name: 'microsoft-provider-authentication-secret'
    value: entraClientSecret
  }
], workIqConfigured ? [
  {
    name: 'workiq-client-secret'
    value: workIqClientSecret
  }
] : [])
var containerEnvironment = concat([
  {
    name: 'PORT'
    value: '8080'
  }
  {
    name: 'NODE_ENV'
    value: 'production'
  }
  {
    name: 'ACS_CONNECTION_STRING'
    secretRef: 'acs-connection-string'
  }
  {
    name: 'EXECUTIVE_PROFILES_BASE64'
    secretRef: 'executive-profiles'
  }
], workIqConfigured ? [
  {
    name: 'WORKIQ_TENANT_ID'
    value: workIqTenantId
  }
  {
    name: 'WORKIQ_CLIENT_ID'
    value: workIqClientId
  }
  {
    name: 'WORKIQ_CLIENT_SECRET'
    secretRef: 'workiq-client-secret'
  }
] : [])

resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: logAnalyticsName
  location: location
  properties: {
    retentionInDays: 30
    sku: {
      name: 'PerGB2018'
    }
  }
}

resource communicationService 'Microsoft.Communication/communicationServices@2023-04-01' = {
  name: communicationServiceName
  location: 'global'
  properties: {
    dataLocation: communicationDataLocation
  }
}

resource managedEnvironment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: managedEnvironmentName
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logs.properties.customerId
        sharedKey: logs.listKeys().primarySharedKey
      }
    }
  }
}

resource containerApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: appName
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    environmentId: managedEnvironment.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        allowInsecure: false
        external: true
        targetPort: 8080
        transport: 'auto'
      }
      secrets: containerSecrets
    }
    template: {
      containers: [
        {
          name: 'web'
          image: 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'
          env: containerEnvironment
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 3
        rules: [
          {
            name: 'http'
            http: {
              metadata: {
                concurrentRequests: '50'
              }
            }
          }
        ]
      }
    }
  }
}

resource authConfig 'Microsoft.App/containerApps/authConfigs@2024-03-01' = {
  parent: containerApp
  name: 'current'
  properties: {
    globalValidation: {
      redirectToProvider: 'azureactivedirectory'
      unauthenticatedClientAction: 'RedirectToLoginPage'
    }
    httpSettings: {
      requireHttps: true
    }
    identityProviders: {
      azureActiveDirectory: {
        registration: {
          clientId: entraClientId
          clientSecretSettingName: 'microsoft-provider-authentication-secret'
          openIdIssuer: '${environment().authentication.loginEndpoint}${entraTenantId}/v2.0'
        }
      }
    }
    login: {
      tokenStore: {
        enabled: false
      }
    }
    platform: {
      enabled: true
    }
  }
}

output containerAppName string = containerApp.name
output containerAppUri string = 'https://${containerApp.properties.configuration.ingress.fqdn}'
output principalId string = containerApp.identity.principalId
