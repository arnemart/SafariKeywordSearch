// Sync between devices via iCloud key-value storage (see PLAN.md, step 3).
//
// State (v4) is merged per search, so changes from several devices survive:
// {
//   version: 4,
//   searches: [{ id, updatedAt, name, keywords, expansion, ... }],
//   deleted: { [id]: timestamp },          // tombstones
//   settings: { [key]: value },
//   settingsUpdatedAt: { [key]: timestamp },
//   legacyTimestamp                         // newest v3 write from an old app version that has been read in
// }
//
// Old app versions only know the v3 key. We write a v3 copy marked with `bridge: true`, and read
// unmarked v3 writes (from old versions) back in.

import { CURRENT_VERSION, defaultSearches, upgradeData, validateData, ensureIds } from './data.js'

export const STATE_VERSION = 4
export const KEYS = { v1: 'keywordSearches', v3: 'keywordSearchesv3', v4: 'keywordSearchesv4' }

const defaultSettings = defaultSearches.settings

export const emptyState = () => ({
  version: STATE_VERSION,
  searches: [],
  deleted: {},
  settings: {},
  settingsUpdatedAt: {},
  legacyTimestamp: 0
})

// JSON with sorted keys, so equal data always gives equal strings
export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value && typeof value == 'object') {
    const keys = Object.keys(value)
      .filter(k => value[k] !== undefined)
      .sort()
    return `{${keys.map(k => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

// The user-visible content of a search, with defaults filled in so e.g. a missing `escape` equals `escape: true`
function content(s) {
  return {
    name: s.name || '',
    keywords: s.keywords,
    expansion: s.expansion,
    isDefault: !!s.isDefault,
    escape: s.escape !== false,
    spaceReplacer: s.spaceReplacer || '',
    allowedLocations: s.allowedLocations || 'default'
  }
}

const sameContent = (a, b) => stableStringify(content(a)) == stableStringify(content(b))

// Strips editor-only fields
function clean(s) {
  const { new: _new, updatedAt: _updatedAt, ...rest } = s
  return rest
}

export function maxTimestamp(state) {
  return Math.max(
    state.legacyTimestamp,
    ...state.searches.map(s => s.updatedAt),
    ...Object.values(state.deleted),
    ...Object.values(state.settingsUpdatedAt)
  )
}

// Never goes backwards, even if this device's clock is behind
const clock = (state, now) => Math.max(now, maxTimestamp(state) + 1)

// True if nothing has ever been stored; defaults are shown but not stored until the user changes something
export const isPristine = state =>
  state.searches.length == 0 &&
  Object.keys(state.deleted).length == 0 &&
  Object.keys(state.settingsUpdatedAt).length == 0

// Deterministic tie-breaking: equal timestamps pick the same winner on every device
const wins = (tsA, valA, tsB, valB) => tsA > tsB || (tsA == tsB && stableStringify(valA) > stableStringify(valB))

// Sorts, applies tombstones and keeps only the newest default
function normalize(state) {
  let searches = state.searches.filter(s => !(state.deleted[s.id] >= s.updatedAt))
  const defaults = searches.filter(s => s.isDefault)
  if (defaults.length > 1) {
    const winner = defaults.reduce((a, b) => (wins(a.updatedAt, a.id, b.updatedAt, b.id) ? a : b))
    searches = searches.map(s => {
      if (s.isDefault && s !== winner) {
        const { isDefault: _, ...rest } = s
        return rest
      }
      return s
    })
  }
  searches.sort((a, b) => (a.id < b.id ? -1 : 1))
  return { ...state, searches }
}

export function parseState(json) {
  try {
    const state = typeof json == 'string' ? JSON.parse(json) : json
    if (state && state.version == STATE_VERSION && Array.isArray(state.searches)) {
      return { ...emptyState(), ...state }
    }
  } catch (e) {}
  return null
}

export function merge(a, b) {
  if (!a) return b
  if (!b) return a

  const deleted = { ...a.deleted }
  for (const [id, ts] of Object.entries(b.deleted)) {
    deleted[id] = Math.max(deleted[id] || 0, ts)
  }

  const byId = new Map()
  for (const s of [...a.searches, ...b.searches]) {
    const existing = byId.get(s.id)
    if (!existing || wins(s.updatedAt, s, existing.updatedAt, existing)) byId.set(s.id, s)
  }

  const settings = { ...a.settings }
  const settingsUpdatedAt = { ...a.settingsUpdatedAt }
  for (const key of Object.keys(b.settings)) {
    const tsA = settingsUpdatedAt[key] ?? -1
    const tsB = b.settingsUpdatedAt[key] ?? -1
    if (wins(tsB, b.settings[key], tsA, settings[key])) {
      settings[key] = b.settings[key]
      settingsUpdatedAt[key] = tsB
    }
  }

  return normalize({
    version: STATE_VERSION,
    searches: [...byId.values()],
    deleted,
    settings,
    settingsUpdatedAt,
    legacyTimestamp: Math.max(a.legacyTimestamp, b.legacyTimestamp)
  })
}

// What the popup and the search lookup see (v3 shape, with ids)
export function view(state) {
  if (isPristine(state)) {
    return { version: CURRENT_VERSION, searches: ensureIds(defaultSearches.searches), settings: { ...defaultSettings } }
  }
  return {
    version: CURRENT_VERSION,
    searches: state.searches.map(({ updatedAt: _, ...s }) => s),
    settings: { ...defaultSettings, ...state.settings }
  }
}

// Turns a pristine state into one that stores the defaults, with timestamp 0 so any real data wins
function materialize(state) {
  if (!isPristine(state)) return state
  return {
    ...state,
    searches: ensureIds(defaultSearches.searches).map(s => ({ ...s, updatedAt: 0 })),
    settings: { ...defaultSettings },
    settingsUpdatedAt: Object.fromEntries(Object.keys(defaultSettings).map(k => [k, 0]))
  }
}

// Applies the changes the user made in the popup (from `base` to `next`) on top of the current state
export function applyEdit(state, base, next, now) {
  const current = materialize(state)
  const ts = clock(current, now)
  const baseById = new Map(base.searches.map(s => [s.id, s]))
  const nextIds = new Set(next.searches.map(s => s.id))

  const changed = new Map()
  for (const s of next.searches) {
    const b = baseById.get(s.id)
    if (!b || !sameContent(b, s)) changed.set(s.id, { ...clean(s), updatedAt: ts })
  }
  const deleted = { ...current.deleted }
  for (const id of baseById.keys()) {
    if (!nextIds.has(id)) deleted[id] = ts
  }
  const searches = current.searches.filter(s => !changed.has(s.id) && !(deleted[s.id] >= s.updatedAt))

  const settings = { ...current.settings }
  const settingsUpdatedAt = { ...current.settingsUpdatedAt }
  for (const [key, value] of Object.entries(next.settings || {})) {
    if (value !== (base.settings || {})[key]) {
      settings[key] = value
      settingsUpdatedAt[key] = ts
    }
  }

  return normalize({ ...current, searches: [...searches, ...changed.values()], deleted, settings, settingsUpdatedAt })
}

// Replaces everything (import, reset)
export function replaceAll(state, data, now) {
  const ts = clock(state, now)
  const searches = ensureIds(data.searches).map(s => ({ ...clean(s), updatedAt: ts }))
  const ids = new Set(searches.map(s => s.id))
  const deleted = { ...state.deleted }
  for (const s of state.searches) {
    if (!ids.has(s.id)) deleted[s.id] = ts
  }
  const settings = { ...defaultSettings, ...data.settings }
  return normalize({
    ...state,
    searches,
    deleted,
    settings,
    settingsUpdatedAt: Object.fromEntries(Object.keys(settings).map(k => [k, ts]))
  })
}

// Reads in a v3 (or older) write from an old app version. Old versions keep unknown fields on searches they
// don't edit, but drop `id` and other unknown fields on the search being edited. So:
// - a search with an id we know is unchanged or a stale copy: keep ours (and keep tombstones)
// - a search with an unknown id is new or edited by the old version: add it
// - a search we have that is missing from it was deleted by the old version, but only if the old version could
//   have seen it. Our v3 copies stamp each search with `syncedAt`, which tells which copy the old version
//   started from. Without stamps (data that never passed through a new version), anything older is deleted.
export function bridgeLegacy(state, legacy) {
  // Timestamp 0 is an old version's untouched defaults, not real data
  if (!legacy || legacy.bridge || legacy.timestamp === 0) return state
  const ts = legacy.timestamp ?? 1
  if (ts <= state.legacyTimestamp) return state

  let data = legacy
  try {
    if (!data.version || data.version < CURRENT_VERSION) data = upgradeData(data)
  } catch (e) {
    return state
  }
  if (!validateData(data)) return state

  const legacySearches = ensureIds(data.searches)
  const syncedAt = Math.max(0, ...legacySearches.map(s => s.syncedAt || 0)) || ts
  const current = new Map(state.searches.map(s => [s.id, s]))
  const legacyIds = new Set(legacySearches.map(s => s.id))

  const searches = []
  for (const s of legacySearches) {
    if (current.has(s.id) || state.deleted[s.id] !== undefined) continue
    const { syncedAt: _, ...rest } = clean(s)
    searches.push({ ...rest, updatedAt: ts })
  }
  const deleted = { ...state.deleted }
  for (const s of state.searches) {
    if (!legacyIds.has(s.id) && s.updatedAt <= syncedAt && s.updatedAt < ts) {
      deleted[s.id] = Math.max(deleted[s.id] || 0, ts)
    } else {
      searches.push(s)
    }
  }

  const settings = { ...state.settings }
  const settingsUpdatedAt = { ...state.settingsUpdatedAt }
  for (const [key, value] of Object.entries(data.settings)) {
    if (value !== settings[key] && (settingsUpdatedAt[key] ?? -1) < ts) {
      settings[key] = value
      settingsUpdatedAt[key] = ts
    }
  }

  return normalize({ ...state, searches, deleted, settings, settingsUpdatedAt, legacyTimestamp: ts })
}

// The v3 copy for old app versions
export function toLegacy(state, now) {
  const { searches, settings } = view(state)
  const timestamp = clock(state, now)
  return {
    version: CURRENT_VERSION,
    timestamp,
    bridge: true,
    settings,
    searches: searches.map(s => ({ ...s, syncedAt: timestamp }))
  }
}

const legacyContent = data =>
  data && stableStringify({ searches: ensureIds(data.searches || []).map(s => [s.id, content(s)]), settings: data.settings })

function parseJson(json) {
  try {
    return json ? JSON.parse(json) : null
  } catch (e) {
    return null
  }
}

// Reads all stores, merges them with the cached state and works out what needs to be written back.
// `stores` is { local: { [key]: json }, cloud: { [key]: json } } as returned by the native side.
export function syncStores(stores, cached, now) {
  const local = stores.local || {}
  const cloud = stores.cloud || {}

  let state = merge(merge(parseState(local[KEYS.v4]), parseState(cloud[KEYS.v4])), cached) || emptyState()

  // Old versions' data, oldest first. v1 is only used if there never was any v3 data.
  let legacy = [parseJson(local[KEYS.v3]), parseJson(cloud[KEYS.v3])].filter(Boolean)
  if (legacy.length == 0) legacy = [parseJson(local[KEYS.v1]), parseJson(cloud[KEYS.v1])].filter(Boolean)
  legacy.sort((a, b) => (a.timestamp || 1) - (b.timestamp || 1))
  for (const l of legacy) state = bridgeLegacy(state, l)

  const writes = { local: {}, cloud: {} }
  if (!isPristine(state)) {
    const serialized = stableStringify(state)
    const stateString = s => {
      const parsed = parseState(s)
      return parsed && stableStringify(normalize(parsed))
    }
    if (stateString(local[KEYS.v4]) != serialized) writes.local[KEYS.v4] = serialized
    if (stateString(cloud[KEYS.v4]) != serialized) writes.cloud[KEYS.v4] = serialized

    const legacyCopy = toLegacy(state, now)
    if (legacyContent(parseJson(cloud[KEYS.v3])) != legacyContent(legacyCopy)) {
      writes.cloud[KEYS.v3] = JSON.stringify(legacyCopy)
    }
  }
  return { state, writes }
}

// What the stores look like after `writes` have been applied
export function applyWrites(stores, writes) {
  return {
    local: { ...stores.local, ...writes.local },
    cloud: { ...stores.cloud, ...writes.cloud }
  }
}
