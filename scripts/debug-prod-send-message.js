/* eslint-disable no-console */

const BASE_URL = process.argv[2] || "https://barber-production-e611.up.railway.app"
const tenant = process.argv[3] || "tenant_prueba"
const userEmail = process.argv[4] || "pruebas@prueba.com"
const messageText = process.argv[5] || `Prueba envío ${new Date().toISOString()}`
const directConversationId = process.argv[6]?.trim() || ""

async function requestJson(path, init = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "x-tenant": tenant,
      "x-user-email": userEmail,
      ...(init.headers || {}),
    },
  })
  const data = await response.json().catch(() => ({}))
  return { status: response.status, data }
}

async function main() {
  console.log({ BASE_URL, tenant, userEmail, messageText, directConversationId: directConversationId || null })

  if (directConversationId) {
    const form = new FormData()
    form.append("text", messageText)
    form.append("contactName", "Contacto directo")

    const sendDirect = await requestJson(`/api/admin/conversations/${encodeURIComponent(directConversationId)}/send`, {
      method: "POST",
      body: form,
    })

    console.log("send direct status:", sendDirect.status)
    console.dir(sendDirect.data, { depth: 5 })
    return
  }

  const conversations = await requestJson("/api/admin/conversations?limit=20")
  console.log("conversations status:", conversations.status)

  if (conversations.status !== 200 || !Array.isArray(conversations.data?.conversations) || conversations.data.conversations.length === 0) {
    console.dir(conversations.data, { depth: 4 })
    return
  }

  const target = conversations.data.conversations[0]
  console.log("target conversation:", target)

  const form = new FormData()
  form.append("text", messageText)
  form.append("contactName", target.name ?? "")

  const send = await requestJson(`/api/admin/conversations/${encodeURIComponent(target.id)}/send`, {
    method: "POST",
    body: form,
  })

  console.log("send status:", send.status)
  console.dir(send.data, { depth: 5 })
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
