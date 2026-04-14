import { ENV, getAuthHeaders } from '../config/env'

export type SessionUser = {
  id: number
  nombre: string
  username: string
  role: string
  permissions?: string[]
}

export type Reserva = {
  id: number
  nombre: string
  cedula?: string | null
  telefono?: string | null
  marca?: string | null
  modelo?: string | null
  matricula?: string | null
  fecha?: string | null
  hora?: string | null
  estado?: string | null
  detalles?: string | null
  tipo_turno?: string | null
  particular_tipo?: string | null
  garantia_tipo?: string | null
  [key: string]: unknown
}

export type Apronte = {
  id: number
  nombre: string
  telefono?: string | null
  localidad?: string | null
  marca?: string | null
  modelo?: string | null
  factura?: string | null
  fecha?: string | null
  hora?: string | null
  estado?: string | null
  observaciones?: string | null
  repuestos_garantia?: string | null
  [key: string]: unknown
}

function unwrapPayload<T>(payload: any): T {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return payload.data as T
  }
  return payload as T
}

function getBaseCandidates() {
  const primary = String(ENV.apiUrl || '').trim().replace(/\/+$/, '')
  const candidates = [primary]

  if (primary.endsWith('/api')) {
    candidates.push(primary.replace(/\/api$/, ''))
  } else if (primary.includes('/api-socket-io')) {
    candidates.push(primary.replace('/api-socket-io', ''))
  } else if (primary) {
    candidates.push(`${primary}/api`)
  }

  return Array.from(new Set(candidates.filter(Boolean)))
}

function buildRequestUrl(baseUrl: string, path: string) {
  const cleanBase = String(baseUrl || '').trim().replace(/\/+$/, '')
  const cleanPath = String(path || '').trim().startsWith('/') ? String(path || '').trim() : `/${String(path || '').trim()}`

  if (cleanBase.endsWith('/api') && cleanPath.startsWith('/api/')) {
    return `${cleanBase}${cleanPath.slice(4)}`
  }

  return `${cleanBase}${cleanPath}`
}

async function request<T>(path: string, options: any = {}): Promise<T> {
  const headers = {
    'Content-Type': 'application/json',
    ...getAuthHeaders(),
    ...(options.headers || {}),
  }

  let lastMessage = 'Error de conexión'

  for (const baseUrl of getBaseCandidates()) {
    const response = await fetch(buildRequestUrl(baseUrl, path), {
      ...options,
      headers,
    })

    const raw = await response.text()
    let payload: any = null

    try {
      payload = raw ? JSON.parse(raw) : null
    } catch {
      payload = raw
    }

    if (response.ok && !(payload && typeof payload === 'object' && payload.ok === false)) {
      return unwrapPayload<T>(payload)
    }

    lastMessage = payload?.error || `HTTP ${response.status}`

    if (!(response.status === 404 || String(lastMessage).toLowerCase().includes('endpoint no encontrado'))) {
      throw new Error(lastMessage)
    }
  }

  throw new Error(lastMessage)
}

export function login(username: string, password: string) {
  return request<{ ok: boolean; user?: SessionUser; error?: string }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
}

export function obtenerReservasDia(fecha: string) {
  return request<Reserva[]>(`/api/reservas/dia?fecha=${encodeURIComponent(fecha)}`)
}

export function obtenerAprontesDia(fecha: string) {
  return request<Apronte[]>(`/api/aprontes?fecha=${encodeURIComponent(fecha)}`)
}

export function cambiarEstadoReserva(reserva: Reserva, estado: string) {
  return request('/api/reservas/' + reserva.id, {
    method: 'PUT',
    body: JSON.stringify({
      ...reserva,
      estado,
    }),
  })
}

export function cambiarEstadoApronte(apronte: Apronte, estado: string) {
  return request('/api/aprontes/' + apronte.id, {
    method: 'PUT',
    body: JSON.stringify({
      ...apronte,
      estado,
    }),
  })
}
