import withPWAInit from "next-pwa"
import runtimeCaching from "next-pwa/cache.js"

const withPWA = withPWAInit({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
  runtimeCaching,
  fallbacks: {
    document: "/offline",
  },
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep dev and production artifacts isolated to avoid cache/chunk collisions on Windows.
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

export default withPWA(nextConfig)
