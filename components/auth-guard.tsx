"use client"

import type React from "react"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Spinner } from "@/components/ui/spinner"

type UserRole = "client" | "barber" | "admin"

interface AuthGuardProps {
  children: React.ReactNode
  allowedRoles: UserRole[]
}

export function AuthGuard({ children, allowedRoles }: AuthGuardProps) {
  const router = useRouter()
  const [isMounted, setIsMounted] = useState(false)
  const [isAuthorized, setIsAuthorized] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  useEffect(() => {
    if (!isMounted) {
      return
    }

    const userRole = localStorage.getItem("userRole") as UserRole | null

    if (!userRole) {
      setIsAuthorized(false)
      setIsLoading(false)
      router.push("/login")
      return
    }

    if (!allowedRoles.includes(userRole)) {
      setIsAuthorized(false)
      setIsLoading(false)
      router.push("/login")
      return
    }

    setIsAuthorized(true)
    setIsLoading(false)
  }, [isMounted, router, allowedRoles])

  if (!isMounted) {
    return null
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" suppressHydrationWarning>
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  if (!isAuthorized) {
    return null
  }

  return <>{children}</>
}
