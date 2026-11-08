/**
 * Server origin, e.g. "https://api.example.com" or, in development, the laptop's LAN
 * address "http://192.168.1.10:3001". Set in apps/mobile/.env as EXPO_PUBLIC_API_URL.
 */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/+$/, '');

if (!API_URL) {
  console.warn('EXPO_PUBLIC_API_URL belum diisi — aplikasi tidak bisa menghubungi server.');
}
