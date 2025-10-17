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
  const [isAuthorized, setIsAuthorized] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const userRole = localStorage.getItem("userRole") as UserRole | null

    if (!userRole) {
      router.push("/login")
      return
    }

    if (!allowedRoles.includes(userRole)) {
      router.push("/login")
      return
    }

    setIsAuthorized(true)
    setIsLoading(false)
  }, [router, allowedRoles])

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  if (!isAuthorized) {
    return null
  }

  return <>{children}</>
}
