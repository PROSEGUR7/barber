"use client"

import dynamic from "next/dynamic"

const AdminDashboardScreen = dynamic(() => import("./admin-dashboard-screen"), {
  ssr: false,
})

export default function AdminPage() {
  return <AdminDashboardScreen />
}
