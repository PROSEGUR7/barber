"use client"

import dynamic from "next/dynamic"

const AdminPagosScreen = dynamic(() => import("./pagos-screen"), {
  ssr: false,
})

export default function AdminPagosPage() {
  return <AdminPagosScreen />
}
