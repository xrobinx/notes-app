import { scrypt } from '@noble/hashes/scrypt'

interface SyncEnvelope {
  version: 1
  algorithm: 'aes-256-gcm+scrypt'
  salt: string
  iv: string
  tag: string
  verifier: string
  ciphertext: string
}

const SCRYPT_OPTIONS = { N: 2 ** 14, r: 8, p: 1, dkLen: 32 }

export async function encryptMobileSyncPayload(payload: unknown, passphrase: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const keyBytes = keyFromPassphrase(passphrase, salt)
  const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt'])
  const encrypted = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(JSON.stringify(payload))
  ))
  const tag = encrypted.slice(encrypted.length - 16)
  const ciphertext = encrypted.slice(0, encrypted.length - 16)
  const envelope: SyncEnvelope = {
    version: 1,
    algorithm: 'aes-256-gcm+scrypt',
    salt: toBase64(salt),
    iv: toBase64(iv),
    tag: toBase64(tag),
    verifier: toBase64(makeVerifier(passphrase, salt)),
    ciphertext: toBase64(ciphertext),
  }
  return JSON.stringify(envelope, null, 2)
}

export async function decryptMobileSyncPayload<T>(envelopeJson: string, passphrase: string): Promise<T> {
  const envelope = JSON.parse(envelopeJson) as SyncEnvelope
  const salt = fromBase64(envelope.salt)
  const verifier = fromBase64(envelope.verifier)
  if (!constantTimeEqual(verifier, makeVerifier(passphrase, salt))) {
    throw new Error('Sync passphrase is wrong.')
  }
  const keyBytes = keyFromPassphrase(passphrase, salt)
  const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['decrypt'])
  const ciphertext = concatBytes(fromBase64(envelope.ciphertext), fromBase64(envelope.tag))
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(envelope.iv) },
    key,
    ciphertext
  )
  return JSON.parse(new TextDecoder().decode(decrypted)) as T
}

function keyFromPassphrase(passphrase: string, salt: Uint8Array): Uint8Array {
  return scrypt(passphrase, salt, SCRYPT_OPTIONS)
}

function makeVerifier(passphrase: string, salt: Uint8Array): Uint8Array {
  return scrypt(`verify:${passphrase}`, salt, SCRYPT_OPTIONS)
}

function concatBytes(left: Uint8Array, right: Uint8Array): Uint8Array {
  const next = new Uint8Array(left.length + right.length)
  next.set(left, 0)
  next.set(right, left.length)
  return next
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false
  let diff = 0
  for (let i = 0; i < left.length; i += 1) diff |= left[i] ^ right[i]
  return diff === 0
}

function toBase64(value: Uint8Array): string {
  let binary = ''
  for (const byte of value) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), char => char.charCodeAt(0))
}
