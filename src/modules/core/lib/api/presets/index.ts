/**
 * Backend presets: one framework's conventions as a bundle of classifiers,
 * error mappers and a CSRF strategy.
 *
 *     export default defineApiOverrides({ backend: presets.laravel })
 *
 * A preset is a starting point, not a mode: every option beside `backend` in
 * `app/config/api.overrides.ts` still applies, and wins over the preset's (see
 * `ApiOverrides` for the order). Each preset's file says what it covers and
 * what it leaves to you.
 *
 * The Laravel, Django and Spring presets carry a collection dialect too (the
 * paginator, `PageNumberPagination`, `Page`), so `createCollectionApi` speaks
 * that backend's lists without another line. ASP.NET Core and NestJS have no
 * pagination convention of their own: name one under `collection`.
 */
import { aspnet } from './aspnet'
import { django } from './django'
import { laravel } from './laravel'
import { nest } from './nest'
import { spring } from './spring'
import { vuestrata } from './vuestrata'

export { aspnet, django, laravel, nest, spring, vuestrata }

export const presets = { vuestrata, laravel, django, spring, aspnet, nest } as const
