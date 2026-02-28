"use client"

import dynamic from "next/dynamic"

const LoginScreen = dynamic(() => import("./login-screen"), {
  ssr: false,
})

export default function LoginPage() {
  return <LoginScreen />
}
