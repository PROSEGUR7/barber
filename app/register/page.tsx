"use client"

import dynamic from "next/dynamic"

const RegisterScreen = dynamic(() => import("./register-screen"), {
  ssr: false,
})

export default function RegisterPage() {
  return <RegisterScreen />
}
