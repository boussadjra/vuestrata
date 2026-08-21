/**
 * ─────────────────────────────────────────────────────────────────────────────
 * This file is yours. Vuestrata never modifies it.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `app.config.ts` beside it is derived entirely from validated environment
 * variables and is replaced wholesale by an upgrade. This file is the opposite:
 * the handful of build-time constants that are about *your product* rather than
 * about a deployment, kept somewhere nothing upstream writes to.
 *
 * The split follows a simple test. If the value changes between your staging
 * and production deploys, it is environment — put it in `.env` and read it
 * through `appConfig`. If it is the same everywhere your app runs and different
 * from everywhere Vuestrata runs, it belongs here.
 *
 * Everything is optional. An untouched template leaves the object empty and
 * every consumer falls back to the Vuestrata defaults.
 *
 * ── Related seams ──────────────────────────────────────────────────────────
 *
 *   Colour and design tokens     src/modules/app/styles/brand.css
 *   Interface copy               src/modules/app/locales/<locale>.overrides.json
 *   Your logo                    src/modules/app/components/Logo.vue — that file
 *                                is yours too; an upgrade will not replace it.
 */
import type { IconName } from '~/types'

export interface BrandLink {
  /** i18n key, or a literal when the label is a proper noun such as "GitHub". */
  label: string
  /** External destination. Mutually exclusive with `to`. */
  href?: string
  /** Internal route. Mutually exclusive with `href`. */
  to?: string
  /** Semantic icon name; resolved through the active icon provider. */
  icon?: IconName
  /**
   * A raw Iconify class, for marks the icon providers do not carry.
   *
   * `IconName` is a closed union that every one of the nine providers must
   * implement, which is right for interface icons and wrong for third-party
   * logos: adding `github` would oblige all nine to ship a GitHub glyph. Use
   * this for brand marks (`i-simple-icons-github`, `i-simple-icons-slack`) and
   * `icon` for everything else. Ignored when `icon` is set.
   */
  iconClass?: string
}

export interface BrandOverrides {
  /**
   * Product name in the footer and anywhere else the shell names itself.
   *
   * Not the browser title — that is `VUESTRATA_APP_TITLE`, because it is
   * routinely different between environments ("Acme Console (staging)").
   */
  name?: string
  /** Copyright holder, when it differs from `name`. */
  copyright?: string
  /**
   * Footer links. An empty array renders no links; omitting the key keeps the
   * Vuestrata set, which is the right default while you are still evaluating
   * the template and the wrong one the moment you ship.
   */
  links?: BrandLink[]
}

export const brand: BrandOverrides = {}
