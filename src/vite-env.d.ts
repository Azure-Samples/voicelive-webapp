/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AZURE_AI_RESOURCE_NAME: string;
  readonly VITE_AZURE_AI_REGION: string;
  readonly VITE_AUTH_METHOD: 'apiKey' | 'entraId';
  readonly VITE_AZURE_API_KEY: string;
  readonly VITE_AZURE_CLIENT_ID: string;
  readonly VITE_AZURE_AUTHORITY: string;
  readonly VITE_AZURE_REDIRECT_URI: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}