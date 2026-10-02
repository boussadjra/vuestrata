import { nestErrorMapper } from '../error-mappers'
import type { ApiBackendPreset } from '../integration'

/**
 * NestJS.
 *
 * - **Errors**: `{ statusCode, message, error }`, where `message` is a list
 *   when a `ValidationPipe` rejected the input. The list names no fields, so
 *   its entries arrive as form errors.
 *
 * Nest's guards answer 401 for an unauthenticated request, which the client
 * handles already, and Nest ships no CSRF convention of its own.
 */
export const nest: ApiBackendPreset = {
  name: 'nest',
  errors: [nestErrorMapper],
}
