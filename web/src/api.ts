import type { ColorName, IconName } from './icons'
export type WebApp = { id: string; name: string; url: string; icon: IconName; color: ColorName }
export type Grid = { apps: WebApp[]; revision: number }
export type State =
  ({ authenticated: true; pinEnabled: boolean } & Grid) | { authenticated: false; pinEnabled: true }
export class APIError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message)
  }
}
export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`/api/${path}`, {
    method,
    credentials: 'same-origin',
    cache: 'no-store',
    headers: method === 'GET' ? {} : { 'Content-Type': 'application/json', 'X-Launchpad': '1' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok)
    throw new APIError(
      result.error || 'The server could not complete that request. Try again.',
      response.status,
    )
  return result as T
}
export function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error instanceof TypeError
      ? 'Couldn’t reach your launchpad. Check your connection and try again.'
      : error.message
    : 'Something went wrong. Try again.'
}
export function newID(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
}
