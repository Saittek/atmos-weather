/**
 * Free vs Preview Pro entitlements.
 * Preview Pro is a local demo only (localStorage) — no payment, no cloud Pro account.
 * Core Solara stays free; real billing / StoreKit is not shipped yet.
 */

export type PlanId = 'free' | 'pro'

export interface Entitlements {
  plan: PlanId
  /** Extended radar history (not yet gated in UI) */
  extendedRadarHistory: boolean
  /** Multiple home-screen widget configs */
  multiWidget: boolean
  /** Suppress ads when AdSense is enabled */
  adFree: boolean
  /** Extra saved places beyond free cap */
  extraFavorites: boolean
}

const FREE: Entitlements = {
  plan: 'free',
  extendedRadarHistory: false,
  multiWidget: false,
  adFree: false,
  extraFavorites: false,
}

const PRO: Entitlements = {
  plan: 'pro',
  extendedRadarHistory: true,
  multiWidget: true,
  adFree: true,
  extraFavorites: true,
}

const STORAGE_KEY = 'solara-plan-v1'

/** Free plan limits (enforced only where wired) */
export const FREE_LIMITS = {
  favorites: 12,
  tripCities: 5,
  chatMessagesPerHour: 40,
} as const

export const PRO_LIMITS = {
  favorites: 24,
  tripCities: 12,
  chatMessagesPerHour: 120,
} as const

export function readPlan(): PlanId {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'pro') return 'pro'
  } catch {
    /* ignore */
  }
  return 'free'
}

/** Local Preview Pro toggle only — not a purchase or account upgrade. */
export function setPlanLocal(plan: PlanId) {
  try {
    localStorage.setItem(STORAGE_KEY, plan)
    window.dispatchEvent(new CustomEvent('solara-plan-change', { detail: plan }))
  } catch {
    /* ignore */
  }
}

export function getEntitlements(plan: PlanId = readPlan()): Entitlements {
  return plan === 'pro' ? { ...PRO } : { ...FREE }
}

export function isPro(): boolean {
  return readPlan() === 'pro'
}

export function favoritesCap(plan: PlanId = readPlan()): number {
  return plan === 'pro' || getEntitlements(plan).extraFavorites
    ? PRO_LIMITS.favorites
    : FREE_LIMITS.favorites
}

export function tripCitiesCap(plan: PlanId = readPlan()): number {
  return plan === 'pro' ? PRO_LIMITS.tripCities : FREE_LIMITS.tripCities
}

/** When AdSense is enabled, Pro preview suppresses it. */
export function shouldShowAds(): boolean {
  if (getEntitlements().adFree) return false
  return true
}
