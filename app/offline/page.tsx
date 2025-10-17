export const metadata = {
  title: "BarberPro sin conexión",
}

export default function OfflinePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <h1 className="text-2xl font-semibold">Estás sin conexión</h1>
      <p className="max-w-md text-muted-foreground">
        Parece que no hay conexión a internet. Puedes seguir explorando algunas secciones ya guardadas y, en cuanto vuelva la red, se actualizará la información.
      </p>
    </main>
  )
}
