"use client"

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Building2, CalendarDays, ChevronLeft, ChevronRight, ImageIcon, Loader2, MapPinned, MoreHorizontal, Pencil, Phone, Plus, RefreshCcw, Scissors, Trash2, Upload, Users } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import type { AdminSedeSummary } from "@/lib/admin"
import { formatNumber } from "@/lib/formatters"

type SedesResponse = {
  sedes?: AdminSedeSummary[]
  error?: string
}

type SedeResponse = {
  sede?: AdminSedeSummary
  error?: string
}

type SedeMapPoint = {
  latitude: number
  longitude: number
}

const DEFAULT_MAP_CENTER: [number, number] = [4.5709, -74.2973]
const DEFAULT_MAP_ZOOM = 6
const MAX_SEDE_PHOTOS = 5

declare global {
  interface Window {
    google?: {
      maps?: {
        Map: new (container: HTMLElement, options?: Record<string, unknown>) => {
          setCenter: (latLng: { lat: number; lng: number }) => void
          setZoom: (zoom: number) => void
          getZoom: () => number
          addListener: (eventName: string, handler: (event: unknown) => void) => { remove: () => void }
        }
        Marker: new (options?: {
          map?: unknown
          position?: { lat: number; lng: number }
          draggable?: boolean
        }) => {
          setMap: (map: unknown | null) => void
          setPosition: (position: { lat: number; lng: number }) => void
          addListener: (eventName: string, handler: (event: unknown) => void) => { remove: () => void }
        }
        Geocoder: new () => {
          geocode: (
            request: { address: string },
            callback: (
              results: Array<{ geometry?: { location?: { lat: () => number; lng: () => number } } }> | null,
              status: string,
            ) => void,
          ) => void
        }
      }
    }
  }
}

let googleMapsScriptPromise: Promise<void> | null = null

function ensureGoogleMapsScript(apiKey: string): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("WINDOW_NOT_AVAILABLE"))
  }

  if (window.google?.maps) {
    return Promise.resolve()
  }

  if (googleMapsScriptPromise) {
    return googleMapsScriptPromise
  }

  googleMapsScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById("google-maps-js-api") as HTMLScriptElement | null

    const handleLoaded = () => {
      if (window.google?.maps) {
        resolve()
      } else {
        googleMapsScriptPromise = null
        reject(new Error("GOOGLE_MAPS_LOAD_FAILED"))
      }
    }

    const handleError = () => {
      googleMapsScriptPromise = null
      reject(new Error("GOOGLE_MAPS_SCRIPT_ERROR"))
    }

    if (existing) {
      existing.addEventListener("load", handleLoaded, { once: true })
      existing.addEventListener("error", handleError, { once: true })

      if (window.google?.maps) {
        resolve()
      }

      return
    }

    const script = document.createElement("script")
    script.id = "google-maps-js-api"
    script.async = true
    script.defer = true
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly`
    script.addEventListener("load", handleLoaded, { once: true })
    script.addEventListener("error", handleError, { once: true })
    document.head.appendChild(script)
  })

  return googleMapsScriptPromise
}

function sortSedes(list: AdminSedeSummary[]): AdminSedeSummary[] {
  return [...list].sort((a, b) => {
    if (a.active !== b.active) {
      return a.active ? -1 : 1
    }

    return a.name.localeCompare(b.name, "es", { sensitivity: "base" })
  })
}

function buildTenantHeaders(): HeadersInit {
  if (typeof window === "undefined") {
    return {}
  }

  const headers: Record<string, string> = {}
  const tenant = (localStorage.getItem("tenantSchema") ?? localStorage.getItem("userTenant") ?? "").trim()
  const userEmail = (localStorage.getItem("userEmail") ?? "").trim().toLowerCase()

  if (tenant) {
    headers["x-tenant"] = tenant
  }

  if (userEmail) {
    headers["x-user-email"] = userEmail
  }

  return headers
}

function roundCoordinate(value: number): number {
  return Number(value.toFixed(6))
}

function buildGoogleMapsUrl(sede: AdminSedeSummary): string | null {
  if (sede.latitude != null && sede.longitude != null) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${sede.latitude},${sede.longitude}`)}`
  }

  const query = [sede.address, sede.city].filter((item): item is string => Boolean(item && item.trim())).join(", ")
  if (!query) {
    return null
  }

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}

function buildGoogleMapsUrlFromForm(point: SedeMapPoint | null, address: string, city: string): string | null {
  if (point) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${point.latitude},${point.longitude}`)}`
  }

  const query = [address.trim(), city.trim()].filter((item) => item.length > 0).join(", ")
  if (!query) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${DEFAULT_MAP_CENTER[0]},${DEFAULT_MAP_CENTER[1]}`)}`
  }

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}

function buildGoogleMapsEmbedUrlFromForm(point: SedeMapPoint | null, address: string, city: string): string | null {
  if (point) {
    return `https://www.google.com/maps?q=${encodeURIComponent(`${point.latitude},${point.longitude}`)}&output=embed`
  }

  const query = [address.trim(), city.trim()].filter((item) => item.length > 0).join(", ")
  if (!query) {
    return `https://www.google.com/maps?q=${encodeURIComponent(`${DEFAULT_MAP_CENTER[0]},${DEFAULT_MAP_CENTER[1]}`)}&output=embed`
  }

  return `https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed`
}

function normalizeSedePhotoUrlEntry(entry: string): string | null {
  const raw = entry.trim()
  if (!raw) {
    return null
  }

  const pathOnly = raw.split("?")[0]?.split("#")[0] ?? raw
  const isLocalUploadPath =
    pathOnly.startsWith("/uploads/sedes/") &&
    !pathOnly.includes("..") &&
    /\.(jpg|jpeg|png|webp|gif)$/i.test(pathOnly)

  if (isLocalUploadPath) {
    return raw
  }

  try {
    const parsed = new URL(raw)
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null
    }

    return parsed.toString()
  } catch {
    return null
  }
}

function parseSedePhotoUrlsInput(value: string): { photoUrls: string[]; invalidEntries: string[] } {
  const entries = value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0)

  const unique = new Set<string>()
  const photoUrls: string[] = []
  const invalidEntries: string[] = []

  for (const entry of entries) {
    const normalized = normalizeSedePhotoUrlEntry(entry)
    if (!normalized) {
      invalidEntries.push(entry)
      continue
    }

    if (unique.has(normalized)) {
      continue
    }

    unique.add(normalized)
    photoUrls.push(normalized)
  }

  return {
    photoUrls,
    invalidEntries,
  }
}

function resolveSedePhotoUrls(sede: AdminSedeSummary): string[] {
  return Array.isArray(sede.photoUrls) ? sede.photoUrls : []
}

export default function AdminSedesPage() {
  const { toast } = useToast()
  const googleMapsApiKey = (process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "").trim()
  const shouldUseGoogleMaps = googleMapsApiKey.length > 0

  const [sedes, setSedes] = useState<AdminSedeSummary[]>([])
  const [areSedesLoading, setAreSedesLoading] = useState(true)
  const [sedesError, setSedesError] = useState<string | null>(null)

  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingSede, setEditingSede] = useState<AdminSedeSummary | null>(null)

  const [formName, setFormName] = useState("")
  const [formAddress, setFormAddress] = useState("")
  const [formCity, setFormCity] = useState("")
  const [formMapPoint, setFormMapPoint] = useState<SedeMapPoint | null>(null)
  const [formPhone, setFormPhone] = useState("")
  const [formReference, setFormReference] = useState("")
  const [formPhotoUrlsInput, setFormPhotoUrlsInput] = useState("")
  const [formStatus, setFormStatus] = useState<"activo" | "inactivo">("activo")
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isUploadingPhotos, setIsUploadingPhotos] = useState(false)
  const [isFindingAddressOnMap, setIsFindingAddressOnMap] = useState(false)
  const [isInitializingMap, setIsInitializingMap] = useState(false)
  const [deletingSedeId, setDeletingSedeId] = useState<number | null>(null)

  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const photoUploadInputRef = useRef<HTMLInputElement | null>(null)

  const googleMapRef = useRef<{
    setCenter: (latLng: { lat: number; lng: number }) => void
    setZoom: (zoom: number) => void
    getZoom: () => number
    addListener: (eventName: string, handler: (event: unknown) => void) => { remove: () => void }
  } | null>(null)
  const googleMarkerRef = useRef<{
    setMap: (map: unknown | null) => void
    setPosition: (position: { lat: number; lng: number }) => void
    addListener: (eventName: string, handler: (event: unknown) => void) => { remove: () => void }
  } | null>(null)
  const googleMapClickListenerRef = useRef<{ remove: () => void } | null>(null)
  const googleMarkerDragListenerRef = useRef<{ remove: () => void } | null>(null)

  const resetForm = useCallback(() => {
    setEditingSede(null)
    setFormName("")
    setFormAddress("")
    setFormCity("")
    setFormMapPoint(null)
    setFormPhone("")
    setFormReference("")
    setFormPhotoUrlsInput("")
    setFormStatus("activo")
    setFormError(null)
    setIsUploadingPhotos(false)
    setIsFindingAddressOnMap(false)
  }, [])

  const loadSedes = useCallback(async (signal?: AbortSignal) => {
    setAreSedesLoading(true)
    setSedesError(null)

    try {
      const response = await fetch("/api/admin/sedes", {
        signal,
        cache: "no-store",
        headers: buildTenantHeaders(),
      })
      const data: SedesResponse = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(data.error ?? "No se pudieron cargar las sedes")
      }

      if (!signal?.aborted) {
        const list = Array.isArray(data.sedes) ? data.sedes : []
        setSedes(sortSedes(list))
      }
    } catch (error) {
      if (signal?.aborted) {
        return
      }

      console.error("Error fetching sedes", error)
      setSedesError("No se pudieron cargar las sedes.")
    } finally {
      if (!signal?.aborted) {
        setAreSedesLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void loadSedes(controller.signal)

    return () => controller.abort()
  }, [loadSedes])

  useEffect(() => {
    if (!isFormOpen) {
      resetForm()
      setIsSubmitting(false)
    }
  }, [isFormOpen, resetForm])

  const clearGoogleMapObjects = useCallback(() => {
    googleMapClickListenerRef.current?.remove()
    googleMapClickListenerRef.current = null

    googleMarkerDragListenerRef.current?.remove()
    googleMarkerDragListenerRef.current = null

    googleMarkerRef.current?.setMap(null)
    googleMarkerRef.current = null
    googleMapRef.current = null
  }, [])

  useEffect(() => {
    if (!isFormOpen) {
      clearGoogleMapObjects()
      setIsInitializingMap(false)

      return
    }

    if (!shouldUseGoogleMaps) {
      clearGoogleMapObjects()
      setIsInitializingMap(false)
      return
    }

    let isDisposed = false

    const setupMap = async () => {
      setIsInitializingMap(true)

      try {
        await ensureGoogleMapsScript(googleMapsApiKey)

        if (isDisposed || !mapContainerRef.current || !window.google?.maps) {
          return
        }

        const googleMaps = window.google.maps
        const center = formMapPoint
          ? { lat: formMapPoint.latitude, lng: formMapPoint.longitude }
          : { lat: DEFAULT_MAP_CENTER[0], lng: DEFAULT_MAP_CENTER[1] }

        const map = new googleMaps.Map(mapContainerRef.current, {
          center,
          zoom: formMapPoint ? 16 : DEFAULT_MAP_ZOOM,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
        })

        googleMapRef.current = map
        googleMapClickListenerRef.current = map.addListener("click", (event: unknown) => {
          const latLng = event as { latLng?: { lat: () => number; lng: () => number } }

          if (!latLng?.latLng) {
            return
          }

          setFormMapPoint({
            latitude: roundCoordinate(latLng.latLng.lat()),
            longitude: roundCoordinate(latLng.latLng.lng()),
          })
        })
      } catch (error) {
        console.error("Error loading Google Maps selector", error)
        setFormError("No se pudo cargar Google Maps para seleccionar la ubicacion.")
      } finally {
        setIsInitializingMap(false)
      }
    }

    void setupMap()

    return () => {
      isDisposed = true
    }
  }, [clearGoogleMapObjects, googleMapsApiKey, isFormOpen, shouldUseGoogleMaps])

  useEffect(() => {
    return () => {
      clearGoogleMapObjects()
    }
  }, [clearGoogleMapObjects])

  useEffect(() => {
    if (!isFormOpen) {
      return
    }

    if (!shouldUseGoogleMaps) {
      return
    }

    const map = googleMapRef.current
    const googleMaps = window.google?.maps
    if (!map || !googleMaps) {
      return
    }

    if (!formMapPoint) {
      googleMarkerDragListenerRef.current?.remove()
      googleMarkerDragListenerRef.current = null

      googleMarkerRef.current?.setMap(null)
      googleMarkerRef.current = null
      return
    }

    const position = { lat: formMapPoint.latitude, lng: formMapPoint.longitude }

    if (!googleMarkerRef.current) {
      const marker = new googleMaps.Marker({
        map,
        position,
        draggable: true,
      })

      googleMarkerRef.current = marker
      googleMarkerDragListenerRef.current = marker.addListener("dragend", (event: unknown) => {
        const dragEvent = event as { latLng?: { lat: () => number; lng: () => number } }

        if (!dragEvent?.latLng) {
          return
        }

        setFormMapPoint({
          latitude: roundCoordinate(dragEvent.latLng.lat()),
          longitude: roundCoordinate(dragEvent.latLng.lng()),
        })
      })
    } else {
      googleMarkerRef.current.setPosition(position)
    }

    map.setCenter(position)
    if (map.getZoom() < 16) {
      map.setZoom(16)
    }
  }, [formMapPoint, isFormOpen, shouldUseGoogleMaps])

  const handleFindAddressOnMap = useCallback(async () => {
    const query = [formAddress.trim(), formCity.trim()].filter((value) => value.length > 0).join(", ")

    if (!query) {
      setFormError("Escribe dirección o ciudad para ubicar la sede en el mapa.")
      return
    }

    setFormError(null)
    setIsFindingAddressOnMap(true)

    try {
      if (shouldUseGoogleMaps) {
        await ensureGoogleMapsScript(googleMapsApiKey)

        const googleMaps = window.google?.maps
        if (!googleMaps) {
          setFormError("No se pudo cargar Google Maps para buscar la dirección.")
          return
        }

        const geocoder = new googleMaps.Geocoder()

        const { latitude, longitude } = await new Promise<{ latitude: number; longitude: number }>((resolve, reject) => {
          geocoder.geocode({ address: query }, (results, status) => {
            if (status !== "OK") {
              reject(new Error(`GEOCODER_STATUS_${status}`))
              return
            }

            const location = results?.[0]?.geometry?.location
            if (!location) {
              reject(new Error("GEOCODER_NO_RESULT"))
              return
            }

            resolve({
              latitude: location.lat(),
              longitude: location.lng(),
            })
          })
        })

        setFormMapPoint({
          latitude: roundCoordinate(latitude),
          longitude: roundCoordinate(longitude),
        })

        return
      }

      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`,
        {
          method: "GET",
          headers: {
            Accept: "application/json",
          },
        },
      )

      const results = (await response.json().catch(() => [])) as Array<{ lat?: string; lon?: string }>

      const first = Array.isArray(results) ? results[0] : null
      const latitude = first?.lat ? Number(first.lat) : NaN
      const longitude = first?.lon ? Number(first.lon) : NaN

      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        setFormError("No se encontró una ubicación exacta. Marca el punto manualmente en el mapa.")
        return
      }

      setFormMapPoint({
        latitude: roundCoordinate(latitude),
        longitude: roundCoordinate(longitude),
      })
    } catch (error) {
      console.error("Error finding address on map", error)
      setFormError(
        shouldUseGoogleMaps
          ? "No se pudo ubicar la dirección con Google Maps. Ajusta el punto manualmente en el mapa."
          : "No se pudo buscar la dirección en el mapa. Intenta de nuevo.",
      )
    } finally {
      setIsFindingAddressOnMap(false)
    }
  }, [formAddress, formCity, googleMapsApiKey, shouldUseGoogleMaps])

  const handlePhotoFilesUpload = useCallback(
    async (fileList: FileList | null) => {
      const selectedFiles = Array.from(fileList ?? []).filter((file) => file.size > 0)
      if (selectedFiles.length === 0) {
        return
      }

      const currentPhotos = parseSedePhotoUrlsInput(formPhotoUrlsInput)
      if (currentPhotos.invalidEntries.length > 0) {
        setFormError("Corrige primero las URLs inválidas en fotos para poder subir nuevos archivos.")
        return
      }

      const remainingSlots = Math.max(0, MAX_SEDE_PHOTOS - currentPhotos.photoUrls.length)
      if (remainingSlots === 0) {
        setFormError(`Ya alcanzaste el máximo de ${MAX_SEDE_PHOTOS} fotos por sede.`)
        return
      }

      const filesToUpload = selectedFiles.slice(0, remainingSlots)

      setIsUploadingPhotos(true)
      setFormError(null)

      try {
        const formData = new FormData()
        for (const file of filesToUpload) {
          formData.append("files", file)
        }

        const response = await fetch("/api/admin/sedes/upload", {
          method: "POST",
          headers: buildTenantHeaders(),
          body: formData,
        })

        const payload = (await response.json().catch(() => ({}))) as { urls?: string[]; error?: string }

        if (!response.ok) {
          setFormError(payload.error ?? "No se pudieron subir las fotos.")
          return
        }

        const uploadedUrls = Array.isArray(payload.urls) ? payload.urls.filter((item) => typeof item === "string") : []
        if (uploadedUrls.length === 0) {
          setFormError("No se recibieron URLs de fotos después de subir archivos.")
          return
        }

        const nextUrls = Array.from(new Set([...currentPhotos.photoUrls, ...uploadedUrls])).slice(0, MAX_SEDE_PHOTOS)
        setFormPhotoUrlsInput(nextUrls.join("\n"))

        toast({
          title: "Fotos cargadas",
          description: `${uploadedUrls.length} imagen${uploadedUrls.length === 1 ? "" : "es"} agregada${uploadedUrls.length === 1 ? "" : "s"} a la sede.`,
        })

        if (selectedFiles.length > filesToUpload.length) {
          setFormError(`Solo se subieron ${filesToUpload.length} imagenes por el límite de ${MAX_SEDE_PHOTOS} fotos.`)
        }
      } catch (error) {
        console.error("Error uploading sede photos", error)
        setFormError(error instanceof Error ? error.message : "No se pudieron subir las fotos.")
      } finally {
        setIsUploadingPhotos(false)
        if (photoUploadInputRef.current) {
          photoUploadInputRef.current.value = ""
        }
      }
    },
    [formPhotoUrlsInput, toast],
  )

  const handleRemovePhotoFromForm = useCallback(
    (photoUrl: string) => {
      const currentPhotos = parseSedePhotoUrlsInput(formPhotoUrlsInput)
      const nextUrls = currentPhotos.photoUrls.filter((item) => item !== photoUrl)
      setFormPhotoUrlsInput(nextUrls.join("\n"))
      setFormError(null)
    },
    [formPhotoUrlsInput],
  )

  const metrics = useMemo(() => {
    const totals = {
      active: 0,
      inactive: 0,
      withGeo: 0,
      upcomingAppointments: 0,
    }

    for (const sede of sedes) {
      if (sede.active) {
        totals.active += 1
      } else {
        totals.inactive += 1
      }

      if (sede.latitude != null && sede.longitude != null) {
        totals.withGeo += 1
      }

      totals.upcomingAppointments += sede.upcomingAppointments
    }

    return totals
  }, [sedes])

  const shouldShowErrorCard = Boolean(sedesError) && !areSedesLoading && sedes.length === 0

  const formGoogleMapsUrl = useMemo(
    () => buildGoogleMapsUrlFromForm(formMapPoint, formAddress, formCity),
    [formAddress, formCity, formMapPoint],
  )

  const formGoogleMapsEmbedUrl = useMemo(
    () => buildGoogleMapsEmbedUrlFromForm(formMapPoint, formAddress, formCity),
    [formAddress, formCity, formMapPoint],
  )

  const formPhotoParseResult = useMemo(() => parseSedePhotoUrlsInput(formPhotoUrlsInput), [formPhotoUrlsInput])

  const formPhotoPreviewUrls = useMemo(
    () => formPhotoParseResult.photoUrls.slice(0, MAX_SEDE_PHOTOS),
    [formPhotoParseResult.photoUrls],
  )

  const handleReload = useCallback(() => {
    void loadSedes()
  }, [loadSedes])

  const openCreateForm = () => {
    resetForm()
    setIsFormOpen(true)
  }

  const openEditForm = (sede: AdminSedeSummary) => {
    setEditingSede(sede)
    setFormName(sede.name)
    setFormAddress(sede.address ?? "")
    setFormCity(sede.city ?? "")
    setFormMapPoint(
      typeof sede.latitude === "number" && typeof sede.longitude === "number"
        ? {
            latitude: roundCoordinate(sede.latitude),
            longitude: roundCoordinate(sede.longitude),
          }
        : null,
    )
    setFormPhone(sede.phone ?? "")
    setFormReference(sede.reference ?? "")
    setFormPhotoUrlsInput(resolveSedePhotoUrls(sede).join("\n"))
    setFormStatus(sede.active ? "activo" : "inactivo")
    setFormError(null)
    setIsFormOpen(true)
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormError(null)

    const name = formName.trim()
    const address = formAddress.trim()
    const city = formCity.trim()
    const phone = formPhone.trim()
    const reference = formReference.trim()
    const parsedPhotoUrls = formPhotoParseResult

    if (name.length < 2) {
      setFormError("Ingresa un nombre valido (minimo 2 caracteres).")
      return
    }

    if (phone && !/^[0-9+\-\s()]+$/.test(phone)) {
      setFormError("El telefono solo puede contener numeros, espacios y + - ().")
      return
    }

    if (parsedPhotoUrls.invalidEntries.length > 0) {
      setFormError("Una o más URLs de fotos no son válidas. Usa enlaces http(s) separados por coma o salto de línea.")
      return
    }

    if (parsedPhotoUrls.photoUrls.length > MAX_SEDE_PHOTOS) {
      setFormError(`Solo puedes guardar hasta ${MAX_SEDE_PHOTOS} fotos por sede.`)
      return
    }

    setIsSubmitting(true)

    try {
      const isEditing = Boolean(editingSede)
      const endpoint = isEditing ? `/api/admin/sedes/${editingSede!.id}` : "/api/admin/sedes"
      const method = isEditing ? "PATCH" : "POST"

      const response = await fetch(endpoint, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...buildTenantHeaders(),
        },
        body: JSON.stringify({
          name,
          address: address.length > 0 ? address : null,
          city: city.length > 0 ? city : null,
          latitude: formMapPoint?.latitude ?? null,
          longitude: formMapPoint?.longitude ?? null,
          phone: phone.length > 0 ? phone : null,
          reference: reference.length > 0 ? reference : null,
          photoUrls: parsedPhotoUrls.photoUrls,
          active: formStatus === "activo",
        }),
      })

      const data: SedeResponse = await response.json().catch(() => ({} as SedeResponse))

      if (!response.ok || !data.sede) {
        setFormError(data.error ?? "No se pudo guardar la sede.")
        return
      }

      setSedes((previous) => {
        const next = previous.filter((item) => item.id !== data.sede!.id)
        next.push(data.sede!)
        return sortSedes(next)
      })

      setSedesError(null)
      setIsFormOpen(false)

      toast({
        title: isEditing ? "Sede actualizada" : "Sede creada",
        description: `${data.sede.name} ya esta disponible para reservas.`,
      })
    } catch (error) {
      console.error("Error saving sede", error)
      setFormError("Error de conexion con el servidor.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async (sede: AdminSedeSummary) => {
    const confirmed = window.confirm(`Deseas eliminar la sede \"${sede.name}\"? Esta accion no se puede deshacer.`)
    if (!confirmed) {
      return
    }

    setDeletingSedeId(sede.id)

    try {
      const response = await fetch(`/api/admin/sedes/${sede.id}`, {
        method: "DELETE",
        headers: buildTenantHeaders(),
      })

      const data = (await response.json().catch(() => ({}))) as { error?: string }

      if (!response.ok) {
        toast({
          title: "No se pudo eliminar",
          description: data.error ?? "La sede no pudo eliminarse.",
          variant: "destructive",
        })
        return
      }

      setSedes((previous) => previous.filter((item) => item.id !== sede.id))
      toast({
        title: "Sede eliminada",
        description: `${sede.name} fue eliminada del panel administrativo.`,
      })
    } catch (error) {
      console.error("Error deleting sede", error)
      toast({
        title: "Error de conexion",
        description: "No fue posible eliminar la sede.",
        variant: "destructive",
      })
    } finally {
      setDeletingSedeId(null)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto space-y-8 px-4 py-8">
        <section className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-2 xl:grid-cols-4">
          <CompactMetricCard title="Sedes totales" value={formatNumber(sedes.length)} />
          <CompactMetricCard title="Sedes activas" value={formatNumber(metrics.active)} />
          <CompactMetricCard title="Con geolocalizacion" value={formatNumber(metrics.withGeo)} className="col-span-2 xl:col-span-1" />
          <CompactMetricCard
            title="Proximas citas"
            value={formatNumber(metrics.upcomingAppointments)}
            className="col-span-2 xl:col-span-1"
          />
        </section>

        <section className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <h2 className="text-2xl font-semibold">Configuracion de sedes</h2>
              <p className="text-muted-foreground">
                Crea y administra las sedes donde atiende tu equipo.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={handleReload} disabled={areSedesLoading}>
                <RefreshCcw className="mr-2 h-4 w-4" />
                Recargar
              </Button>
              <Sheet open={isFormOpen} onOpenChange={setIsFormOpen}>
                <SheetTrigger asChild>
                  <Button onClick={openCreateForm}>
                    <Plus className="mr-2 h-4 w-4" />
                    Nueva sede
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="p-0 sm:max-w-md lg:max-w-lg">
                  <form onSubmit={handleSubmit} className="flex h-full flex-col">
                    <SheetHeader className="border-b px-6 py-4 text-left">
                      <SheetTitle>{editingSede ? "Editar sede" : "Crear nueva sede"}</SheetTitle>
                      <SheetDescription>
                        Define informacion de ubicacion, contacto y estado.
                      </SheetDescription>
                    </SheetHeader>

                    <div className="flex-1 overflow-y-auto px-6 py-4">
                      <FieldGroup>
                        <Field>
                          <FieldLabel htmlFor="sede-name">Nombre</FieldLabel>
                          <Input
                            id="sede-name"
                            value={formName}
                            onChange={(event) => {
                              setFormName(event.target.value)
                              setFormError(null)
                            }}
                            placeholder="Ej. Sede Centro"
                            required
                          />
                        </Field>

                        <Field>
                          <FieldLabel htmlFor="sede-address">Direccion</FieldLabel>
                          <Input
                            id="sede-address"
                            value={formAddress}
                            onChange={(event) => {
                              setFormAddress(event.target.value)
                              setFormError(null)
                            }}
                            placeholder="Ej. Calle 123 # 10 - 20"
                          />
                        </Field>

                        <Field>
                          <FieldLabel htmlFor="sede-city">Ciudad</FieldLabel>
                          <Input
                            id="sede-city"
                            value={formCity}
                            onChange={(event) => {
                              setFormCity(event.target.value)
                              setFormError(null)
                            }}
                            placeholder="Ej. Medellin"
                          />
                        </Field>

                        <Field>
                          <FieldLabel>Ubicacion en mapa</FieldLabel>
                          <FieldDescription>
                            {shouldUseGoogleMaps
                              ? "Google Maps activo: haz clic en el mapa para poner el marcador y moverlo con precisión."
                              : "Google Maps en vista previa: busca por direccion + ciudad y valida la ubicacion."}
                          </FieldDescription>

                          <div className="mt-2 space-y-3">
                            {shouldUseGoogleMaps ? (
                              <div className="overflow-hidden rounded-lg border border-border/60">
                                <div ref={mapContainerRef} className="h-64 w-full" aria-label="Mapa para seleccionar ubicación" />
                              </div>
                            ) : formGoogleMapsEmbedUrl ? (
                              <div className="space-y-2">
                                <div className="overflow-hidden rounded-lg border border-border/60">
                                  <iframe
                                    src={formGoogleMapsEmbedUrl}
                                    title="Vista previa Google Maps"
                                    className="h-64 w-full"
                                    loading="lazy"
                                    referrerPolicy="no-referrer-when-downgrade"
                                  />
                                </div>
                              </div>
                            ) : null}

                            <div className="flex flex-wrap items-center gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => {
                                  void handleFindAddressOnMap()
                                }}
                                disabled={isFindingAddressOnMap || isInitializingMap}
                              >
                                {isFindingAddressOnMap
                                  ? "Buscando..."
                                  : shouldUseGoogleMaps
                                    ? "Buscar direccion (Google)"
                                    : "Buscar direccion"}
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                onClick={() => {
                                  setFormMapPoint(null)
                                  setFormError(null)
                                }}
                                disabled={!formMapPoint || isInitializingMap}
                              >
                                Quitar marcador
                              </Button>
                            </div>

                            <p className="text-xs text-muted-foreground">
                              {isInitializingMap
                                ? "Cargando mapa..."
                                : formMapPoint
                                ? `Marcador: ${formMapPoint.latitude}, ${formMapPoint.longitude}`
                                : "Sin marcador seleccionado. (Opcional)"}
                            </p>

                            {formGoogleMapsUrl ? (
                              <a
                                href={formGoogleMapsUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-sm text-primary underline-offset-2 hover:underline"
                              >
                                <MapPinned className="h-4 w-4" />
                                Abrir en Google Maps
                              </a>
                            ) : null}
                          </div>
                        </Field>

                        <Field>
                          <FieldLabel htmlFor="sede-phone">Telefono</FieldLabel>
                          <Input
                            id="sede-phone"
                            value={formPhone}
                            onChange={(event) => {
                              setFormPhone(event.target.value)
                              setFormError(null)
                            }}
                            placeholder="Ej. +57 300 123 4567"
                          />
                          <FieldDescription>Opcional. Se mostrara en la informacion de la sede.</FieldDescription>
                        </Field>

                        <Field>
                          <FieldLabel htmlFor="sede-reference">Referencia</FieldLabel>
                          <Textarea
                            id="sede-reference"
                            value={formReference}
                            onChange={(event) => {
                              setFormReference(event.target.value)
                              setFormError(null)
                            }}
                            placeholder="Puntos de referencia para llegar mas facil"
                            rows={4}
                          />
                        </Field>

                        <Field>
                          <FieldLabel htmlFor="sede-photo-files">Fotos de la sede</FieldLabel>

                          <div className="mb-3 flex flex-wrap items-center gap-2">
                            <input
                              ref={photoUploadInputRef}
                              id="sede-photo-files"
                              type="file"
                              accept="image/png,image/jpeg,image/webp,image/gif"
                              multiple
                              className="hidden"
                              onChange={(event) => {
                                void handlePhotoFilesUpload(event.target.files)
                              }}
                            />

                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => photoUploadInputRef.current?.click()}
                              disabled={isUploadingPhotos || isSubmitting}
                            >
                              {isUploadingPhotos ? (
                                <>
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  Subiendo fotos...
                                </>
                              ) : (
                                <>
                                  <Upload className="mr-2 h-4 w-4" />
                                  Subir desde archivos
                                </>
                              )}
                            </Button>
                          </div>

                          <FieldDescription>
                            Sube fotos desde tu dispositivo. No necesitas pegar links. Máximo {MAX_SEDE_PHOTOS} imágenes por sede y 15MB por imagen.
                          </FieldDescription>

                          {formPhotoPreviewUrls.length > 0 ? (
                            <div className="mt-3 space-y-2">
                              <div className="grid grid-cols-4 gap-2">
                                {formPhotoPreviewUrls.map((photoUrl, index) => (
                                  <div key={`preview-${photoUrl}-${index}`} className="relative">
                                    <SedeThumbnailMedia photoUrl={photoUrl} sedeName={formName || "sede"} index={index + 1} />
                                    <button
                                      type="button"
                                      className="absolute right-1 top-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white"
                                      onClick={() => handleRemovePhotoFromForm(photoUrl)}
                                      aria-label={`Quitar foto ${index + 1}`}
                                    >
                                      x
                                    </button>
                                  </div>
                                ))}
                              </div>

                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setFormPhotoUrlsInput("")
                                  setFormError(null)
                                }}
                              >
                                Quitar todas las fotos
                              </Button>
                            </div>
                          ) : null}
                        </Field>

                        <Field>
                          <FieldLabel htmlFor="sede-status">Estado</FieldLabel>
                          <Select value={formStatus} onValueChange={(value: "activo" | "inactivo") => setFormStatus(value)}>
                            <SelectTrigger id="sede-status">
                              <SelectValue placeholder="Selecciona estado" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="activo">Activa</SelectItem>
                              <SelectItem value="inactivo">Inactiva</SelectItem>
                            </SelectContent>
                          </Select>
                        </Field>
                      </FieldGroup>

                      {formError ? (
                        <Alert variant="destructive" className="mt-4">
                          <AlertTitle>No se pudo guardar</AlertTitle>
                          <AlertDescription>{formError}</AlertDescription>
                        </Alert>
                      ) : null}
                    </div>

                    <SheetFooter className="border-t px-6 py-4 sm:justify-between">
                      <Button type="button" variant="ghost" onClick={() => setIsFormOpen(false)} disabled={isSubmitting}>
                        Cancelar
                      </Button>
                      <Button type="submit" disabled={isSubmitting}>
                        {isSubmitting ? "Guardando..." : editingSede ? "Guardar cambios" : "Crear sede"}
                      </Button>
                    </SheetFooter>
                  </form>
                </SheetContent>
              </Sheet>
            </div>
          </div>

          {areSedesLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-11 w-full" />
              <Skeleton className="h-11 w-full" />
              <Skeleton className="h-11 w-full" />
            </div>
          ) : null}

          {shouldShowErrorCard ? (
            <Card>
              <CardHeader>
                <CardTitle>No se pudieron cargar las sedes</CardTitle>
                <CardDescription>Valida tu conexion o intenta recargar de nuevo.</CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={handleReload}>Reintentar</Button>
              </CardContent>
            </Card>
          ) : null}

          {!areSedesLoading && !shouldShowErrorCard && sedes.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon" className="bg-primary/5 text-primary">
                  <Building2 className="size-5" />
                </EmptyMedia>
                <EmptyTitle>No hay sedes configuradas</EmptyTitle>
                <EmptyDescription>
                  Crea la primera sede para habilitar reservas con ubicacion y mapa.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button onClick={openCreateForm}>
                  <Plus className="mr-2 h-4 w-4" />
                  Crear primera sede
                </Button>
              </EmptyContent>
            </Empty>
          ) : null}

          {!areSedesLoading && !shouldShowErrorCard && sedes.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {sedes.map((sede) => {
                const mapsUrl = buildGoogleMapsUrl(sede)
                const photoUrls = resolveSedePhotoUrls(sede).slice(0, MAX_SEDE_PHOTOS)

                return (
                  <Card key={sede.id} className="overflow-hidden border border-border/60 bg-background/70 shadow-sm">
                    <div className="relative">
                      <SedePhotoCarousel photoUrls={photoUrls} sedeName={sede.name} />
                      <div className="absolute left-3 top-3 flex items-center gap-2">
                        <Badge variant={sede.active ? "default" : "secondary"}>{sede.active ? "Activa" : "Inactiva"}</Badge>
                        <Badge variant="secondary" className="bg-background/80 text-xs">
                          {formatNumber(photoUrls.length)} foto{photoUrls.length === 1 ? "" : "s"}
                        </Badge>
                      </div>
                    </div>

                    <CardContent className="space-y-4 p-4">
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-base font-semibold">{sede.name}</p>
                          </div>

                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button type="button" variant="ghost" size="icon" className="size-8">
                                <MoreHorizontal className="size-4" />
                                <span className="sr-only">Acciones de sede</span>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              <DropdownMenuItem onClick={() => openEditForm(sede)}>
                                <Pencil className="mr-2 size-4" />
                                Editar
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => {
                                  void handleDelete(sede)
                                }}
                                disabled={deletingSedeId === sede.id}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 className="mr-2 size-4" />
                                {deletingSedeId === sede.id ? "Eliminando..." : "Eliminar"}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>

                        <p className="text-sm text-muted-foreground">
                          {[sede.address, sede.city].filter(Boolean).join(", ") || "Sin direccion registrada"}
                        </p>

                        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1 rounded-full border border-border/70 px-2 py-1">
                            <Users className="size-3.5" /> Barberos: {formatNumber(sede.totalEmployees)}
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-full border border-border/70 px-2 py-1">
                            <Scissors className="size-3.5" /> Servicios: {formatNumber(sede.totalServices)}
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-full border border-border/70 px-2 py-1">
                            <CalendarDays className="size-3.5" /> Citas: {formatNumber(sede.upcomingAppointments)}
                          </span>
                        </div>
                      </div>

                      <div className="space-y-2 text-sm">
                        <p className="line-clamp-2 text-muted-foreground">{sede.reference || "Sin referencia"}</p>
                        <p className="inline-flex items-center gap-2 text-muted-foreground">
                          <Phone className="size-3.5" /> {sede.phone || "Sin telefono"}
                        </p>
                        {mapsUrl ? (
                          <a
                            href={mapsUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
                          >
                            <MapPinned className="h-3.5 w-3.5" />
                            Ver en mapa
                          </a>
                        ) : null}
                      </div>

                    </CardContent>
                  </Card>
                )
              })}
            </div>
          ) : null}
        </section>
      </main>
    </div>
  )
}

function CompactMetricCard({ title, value, className }: { title: string; value: string; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader className="space-y-1 pb-2">
        <CardDescription className="text-xs uppercase tracking-wide text-muted-foreground">{title}</CardDescription>
        <CardTitle className="text-xl font-semibold sm:text-2xl">{value}</CardTitle>
      </CardHeader>
    </Card>
  )
}

function SedePhotoCarousel({ photoUrls, sedeName }: { photoUrls: string[]; sedeName: string }) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const hasManyPhotos = photoUrls.length > 1

  useEffect(() => {
    if (currentIndex < photoUrls.length) {
      return
    }

    setCurrentIndex(0)
  }, [currentIndex, photoUrls.length])

  const currentPhotoUrl = photoUrls[currentIndex] ?? null

  return (
    <div className="relative">
      <SedeCoverMedia photoUrl={currentPhotoUrl} sedeName={sedeName} />

      {hasManyPhotos ? (
        <>
          <button
            type="button"
            onClick={() => {
              setCurrentIndex((previous) => (previous === 0 ? photoUrls.length - 1 : previous - 1))
            }}
            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-1.5 text-white hover:bg-black/75"
            aria-label="Foto anterior"
          >
            <ChevronLeft className="size-4" />
          </button>

          <button
            type="button"
            onClick={() => {
              setCurrentIndex((previous) => (previous === photoUrls.length - 1 ? 0 : previous + 1))
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-1.5 text-white hover:bg-black/75"
            aria-label="Foto siguiente"
          >
            <ChevronRight className="size-4" />
          </button>

          <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1">
            {photoUrls.map((photoUrl, index) => (
              <button
                key={`${photoUrl}-${index}`}
                type="button"
                onClick={() => setCurrentIndex(index)}
                className={`h-1.5 rounded-full transition-all ${index === currentIndex ? "w-4 bg-white" : "w-1.5 bg-white/50"}`}
                aria-label={`Ir a foto ${index + 1}`}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  )
}

function SedeCoverMedia({ photoUrl, sedeName }: { photoUrl: string | null; sedeName: string }) {
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    setHasError(false)
  }, [photoUrl])

  if (!photoUrl || hasError) {
    return (
      <div className="flex h-44 w-full items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700">
        <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-black/20 px-3 py-1 text-xs text-white">
          <ImageIcon className="size-3.5" />
          Sin foto de {sedeName}
        </div>
      </div>
    )
  }

  return (
    <img
      src={photoUrl}
      alt={`Foto principal de ${sedeName}`}
      className="h-44 w-full object-cover"
      loading="lazy"
      onError={() => setHasError(true)}
    />
  )
}

function SedeThumbnailMedia({ photoUrl, sedeName, index }: { photoUrl: string; sedeName: string; index: number }) {
  const [hasError, setHasError] = useState(false)

  if (hasError) {
    return (
      <div className="flex h-14 w-full items-center justify-center rounded-md border border-dashed border-border/70 bg-muted/30 text-muted-foreground">
        <ImageIcon className="size-3.5" />
      </div>
    )
  }

  return (
    <img
      src={photoUrl}
      alt={`Foto ${index} de ${sedeName}`}
      className="h-14 w-full rounded-md border border-border/70 object-cover"
      loading="lazy"
      onError={() => setHasError(true)}
    />
  )
}
