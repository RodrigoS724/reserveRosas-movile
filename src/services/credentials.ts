import * as SecureStore from 'expo-secure-store'

const CREDENTIALS_KEY = 'rr_mobile_credentials_v1'
const SESSION_KEY = 'rr_mobile_session_v1'

type StoredCredentials = {
  username: string
  password: string
}

type StoredSessionUser = {
  id: number
  nombre: string
  username: string
  role: string
  permissions?: string[]
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

export async function loadStoredSessionUser(): Promise<StoredSessionUser | null> {
  try {
    const raw = await SecureStore.getItemAsync(SESSION_KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw) as StoredSessionUser
    const id = Number(parsed?.id || 0)
    const nombre = String(parsed?.nombre || '').trim()
    const username = String(parsed?.username || '').trim()
    const role = String(parsed?.role || '').trim()
    const permissions = Array.isArray(parsed?.permissions) ? parsed.permissions : []

    if (!id || !username || !role) return null
    return { id, nombre, username, role, permissions }
  } catch {
    return null
  }
}

export async function saveStoredSessionUser(user: StoredSessionUser): Promise<void> {
  const payload = {
    id: Number(user?.id || 0),
    nombre: String(user?.nombre || '').trim(),
    username: String(user?.username || '').trim(),
    role: String(user?.role || '').trim(),
    permissions: Array.isArray(user?.permissions) ? user.permissions : [],
  }

  if (!payload.id || !payload.username || !payload.role) {
    await clearStoredSessionUser()
    return
  }

  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(payload))
}

export async function clearStoredSessionUser(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(SESSION_KEY)
  } catch {
    // Ignora errores de almacenamiento para no bloquear el flujo de logout.
  }
}
