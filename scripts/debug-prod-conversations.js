/* eslint-disable no-console */

const BASE_URL = process.argv[2] || "https://barber-production-e611.up.railway.app"
const tenant = process.argv[3] || "tenant_prueba"
const userEmail = process.argv[4] || "pruebas@prueba.com"

async function requestJson(path) {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: {
      "x-tenant": tenant,
      "x-user-email": userEmail,
    },
  })

  const data = await response.json().catch(() => ({}))
  return { status: response.status, data }
}

async function main() {
  console.log({ BASE_URL, tenant, userEmail })

  const conversations = await requestJson("/api/admin/conversations?limit=20")
  console.log("conversations status:", conversations.status)
  console.dir(conversations.data, { depth: 4 })

  const list = Array.isArray(conversations.data?.conversations) ? conversations.data.conversations : []

  for (const conversation of list.slice(0, 5)) {
    const id = encodeURIComponent(conversation.id)
    const messages = await requestJson(`/api/admin/conversations/${id}/messages?limit=50`)

    console.log(`messages for ${conversation.id} => status ${messages.status}`)
    if (messages.status !== 200) {
      console.dir(messages.data, { depth: 4 })
    } else {
      console.log(`count=${Array.isArray(messages.data?.messages) ? messages.data.messages.length : 0}`)
    }
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
