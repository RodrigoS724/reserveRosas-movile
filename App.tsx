import { StatusBar } from 'expo-status-bar'
import * as Updates from 'expo-updates'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Modal,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { ENV } from './src/config/env'
import {
  Apronte,
  cambiarEstadoApronte,
  cambiarEstadoReserva,
  login,
  obtenerAprontesDia,
  obtenerReservasDia,
  Reserva,
  SessionUser,
} from './src/services/api'
import {
  clearStoredCredentials,
  loadStoredCredentials,
  saveStoredCredentials,
} from './src/services/credentials'

type ThemeMode = 'light' | 'dark'
type ActiveScreen = 'panel' | 'ajustes'
type Palette = typeof PALETTES.light

type DetailSelection =
  | { kind: 'reserva'; item: Reserva }
  | { kind: 'apronte'; item: Apronte }
  | null

const RESERVA_ESTADOS = ['PENDIENTE', 'PENDIENTE REPUESTOS', 'EN REVISION', 'PRONTO', 'EN PROCESO', 'CANCELADO']
const APRONTE_ESTADOS = ['APRONTE', 'ENTREGADA', 'ENTREGADA ESPERA DE GARANTIA']

const PALETTES = {
  light: {
    background: '#f3f7fb',
    surface: '#ffffff',
    surfaceAlt: '#eef6ff',
    text: '#0f172a',
    muted: '#64748b',
    border: '#d9e3f0',
    primary: '#0f766e',
    primarySoft: '#ccfbf1',
    accent: '#4f46e5',
    danger: '#b91c1c',
    dangerSoft: '#fee2e2',
  },
  dark: {
    background: '#0b1220',
    surface: '#121a2b',
    surfaceAlt: '#182235',
    text: '#e6eefc',
    muted: '#94a3b8',
    border: '#263247',
    primary: '#2dd4bf',
    primarySoft: '#10333b',
    accent: '#818cf8',
    danger: '#fca5a5',
    dangerSoft: '#411b24',
  },
}

function getTodayIso() {
  const now = new Date()
  const offset = now.getTimezoneOffset() * 60000
  return new Date(now.getTime() - offset).toISOString().split('T')[0]
}

function formatPrettyDate(dateIso: string) {
  return new Date(`${dateIso}T12:00:00`).toLocaleDateString('es-UY', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

function displayText(value: unknown) {
  const text = String(value ?? '').trim()
  return text || '-'
}

function displayStatus(estado?: string | null) {
  return String(estado || 'SIN ESTADO').replace(/_/g, ' ').trim()
}

function buildReservaType(reserva: Reserva) {
  const tipo = String(reserva.tipo_turno || '').trim().toLowerCase()
  if (tipo === 'garantía' || tipo === 'garantia') {
    return `Garantía${reserva.garantia_tipo ? ` · ${reserva.garantia_tipo}` : ''}`
  }
  if (tipo === 'particular') {
    return `Particular${reserva.particular_tipo ? ` · ${reserva.particular_tipo}` : ''}`
  }
  return 'Reserva'
}

function getStatusColors(estado: string | null | undefined, isDark: boolean) {
  const normalized = String(estado || '').toUpperCase()

  if (normalized.includes('CANCEL')) {
    return { backgroundColor: isDark ? '#4c1d1d' : '#fee2e2', color: isDark ? '#fecaca' : '#b91c1c' }
  }
  if (normalized.includes('GARANTIA') || normalized.includes('PRONTO')) {
    return { backgroundColor: isDark ? '#3b2f14' : '#fef3c7', color: isDark ? '#fde68a' : '#92400e' }
  }
  if (normalized.includes('PROCESO') || normalized.includes('REVISION')) {
    return { backgroundColor: isDark ? '#152a46' : '#dbeafe', color: isDark ? '#93c5fd' : '#1d4ed8' }
  }
  if (normalized.includes('ENTREG')) {
    return { backgroundColor: isDark ? '#123524' : '#dcfce7', color: isDark ? '#86efac' : '#166534' }
  }

  return { backgroundColor: isDark ? '#3a1f24' : '#ffe4e6', color: isDark ? '#fda4af' : '#be123c' }
}

function StatCard({ label, value, palette }: { label: string; value: string; palette: Palette }) {
  return (
    <View style={[styles.statCard, { backgroundColor: palette.surface, borderColor: palette.border }]}> 
      <Text style={[styles.statValue, { color: palette.text }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: palette.muted }]}>{label}</Text>
    </View>
  )
}

function DetailField({ label, value, palette }: { label: string; value: unknown; palette: Palette }) {
  return (
    <View style={[styles.detailField, { backgroundColor: palette.surfaceAlt, borderColor: palette.border }]}> 
      <Text style={[styles.detailLabel, { color: palette.muted }]}>{label}</Text>
      <Text style={[styles.detailValue, { color: palette.text }]}>{displayText(value)}</Text>
    </View>
  )
}

export default function App() {
  const fechaHoy = useMemo(() => getTodayIso(), [])
  const [themeMode, setThemeMode] = useState<ThemeMode>('light')
  const [activeScreen, setActiveScreen] = useState<ActiveScreen>('panel')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [rememberCredentials, setRememberCredentials] = useState(false)
  const [restoringCredentials, setRestoringCredentials] = useState(true)
  const [user, setUser] = useState<SessionUser | null>(null)
  const [reservas, setReservas] = useState<Reserva[]>([])
  const [aprontes, setAprontes] = useState<Apronte[]>([])
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [updatingKey, setUpdatingKey] = useState('')
  const [error, setError] = useState('')
  const [lastSync, setLastSync] = useState('')
  const [updateStatus, setUpdateStatus] = useState('verificando versión')
  const [updateDebug, setUpdateDebug] = useState('')
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const [selectedItem, setSelectedItem] = useState<DetailSelection>(null)
  const hasTriedAutoLogin = useRef(false)

  const isDark = themeMode === 'dark'
  const palette = PALETTES[themeMode]

  const cargarPanel = useCallback(async (isRefresh = false) => {
    if (!user) return

    if (isRefresh) setRefreshing(true)
    else setLoading(true)

    setError('')

    try {
      const [reservasRes, aprontesRes] = await Promise.allSettled([
        obtenerReservasDia(fechaHoy),
        obtenerAprontesDia(fechaHoy),
      ])

      const errors: string[] = []

      if (reservasRes.status === 'fulfilled') {
        setReservas(Array.isArray(reservasRes.value) ? reservasRes.value : [])
      } else {
        errors.push('reservas')
        setReservas([])
      }

      if (aprontesRes.status === 'fulfilled') {
        setAprontes(Array.isArray(aprontesRes.value) ? aprontesRes.value : [])
      } else {
        errors.push('aprontes')
        setAprontes([])
      }

      setLastSync(
        new Date().toLocaleTimeString('es-UY', {
          hour: '2-digit',
          minute: '2-digit',
        })
      )

      if (errors.length) {
        setError(`No se pudieron cargar: ${errors.join(', ')}.`)
      }
    } catch (err: any) {
      setError(err?.message || 'No se pudieron cargar los datos del día.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [fechaHoy, user])

  useEffect(() => {
    if (user) {
      cargarPanel()
    }
  }, [user, cargarPanel])

  useEffect(() => {
    let mounted = true

    const restoreCredentials = async () => {
      try {
        const stored = await loadStoredCredentials()
        if (!mounted || !stored) return

        setUsername(stored.username)
        setPassword(stored.password)
        setRememberCredentials(true)
      } finally {
        if (mounted) {
          setRestoringCredentials(false)
        }
      }
    }

    void restoreCredentials()

    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    const channel = Updates.channel || 'sin canal'
    const runtime = Updates.runtimeVersion || 'sin runtime'
    const updateId = Updates.updateId || 'embedded'
    setUpdateDebug(`canal ${channel} · runtime ${runtime} · update ${updateId}`)
  }, [])

  const buscarActualizacion = useCallback(async (options?: { manual?: boolean }) => {
    if (__DEV__) {
      setUpdateStatus('modo desarrollo')
      if (options?.manual) {
        Alert.alert('OTA deshabilitada', 'En modo desarrollo no se aplican updates OTA de EAS.')
      }
      return
    }

    setCheckingUpdate(true)

    try {
      setUpdateStatus('verificando actualización')
      const result = await Updates.checkForUpdateAsync()
      if (!result.isAvailable) {
        setUpdateStatus('app actualizada')
        if (options?.manual) {
          Alert.alert('Sin novedades', 'No hay una actualización OTA disponible para este runtime/canal.')
        }
        return
      }

      setUpdateStatus('descargando actualización')
      await Updates.fetchUpdateAsync()
      setUpdateStatus('actualización lista')

      Alert.alert(
        'Actualización disponible',
        'Se descargó una nueva versión. Reinicia la app para aplicarla.',
        [
          { text: 'Luego', style: 'cancel' },
          {
            text: 'Reiniciar',
            onPress: () => {
              void Updates.reloadAsync()
            },
          },
        ]
      )
    } catch (err: any) {
      const message = err?.message || 'sin detalles'
      setUpdateStatus(`error OTA: ${message}`)
      if (options?.manual) {
        Alert.alert('Error de actualización', message)
      }
    } finally {
      setCheckingUpdate(false)
    }
  }, [])

  useEffect(() => {
    void buscarActualizacion()
  }, [buscarActualizacion])

  const handleLogin = useCallback(async (options?: { silent?: boolean }) => {
    const userValue = username.trim()
    const passValue = password

    if (!userValue || !passValue) {
      if (!options?.silent) {
        Alert.alert('Datos incompletos', 'Ingresa tu usuario y contraseña.')
      }
      return
    }

    setSubmitting(true)
    setError('')

    try {
      const result = await login(userValue, passValue)
      if (!result?.ok || !result.user) {
        throw new Error(result?.error || 'No fue posible iniciar sesión.')
      }
      setUser(result.user)

      if (rememberCredentials) {
        await saveStoredCredentials(userValue, passValue)
      } else {
        await clearStoredCredentials()
        setPassword('')
      }
    } catch (err: any) {
      const message = err?.message || 'Credenciales inválidas.'
      setError(message)

      if (!options?.silent) {
        Alert.alert('Inicio de sesión', message)
      }
    } finally {
      setSubmitting(false)
    }
  }, [password, rememberCredentials, username])

  useEffect(() => {
    if (restoringCredentials) return
    if (hasTriedAutoLogin.current) return

    hasTriedAutoLogin.current = true

    if (!rememberCredentials) return
    if (!username.trim() || !password.trim()) return

    void handleLogin({ silent: true })
  }, [handleLogin, password, rememberCredentials, restoringCredentials, username])

  const handleRememberCredentials = useCallback(async (value: boolean) => {
    setRememberCredentials(value)

    if (!value) {
      await clearStoredCredentials()
    }
  }, [])

  const logout = () => {
    hasTriedAutoLogin.current = true
    setUser(null)
    setReservas([])
    setAprontes([])
    setSelectedItem(null)
    setActiveScreen('panel')
    setError('')
  }

  const handleUpdateEstado = async (kind: 'reserva' | 'apronte', item: Reserva | Apronte, estado: string) => {
    const key = `${kind}-${item.id}`
    setUpdatingKey(key)
    setError('')

    try {
      if (kind === 'reserva') {
        await cambiarEstadoReserva(item as Reserva, estado)
        setReservas((current) => current.map((r) => (r.id === item.id ? { ...r, estado } : r)))
      } else {
        await cambiarEstadoApronte(item as Apronte, estado)
        setAprontes((current) => current.map((a) => (a.id === item.id ? { ...a, estado } : a)))
      }

      setSelectedItem((current) => {
        if (!current) return current
        if (current.kind !== kind || current.item.id !== item.id) return current
        return { ...current, item: { ...current.item, estado } as any }
      })
    } catch (err: any) {
      const message = err?.message || 'No se pudo actualizar el estado.'
      setError(message)
      Alert.alert('Actualización fallida', message)
    } finally {
      setUpdatingKey('')
    }
  }

  if (!user) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: palette.background }]}> 
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <View style={styles.loginWrapper}>
          <View style={[styles.loginOrb, styles.loginOrbLeft, { backgroundColor: palette.primarySoft }]} />
          <View style={[styles.loginOrb, styles.loginOrbRight, { backgroundColor: palette.surfaceAlt }]} />

          <View style={[styles.loginCard, { backgroundColor: palette.surface, borderColor: palette.border }]}> 
            <Text style={[styles.kicker, { color: palette.primary }]}>reserveRosas mobile</Text>
            <Text style={[styles.appTitle, { color: palette.text }]}>Control diario de reservas y aprontes</Text>
            <Text style={[styles.appSubtitle, { color: palette.muted }]}>Ingresa para ver los movimientos del día y cambiar únicamente el estado.</Text>

            <TextInput
              autoCapitalize="none"
              placeholder="Usuario"
              placeholderTextColor={palette.muted}
              style={[styles.input, { color: palette.text, backgroundColor: palette.surfaceAlt, borderColor: palette.border }]}
              value={username}
              onChangeText={setUsername}
            />

            <TextInput
              secureTextEntry
              placeholder="Contraseña"
              placeholderTextColor={palette.muted}
              style={[styles.input, { color: palette.text, backgroundColor: palette.surfaceAlt, borderColor: palette.border }]}
              value={password}
              onChangeText={setPassword}
            />

            <View style={styles.rememberRow}>
              <View style={styles.rememberTextBox}>
                <Text style={[styles.rememberTitle, { color: palette.text }]}>Recordar credenciales</Text>
                <Text style={[styles.rememberHint, { color: palette.muted }]}>Guarda usuario y contraseña para iniciar automáticamente.</Text>
              </View>
              <Switch
                value={rememberCredentials}
                onValueChange={(value) => {
                  void handleRememberCredentials(value)
                }}
                thumbColor="#ffffff"
                trackColor={{ false: '#cbd5e1', true: palette.primary }}
              />
            </View>

            {error ? <Text style={[styles.errorText, { color: palette.danger }]}>{error}</Text> : null}

            <TouchableOpacity style={[styles.primaryButton, { backgroundColor: palette.primary }]} onPress={() => void handleLogin()} disabled={submitting || restoringCredentials}>
              <Text style={styles.primaryButtonText}>{submitting ? 'Ingresando...' : 'Iniciar sesión'}</Text>
            </TouchableOpacity>

            {restoringCredentials ? (
              <View style={styles.restoringBox}>
                <ActivityIndicator size="small" color={palette.primary} />
                <Text style={[styles.restoringText, { color: palette.muted }]}>Restaurando credenciales...</Text>
              </View>
            ) : null}

            <Text style={[styles.helperText, { color: palette.muted }]}>API embebida: {ENV.apiUrl}</Text>
            <Text style={[styles.helperText, { color: palette.muted }]}>Versiones: {updateStatus}</Text>
          </View>
        </View>
      </SafeAreaView>
    )
  }

  const renderPanel = () => (
    <>
      <View style={[styles.heroCard, { backgroundColor: palette.surface, borderColor: palette.border }]}> 
        <Text style={[styles.kicker, { color: palette.primary }]}>Agenda de hoy</Text>
        <Text style={[styles.heroTitle, { color: palette.text }]}>{formatPrettyDate(fechaHoy)}</Text>
        <Text style={[styles.heroSubtitle, { color: palette.muted }]}>Última sincronización: {lastSync || 'pendiente'}</Text>
        <Text style={[styles.heroSubtitle, { color: palette.muted }]}>Estado de versión: {updateStatus}</Text>

        <View style={styles.statsRow}>
          <StatCard label="Reservas" value={String(reservas.length)} palette={palette} />
          <StatCard label="Aprontes" value={String(aprontes.length)} palette={palette} />
        </View>
      </View>

      {error ? (
        <View style={[styles.banner, { backgroundColor: palette.dangerSoft, borderColor: palette.border }]}>
          <Text style={[styles.bannerText, { color: palette.danger }]}>{error}</Text>
        </View>
      ) : null}

      {loading ? (
        <View style={[styles.loaderBox, { backgroundColor: palette.surface, borderColor: palette.border }]}> 
          <ActivityIndicator size="large" color={palette.primary} />
          <Text style={[styles.loaderText, { color: palette.muted }]}>Cargando datos del día...</Text>
        </View>
      ) : (
        <>
          <View style={styles.sectionBlock}>
            <View style={styles.sectionHead}>
              <Text style={[styles.sectionTitle, { color: palette.text }]}>Reservas del día</Text>
              <Text style={[styles.sectionHint, { color: palette.muted }]}>Toca una reserva para ver el detalle</Text>
            </View>

            {reservas.length === 0 ? (
              <View style={[styles.emptyCard, { backgroundColor: palette.surface, borderColor: palette.border }]}> 
                <Text style={[styles.emptyTitle, { color: palette.text }]}>Sin reservas hoy</Text>
                <Text style={[styles.emptyText, { color: palette.muted }]}>No hay reservas registradas para la fecha actual.</Text>
              </View>
            ) : (
              reservas.map((reserva) => {
                const badge = getStatusColors(reserva.estado, isDark)
                return (
                  <TouchableOpacity
                    key={reserva.id}
                    style={[styles.itemCard, { backgroundColor: palette.surface, borderColor: palette.border }]}
                    onPress={() => setSelectedItem({ kind: 'reserva', item: reserva })}
                  >
                    <View style={styles.itemHeader}>
                      <View style={[styles.timeChip, { backgroundColor: palette.surfaceAlt }]}> 
                        <Text style={[styles.timeChipText, { color: palette.primary }]}>{displayText(reserva.hora)}</Text>
                      </View>

                      <View style={[styles.statusChip, { backgroundColor: badge.backgroundColor }]}> 
                        <Text style={[styles.statusChipText, { color: badge.color }]}>{displayStatus(reserva.estado)}</Text>
                      </View>
                    </View>

                    <Text style={[styles.itemTitle, { color: palette.text }]}>{displayText(reserva.nombre)}</Text>
                    <Text style={[styles.itemMeta, { color: palette.muted }]}>{buildReservaType(reserva)}</Text>
                    <Text style={[styles.itemMeta, { color: palette.muted }]}>Vehículo: {displayText(`${reserva.marca || ''} ${reserva.modelo || ''}`)}</Text>
                    <Text style={[styles.itemFoot, { color: palette.accent }]}>Ver detalle</Text>
                  </TouchableOpacity>
                )
              })
            )}
          </View>

          <View style={styles.sectionBlock}>
            <View style={styles.sectionHead}>
              <Text style={[styles.sectionTitle, { color: palette.text }]}>Aprontes del día</Text>
              <Text style={[styles.sectionHint, { color: palette.muted }]}>Toca un apronte para ver el detalle</Text>
            </View>

            {aprontes.length === 0 ? (
              <View style={[styles.emptyCard, { backgroundColor: palette.surface, borderColor: palette.border }]}> 
                <Text style={[styles.emptyTitle, { color: palette.text }]}>Sin aprontes hoy</Text>
                <Text style={[styles.emptyText, { color: palette.muted }]}>No hay aprontes cargados para esta fecha.</Text>
              </View>
            ) : (
              aprontes.map((apronte) => {
                const badge = getStatusColors(apronte.estado, isDark)
                return (
                  <TouchableOpacity
                    key={apronte.id}
                    style={[styles.itemCard, { backgroundColor: palette.surface, borderColor: palette.border }]}
                    onPress={() => setSelectedItem({ kind: 'apronte', item: apronte })}
                  >
                    <View style={styles.itemHeader}>
                      <View style={[styles.timeChip, { backgroundColor: palette.surfaceAlt }]}> 
                        <Text style={[styles.timeChipText, { color: palette.primary }]}>{displayText(apronte.hora)}</Text>
                      </View>

                      <View style={[styles.statusChip, { backgroundColor: badge.backgroundColor }]}> 
                        <Text style={[styles.statusChipText, { color: badge.color }]}>{displayStatus(apronte.estado)}</Text>
                      </View>
                    </View>

                    <Text style={[styles.itemTitle, { color: palette.text }]}>{displayText(apronte.nombre)}</Text>
                    <Text style={[styles.itemMeta, { color: palette.muted }]}>Factura: {displayText(apronte.factura)}</Text>
                    <Text style={[styles.itemMeta, { color: palette.muted }]}>Vehículo: {displayText(`${apronte.marca || ''} ${apronte.modelo || ''}`)}</Text>
                    <Text style={[styles.itemFoot, { color: palette.accent }]}>Ver detalle</Text>
                  </TouchableOpacity>
                )
              })
            )}
          </View>
        </>
      )}
    </>
  )

  const renderSettings = () => (
    <>
      <View style={[styles.settingsCard, { backgroundColor: palette.surface, borderColor: palette.border }]}> 
        <Text style={[styles.sectionTitle, { color: palette.text }]}>Ajustes visuales</Text>
        <Text style={[styles.sectionHint, { color: palette.muted }]}>Elige entre modo claro y modo oscuro.</Text>

        <View style={[styles.settingRow, { borderColor: palette.border }]}> 
          <View style={{ flex: 1 }}>
            <Text style={[styles.settingTitle, { color: palette.text }]}>Modo oscuro</Text>
            <Text style={[styles.settingDesc, { color: palette.muted }]}>Activa una interfaz más cómoda para poca luz.</Text>
          </View>
          <Switch
            value={isDark}
            onValueChange={(value) => setThemeMode(value ? 'dark' : 'light')}
            thumbColor="#ffffff"
            trackColor={{ false: '#cbd5e1', true: palette.primary }}
          />
        </View>

        <View style={styles.themeButtonsRow}>
          <TouchableOpacity
            style={[
              styles.themeChoice,
              { borderColor: palette.border, backgroundColor: !isDark ? palette.primarySoft : palette.surfaceAlt },
            ]}
            onPress={() => setThemeMode('light')}
          >
            <Text style={[styles.themeChoiceText, { color: palette.text }]}>Claro</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.themeChoice,
              { borderColor: palette.border, backgroundColor: isDark ? palette.primarySoft : palette.surfaceAlt },
            ]}
            onPress={() => setThemeMode('dark')}
          >
            <Text style={[styles.themeChoiceText, { color: palette.text }]}>Oscuro</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={[styles.settingsCard, { backgroundColor: palette.surface, borderColor: palette.border }]}> 
        <Text style={[styles.sectionTitle, { color: palette.text }]}>Conexión</Text>
        <DetailField label="API" value={ENV.apiUrl} palette={palette} />
        <DetailField label="Token embebido" value="Sí" palette={palette} />
      </View>

      <View style={[styles.settingsCard, { backgroundColor: palette.surface, borderColor: palette.border }]}> 
        <Text style={[styles.sectionTitle, { color: palette.text }]}>Actualizaciones OTA</Text>
        <DetailField label="Estado" value={updateStatus} palette={palette} />
        <DetailField label="Diagnóstico" value={updateDebug} palette={palette} />
        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: palette.primary, marginTop: 10 }]}
          onPress={() => {
            void buscarActualizacion({ manual: true })
          }}
          disabled={checkingUpdate}
        >
          <Text style={styles.primaryButtonText}>{checkingUpdate ? 'Verificando...' : 'Buscar actualización ahora'}</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.settingsCard, { backgroundColor: palette.surface, borderColor: palette.border }]}> 
        <Text style={[styles.sectionTitle, { color: palette.text }]}>Cuenta activa</Text>
        <DetailField label="Nombre" value={user.nombre} palette={palette} />
        <DetailField label="Usuario" value={user.username} palette={palette} />
        <DetailField label="Rol" value={user.role} palette={palette} />
      </View>
    </>
  )

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: palette.background }]}> 
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          activeScreen === 'panel' ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => cargarPanel(true)}
              tintColor={palette.primary}
              colors={[palette.primary]}
            />
          ) : undefined
        }
      >
        <View style={[styles.topCard, { backgroundColor: palette.surface, borderColor: palette.border }]}> 
          <View style={styles.topRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.kicker, { color: palette.primary }]}>Hola, {user.nombre}</Text>
              <Text style={[styles.topCardTitle, { color: palette.text }]}>ReserveRosas Mobile</Text>
            </View>

            <TouchableOpacity style={[styles.logoutButton, { backgroundColor: palette.surfaceAlt }]} onPress={logout}>
              <Text style={[styles.logoutText, { color: palette.text }]}>Salir</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.segmentedRow}>
            <TouchableOpacity
              style={[
                styles.segmentButton,
                { borderColor: palette.border, backgroundColor: activeScreen === 'panel' ? palette.primary : palette.surfaceAlt },
              ]}
              onPress={() => setActiveScreen('panel')}
            >
              <Text style={[styles.segmentText, { color: activeScreen === 'panel' ? '#ffffff' : palette.text }]}>Panel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.segmentButton,
                { borderColor: palette.border, backgroundColor: activeScreen === 'ajustes' ? palette.primary : palette.surfaceAlt },
              ]}
              onPress={() => setActiveScreen('ajustes')}
            >
              <Text style={[styles.segmentText, { color: activeScreen === 'ajustes' ? '#ffffff' : palette.text }]}>Ajustes</Text>
            </TouchableOpacity>
          </View>
        </View>

        {activeScreen === 'panel' ? renderPanel() : renderSettings()}
      </ScrollView>

      <Modal visible={!!selectedItem} transparent animationType="slide" onRequestClose={() => setSelectedItem(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: palette.surface, borderColor: palette.border }]}> 
            {selectedItem ? (
              <>
                <View style={[styles.modalHeader, { borderColor: palette.border }]}> 
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.kicker, { color: palette.primary }]}>Detalle</Text>
                    <Text style={[styles.modalTitle, { color: palette.text }]}>
                      {selectedItem.kind === 'reserva' ? displayText(selectedItem.item.nombre) : displayText(selectedItem.item.nombre)}
                    </Text>
                    <Text style={[styles.modalSubtitle, { color: palette.muted }]}>Solo el estado es editable.</Text>
                  </View>

                  <TouchableOpacity style={[styles.closeButton, { backgroundColor: palette.surfaceAlt }]} onPress={() => setSelectedItem(null)}>
                    <Text style={[styles.closeButtonText, { color: palette.text }]}>Cerrar</Text>
                  </TouchableOpacity>
                </View>

                <ScrollView contentContainerStyle={styles.modalBody}>
                  <View style={styles.detailGrid}>
                    {selectedItem.kind === 'reserva' ? (
                      <>
                        <DetailField label="Fecha" value={selectedItem.item.fecha} palette={palette} />
                        <DetailField label="Hora" value={selectedItem.item.hora} palette={palette} />
                        <DetailField label="Cédula" value={selectedItem.item.cedula} palette={palette} />
                        <DetailField label="Teléfono" value={selectedItem.item.telefono} palette={palette} />
                        <DetailField label="Marca" value={selectedItem.item.marca} palette={palette} />
                        <DetailField label="Modelo" value={selectedItem.item.modelo} palette={palette} />
                        <DetailField label="Matrícula" value={selectedItem.item.matricula} palette={palette} />
                        <DetailField label="Tipo" value={buildReservaType(selectedItem.item)} palette={palette} />
                        <DetailField label="Detalles" value={selectedItem.item.detalles} palette={palette} />
                        <DetailField label="Estado actual" value={displayStatus(selectedItem.item.estado)} palette={palette} />
                      </>
                    ) : (
                      <>
                        <DetailField label="Fecha" value={selectedItem.item.fecha} palette={palette} />
                        <DetailField label="Hora" value={selectedItem.item.hora} palette={palette} />
                        <DetailField label="Teléfono" value={selectedItem.item.telefono} palette={palette} />
                        <DetailField label="Localidad" value={selectedItem.item.localidad} palette={palette} />
                        <DetailField label="Marca" value={selectedItem.item.marca} palette={palette} />
                        <DetailField label="Modelo" value={selectedItem.item.modelo} palette={palette} />
                        <DetailField label="Factura" value={selectedItem.item.factura} palette={palette} />
                        <DetailField label="Observaciones" value={selectedItem.item.observaciones} palette={palette} />
                        <DetailField label="Repuestos garantía" value={selectedItem.item.repuestos_garantia} palette={palette} />
                        <DetailField label="Estado actual" value={displayStatus(selectedItem.item.estado)} palette={palette} />
                      </>
                    )}
                  </View>

                  <View style={styles.statusSection}>
                    <Text style={[styles.sectionTitle, { color: palette.text }]}>Cambiar estado</Text>
                    <View style={styles.statusButtonsWrap}>
                      {(selectedItem.kind === 'reserva' ? RESERVA_ESTADOS : APRONTE_ESTADOS).map((estado) => {
                        const active = String(selectedItem.item.estado || '').toUpperCase() === estado
                        const currentKey = `${selectedItem.kind}-${selectedItem.item.id}`
                        return (
                          <TouchableOpacity
                            key={estado}
                            style={[
                              styles.statusAction,
                              {
                                borderColor: palette.border,
                                backgroundColor: active ? palette.primary : palette.surfaceAlt,
                              },
                            ]}
                            disabled={updatingKey === currentKey}
                            onPress={() => handleUpdateEstado(selectedItem.kind, selectedItem.item as any, estado)}
                          >
                            <Text style={[styles.statusActionText, { color: active ? '#ffffff' : palette.text }]}>
                              {updatingKey === currentKey && active ? 'Guardando...' : estado}
                            </Text>
                          </TouchableOpacity>
                        )
                      })}
                    </View>
                  </View>
                </ScrollView>
              </>
            ) : null}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 28,
  },
  loginWrapper: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  loginOrb: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 999,
    opacity: 0.7,
  },
  loginOrbLeft: {
    top: 60,
    left: -30,
  },
  loginOrbRight: {
    bottom: 80,
    right: -20,
  },
  loginCard: {
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 6,
  },
  kicker: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  appTitle: {
    fontSize: 28,
    fontWeight: '900',
    lineHeight: 34,
    marginBottom: 8,
  },
  appSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 18,
  },
  input: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 12,
  },
  rememberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: -2,
    marginBottom: 10,
  },
  rememberTextBox: {
    flex: 1,
    paddingRight: 10,
  },
  rememberTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  rememberHint: {
    fontSize: 11,
    marginTop: 2,
  },
  primaryButton: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },
  helperText: {
    marginTop: 12,
    fontSize: 12,
    textAlign: 'center',
  },
  restoringBox: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
  },
  restoringText: {
    marginLeft: 8,
    fontSize: 12,
  },
  errorText: {
    marginBottom: 10,
    fontWeight: '700',
  },
  topCard: {
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    marginBottom: 14,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  topCardTitle: {
    fontSize: 22,
    fontWeight: '900',
  },
  logoutButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  logoutText: {
    fontWeight: '800',
  },
  segmentedRow: {
    flexDirection: 'row',
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    marginRight: 8,
  },
  segmentText: {
    fontWeight: '800',
  },
  heroCard: {
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    marginBottom: 14,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '900',
    marginBottom: 4,
    textTransform: 'capitalize',
  },
  heroSubtitle: {
    fontSize: 13,
  },
  statsRow: {
    flexDirection: 'row',
    marginTop: 14,
  },
  statCard: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    marginRight: 10,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '900',
  },
  statLabel: {
    fontSize: 12,
    marginTop: 2,
  },
  banner: {
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 14,
  },
  bannerText: {
    fontWeight: '700',
  },
  sectionBlock: {
    marginBottom: 18,
  },
  sectionHead: {
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '900',
    marginBottom: 2,
  },
  sectionHint: {
    fontSize: 12,
  },
  itemCard: {
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    marginBottom: 10,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  timeChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  timeChipText: {
    fontSize: 12,
    fontWeight: '800',
  },
  statusChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  statusChipText: {
    fontSize: 11,
    fontWeight: '900',
  },
  itemTitle: {
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 4,
  },
  itemMeta: {
    fontSize: 13,
    marginBottom: 2,
  },
  itemFoot: {
    marginTop: 8,
    fontWeight: '800',
    fontSize: 12,
  },
  loaderBox: {
    borderRadius: 18,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
  },
  loaderText: {
    marginTop: 10,
  },
  emptyCard: {
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 4,
  },
  emptyText: {
    fontSize: 13,
    lineHeight: 19,
  },
  settingsCard: {
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    marginBottom: 14,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    marginTop: 6,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 2,
  },
  settingDesc: {
    fontSize: 12,
  },
  themeButtonsRow: {
    flexDirection: 'row',
    marginTop: 12,
  },
  themeChoice: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 12,
    alignItems: 'center',
    marginRight: 10,
  },
  themeChoiceText: {
    fontWeight: '800',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    maxHeight: '88%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 18,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '900',
  },
  modalSubtitle: {
    fontSize: 12,
    marginTop: 4,
  },
  closeButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  closeButtonText: {
    fontWeight: '800',
  },
  modalBody: {
    padding: 16,
    paddingBottom: 28,
  },
  detailGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  detailField: {
    width: '48%',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  detailLabel: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '700',
  },
  statusSection: {
    marginTop: 10,
  },
  statusButtonsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
  },
  statusAction: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 9,
    marginRight: 8,
    marginBottom: 8,
  },
  statusActionText: {
    fontSize: 12,
    fontWeight: '800',
  },
})