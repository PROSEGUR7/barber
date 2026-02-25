"use client"

import { useEffect, useMemo, useState } from "react"
import { AlertCircle, MessageSquare, Search, Smartphone } from "lucide-react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"

type ChatPreview = {
  id: string
  name: string
  initials: string
  snippet: string
  channel: "WhatsApp"
  owner: "Humano" | "IA"
  dateLabel: string
  isUnread?: boolean
}

type ConversationsResponse = {
  ok?: boolean
  connected?: boolean
  phone?: {
    id?: string
    displayPhoneNumber?: string
    verifiedName?: string
    qualityRating?: string
  }
  conversations?: ChatPreview[]
  warnings?: string[]
  error?: string
  detail?: string
}

export default function AdminConversacionesPage() {
  const [chats, setChats] = useState<ChatPreview[]>([])
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [phoneInfo, setPhoneInfo] = useState<ConversationsResponse["phone"] | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    async function loadConversations() {
      setIsLoading(true)
      setError(null)

      try {
        const response = await fetch("/api/admin/conversations?limit=25", {
          signal: controller.signal,
          cache: "no-store",
        })

        const data = (await response.json().catch(() => ({}))) as ConversationsResponse

        if (!response.ok || !data.ok) {
          throw new Error(data.error ?? data.detail ?? "No se pudo cargar la bandeja de conversaciones")
        }

        if (!controller.signal.aborted) {
          const nextChats = Array.isArray(data.conversations) ? data.conversations : []
          setChats(nextChats)
          setWarnings(Array.isArray(data.warnings) ? data.warnings : [])
          setPhoneInfo(data.phone ?? null)
          setSelectedChatId((current) => current ?? nextChats[0]?.id ?? null)
        }
      } catch (requestError) {
        if (controller.signal.aborted) {
          return
        }

        console.error("Error loading admin conversations", requestError)
        setError(requestError instanceof Error ? requestError.message : "No se pudo cargar la bandeja de conversaciones")
        setChats([])
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false)
        }
      }
    }

    void loadConversations()

    return () => controller.abort()
  }, [])

  const filteredChats = useMemo(() => {
    const normalized = searchTerm.trim().toLowerCase()

    if (!normalized) {
      return chats
    }

    return chats.filter((chat) => {
      const text = `${chat.name} ${chat.snippet}`.toLowerCase()
      return text.includes(normalized)
    })
  }, [chats, searchTerm])

  const selectedChat = useMemo(
    () => filteredChats.find((chat) => chat.id === selectedChatId) ?? null,
    [filteredChats, selectedChatId],
  )

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto space-y-6 px-4 py-8">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold">Conversaciones</h1>
        </header>

        {error ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error de conexión</AlertTitle>
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

        <section className="overflow-hidden rounded-xl border bg-card">
          <div className="grid min-h-[640px] grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)]">
            <aside className="border-b lg:border-r lg:border-b-0">
              <div className="space-y-4 border-b p-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Chats</p>
                  <h2 className="text-2xl font-semibold">{filteredChats.length} activos</h2>
                  <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <Smartphone className="h-3.5 w-3.5" />
                    <span>{phoneInfo?.displayPhoneNumber || "Número de Meta no disponible"}</span>
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
                  <Badge>Todos</Badge>
                  <Badge variant="outline">No leídos</Badge>
                </div>
              </div>

              <ScrollArea className="h-[480px] lg:h-[540px]">
                <div>
                  {isLoading ? (
                    <div className="space-y-3 p-4">
                      {Array.from({ length: 4 }).map((_, index) => (
                        <div key={index} className="space-y-2">
                          <Skeleton className="h-4 w-2/3" />
                          <Skeleton className="h-3 w-full" />
                        </div>
                      ))}
                    </div>
                  ) : (
                    filteredChats.map((chat) => (
                      <button
                        key={chat.id}
                        type="button"
                        onClick={() => setSelectedChatId(chat.id)}
                        className={`flex w-full items-start gap-3 border-b p-4 text-left transition-colors hover:bg-muted/40 ${
                          selectedChatId === chat.id ? "bg-muted/50" : ""
                        }`}
                      >
                        <Avatar className="h-9 w-9">
                          <AvatarFallback>{chat.initials}</AvatarFallback>
                        </Avatar>

                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className="truncate text-sm font-semibold">{chat.name}</p>
                            <span className="shrink-0 text-xs text-muted-foreground">{chat.dateLabel}</span>
                          </div>

                          <p className="truncate text-sm text-muted-foreground">{chat.snippet}</p>

                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="text-xs">
                              {chat.channel}
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              {chat.owner}
                            </Badge>
                            {chat.isUnread ? <span className="text-xs font-medium text-foreground">Nuevo</span> : null}
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </ScrollArea>
            </aside>

            <div className="flex h-full min-h-[460px] items-center justify-center p-6">
              <div className="text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-xl border bg-muted/40">
                  <MessageSquare className="h-7 w-7 text-muted-foreground" />
                </div>
                <h3 className="text-2xl font-semibold">
                  {selectedChat ? selectedChat.name : "Selecciona una conversación"}
                </h3>
                <p className="mt-2 text-muted-foreground">
                  {selectedChat
                    ? selectedChat.snippet
                    : "Elige un contacto del panel izquierdo para ver su chat."}
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}