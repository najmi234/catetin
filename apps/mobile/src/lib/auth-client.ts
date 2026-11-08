import { expoClient } from '@better-auth/expo/client';
import { emailOTPClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';
import * as SecureStore from 'expo-secure-store';
import { API_URL } from './config';

export const authClient = createAuthClient({
  baseURL: API_URL,
  plugins: [
    expoClient({ scheme: 'catetin', storagePrefix: 'catetin', storage: SecureStore }),
    emailOTPClient(),
  ],
});
