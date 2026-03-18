"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  AlertCircle,
  ArrowLeft,
  Camera,
  ChevronDown,
  Circle,
  Smile,
  FileAudio,
  FileText,
  Images,
  Image as ImageIcon,
  MessageSquare,
  Mic,
  Pause,
  Play,
  Plus,
  Search,
  Smartphone,
} from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { useIsMobile } from "@/hooks/use-mobile"
import { cn } from "@/lib/utils"

type ChatPreview = {
  id: string
  waId: string | null
  name: string
  initials: string
  snippet: string
  channel: "WhatsApp"
  owner: "Humano" | "IA"
  dateLabel: string
  isUnread: boolean
  unreadCount: number
}

type ChatMessage = {
  id: string
  wamid: string | null
  direction: "inbound" | "outbound"
  owner: "Humano" | "IA"
  sentByType: "bot" | "human" | "unknown"
  sentByName: string | null
  type: string
  text: string | null
  mediaId: string | null
  mediaMimeType: string | null
  mediaCaption: string | null
  mediaFilename: string | null
  status: string | null
  statusError: string | null
  reactionEmoji: string | null
  reactionToWamid: string | null
  reactionToSnippet: string | null
  dateLabel: string
  timeLabel: string
  sentAt: string | null
}

type ConversationsResponse = {
  ok?: boolean
  connected?: boolean
  phone?: {
    id?: string
    displayPhoneNumber?: string
  }
  conversations?: ChatPreview[]
  warnings?: string[]
  error?: string
  detail?: string
}

type MessagesResponse = {
  ok?: boolean
  messages?: ChatMessage[]
  error?: string
  detail?: string
}

type BotStatusResponse = {
  ok?: boolean
  active?: boolean
  error?: string
  detail?: string
}

type FilterMode = "all" | "unread"
type LoadOptions = { silent?: boolean }

type ChatRenderItem =
  | {
      kind: "message"
      message: ChatMessage
      latestReaction: ChatMessage | null
    }
  | {
      kind: "orphan-reaction"
      message: ChatMessage
    }

const QUICK_REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"] as const
const EXTENDED_REACTION_EMOJIS = [
  "👍", "❤️", "😂", "😮", "😢", "🙏", "👏", "🔥", "🎉", "✅",
  "😁", "😅", "😎", "🤔", "😡", "😭", "🤩", "🙌", "👌", "💯",
  "🤝", "🥳", "💪", "🫡", "🤯", "😴", "🤗", "🤨", "👀", "🙄",
] as const

type LameModule = {
  Mp3Encoder: new (channels: number, sampleRate: number, kbps: number) => {
    encodeBuffer: (left: Int16Array, right?: Int16Array) => Int8Array | Uint8Array | number[]
    flush: () => Int8Array | Uint8Array | number[]
  }
}

declare global {
  interface Window {
    lamejs?: LameModule
  }
}

function normalizePhone(phone: string): string {
  return phone.replace(/\D+/g, "")
}

function getStoredTenantSchema(): string | null {
  if (typeof window === "undefined") {
    return null
  }

  const raw =
    localStorage.getItem("userTenant") ??
    localStorage.getItem("tenantSchema") ??
    ""

  const normalized = raw.trim().toLowerCase()
  return /^tenant_[a-z0-9_]+$/.test(normalized) ? normalized : null
}

function withTenantQuery(path: string): string {
  const tenantSchema = getStoredTenantSchema()
  if (!tenantSchema) {
    return path
  }

  const separator = path.includes("?") ? "&" : "?"
  return `${path}${separator}tenant=${encodeURIComponent(tenantSchema)}`
}

function tenantHeaders(headers: Record<string, string> = {}): Record<string, string> {
  const tenantSchema = getStoredTenantSchema()
  const userEmail =
    typeof window === "undefined"
      ? ""
      : (localStorage.getItem("userEmail") ?? "").trim().toLowerCase()
  const userDisplayName =
    typeof window === "undefined"
      ? ""
      : (localStorage.getItem("userDisplayName") ?? "").trim()

  const withUserEmail = userEmail
    ? {
        ...headers,
        "x-user-email": userEmail,
      }
    : { ...headers }

  const withUserIdentity = userDisplayName
    ? {
        ...withUserEmail,
        "x-user-name": userDisplayName,
      }
    : withUserEmail

  if (!tenantSchema) {
    return withUserIdentity
  }

  return {
    ...withUserIdentity,
    "x-tenant": tenantSchema,
  }
}

function getOutboundSenderLabel(message: ChatMessage): string {
  if (message.sentByType === "human") {
    return `Enviado por: ${message.sentByName?.trim() || "Asesor"}`
  }

  return `Enviado por: ${message.sentByName?.trim() || "Bot whatsapp"}`
}

function buildInitials(value: string): string {
  const parts = value
    .split(/\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)

  if (parts.length === 0) {
    return "--"
  }

  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
}

function getOutboundSenderInitials(message: ChatMessage): string {
  const fallbackName = message.sentByType === "human" ? "Asesor" : "Bot whatsapp"
  return buildInitials(message.sentByName?.trim() || fallbackName)
}

function formatStatus(status: string | null): string {
  if (!status) {
    return ""
  }

  switch (status.toLowerCase()) {
    case "sent":
      return "Enviado"
    case "delivered":
      return "Entregado"
    case "read":
      return "Leído"
    case "failed":
      return "Fallido"
    default:
      return status
  }
}

function createWaveBars(seed: string, count = 40): number[] {
  let hash = 0
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0
  }

  const bars: number[] = []
  for (let index = 0; index < count; index += 1) {
    hash = (hash * 1664525 + 1013904223) >>> 0
    bars.push(25 + (hash % 75))
  }

  return bars
}

function floatTo16BitPCM(input: Float32Array): Int16Array {
  const output = new Int16Array(input.length)

  for (let index = 0; index < input.length; index += 1) {
    const clamped = Math.max(-1, Math.min(1, input[index]))
    output[index] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff
  }

  return output
}

function mergeInt16Chunks(chunks: Int16Array[]): Int16Array {
  const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0)
  const merged = new Int16Array(totalLength)

  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.length
  }

  return merged
}

function AudioWaveform({
  seed,
  dimmed = false,
  progressPercent = 0,
  onSeek,
}: {
  seed: string
  dimmed?: boolean
  progressPercent?: number
  onSeek?: (percent: number) => void
}) {
  const bars = useMemo(() => createWaveBars(seed), [seed])
  const clampedProgress = Math.max(0, Math.min(100, progressPercent))

  return (
    <div
      className={cn("relative h-7 w-[170px] max-w-full", onSeek ? "cursor-pointer" : "")}
      onClick={(event) => {
        if (!onSeek) {
          return
        }

        const rect = event.currentTarget.getBoundingClientRect()
        const percent = ((event.clientX - rect.left) / rect.width) * 100
        onSeek(Math.max(0, Math.min(100, percent)))
      }}
    >
      <div className="flex h-7 items-center gap-[2px]">
        {bars.map((height, index) => {
          const barPercent = (index / Math.max(1, bars.length - 1)) * 100
          const isPlayed = barPercent <= clampedProgress

          return (
            <span
              key={`${seed}-${index}`}
              className={cn(
                "inline-block w-[2px] shrink-0 rounded-full transition-colors",
                isPlayed
                  ? "bg-sky-400"
                  : dimmed
                    ? "bg-current/35"
                    : "bg-current/55",
              )}
              style={{ height: `${Math.max(6, Math.round((height / 100) * 24))}px` }}
            />
          )
        })}
      </div>
      <span
        className="pointer-events-none absolute top-1/2 z-10 h-3 w-3 -translate-y-1/2 rounded-full bg-sky-400 shadow"
        style={{ left: `calc(${clampedProgress}% - 6px)` }}
      />
    </div>
  )
}

function formatAudioTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "0:00"
  }

  const totalSeconds = Math.round(seconds)
  const minutes = Math.floor(totalSeconds / 60)
  const remainingSeconds = totalSeconds % 60
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`
}

type CompactAudioPlayerProps = {
  src: string
  seed: string
  mimeType?: string | null
  tone?: "outbound" | "inbound" | "preview"
}

function CompactAudioPlayer({ src, seed, mimeType, tone = "preview" }: CompactAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const durationRef = useRef(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [playbackRate, setPlaybackRate] = useState<1 | 1.5 | 2>(1)

  const resolveMediaDuration = useCallback((media: HTMLAudioElement | null): number => {
    if (!media) {
      return 0
    }

    if (Number.isFinite(media.duration) && media.duration > 0) {
      return media.duration
    }

    if (media.seekable.length > 0) {
      const seekableEnd = media.seekable.end(media.seekable.length - 1)
      if (Number.isFinite(seekableEnd) && seekableEnd > 0) {
        return seekableEnd
      }
    }

    return 0
  }, [])

  const effectiveDuration = duration > 0 ? duration : currentTime > 0 ? currentTime : 0
  const progressPercent =
    duration > 0 ? Math.max(0, Math.min(100, (currentTime / duration) * 100)) : 0

  useEffect(() => {
    durationRef.current = duration
  }, [duration])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) {
      return
    }

    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }

    audio.pause()
    audio.currentTime = 0
    audio.playbackRate = 1
    setIsPlaying(false)
    setCurrentTime(0)
    setDuration(resolveMediaDuration(audio))
    setPlaybackRate(1)
  }, [resolveMediaDuration, src])

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    const audio = audioRef.current
    if (!audio || !isPlaying) {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
      return
    }

    const tick = () => {
      setCurrentTime(audio.currentTime || 0)

      const detectedDuration = resolveMediaDuration(audio)
      if (detectedDuration > 0 && Math.abs(detectedDuration - durationRef.current) > 0.05) {
        setDuration(detectedDuration)
      }

      animationFrameRef.current = window.requestAnimationFrame(tick)
    }

    animationFrameRef.current = window.requestAnimationFrame(tick)

    return () => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
    }
  }, [isPlaying, resolveMediaDuration])

  const toneStyles =
    tone === "outbound"
      ? "border-primary-foreground/30 bg-primary-foreground/10 text-primary-foreground"
      : tone === "inbound"
        ? "border-border bg-background text-foreground"
        : "border-border bg-background text-foreground"

  return (
    <div className={cn("w-full rounded-2xl border px-3 py-2", toneStyles)}>
      <div className="flex items-center gap-3">
        <button
          type="button"
          className={cn(
            "rounded-md border px-1.5 py-0.5 text-[11px] font-medium transition-colors",
            tone === "outbound"
              ? "border-primary-foreground/30 bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/20"
              : "border-border bg-muted/50 text-foreground hover:bg-muted",
          )}
          aria-label="Cambiar velocidad"
          onClick={() => {
            const audio = audioRef.current
            if (!audio) {
              return
            }

            const nextRate: 1 | 1.5 | 2 = playbackRate === 1 ? 1.5 : playbackRate === 1.5 ? 2 : 1
            audio.playbackRate = nextRate
            setPlaybackRate(nextRate)
          }}
        >
          x{playbackRate}
        </button>

        <button
          type="button"
          aria-label={isPlaying ? "Pausar audio" : "Reproducir audio"}
          onClick={() => {
            const audio = audioRef.current
            if (!audio) {
              return
            }

            if (audio.paused) {
              void audio.play()
              return
            }

            audio.pause()
          }}
          className={cn(
            "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors",
            tone === "outbound"
              ? "border-primary-foreground/30 bg-primary-foreground/15 text-primary-foreground hover:bg-primary-foreground/25"
              : "border-border bg-muted/60 text-foreground hover:bg-muted",
          )}
        >
          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </button>

        <div className="min-w-0">
          <AudioWaveform
            seed={seed}
            dimmed={tone !== "outbound"}
            progressPercent={progressPercent}
            onSeek={(percent) => {
              const audio = audioRef.current
              if (!audio || duration <= 0) {
                return
              }

              const nextTime = (percent / 100) * effectiveDuration
              audio.currentTime = nextTime
              setCurrentTime(nextTime)
            }}
          />
          <div
            className={cn(
              "mt-1 flex items-center justify-between text-[11px]",
              tone === "outbound" ? "text-primary-foreground/80" : "text-muted-foreground",
            )}
          >
            <span>{formatAudioTime(currentTime)} / {formatAudioTime(effectiveDuration)}</span>
          </div>
        </div>
      </div>

      <audio
        ref={audioRef}
        className="hidden"
        preload="metadata"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          setIsPlaying(false)
          setCurrentTime(resolveMediaDuration(audioRef.current))
        }}
        onLoadedMetadata={(event) => {
          const media = event.currentTarget
          media.playbackRate = playbackRate
          setDuration(resolveMediaDuration(media))
        }}
        onLoadedData={(event) => {
          setDuration(resolveMediaDuration(event.currentTarget))
        }}
        onCanPlay={(event) => {
          setDuration(resolveMediaDuration(event.currentTarget))
        }}
        onDurationChange={(event) => {
          setDuration(resolveMediaDuration(event.currentTarget))
        }}
        onTimeUpdate={(event) => {
          const media = event.currentTarget
          setCurrentTime(media.currentTime || 0)
          setDuration(resolveMediaDuration(media))
        }}
      >
        <source src={src} type={mimeType ?? undefined} />
      </audio>
    </div>
  )
}

async function ensureLameJsLoaded(): Promise<LameModule> {
  if (typeof window === "undefined") {
    throw new Error("LAME_NOT_AVAILABLE")
  }

  if (window.lamejs?.Mp3Encoder) {
    return window.lamejs
  }

  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-lamejs="1"]')

    if (existing) {
      if ((existing as HTMLScriptElement).dataset.loaded === "1") {
        resolve()
        return
      }

      existing.addEventListener("load", () => resolve(), { once: true })
      existing.addEventListener("error", () => reject(new Error("LAME_SCRIPT_LOAD_ERROR")), { once: true })
      return
    }

    const script = document.createElement("script")
    script.src = "/lame.min.js"
    script.async = true
    script.dataset.lamejs = "1"
    script.onload = () => {
      script.dataset.loaded = "1"
      resolve()
    }
    script.onerror = () => reject(new Error("LAME_SCRIPT_LOAD_ERROR"))
    document.head.appendChild(script)
  })

  if (!window.lamejs?.Mp3Encoder) {
    throw new Error("LAME_ENCODER_NOT_AVAILABLE")
  }

  return window.lamejs
}

export default function AdminConversacionesPage() {
  const isMobile = useIsMobile()
  const [conversations, setConversations] = useState<ChatPreview[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  const [filterMode, setFilterMode] = useState<FilterMode>("all")
  const [isLoadingConversations, setIsLoadingConversations] = useState(true)
  const [isLoadingMessages, setIsLoadingMessages] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [phoneDisplay, setPhoneDisplay] = useState("")
  const [composerText, setComposerText] = useState("")
  const [manualChatClosed, setManualChatClosed] = useState(false)
  const [botEnabledByConversation, setBotEnabledByConversation] = useState<Record<string, boolean>>({})
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [selectedFilePreviewUrl, setSelectedFilePreviewUrl] = useState<string | null>(null)
  const [isCameraDialogOpen, setIsCameraDialogOpen] = useState(false)
  const [isCameraStarting, setIsCameraStarting] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [isRecordingAudio, setIsRecordingAudio] = useState(false)
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const [isUpdatingBotState, setIsUpdatingBotState] = useState(false)
  const [isAtBottom, setIsAtBottom] = useState(true)
  const [hasScrollableMessages, setHasScrollableMessages] = useState(false)
  const [reactionPickerTargetMessageId, setReactionPickerTargetMessageId] = useState<string | null>(null)
  const [reactionExpandedTargetMessageId, setReactionExpandedTargetMessageId] = useState<string | null>(null)
  const [isSendingReaction, setIsSendingReaction] = useState(false)
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null)

  const endOfMessagesRef = useRef<HTMLDivElement | null>(null)
  const messagesScrollContainerRef = useRef<HTMLDivElement | null>(null)
  const documentInputRef = useRef<HTMLInputElement | null>(null)
  const galleryInputRef = useRef<HTMLInputElement | null>(null)
  const cameraInputRef = useRef<HTMLInputElement | null>(null)
  const audioInputRef = useRef<HTMLInputElement | null>(null)
  const composerRef = useRef<HTMLTextAreaElement | null>(null)
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null)
  const cameraStreamRef = useRef<MediaStream | null>(null)
  const audioStreamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const audioSourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const audioProcessorRef = useRef<ScriptProcessorNode | null>(null)
  const audioPcmChunksRef = useRef<Int16Array[]>([])
  const audioSampleRateRef = useRef<number>(44100)
  const shouldAutoScrollRef = useRef(true)
  const autoScrollTimeoutsRef = useRef<number[]>([])
  const reactionLongPressTimeoutRef = useRef<number | null>(null)

  const clearReactionLongPress = useCallback(() => {
    if (reactionLongPressTimeoutRef.current !== null) {
      window.clearTimeout(reactionLongPressTimeoutRef.current)
      reactionLongPressTimeoutRef.current = null
    }
  }, [])

  const clearPendingAutoScrolls = useCallback(() => {
    for (const timeoutId of autoScrollTimeoutsRef.current) {
      window.clearTimeout(timeoutId)
    }
    autoScrollTimeoutsRef.current = []
  }, [])

  const scrollMessagesToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const container = messagesScrollContainerRef.current
    const viewport = container?.querySelector("[data-radix-scroll-area-viewport]") as HTMLDivElement | null

    if (viewport) {
      viewport.scrollTop = viewport.scrollHeight
      return
    }

    endOfMessagesRef.current?.scrollIntoView({ behavior, block: "end" })
  }, [])

  const scheduleOpenChatAutoScroll = useCallback(() => {
    clearPendingAutoScrolls()

    const runScroll = () => {
      requestAnimationFrame(() => {
        scrollMessagesToBottom("auto")
      })
    }

    runScroll()

    const checkpoints = [80, 180, 320, 560, 900, 1300]
    checkpoints.forEach((delay) => {
      const timeoutId = window.setTimeout(runScroll, delay)
      autoScrollTimeoutsRef.current.push(timeoutId)
    })

    const finalizeId = window.setTimeout(() => {
      shouldAutoScrollRef.current = false
      clearPendingAutoScrolls()
    }, 1600)
    autoScrollTimeoutsRef.current.push(finalizeId)
  }, [clearPendingAutoScrolls, scrollMessagesToBottom])

  const loadConversations = useCallback(async (options?: LoadOptions) => {
    const silent = options?.silent === true

    if (!silent) {
      setIsLoadingConversations(true)
    }

    try {
      const response = await fetch(withTenantQuery("/api/admin/conversations?limit=100"), {
        cache: "no-store",
        headers: tenantHeaders(),
      })
      const data = (await response.json().catch(() => ({}))) as ConversationsResponse

      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? data.detail ?? "No se pudo cargar la bandeja de conversaciones")
      }

      const nextConversations = Array.isArray(data.conversations) ? data.conversations : []

      setConversations(nextConversations)
      setWarnings(Array.isArray(data.warnings) ? data.warnings : [])
      setPhoneDisplay(data.phone?.displayPhoneNumber?.trim() || "")

      setSelectedChatId((current) => {
        if (current && nextConversations.some((conversation) => conversation.id === current)) {
          return current
        }

        if (isMobile) {
          return null
        }

        if (manualChatClosed) {
          return null
        }

        return nextConversations[0]?.id ?? null
      })
    } catch (requestError) {
      console.error("Error loading admin conversations", requestError)
      if (!silent) {
        setError(requestError instanceof Error ? requestError.message : "No se pudo cargar la bandeja de conversaciones")
        setConversations([])
      }
    } finally {
      if (!silent) {
        setIsLoadingConversations(false)
      }
    }
  }, [isMobile, manualChatClosed])

  const loadMessages = useCallback(async (conversationId: string, options?: LoadOptions) => {
    const silent = options?.silent === true

    if (!silent) {
      setIsLoadingMessages(true)
    }

    try {
      const encodedId = encodeURIComponent(conversationId)
      const response = await fetch(withTenantQuery(`/api/admin/conversations/${encodedId}/messages?limit=250`), {
        cache: "no-store",
        headers: tenantHeaders(),
      })
      const data = (await response.json().catch(() => ({}))) as MessagesResponse

      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? data.detail ?? "No se pudieron cargar los mensajes")
      }

      setMessages(Array.isArray(data.messages) ? data.messages : [])

      const botStatusResponse = await fetch(
        withTenantQuery(`/api/admin/conversations/${encodedId}/bot-status`),
        {
          cache: "no-store",
          headers: tenantHeaders(),
        },
      )

      const botStatusData = (await botStatusResponse.json().catch(() => ({}))) as BotStatusResponse
      if (botStatusResponse.ok && botStatusData.ok && typeof botStatusData.active === "boolean") {
        setBotEnabledByConversation((current) => ({
          ...current,
          [conversationId]: botStatusData.active as boolean,
        }))
      }

      await fetch(withTenantQuery(`/api/admin/conversations/${encodedId}/read`), {
        method: "POST",
        headers: tenantHeaders(),
      })

      setConversations((current) =>
        current.map((conversation) =>
          conversation.id === conversationId
            ? {
                ...conversation,
                unreadCount: 0,
                isUnread: false,
              }
            : conversation,
        ),
      )
    } catch (requestError) {
      console.error("Error loading conversation messages", requestError)
      if (!silent) {
        setError(requestError instanceof Error ? requestError.message : "No se pudo cargar el chat")
        setMessages([])
      }
    } finally {
      if (!silent) {
        setIsLoadingMessages(false)
      }
    }
  }, [])

  useEffect(() => {
    setError(null)
    void loadConversations()
  }, [loadConversations])

  useEffect(() => {
    return () => {
      clearPendingAutoScrolls()
      clearReactionLongPress()
    }
  }, [clearPendingAutoScrolls, clearReactionLongPress])

  useEffect(() => {
    if (!selectedChatId) {
      setMessages([])
      clearPendingAutoScrolls()
      shouldAutoScrollRef.current = false
      setReactionPickerTargetMessageId(null)
      setReactionExpandedTargetMessageId(null)
      return
    }

    shouldAutoScrollRef.current = true

    void (async () => {
      await loadMessages(selectedChatId)

      if (!shouldAutoScrollRef.current) {
        return
      }

      scheduleOpenChatAutoScroll()
    })()
  }, [clearPendingAutoScrolls, loadMessages, scheduleOpenChatAutoScroll, selectedChatId])

  useEffect(() => {
    if (!reactionPickerTargetMessageId) {
      return
    }

    if (!messages.some((message) => message.id === reactionPickerTargetMessageId)) {
      setReactionPickerTargetMessageId(null)
      setReactionExpandedTargetMessageId(null)
    }
  }, [messages, reactionPickerTargetMessageId])

  useEffect(() => {
    const interval = setInterval(() => {
      void loadConversations({ silent: true })

      if (selectedChatId) {
        void loadMessages(selectedChatId, { silent: true })
      }
    }, 8000)

    return () => clearInterval(interval)
  }, [loadConversations, loadMessages, selectedChatId])

  useEffect(() => {
    if (!endOfMessagesRef.current || !shouldAutoScrollRef.current) {
      return
    }

    scheduleOpenChatAutoScroll()
  }, [messages, scheduleOpenChatAutoScroll])

  useEffect(() => {
    if (!selectedChatId || isLoadingMessages || !shouldAutoScrollRef.current) {
      return
    }

    scheduleOpenChatAutoScroll()
  }, [isLoadingMessages, scheduleOpenChatAutoScroll, selectedChatId])

  useEffect(() => {
    if (!selectedChatId) {
      setIsAtBottom(true)
      setHasScrollableMessages(false)
      return
    }

    const container = messagesScrollContainerRef.current
    if (!container) {
      return
    }

    const viewport = container.querySelector("[data-radix-scroll-area-viewport]") as HTMLDivElement | null
    if (!viewport) {
      setIsAtBottom(false)
      setHasScrollableMessages(messages.length > 0)
      return
    }

    const updateIsAtBottom = () => {
      const distanceToBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight
      setIsAtBottom(distanceToBottom <= 24)
      setHasScrollableMessages(viewport.scrollHeight - viewport.clientHeight > 8)
    }

    updateIsAtBottom()

    viewport.addEventListener("scroll", updateIsAtBottom, { passive: true })
    const resizeObserver = new ResizeObserver(() => updateIsAtBottom())
    resizeObserver.observe(viewport)

    return () => {
      viewport.removeEventListener("scroll", updateIsAtBottom)
      resizeObserver.disconnect()
    }
  }, [messages, selectedChatId])

  useEffect(() => {
    if (!composerRef.current) {
      return
    }

    composerRef.current.style.height = "0px"
    const nextHeight = Math.min(composerRef.current.scrollHeight, 144)
    composerRef.current.style.height = `${Math.max(nextHeight, 40)}px`
  }, [composerText])

  useEffect(() => {
    if (!selectedFile) {
      setSelectedFilePreviewUrl(null)
      return
    }

    const previewUrl = URL.createObjectURL(selectedFile)
    setSelectedFilePreviewUrl(previewUrl)

    return () => {
      URL.revokeObjectURL(previewUrl)
    }
  }, [selectedFile])

  const filteredConversations = useMemo(() => {
    const normalized = searchTerm.trim().toLowerCase()

    return conversations.filter((conversation) => {
      if (filterMode === "unread" && !conversation.isUnread) {
        return false
      }

      if (!normalized) {
        return true
      }

      return `${conversation.name} ${conversation.snippet}`.toLowerCase().includes(normalized)
    })
  }, [conversations, filterMode, searchTerm])

  const selectedConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedChatId) ?? null,
    [conversations, selectedChatId],
  )

  const showChatListPanel = !isMobile || !selectedConversation
  const showChatDetailPanel = !isMobile || Boolean(selectedConversation)

  const isBotEnabled = useMemo(() => {
    if (!selectedConversation) {
      return false
    }

    return botEnabledByConversation[selectedConversation.id] ?? false
  }, [botEnabledByConversation, selectedConversation])

  const unreadCount = useMemo(
    () => conversations.reduce((acc, conversation) => acc + conversation.unreadCount, 0),
    [conversations],
  )

  const chatRenderItems = useMemo<ChatRenderItem[]>(() => {
    const baseMessages = messages.filter((message) => message.type !== "reaction")
    const baseWamids = new Set(
      baseMessages
        .map((message) => message.wamid?.trim() || "")
        .filter((wamid) => wamid.length > 0),
    )

    const latestReactionByTarget = new Map<string, ChatMessage>()
    const orphanReactions: ChatMessage[] = []

    for (const message of messages) {
      if (message.type !== "reaction") {
        continue
      }

      const targetWamid = message.reactionToWamid?.trim() || ""
      if (targetWamid && baseWamids.has(targetWamid)) {
        // Keep only the most recent reaction for each target message.
        latestReactionByTarget.set(targetWamid, message)
        continue
      }

      orphanReactions.push(message)
    }

    const groupedItems: ChatRenderItem[] = baseMessages.map((message) => {
      const messageWamid = message.wamid?.trim() || ""
      const latestReaction = messageWamid ? latestReactionByTarget.get(messageWamid) ?? null : null

      return {
        kind: "message",
        message,
        latestReaction,
      }
    })

    const orphanItems: ChatRenderItem[] = orphanReactions.map((message) => ({
      kind: "orphan-reaction",
      message,
    }))

    return [...groupedItems, ...orphanItems]
  }, [messages])

  const handleSendMessage = useCallback(() => {
    if (!selectedConversation) {
      setError("Selecciona una conversación para enviar mensajes.")
      return
    }

    if (isBotEnabled) {
      setError("El bot IA está activo. Desactívalo para enviar mensajes manuales.")
      return
    }

    const textToSend = composerText
    const fileToSend = selectedFile

    if (textToSend.trim().length === 0 && !fileToSend) {
      return
    }

    setError(null)
    setIsSending(true)
    setComposerText("")
    setSelectedFile(null)
    if (documentInputRef.current) documentInputRef.current.value = ""
    if (galleryInputRef.current) galleryInputRef.current.value = ""
    if (cameraInputRef.current) cameraInputRef.current.value = ""
    if (audioInputRef.current) audioInputRef.current.value = ""

    void (async () => {
      let shouldRestoreDraft = false

      try {
        const formData = new FormData()
        formData.append("text", textToSend)
        formData.append("contactName", selectedConversation.name)

        if (fileToSend) {
          formData.append("file", fileToSend)
        }

        const response = await fetch(withTenantQuery(`/api/admin/conversations/${encodeURIComponent(selectedConversation.id)}/send`), {
          method: "POST",
          headers: tenantHeaders(),
          body: formData,
        })

        const payload = (await response.json().catch(() => ({}))) as { error?: string; detail?: string; ok?: boolean }

        if (!response.ok || !payload.ok) {
          shouldRestoreDraft = true
          throw new Error(payload.error ?? payload.detail ?? "No se pudo enviar el mensaje")
        }

        await Promise.all([loadMessages(selectedConversation.id, { silent: true }), loadConversations({ silent: true })])
      } catch (sendError) {
        console.error("Send message error", sendError)
        if (shouldRestoreDraft) {
          setComposerText(textToSend)
          setSelectedFile(fileToSend)
        }
        setError(sendError instanceof Error ? sendError.message : "No se pudo enviar el mensaje")
      } finally {
        setIsSending(false)
      }
    })()
  }, [composerText, isBotEnabled, loadConversations, loadMessages, selectedConversation, selectedFile])

  const handleSendReaction = useCallback(
    async (targetMessage: ChatMessage, emoji: string) => {
      if (!selectedConversation) {
        setError("Selecciona una conversación para reaccionar.")
        return
      }

      if (!targetMessage.wamid) {
        setError("No se pudo identificar el mensaje para reaccionar.")
        return
      }

      if (isBotEnabled) {
        setError("El bot IA está activo. Desactívalo para reaccionar manualmente.")
        return
      }

      setError(null)
      setIsSendingReaction(true)
      setReactionPickerTargetMessageId(null)
      setReactionExpandedTargetMessageId(null)

      try {
        const formData = new FormData()
        formData.append("text", "")
        formData.append("contactName", selectedConversation.name)
        formData.append("reactionEmoji", emoji)
        formData.append("reactionToWamid", targetMessage.wamid)

        const response = await fetch(withTenantQuery(`/api/admin/conversations/${encodeURIComponent(selectedConversation.id)}/send`), {
          method: "POST",
          headers: tenantHeaders(),
          body: formData,
        })

        const payload = (await response.json().catch(() => ({}))) as { error?: string; detail?: string; ok?: boolean }
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error ?? payload.detail ?? "No se pudo enviar la reacción")
        }

        await Promise.all([
          loadMessages(selectedConversation.id, { silent: true }),
          loadConversations({ silent: true }),
        ])
      } catch (sendError) {
        console.error("Send reaction error", sendError)
        setError(sendError instanceof Error ? sendError.message : "No se pudo enviar la reacción")
      } finally {
        setIsSendingReaction(false)
      }
    },
    [isBotEnabled, loadConversations, loadMessages, selectedConversation],
  )

  const handleBotToggle = useCallback(
    async (checked: boolean) => {
      if (!selectedConversation || isUpdatingBotState) {
        return
      }

      setIsUpdatingBotState(true)
      setError(null)

      try {
        const response = await fetch(
          withTenantQuery(`/api/admin/conversations/${encodeURIComponent(selectedConversation.id)}/bot-status`),
          {
            method: "POST",
            cache: "no-store",
            headers: {
              ...tenantHeaders(),
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ active: checked }),
          },
        )

        const payload = (await response.json().catch(() => ({}))) as BotStatusResponse
        if (!response.ok || !payload.ok || typeof payload.active !== "boolean") {
          throw new Error(payload.error ?? payload.detail ?? "No se pudo actualizar el estado del bot")
        }

        setBotEnabledByConversation((current) => ({
          ...current,
          [selectedConversation.id]: payload.active as boolean,
        }))
      } catch (toggleError) {
        setError(toggleError instanceof Error ? toggleError.message : "No se pudo actualizar el estado del bot")
      } finally {
        setIsUpdatingBotState(false)
      }
    },
    [isUpdatingBotState, selectedConversation],
  )

  const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] ?? null
    setSelectedFile(nextFile)
  }, [])

  const stopCameraStream = useCallback(() => {
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((track) => track.stop())
      cameraStreamRef.current = null
    }

    if (cameraVideoRef.current) {
      cameraVideoRef.current.srcObject = null
    }
  }, [])

  const startCameraCapture = useCallback(async () => {
    if (typeof window === "undefined") {
      return
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Este navegador no soporta acceso directo a cámara. Usa la opción de archivo.")
      cameraInputRef.current?.click()
      return
    }

    setIsCameraDialogOpen(true)
    setIsCameraStarting(true)
    setCameraError(null)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
        },
        audio: false,
      })

      cameraStreamRef.current = stream

      if (cameraVideoRef.current) {
        cameraVideoRef.current.srcObject = stream
        await cameraVideoRef.current.play().catch(() => undefined)
      }
    } catch (cameraStartError) {
      console.error("Camera access error", cameraStartError)
      setCameraError(
        "No se pudo acceder a la cámara. Verifica permisos del navegador para este sitio y vuelve a intentar.",
      )
    } finally {
      setIsCameraStarting(false)
    }
  }, [])

  const capturePhotoFromCamera = useCallback(async () => {
    const video = cameraVideoRef.current
    if (!video) {
      return
    }

    const width = video.videoWidth || 1280
    const height = video.videoHeight || 720

    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height

    const context = canvas.getContext("2d")
    if (!context) {
      setCameraError("No se pudo capturar la imagen de la cámara.")
      return
    }

    context.drawImage(video, 0, 0, width, height)

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((nextBlob) => resolve(nextBlob), "image/jpeg", 0.9)
    })

    if (!blob) {
      setCameraError("No se pudo generar la imagen capturada.")
      return
    }

    const file = new File([blob], `captura-${Date.now()}.jpg`, { type: "image/jpeg" })
    setSelectedFile(file)
    setIsCameraDialogOpen(false)
  }, [])

  const openAttachmentPicker = useCallback((kind: "document" | "gallery" | "camera" | "audio") => {
    if (kind === "document") {
      documentInputRef.current?.click()
      return
    }

    if (kind === "gallery") {
      galleryInputRef.current?.click()
      return
    }

    if (kind === "camera") {
      void startCameraCapture()
      return
    }

    audioInputRef.current?.click()
  }, [startCameraCapture])

  useEffect(() => {
    if (isCameraDialogOpen) {
      return
    }

    stopCameraStream()
  }, [isCameraDialogOpen, stopCameraStream])

  useEffect(() => {
    if (!isRecordingAudio) {
      return
    }

    const interval = window.setInterval(() => {
      setRecordingSeconds((previous) => previous + 1)
    }, 1000)

    return () => window.clearInterval(interval)
  }, [isRecordingAudio])

  useEffect(() => {
    return () => {
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach((track) => track.stop())
        audioStreamRef.current = null
      }

      if (audioProcessorRef.current) {
        audioProcessorRef.current.disconnect()
        audioProcessorRef.current = null
      }

      if (audioSourceRef.current) {
        audioSourceRef.current.disconnect()
        audioSourceRef.current = null
      }

      if (audioContextRef.current) {
        void audioContextRef.current.close()
        audioContextRef.current = null
      }
    }
  }, [])

  const startVoiceRecording = useCallback(async () => {
    if (typeof window === "undefined") {
      return
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof window.AudioContext === "undefined") {
      setError("Tu navegador no soporta grabación de audio.")
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      audioStreamRef.current = stream

      const audioContext = new window.AudioContext()
      const source = audioContext.createMediaStreamSource(stream)
      const processor = audioContext.createScriptProcessor(4096, 1, 1)

      audioPcmChunksRef.current = []
      audioSampleRateRef.current = audioContext.sampleRate
      audioContextRef.current = audioContext
      audioSourceRef.current = source
      audioProcessorRef.current = processor

      processor.onaudioprocess = (event) => {
        const input = event.inputBuffer.getChannelData(0)
        audioPcmChunksRef.current.push(floatTo16BitPCM(input))
      }

      source.connect(processor)
      processor.connect(audioContext.destination)

      setRecordingSeconds(0)
      setIsRecordingAudio(true)
    } catch (recordError) {
      console.error("Audio recording error", recordError)
      setIsRecordingAudio(false)
      setError("No se pudo acceder al micrófono. Permite el permiso del navegador e intenta de nuevo.")
    }
  }, [])

  const stopVoiceRecording = useCallback(async () => {
    try {
      if (audioProcessorRef.current) {
        audioProcessorRef.current.disconnect()
        audioProcessorRef.current.onaudioprocess = null
        audioProcessorRef.current = null
      }

      if (audioSourceRef.current) {
        audioSourceRef.current.disconnect()
        audioSourceRef.current = null
      }

      if (audioContextRef.current) {
        await audioContextRef.current.close().catch(() => undefined)
        audioContextRef.current = null
      }

      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach((track) => track.stop())
        audioStreamRef.current = null
      }

      const pcm = mergeInt16Chunks(audioPcmChunksRef.current)
      audioPcmChunksRef.current = []

      if (pcm.length > 0) {
        const lamejs = await ensureLameJsLoaded()
        const encoder = new lamejs.Mp3Encoder(1, audioSampleRateRef.current || 44100, 128)
        const mp3Chunks: Uint8Array[] = []

        const sampleBlockSize = 1152
        for (let offset = 0; offset < pcm.length; offset += sampleBlockSize) {
          const chunk = pcm.subarray(offset, offset + sampleBlockSize)
          const encodedChunk = encoder.encodeBuffer(chunk)
          if (encodedChunk.length > 0) {
            mp3Chunks.push(new Uint8Array(encodedChunk))
          }
        }

        const flushData = encoder.flush()
        if (flushData.length > 0) {
          mp3Chunks.push(new Uint8Array(flushData))
        }

        if (mp3Chunks.length > 0) {
          const blobParts = mp3Chunks.map((chunk) =>
            chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength) as ArrayBuffer,
          )
          const blob = new Blob(blobParts, { type: "audio/mpeg" })
          const voiceFile = new File([blob], `nota-voz-${Date.now()}.mp3`, {
            type: "audio/mpeg",
          })
          setSelectedFile(voiceFile)
        }
      }
    } finally {
      setIsRecordingAudio(false)
    }
  }, [])

  const handleComposerKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key !== "Enter" || event.shiftKey) {
        return
      }

      event.preventDefault()

      if (isSending) {
        return
      }

      handleSendMessage()
    },
    [handleSendMessage, isSending],
  )

  return (
    <div className="h-full min-h-0 overflow-hidden bg-background">
      <main className="container mx-auto flex h-full min-h-0 flex-col gap-2 px-2 py-2 md:px-4 md:py-4">

        {error ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {warnings.map((warning) => (
          <Alert key={warning}>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Conexión parcial</AlertTitle>
            <AlertDescription>{warning}</AlertDescription>
          </Alert>
        ))}

        <section className="min-h-0 flex-1 overflow-hidden rounded-xl border bg-card">
          <div className="grid h-full min-h-0 grid-cols-1 lg:grid-cols-[330px_minmax(0,1fr)]">
            <aside
              className={cn(
                "min-h-0 flex-col border-b lg:flex lg:border-r lg:border-b-0",
                showChatListPanel ? "flex" : "hidden",
              )}
            >
              <div className="space-y-4 border-b p-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Chats</p>
                  <h2 className="text-3xl font-semibold">{filteredConversations.length} activos</h2>
                  <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <Smartphone className="h-3.5 w-3.5" />
                    <span>{phoneDisplay || "Número de Meta no disponible"}</span>
                  </div>
                </div>

                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por nombre o teléfono"
                    className="pl-9"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                  />
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={filterMode === "all" ? "default" : "outline"}
                    onClick={() => setFilterMode("all")}
                  >
                    Todos
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={filterMode === "unread" ? "default" : "outline"}
                    onClick={() => setFilterMode("unread")}
                  >
                    No leídos ({unreadCount})
                  </Button>
                </div>
              </div>

              <ScrollArea className="min-h-0 flex-1">
                <div>
                  {isLoadingConversations ? (
                    <div className="space-y-3 p-4">
                      {Array.from({ length: 5 }).map((_, index) => (
                        <div key={index} className="space-y-2">
                          <Skeleton className="h-4 w-2/3" />
                          <Skeleton className="h-3 w-full" />
                        </div>
                      ))}
                    </div>
                  ) : filteredConversations.length > 0 ? (
                    filteredConversations.map((conversation) => (
                      <button
                        key={conversation.id}
                        type="button"
                        onClick={() => {
                          setSelectedChatId(conversation.id)
                          setManualChatClosed(false)
                        }}
                        className={cn(
                          "flex w-full items-start gap-3 border-b p-4 text-left transition-colors hover:bg-muted/40",
                          selectedChatId === conversation.id && "bg-muted/50",
                        )}
                      >
                        <Avatar className="h-10 w-10">
                          <AvatarFallback>{conversation.initials}</AvatarFallback>
                        </Avatar>

                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className="truncate text-sm font-semibold">{conversation.name}</p>
                            <span className="shrink-0 text-[10px] text-muted-foreground">{conversation.dateLabel}</span>
                          </div>

                          <p className="truncate text-sm text-muted-foreground">{conversation.snippet}</p>

                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="text-xs">
                              {conversation.channel}
                            </Badge>
                            {conversation.isUnread ? (
                              <Badge className="text-xs">{conversation.unreadCount} nuevo(s)</Badge>
                            ) : null}
                          </div>
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="p-4 text-sm text-muted-foreground">
                      No hay conversaciones para el filtro seleccionado.
                    </div>
                  )}
                </div>
              </ScrollArea>
            </aside>

            <div className={cn("relative h-full min-h-0 flex-col", showChatDetailPanel ? "flex" : "hidden") }>
              {selectedConversation ? (
                <>
                  <header className="flex items-center justify-between gap-4 border-b px-5 py-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        {isMobile ? (
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => {
                              setSelectedChatId(null)
                              setManualChatClosed(false)
                            }}
                            aria-label="Volver a chats"
                          >
                            <ArrowLeft className="h-4 w-4" />
                          </Button>
                        ) : null}
                        <p className="truncate text-base font-semibold">{selectedConversation.name}</p>
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <p className="text-xs text-muted-foreground">+{normalizePhone(selectedConversation.waId ?? selectedConversation.id)}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-[120px] items-center justify-between gap-2 rounded-lg border bg-background px-2 py-1.5 md:h-10 md:w-[132px]">
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">BOT IA</p>
                        </div>
                        <Switch
                          checked={isBotEnabled}
                          onCheckedChange={(checked) => {
                            void handleBotToggle(checked)
                          }}
                          disabled={isUpdatingBotState}
                          aria-label="Activar bot de IA"
                        />
                      </div>

                      <Button
                        type="button"
                        size="sm"
                        className="hidden md:inline-flex"
                        onClick={() => {
                          setSelectedChatId(null)
                          setManualChatClosed(true)
                          setMessages([])
                          setComposerText("")
                          setSelectedFile(null)
                        }}
                      >
                        Cerrar chat
                      </Button>
                    </div>
                  </header>

                  <div ref={messagesScrollContainerRef} className="min-h-0 flex-1">
                    <ScrollArea className="h-full bg-muted/20 px-3 py-4 md:px-5">
                      <div
                        className="space-y-4 pb-3"
                        onPointerDown={(event) => {
                          const target = event.target as HTMLElement
                          if (target.closest("[data-reaction-ui='1']")) {
                            return
                          }

                          setReactionPickerTargetMessageId(null)
                          setReactionExpandedTargetMessageId(null)
                        }}
                      >
                      {isLoadingMessages ? (
                        <div className="space-y-3">
                          {Array.from({ length: 4 }).map((_, index) => (
                            <div key={index} className="space-y-2">
                              <Skeleton className="h-5 w-2/5" />
                              <Skeleton className="h-12 w-3/5" />
                            </div>
                          ))}
                        </div>
                      ) : chatRenderItems.length === 0 ? (
                        <div className="pt-16 text-center text-muted-foreground">
                          Esta conversación todavía no tiene mensajes.
                        </div>
                      ) : (
                        chatRenderItems.map((item) => {
                          const message = item.message
                          const isOutbound = message.direction === "outbound"
                          const canReactFromRow = item.kind === "message" && Boolean(message.wamid)
                          const showReactionHoverButton =
                            !isMobile &&
                            canReactFromRow &&
                            (hoveredMessageId === message.id ||
                              reactionPickerTargetMessageId === message.id ||
                              reactionExpandedTargetMessageId === message.id)
                          const mediaUrl = message.mediaId
                            ? withTenantQuery(`/api/admin/conversations/media/${encodeURIComponent(message.mediaId)}`)
                            : null

                          return (
                            <div
                              key={`${item.kind}-${message.id}`}
                              className={cn("flex", isOutbound ? "items-center justify-end gap-2" : "justify-start")}
                              onMouseEnter={() => {
                                if (!isMobile && canReactFromRow) {
                                  setHoveredMessageId(message.id)
                                }
                              }}
                              onMouseLeave={() => {
                                if (!isMobile && hoveredMessageId === message.id) {
                                  setHoveredMessageId(null)
                                }
                              }}
                            >
                              {showReactionHoverButton && isOutbound ? (
                                <button
                                  type="button"
                                  data-reaction-ui="1"
                                  className="inline-flex h-7 w-7 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm transition-colors hover:text-foreground"
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    setReactionPickerTargetMessageId((current) =>
                                      current === message.id ? null : message.id,
                                    )
                                    setReactionExpandedTargetMessageId(null)
                                  }}
                                  aria-label="Abrir reacciones"
                                >
                                  <Smile className="h-4 w-4" />
                                </button>
                              ) : null}

                              <div className={cn("relative flex max-w-[88%] flex-col md:max-w-[78%]", isOutbound ? "items-end" : "items-start")}> 
                                <div
                                  data-reaction-ui="1"
                                  onClick={(event) => {
                                    if (isMobile || item.kind !== "message" || !message.wamid) {
                                      return
                                    }

                                    event.stopPropagation()
                                    setReactionPickerTargetMessageId((current) =>
                                      current === message.id ? null : message.id,
                                    )
                                    setReactionExpandedTargetMessageId(null)
                                  }}
                                  onPointerDown={(event) => {
                                    if (!isMobile || item.kind !== "message" || !message.wamid) {
                                      return
                                    }

                                    event.stopPropagation()
                                    clearReactionLongPress()
                                    reactionLongPressTimeoutRef.current = window.setTimeout(() => {
                                      setReactionPickerTargetMessageId(message.id)
                                      setReactionExpandedTargetMessageId(null)
                                    }, 380)
                                  }}
                                  onPointerUp={() => clearReactionLongPress()}
                                  onPointerCancel={() => clearReactionLongPress()}
                                  onPointerLeave={() => clearReactionLongPress()}
                                  className={cn(
                                    "w-full space-y-2 rounded-2xl px-4 py-3 text-sm shadow-sm",
                                    isOutbound ? "bg-primary text-primary-foreground" : "bg-background",
                                  )}
                                >
                                  {item.kind === "orphan-reaction" ? (
                                    <div className="space-y-2">
                                      <div
                                        className={cn(
                                          "rounded-lg border px-3 py-2 text-xs",
                                          isOutbound
                                            ? "border-primary-foreground/25 bg-primary-foreground/10 text-primary-foreground/90"
                                            : "border-border bg-muted/60 text-muted-foreground",
                                        )}
                                      >
                                        {message.reactionToSnippet || "Mensaje original"}
                                      </div>
                                      <p className="text-lg leading-none">{message.reactionEmoji ?? "👍"}</p>
                                    </div>
                                  ) : null}

                                {message.type === "image" && mediaUrl ? (
                                  <a href={mediaUrl} target="_blank" rel="noreferrer" className="block">
                                    <img
                                      src={mediaUrl}
                                      alt="Imagen enviada"
                                      className="max-h-72 min-w-[220px] rounded-lg object-cover"
                                    />
                                  </a>
                                ) : null}

                                {message.type === "audio" && mediaUrl ? (
                                  <CompactAudioPlayer
                                    src={mediaUrl}
                                    seed={message.wamid ?? message.id}
                                    mimeType={message.mediaMimeType}
                                    tone={isOutbound ? "outbound" : "inbound"}
                                  />
                                ) : null}

                                {(message.type === "document" || message.type === "video") && mediaUrl ? (
                                  <a
                                    href={mediaUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className={cn(
                                      "inline-flex items-center gap-2 rounded-md border px-3 py-2 text-xs",
                                      isOutbound ? "border-primary-foreground/30" : "border-border",
                                    )}
                                  >
                                    {message.type === "video" ? <ImageIcon className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                                    {message.mediaFilename || "Abrir adjunto"}
                                  </a>
                                ) : null}

                                {message.text && item.kind !== "orphan-reaction" ? (
                                  <p className="whitespace-pre-wrap break-words break-all">{message.text}</p>
                                ) : null}

                                {message.mediaCaption && !message.text && item.kind !== "orphan-reaction" ? (
                                  <p className="whitespace-pre-wrap break-words break-all">{message.mediaCaption}</p>
                                ) : null}

                                <div className={cn("flex items-center gap-2 text-[11px]", isOutbound ? "justify-end text-primary-foreground/80" : "text-muted-foreground")}>
                                  <span>{message.timeLabel || message.dateLabel}</span>
                                  {isOutbound && message.status ? <span>{formatStatus(message.status)}</span> : null}
                                </div>

                              </div>

                                {item.kind === "message" && message.wamid && reactionPickerTargetMessageId === message.id ? (
                                  <div
                                    data-reaction-ui="1"
                                    className={cn(
                                      "absolute z-20 flex items-center gap-1 rounded-full border bg-white px-2 py-1 shadow-lg",
                                      isOutbound ? "right-2 -top-12" : "left-2 -top-12",
                                    )}
                                    onPointerDown={(event) => event.stopPropagation()}
                                  >
                                    {QUICK_REACTION_EMOJIS.map((emoji) => (
                                      <button
                                        key={`${message.id}-${emoji}`}
                                        type="button"
                                        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-xl transition-transform hover:scale-110"
                                        onClick={(event) => {
                                          event.stopPropagation()
                                          if (isSendingReaction) {
                                            return
                                          }

                                          void handleSendReaction(message, emoji)
                                        }}
                                        aria-label={`Reaccionar con ${emoji}`}
                                      >
                                        {emoji}
                                      </button>
                                    ))}
                                    <button
                                      type="button"
                                      className="inline-flex h-8 w-8 items-center justify-center rounded-full border text-lg text-muted-foreground"
                                      onClick={(event) => {
                                        event.stopPropagation()
                                        setReactionExpandedTargetMessageId((current) =>
                                          current === message.id ? null : message.id,
                                        )
                                      }}
                                      aria-label="Ver más reacciones"
                                    >
                                      +
                                    </button>
                                  </div>
                                ) : null}

                                {item.kind === "message" && message.wamid && reactionExpandedTargetMessageId === message.id ? (
                                  <div
                                    data-reaction-ui="1"
                                    className={cn(
                                      "absolute z-30 w-[280px] rounded-2xl border bg-white p-2 shadow-xl",
                                      isOutbound ? "right-2 -top-[180px]" : "left-2 -top-[180px]",
                                    )}
                                    onPointerDown={(event) => event.stopPropagation()}
                                  >
                                    <div className="mb-2 flex items-center justify-between px-1">
                                      <p className="text-xs font-medium text-muted-foreground">Más reacciones</p>
                                      <button
                                        type="button"
                                        className="text-xs text-muted-foreground hover:text-foreground"
                                        onClick={(event) => {
                                          event.stopPropagation()
                                          setReactionExpandedTargetMessageId(null)
                                        }}
                                      >
                                        Cerrar
                                      </button>
                                    </div>
                                    <div className="grid grid-cols-10 gap-1">
                                      {EXTENDED_REACTION_EMOJIS.map((emoji) => (
                                        <button
                                          key={`${message.id}-extended-${emoji}`}
                                          type="button"
                                          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-xl transition-transform hover:scale-110"
                                          onClick={(event) => {
                                            event.stopPropagation()
                                            if (isSendingReaction) {
                                              return
                                            }

                                            setReactionExpandedTargetMessageId(null)
                                            void handleSendReaction(message, emoji)
                                          }}
                                          aria-label={`Reaccionar con ${emoji}`}
                                        >
                                          {emoji}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                ) : null}

                                {item.kind === "message" && item.latestReaction ? (
                                  <span
                                    title={`Reacción ${item.latestReaction.timeLabel || item.latestReaction.dateLabel}`}
                                    className={cn(
                                      "-mt-2 inline-flex min-w-7 items-center justify-center rounded-full border px-2 py-0.5 text-base leading-none shadow-sm",
                                      isOutbound
                                        ? "mr-3 border-primary-foreground/30 bg-muted"
                                        : "ml-3 border-border bg-muted",
                                    )}
                                  >
                                    {item.latestReaction.reactionEmoji ?? "👍"}
                                  </span>
                                ) : null}
                              </div>

                              {showReactionHoverButton && !isOutbound ? (
                                <button
                                  type="button"
                                  data-reaction-ui="1"
                                  className="inline-flex h-7 w-7 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm transition-colors hover:text-foreground"
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    setReactionPickerTargetMessageId((current) =>
                                      current === message.id ? null : message.id,
                                    )
                                    setReactionExpandedTargetMessageId(null)
                                  }}
                                  aria-label="Abrir reacciones"
                                >
                                  <Smile className="h-4 w-4" />
                                </button>
                              ) : null}

                              {isOutbound ? (
                                <span
                                  title={getOutboundSenderLabel(message)}
                                  className={cn(
                                    "mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/25 text-[10px] font-semibold text-white shadow",
                                    message.sentByType === "human" ? "bg-sky-500" : "bg-blue-700",
                                  )}
                                >
                                  {getOutboundSenderInitials(message)}
                                </span>
                              ) : null}
                            </div>
                          )
                        })
                      )}
                        <div ref={endOfMessagesRef} className="h-px" />
                      </div>
                    </ScrollArea>
                  </div>

                  {messages.length > 0 && hasScrollableMessages && !isAtBottom ? (
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className="absolute bottom-[78px] right-4 z-30 h-9 w-9 rounded-full bg-background shadow md:bottom-20"
                      onClick={() => {
                        scrollMessagesToBottom("smooth")
                        setIsAtBottom(true)
                      }}
                      aria-label="Ir al último mensaje"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  ) : null}

                  <footer className="sticky bottom-0 z-20 bg-card p-2">
                    {selectedFile ? (
                      <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs">
                        <div className="mb-2 flex items-center justify-end">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setSelectedFile(null)
                              if (documentInputRef.current) documentInputRef.current.value = ""
                              if (galleryInputRef.current) galleryInputRef.current.value = ""
                              if (cameraInputRef.current) cameraInputRef.current.value = ""
                              if (audioInputRef.current) audioInputRef.current.value = ""
                            }}
                          >
                            Quitar
                          </Button>
                        </div>

                        {selectedFile.type.startsWith("image/") && selectedFilePreviewUrl ? (
                          <img
                            src={selectedFilePreviewUrl}
                            alt="Vista previa del adjunto"
                            className="max-h-44 rounded-md border object-cover"
                          />
                        ) : null}

                        {selectedFile.type.startsWith("video/") && selectedFilePreviewUrl ? (
                          <video controls className="max-h-48 rounded-md border">
                            <source src={selectedFilePreviewUrl} type={selectedFile.type} />
                          </video>
                        ) : null}

                        {selectedFile.type.startsWith("audio/") && selectedFilePreviewUrl ? (
                          <CompactAudioPlayer
                            src={selectedFilePreviewUrl}
                            seed={selectedFile.name}
                            mimeType={selectedFile.type || "audio/mpeg"}
                            tone="preview"
                          />
                        ) : null}

                        {(selectedFile.type === "application/pdf" || /\.pdf$/i.test(selectedFile.name)) &&
                        selectedFilePreviewUrl ? (
                          <div className="space-y-2">
                            <p className="truncate font-medium">{selectedFile.name}</p>
                            <div className="mx-auto w-full max-w-[280px] overflow-hidden rounded-md border bg-background">
                              <iframe
                                src={`${selectedFilePreviewUrl}#view=FitH&toolbar=0&navpanes=0&scrollbar=0`}
                                title="Vista previa del PDF"
                                className="h-[320px] w-full"
                              />
                            </div>
                          </div>
                        ) : null}

                        {!selectedFile.type.startsWith("image/") &&
                        !selectedFile.type.startsWith("video/") &&
                        !selectedFile.type.startsWith("audio/") &&
                        !(selectedFile.type === "application/pdf" || /\.pdf$/i.test(selectedFile.name)) ? (
                          <div className="inline-flex items-center gap-2 rounded-md border px-2 py-1 text-xs">
                            <FileText className="h-4 w-4" />
                            <span className="truncate">{selectedFile.name}</span>
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    {isRecordingAudio ? (
                      <div className="mb-2 flex items-center justify-between rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                        <div className="flex items-center gap-2">
                          <Circle className="h-3 w-3 fill-current" />
                          Grabando nota de voz · {recordingSeconds}s
                        </div>
                        <Button type="button" size="sm" variant="outline" onClick={stopVoiceRecording}>
                          Detener
                        </Button>
                      </div>
                    ) : null}

                    <div className="mt-1 flex items-end gap-2">
                      <input
                        ref={documentInputRef}
                        type="file"
                        className="hidden"
                        accept="application/pdf,.doc,.docx,.txt"
                        onChange={handleFileChange}
                      />
                      <input
                        ref={galleryInputRef}
                        type="file"
                        className="hidden"
                        accept="image/*,video/*"
                        onChange={handleFileChange}
                      />
                      <input
                        ref={cameraInputRef}
                        type="file"
                        className="hidden"
                        accept="image/*,video/*"
                        capture="environment"
                        onChange={handleFileChange}
                      />
                      <input
                        ref={audioInputRef}
                        type="file"
                        className="hidden"
                        accept="audio/*"
                        onChange={handleFileChange}
                      />

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            className="h-10 w-10"
                            aria-label="Adjuntar"
                            disabled={isBotEnabled || isSending || isUpdatingBotState}
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" side="top" className="w-52">
                          <DropdownMenuItem onSelect={() => openAttachmentPicker("document")}>
                            <FileText className="h-4 w-4" />
                            Documento
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => openAttachmentPicker("gallery")}>
                            <Images className="h-4 w-4" />
                            Fotos y videos
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => openAttachmentPicker("camera")}>
                            <Camera className="h-4 w-4" />
                            Cámara
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => openAttachmentPicker("audio")}>
                            <FileAudio className="h-4 w-4" />
                            Audio
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>

                      <Textarea
                        ref={composerRef}
                        value={composerText}
                        onChange={(event) => setComposerText(event.target.value)}
                        onKeyDown={handleComposerKeyDown}
                        placeholder={
                          isBotEnabled
                            ? "Bot IA activo: desactívalo para responder manualmente"
                            : "Mensaje"
                        }
                        className="min-h-10 max-h-36 resize-none overflow-y-auto"
                        disabled={isBotEnabled || isSending || isUpdatingBotState}
                      />

                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        className="h-10 w-10"
                        title={isRecordingAudio ? "Detener grabación" : "Grabar nota de voz"}
                        disabled={isBotEnabled || isSending || isUpdatingBotState}
                        onClick={() => {
                          if (isRecordingAudio) {
                            stopVoiceRecording()
                            return
                          }

                          void startVoiceRecording()
                        }}
                      >
                        <Mic className="h-4 w-4" />
                      </Button>
                    </div>
                  </footer>
                </>
              ) : (
                <div className="flex h-full items-center justify-center p-6">
                  <div className="text-center">
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-xl border bg-muted/40">
                      <MessageSquare className="h-7 w-7 text-muted-foreground" />
                    </div>
                    <h3 className="text-2xl font-semibold">Selecciona una conversación</h3>
                    <p className="mt-2 text-muted-foreground">Elige un contacto del panel izquierdo para ver su chat.</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        <Dialog open={isCameraDialogOpen} onOpenChange={setIsCameraDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Tomar foto</DialogTitle>
              <DialogDescription>
                Permite que la app use tu cámara cuando el navegador lo solicite. Luego toma la foto y se adjuntará al chat.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <div className="overflow-hidden rounded-md border bg-muted/30">
                <video ref={cameraVideoRef} autoPlay muted playsInline className="aspect-video w-full bg-black" />
              </div>

              {isCameraStarting ? <p className="text-sm text-muted-foreground">Abriendo cámara...</p> : null}
              {cameraError ? <p className="text-sm text-destructive">{cameraError}</p> : null}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => cameraInputRef.current?.click()}>
                Usar selector de archivo
              </Button>
              <Button type="button" onClick={() => void capturePhotoFromCamera()} disabled={isCameraStarting}>
                Tomar foto
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  )
}
