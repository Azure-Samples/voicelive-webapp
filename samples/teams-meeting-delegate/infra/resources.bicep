param appName string
param communicationDataLocation string
param communicationServiceName string
@secure()
param executiveProfilesBase64 string
param entraClientId string
@secure()
param entraClientSecret string
param entraTenantId string
param location string
param logAnalyticsName string
param managedEnvironmentName string

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
      secrets: [
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
      ]
    }
    template: {
      containers: [
        {
          name: 'web'
          image: 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'
          env: [
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
          ]
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
