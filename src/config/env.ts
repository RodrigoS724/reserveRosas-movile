import Constants from 'expo-constants'

const EMBEDDED_ENV = {
  apiUrl: 'https://rosas.uy/api',
  apiToken: 'gh2t2oNre50TR4ZucrkssNPFb8LnDhD5JT9gM89ERy4',
}

const EXTRA = (Constants.expoConfig?.extra || {}) as Record<string, unknown>

export const ENV = {
  apiUrl: String(EXTRA.apiUrl || EMBEDDED_ENV.apiUrl || '').trim().replace(/\/+$/, ''),
  apiToken: String(EXTRA.apiToken || EMBEDDED_ENV.apiToken || '').trim(),
}

export function getAuthHeaders() {
  if (!ENV.apiToken) return {}
  return {
    Authorization: `Bearer ${ENV.apiToken}`,
    'X-API-KEY': ENV.apiToken,
  }
}
