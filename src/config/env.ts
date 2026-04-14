const EMBEDDED_ENV = {
  apiUrl: 'https://rosas.uy/api-socket-io',
  apiToken: 'gh2t2oNre50TR4ZucrkssNPFb8LnDhD5JT9gM89ERy4',
}

export const ENV = {
  apiUrl: String(EMBEDDED_ENV.apiUrl || '').trim().replace(/\/+$/, ''),
  apiToken: String(EMBEDDED_ENV.apiToken || '').trim(),
}

export function getAuthHeaders() {
  if (!ENV.apiToken) return {}
  return {
    Authorization: `Bearer ${ENV.apiToken}`,
    'X-API-KEY': ENV.apiToken,
  }
}
