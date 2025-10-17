import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server"
import { isoBase64URL } from "@simplewebauthn/server/helpers"
import { parse } from "tldts"
import type {
  AuthenticationResponseJSON,
  AuthenticatorSelectionCriteria,
  AuthenticatorTransport,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/types"

import { findUserByEmail, findUserById } from "@/lib/auth"
import { pool } from "@/lib/db"

const DEFAULT_APP_URL = "http://localhost:3000"

function getAppUrl() {
  const fromEnv = process.env.WEBAUTHN_ORIGIN ?? process.env.NEXT_PUBLIC_APP_URL
  try {
    return fromEnv ? new URL(fromEnv).origin : new URL(DEFAULT_APP_URL).origin
  } catch (error) {
    console.warn("Invalid WEBAUTHN origin env value, falling back to default", error)
    return DEFAULT_APP_URL
  }
}

const RP_NAME = process.env.WEBAUTHN_RP_NAME ?? "BarberPro"
const ORIGIN = getAppUrl()

function cleanHost(value: string): string {
  if (!value) {
    return value
  }

  try {
    const url = value.includes("//") ? new URL(value) : new URL(`https://${value}`)
    return url.hostname.toLowerCase()
  } catch (error) {
    const withoutPort = value.split(":")[0]
    return withoutPort.toLowerCase()
  }
}

// Map a host to the registrable domain so passkeys issued on one subdomain
// work across other subdomains of the same site.
function resolveRegistrableDomain(hostname: string): string | null {
  if (!hostname) {
    return null
  }

  const parsed = parse(hostname, { allowPrivateDomains: true })

  if (parsed.isIp === true || hostname === "localhost") {
    return hostname
  }

  if (parsed.domain) {
    return parsed.domain
  }

  return null
}

function resolveRpId(requestOrigin?: string | null, rpIdHint?: string | null): string {
  if (process.env.WEBAUTHN_RP_ID) {
    return process.env.WEBAUTHN_RP_ID
  }

  if (rpIdHint) {
    const sanitized = cleanHost(rpIdHint)
    if (sanitized) {
      const registrable = resolveRegistrableDomain(sanitized)
      if (registrable) {
        return registrable
      }
      return sanitized
    }
  }

  if (requestOrigin) {
    const normalized = normalizeOrigin(requestOrigin)
    if (normalized) {
      try {
        const host = new URL(normalized).hostname
        const registrable = resolveRegistrableDomain(host)
        if (registrable) {
          return registrable
        }
        return host
      } catch (error) {
        console.warn("Failed to resolve RP ID from request origin", normalized, error)
      }
    }
  }

  try {
    const host = new URL(getAppUrl()).hostname
    const registrable = resolveRegistrableDomain(host)
    if (registrable) {
      return registrable
    }
    return host
  } catch (error) {
    console.warn("Falling back to localhost RP ID", error)
    return "localhost"
  }
}

function parseAllowedOrigins() {
  const configured = process.env.WEBAUTHN_ALLOWED_ORIGINS ?? ""
  return configured
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
}

function normalizeOrigin(value: string): string | null {
  try {
    return new URL(value).origin
  } catch (error) {
    console.warn("Ignoring invalid origin value", value, error)
    return null
  }
}

function getExpectedOrigins(requestOrigin?: string | null): string[] {
  const origins = new Set<string>()

  const primary = normalizeOrigin(ORIGIN) ?? ORIGIN
  origins.add(primary)

  const additionalFromEnv = parseAllowedOrigins()
  additionalFromEnv.forEach((item) => {
    const normalized = normalizeOrigin(item) ?? item
    origins.add(normalized)
  })

  if (requestOrigin) {
    const normalized = normalizeOrigin(requestOrigin) ?? requestOrigin
    origins.add(normalized)
  }

  if (process.env.NODE_ENV !== "production") {
    ;["http://localhost:3000", "http://localhost:3001", "http://127.0.0.1:3000", "http://127.0.0.1:3001"].forEach(
      (devOrigin) => {
        const normalized = normalizeOrigin(devOrigin) ?? devOrigin
        origins.add(normalized)
      },
    )
  }

  return Array.from(origins)
}

let ensuredTablesPromise: Promise<void> | null = null

async function ensureTables() {
  if (!ensuredTablesPromise) {
    ensuredTablesPromise = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS tenant_base.passkeys (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES tenant_base.users(id) ON DELETE CASCADE,
          credential_id BYTEA NOT NULL UNIQUE,
          public_key BYTEA NOT NULL,
          counter BIGINT NOT NULL DEFAULT 0,
          transports TEXT[] DEFAULT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );

        CREATE TABLE IF NOT EXISTS tenant_base.passkey_challenges (
          user_id INTEGER NOT NULL REFERENCES tenant_base.users(id) ON DELETE CASCADE,
          challenge_type TEXT NOT NULL,
          challenge TEXT NOT NULL,
          expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '10 minutes'),
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY (user_id, challenge_type)
        );
      `)
    })().catch((error) => {
      ensuredTablesPromise = null
      throw error
    })
  }

  return ensuredTablesPromise
}

type PasskeyRow = {
  id: number
  user_id: number
  credential_id: Buffer
  public_key: Buffer
  counter: string | number
  transports: string[] | null
}

type ChallengeType = "registration" | "authentication"

type ChallengeRow = {
  user_id: number
  challenge_type: ChallengeType
  challenge: string
  expires_at: Date
}

type ResidentKeyPreference = "discouraged" | "preferred" | "required"
type UserVerificationPreference = "required" | "preferred" | "discouraged"
type AuthenticatorAttachmentPreference = "platform" | "cross-platform"

type RegistrationOptionsOverrides = {
  authenticatorAttachment?: AuthenticatorAttachmentPreference
  residentKey?: ResidentKeyPreference
  userVerification?: UserVerificationPreference
}

type AuthenticationOptionsOverrides = {
  userVerification?: UserVerificationPreference
  preferPlatformAuthenticator?: boolean
}

type RegistrationOptionsParams = {
  overrides?: RegistrationOptionsOverrides
  requestOrigin?: string | null
  rpIdHint?: string | null
}

type AuthenticationOptionsParams = {
  overrides?: AuthenticationOptionsOverrides
  requestOrigin?: string | null
  rpIdHint?: string | null
}

async function upsertChallenge(userId: number, challengeType: ChallengeType, challenge: string) {
  await pool.query(
    `INSERT INTO tenant_base.passkey_challenges (user_id, challenge_type, challenge, expires_at)
     VALUES ($1, $2, $3, now() + interval '10 minutes')
     ON CONFLICT (user_id, challenge_type)
     DO UPDATE
        SET challenge = EXCLUDED.challenge,
            expires_at = now() + interval '10 minutes',
            created_at = now()` ,
    [userId, challengeType, challenge],
  )
}

async function consumeChallenge(userId: number, challengeType: ChallengeType): Promise<string | null> {
  const result = await pool.query<ChallengeRow>(
    `SELECT user_id, challenge_type, challenge, expires_at
       FROM tenant_base.passkey_challenges
      WHERE user_id = $1 AND challenge_type = $2
      LIMIT 1`,
    [userId, challengeType],
  )

  if (result.rowCount === 0) {
    return null
  }

  const challengeRow = result.rows[0]

  await pool.query(
    `DELETE FROM tenant_base.passkey_challenges
      WHERE user_id = $1 AND challenge_type = $2`,
    [userId, challengeType],
  )

  if (challengeRow.expires_at < new Date()) {
    return null
  }

  return challengeRow.challenge
}

async function getPasskeysForUser(userId: number): Promise<PasskeyRow[]> {
  const result = await pool.query<PasskeyRow>(
    `SELECT id, user_id, credential_id, public_key, counter, transports
       FROM tenant_base.passkeys
      WHERE user_id = $1`,
    [userId],
  )
  return result.rows
}

export async function userHasPasskeys(userId: number): Promise<boolean> {
  await ensureTables()

  const result = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS (
        SELECT 1
          FROM tenant_base.passkeys
         WHERE user_id = $1
         LIMIT 1
      ) AS exists`,
    [userId],
  )

  return result.rows[0]?.exists ?? false
}

async function getPasskeyByCredentialId(credentialId: Buffer): Promise<PasskeyRow | null> {
  const result = await pool.query<PasskeyRow>(
    `SELECT id, user_id, credential_id, public_key, counter, transports
       FROM tenant_base.passkeys
      WHERE credential_id = $1
      LIMIT 1`,
    [credentialId],
  )

  if (result.rowCount === 0) {
    return null
  }

  return result.rows[0]
}

async function savePasskey({
  userId,
  credentialID,
  credentialPublicKey,
  counter,
  transports,
}: {
  userId: number
  credentialID: Buffer
  credentialPublicKey: Buffer
  counter: number
  transports?: string[] | null
}) {
  await pool.query(
    `INSERT INTO tenant_base.passkeys (user_id, credential_id, public_key, counter, transports)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (credential_id)
     DO UPDATE SET counter = EXCLUDED.counter,
                   transports = EXCLUDED.transports,
                   updated_at = now()`,
    [userId, credentialID, credentialPublicKey, counter, transports ?? null],
  )
}

async function updatePasskeyCounter(credentialId: Buffer, counter: number) {
  await pool.query(
    `UPDATE tenant_base.passkeys
        SET counter = $2,
            updated_at = now()
      WHERE credential_id = $1`,
    [credentialId, counter],
  )
}

function mapPasskeysToExcludeCredentials(passkeys: PasskeyRow[]) {
  return passkeys.map((passkey) => ({
    id: isoBase64URL.fromBuffer(new Uint8Array(passkey.credential_id)),
    type: "public-key" as const,
  }))
}

const allowedTransports = ["ble", "hybrid", "internal", "nfc", "usb"] as const
type AllowedTransport = (typeof allowedTransports)[number]

function sanitizeTransports(transports: (string | null)[] | null | undefined): AllowedTransport[] | undefined {
  if (!transports) {
    return undefined
  }

  return transports.filter((item): item is AllowedTransport =>
    allowedTransports.includes(item as AllowedTransport),
  )
}

function mapPasskeysToAllowCredentials(passkeys: PasskeyRow[], preferPlatform?: boolean) {
  const mapped = passkeys.map((passkey) => ({
    id: isoBase64URL.fromBuffer(new Uint8Array(passkey.credential_id)),
    type: "public-key" as const,
    transports: sanitizeTransports(passkey.transports)?.map((transport) => transport as AuthenticatorTransport),
  }))

  if (preferPlatform) {
    const platformCredentials = mapped.filter((credential) => {
      const transports = credential.transports
      if (!transports || transports.length === 0) {
        return false
      }

      return transports.some((transport) => transport === "internal" || transport === "hybrid")
    })

    if (platformCredentials.length > 0) {
      return platformCredentials
    }
  }

  return mapped
}

export async function generatePasskeyRegistrationOptions(
  userId: number,
  params?: RegistrationOptionsParams,
): Promise<PublicKeyCredentialCreationOptionsJSON> {
  await ensureTables()

  const user = await findUserById(userId)
  if (!user) {
    throw new Error("USER_NOT_FOUND")
  }

  const existingPasskeys = await getPasskeysForUser(user.id)

  const overrides = params?.overrides
  const rpID = resolveRpId(params?.requestOrigin, params?.rpIdHint)

  const authenticatorSelection: AuthenticatorSelectionCriteria = {
    residentKey: (overrides?.residentKey ?? "preferred") as AuthenticatorSelectionCriteria["residentKey"],
    userVerification: (overrides?.userVerification ?? "preferred") as AuthenticatorSelectionCriteria["userVerification"],
  }

  if (overrides?.authenticatorAttachment) {
    authenticatorSelection.authenticatorAttachment = overrides.authenticatorAttachment
  }

  const baseOptions = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID,
    userID: Buffer.from(String(user.id), "utf8"),
    userName: user.email,
    userDisplayName: user.email,
    attestationType: "none",
    authenticatorSelection,
    excludeCredentials: mapPasskeysToExcludeCredentials(existingPasskeys),
  })

  const options: PublicKeyCredentialCreationOptionsJSON & { rpId?: string } = {
    ...baseOptions,
    rpId: (baseOptions as { rpId?: string }).rpId ?? rpID,
  }

  // Ensure the RP ID returned to the client is explicit for debugging and clients that expect it
  await upsertChallenge(user.id, "registration", options.challenge)

  return options
}

export async function verifyPasskeyRegistration({
  userId,
  credential,
  requestOrigin,
  rpIdHint,
}: {
  userId: number
  credential: RegistrationResponseJSON
  requestOrigin?: string | null
  rpIdHint?: string | null
}) {
  await ensureTables()

  const user = await findUserById(userId)
  if (!user) {
    throw new Error("USER_NOT_FOUND")
  }

  const expectedChallenge = await consumeChallenge(user.id, "registration")
  if (!expectedChallenge) {
    throw new Error("CHALLENGE_NOT_FOUND")
  }

  const expectedOrigins = getExpectedOrigins(requestOrigin)
  if (process.env.NODE_ENV !== "production") {
    console.debug("[WebAuthn] Registration expected origins", expectedOrigins)
  }

  const expectedRPID = resolveRpId(requestOrigin, rpIdHint)

  const verification = await verifyRegistrationResponse({
    response: credential,
    expectedChallenge,
    expectedOrigin: expectedOrigins,
    expectedRPID,
    requireUserVerification: true,
  })

  if (!verification.verified || !verification.registrationInfo) {
    throw new Error("REGISTRATION_NOT_VERIFIED")
  }

  const { credential: registeredCredential, credentialBackedUp } = verification.registrationInfo
  const { publicKey, id: credentialIdBase64, counter, transports } = registeredCredential

  const credentialIdBytes = isoBase64URL.toBuffer(credentialIdBase64)
  const credentialIdBuffer = Buffer.from(credentialIdBytes)

  await savePasskey({
    userId: user.id,
    credentialID: credentialIdBuffer,
    credentialPublicKey: Buffer.from(publicKey),
    counter,
    transports: sanitizeTransports(transports)?.map((transport) => transport as string),
  })

  return {
    verified: verification.verified,
    credentialBackedUp,
  }
}

export async function generatePasskeyAuthenticationOptions(
  email: string,
  params?: AuthenticationOptionsParams,
): Promise<PublicKeyCredentialRequestOptionsJSON> {
  await ensureTables()

  const userRecord = await findUserByEmail(email)
  if (!userRecord) {
    throw new Error("USER_NOT_FOUND")
  }

  const passkeys = await getPasskeysForUser(userRecord.id)
  if (passkeys.length === 0) {
    throw new Error("NO_PASSKEYS")
  }

  const overrides = params?.overrides
  const rpID = resolveRpId(params?.requestOrigin, params?.rpIdHint)

  const baseOptions = await generateAuthenticationOptions({
    rpID,
    userVerification: overrides?.userVerification ?? "preferred",
    allowCredentials: mapPasskeysToAllowCredentials(passkeys, overrides?.preferPlatformAuthenticator),
  })

  const options: PublicKeyCredentialRequestOptionsJSON & { rpId?: string } = {
    ...baseOptions,
    rpId: (baseOptions as { rpId?: string }).rpId ?? rpID,
  }

  await upsertChallenge(userRecord.id, "authentication", options.challenge)

  return options
}

export async function verifyPasskeyAuthentication({
  credential,
  requestOrigin,
  rpIdHint,
}: {
  credential: AuthenticationResponseJSON
  requestOrigin?: string | null
  rpIdHint?: string | null
}) {
  await ensureTables()

  const credentialIdBytes = isoBase64URL.toBuffer(credential.id)
  const credentialIdBuffer = Buffer.from(credentialIdBytes)
  const passkey = await getPasskeyByCredentialId(credentialIdBuffer)

  if (!passkey) {
    throw new Error("PASSKEY_NOT_FOUND")
  }

  const expectedChallenge = await consumeChallenge(passkey.user_id, "authentication")
  if (!expectedChallenge) {
    throw new Error("CHALLENGE_NOT_FOUND")
  }

  const transportList = sanitizeTransports(passkey.transports)?.map((t) => t as AuthenticatorTransport)
  const authenticator = {
    id: isoBase64URL.fromBuffer(new Uint8Array(passkey.credential_id)),
    publicKey: new Uint8Array(passkey.public_key),
    counter:
      typeof passkey.counter === "string"
        ? Number.parseInt(passkey.counter, 10)
        : passkey.counter,
    transports: transportList,
  }

  const expectedOrigins = getExpectedOrigins(requestOrigin)
  if (process.env.NODE_ENV !== "production") {
    console.debug("[WebAuthn] Authentication expected origins", expectedOrigins)
  }

  const expectedRPID = resolveRpId(requestOrigin, rpIdHint)

  const verification = await verifyAuthenticationResponse({
    response: credential,
    expectedChallenge,
    expectedOrigin: expectedOrigins,
    expectedRPID,
    requireUserVerification: true,
    credential: authenticator,
  })

  if (!verification.verified || !verification.authenticationInfo) {
    throw new Error("AUTHENTICATION_NOT_VERIFIED")
  }

  await updatePasskeyCounter(passkey.credential_id, verification.authenticationInfo.newCounter)

  const user = await findUserById(passkey.user_id)
  if (!user) {
    throw new Error("USER_NOT_FOUND")
  }

  return {
    verified: verification.verified,
    user,
  }

}

