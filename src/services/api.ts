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

async function request<T>(path: string, options: any = {}): Promise<T> {
  const headers = {
    'Content-Type': 'application/json',
    ...getAuthHeaders(),
    ...(options.headers || {}),
  }

  const response = await fetch(`${ENV.apiUrl}${path}`, {
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

  if (!response.ok || (payload && typeof payload === 'object' && payload.ok === false)) {
    const message = payload?.error || `HTTP ${response.status}`
    throw new Error(message)
  }

  return unwrapPayload<T>(payload)
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
