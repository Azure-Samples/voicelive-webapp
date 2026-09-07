targetScope = 'subscription'

@minLength(3)
@maxLength(24)
param environmentName string

param location string = deployment().location

@description('Azure Communication Services data location.')
param communicationDataLocation string = 'United States'

@secure()
@description('Base64-encoded server-side executive profile configuration.')
param executiveProfilesBase64 string

@description('Client ID of the single-tenant Microsoft Entra application used by Container Apps authentication.')
param entraClientId string

@description('Tenant ID of the Microsoft Entra application.')
param entraTenantId string

@secure()
@description('Client secret for the Microsoft Entra application.')
param entraClientSecret string

var resourceToken = toLower(uniqueString(subscription().id, environmentName))
var resourceGroupName = 'rg-${environmentName}'
var appName = 'voice-delegate-${resourceToken}'
var communicationServiceName = 'acs-${resourceToken}'
var logAnalyticsName = 'log-${resourceToken}'
var managedEnvironmentName = 'cae-${resourceToken}'

resource resourceGroup 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: resourceGroupName
  location: location
}

module resources 'resources.bicep' = {
  name: 'voice-delegate-resources'
  scope: resourceGroup
  params: {
    appName: appName
    communicationDataLocation: communicationDataLocation
    communicationServiceName: communicationServiceName
    executiveProfilesBase64: executiveProfilesBase64
    entraClientId: entraClientId
    entraClientSecret: entraClientSecret
    entraTenantId: entraTenantId
    location: location
    logAnalyticsName: logAnalyticsName
    managedEnvironmentName: managedEnvironmentName
  }
}

output AZURE_LOCATION string = location
output AZURE_RESOURCE_GROUP string = resourceGroup.name
output SERVICE_WEB_NAME string = resources.outputs.containerAppName
output SERVICE_WEB_URI string = resources.outputs.containerAppUri
output MANAGED_IDENTITY_PRINCIPAL_ID string = resources.outputs.principalId
