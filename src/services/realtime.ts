import { io, type Socket } from 'socket.io-client'
import { ENV } from '../config/env'

type SyncHandler = (payload: any) => void
type StatusHandler = (connected: boolean) => void

function getSocketConfig(baseUrl: string) {
  try {
    const parsed = new URL(baseUrl)
    const basePath = parsed.pathname && parsed.pathname !== '/' ? parsed.pathname.replace(/\/+$/, '') : ''
    return {
      origin: parsed.origin,
      path: `${basePath}/socket.io`,
    }
  } catch {
    return {
      origin: baseUrl,
      path: '/socket.io',
    }
  }
}

let socket: Socket | null = null

export function subscribeRealtime(onSync: SyncHandler, onStatus?: StatusHandler) {
  const baseUrl = String(ENV.apiUrl || '').trim().replace(/\/+$/, '')
  if (!baseUrl) {
    onStatus?.(false)
    return () => {}
  }

  const socketConfig = getSocketConfig(baseUrl)

  if (!socket) {
    socket = io(socketConfig.origin, {
      path: socketConfig.path,
      transports: ['websocket', 'polling'],
      reconnection: true,
      timeout: 6000,
    })
  }

  const handleSync = (payload: any) => onSync(payload || {})
  const handleConnect = () => onStatus?.(true)
  const handleDisconnect = () => onStatus?.(false)

  socket.on('rr:sync', handleSync)
  socket.on('connect', handleConnect)
  socket.on('disconnect', handleDisconnect)
  onStatus?.(socket.connected)

  return () => {
    socket?.off('rr:sync', handleSync)
    socket?.off('connect', handleConnect)
    socket?.off('disconnect', handleDisconnect)
  }
}
