/* eslint-disable no-console */

async function main() {
  const payload = {
    userId: Number(process.argv[2] ?? ""),
    serviceId: Number(process.argv[3] ?? ""),
    barberId: Number(process.argv[4] ?? ""),
    start: String(process.argv[5] ?? ""),
  }

  if (!payload.userId || !payload.serviceId || !payload.barberId || !payload.start) {
    console.error(
      "Usage: node scripts/test-reservation.js <userId> <serviceId> <barberId> <startISO>",
    )
    process.exit(1)
  }

  const res = await fetch("http://localhost:3000/api/reservations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })

  const text = await res.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    // ignore
  }

  console.log("Status:", res.status)
  console.log("Body:", json ?? text)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
