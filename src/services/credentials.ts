import * as SecureStore from 'expo-secure-store'

const CREDENTIALS_KEY = 'rr_mobile_credentials_v1'

type StoredCredentials = {
  username: string
  password: string
}

export async function loadStoredCredentials(): Promise<StoredCredentials | null> {
  try {
    const raw = await SecureStore.getItemAsync(CREDENTIALS_KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw) as StoredCredentials
    const username = String(parsed?.username || '').trim()
    const password = String(parsed?.password || '')

    if (!username || !password) return null
    return { username, password }
  } catch {
    return null
  }
}

export async function saveStoredCredentials(username: string, password: string): Promise<void> {
  const payload = {
    username: String(username || '').trim(),
    password: String(password || ''),
  }

  if (!payload.username || !payload.password) {
    await clearStoredCredentials()
    return
  }

  await SecureStore.setItemAsync(CREDENTIALS_KEY, JSON.stringify(payload))
}

export async function clearStoredCredentials(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(CREDENTIALS_KEY)
  } catch {
    // Ignora errores de almacenamiento para no bloquear el flujo de login.
  }
}
