"use client"

import dynamic from "next/dynamic"

const AdminPlanesScreen = dynamic(() => import("./planes-screen"), {
  ssr: false,
})

export default function AdminPlanesPage() {
  return <AdminPlanesScreen />
}
