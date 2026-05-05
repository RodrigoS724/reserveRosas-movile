import * as Notifications from 'expo-notifications'

type AgendaItem = {
  id: number
  nombre?: string | null
  fecha?: string | null
  hora?: string | null
}

let initialized = false

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
})

function buildDateTime(fecha?: string | null, hora?: string | null) {
  const fechaSafe = String(fecha || '').trim()
  const horaSafe = String(hora || '').trim()
  if (!fechaSafe || !horaSafe) return null

  const value = new Date(`${fechaSafe}T${horaSafe}:00`)
  if (Number.isNaN(value.getTime())) return null
  return value
}

export async function initNotifications() {
  if (initialized) return true

  const current = await Notifications.getPermissionsAsync()
  let granted = current.granted || current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL

  if (!granted) {
    const requested = await Notifications.requestPermissionsAsync()
    granted = requested.granted || requested.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
  }

  if (!granted) {
    return false
  }

  await Notifications.setNotificationChannelAsync('rr-alerts', {
    name: 'ReserveRosas alertas',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
    vibrationPattern: [0, 250, 150, 250],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  })

  initialized = true
  return true
}

export async function notifyNewApronte(item: AgendaItem) {
  const ok = await initNotifications()
  if (!ok) return

  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Nuevo apronte',
      body: `${String(item.nombre || 'Cliente')} (${String(item.hora || '--:--')})`,
      data: { kind: 'apronte', id: item.id },
      sound: 'default',
    },
    trigger: null,
  })
}

export async function notifyUpcoming(kind: 'reserva' | 'apronte', item: AgendaItem, minutesLeft: number) {
  const ok = await initNotifications()
  if (!ok) return

  const target = buildDateTime(item.fecha, item.hora)
  const dateLabel = target
    ? target.toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' })
    : String(item.hora || '--:--')
  const prettyKind = kind === 'reserva' ? 'reserva' : 'apronte'

  await Notifications.scheduleNotificationAsync({
    content: {
      title: `Proximo ${prettyKind}`,
      body: `${String(item.nombre || 'Cliente')} a las ${dateLabel} (en ${minutesLeft} min)`,
      data: { kind, id: item.id, minutesLeft },
      sound: 'default',
    },
    trigger: null,
  })
}

export function getMinutesUntil(fecha?: string | null, hora?: string | null) {
  const dt = buildDateTime(fecha, hora)
  if (!dt) return null
  const diff = dt.getTime() - Date.now()
  return Math.floor(diff / 60000)
}
