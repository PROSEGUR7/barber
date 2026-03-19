'use client'

import * as React from 'react'
import { usePathname } from 'next/navigation'
import {
  ThemeProvider as NextThemesProvider,
  type ThemeProviderProps,
} from 'next-themes'

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  const pathname = usePathname()
  const normalizedPath = (pathname ?? '/').replace(/\/+$/, '') || '/'
  const shouldForceLight = normalizedPath === '/' || normalizedPath === '/login'

  return (
    <NextThemesProvider
      {...props}
      forcedTheme={shouldForceLight ? 'light' : props.forcedTheme}
    >
      {children}
    </NextThemesProvider>
  )
}
