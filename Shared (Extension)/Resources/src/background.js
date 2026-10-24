import { CURRENT_VERSION, defaultSearches, upgradeData, validateData } from './data.js'
import { getSearchParam, getSearchUrl, buildIndex } from './search.js'
import { syncStores, applyEdit, replaceAll, view, parseState, emptyState, applyWrites } from './sync.js'

// How often navigation checks for changes from other devices
const SYNC_INTERVAL = 30_000
const NATIVE_TIMEOUT = 2000

// Null until loaded from the cache or the native side
let state = null
let index = buildIndex({ searches: [] })
// The values last read from or written to native storage
let stores = { local: {}, cloud: {} }
let lastSync = 0
let syncing = null

try {
  // Cached state, used until the native side has answered
  state = parseState(localStorage.getItem('state'))
  if (state) index = buildIndex(view(state))
} catch (e) {}

function setState(newState) {
  state = newState
  index = buildIndex(view(state))
  try {
    localStorage.setItem('state', JSON.stringify(state))
  } catch (e) {}
}

browser.webNavigation.onBeforeNavigate.addListener(beforeNavigate)

browser.webNavigation.onCommitted.addListener(onCommitted)

// Listener must return true when responding asynchronously
browser.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  const respond = promise => {
    promise.then(
      () => sendResponse({ success: true }),
      e => {
        console.log('Error saving search data:', e)
        sendResponse({ success: false })
      }
    )
    return true
  }

  switch (request.message) {
    case 'popupWantsData': {
      sync().then(() => sendResponse({ data: view(state) }))
      return true
    }
    case 'popupWantsToSave': {
      const { base, searches, settings } = request.data
      return respond(commit((s, now) => applyEdit(s, base, { searches, settings }, now)))
    }
    case 'popupWantsToImport': {
      let data = null
      try {
        data = JSON.parse(request.data)
        if (!data.version || data.version < CURRENT_VERSION) data = upgradeData(data)
      } catch (e) {}
      if (data && data.version == CURRENT_VERSION && validateData(data)) {
        return respond(commit((s, now) => replaceAll(s, data, now)))
      }
      console.log('Error importing search data: invalid data', request.data)
      sendResponse({ success: false })
      break
    }
    case 'popupWantsToReset': {
      return respond(commit((s, now) => replaceAll(s, defaultSearches, now)))
    }
  }
})

const message = (message, data = '') => JSON.stringify({ message, data })

function sendNative(msg) {
  return Promise.race([
    browser.runtime.sendNativeMessage('application.id', msg),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Native message timed out')), NATIVE_TIMEOUT))
  ])
}

async function writeStores(writes) {
  if (Object.keys(writes.local).length == 0 && Object.keys(writes.cloud).length == 0) return
  stores = applyWrites(stores, writes)
  await sendNative(message('save', JSON.stringify(writes)))
}

// Reads all stores, merges them and writes back whatever differs. Concurrent calls share one run.
function sync() {
  if (!syncing) {
    syncing = (async () => {
      try {
        stores = JSON.parse(await sendNative(message('load')))
        const result = syncStores(stores, state, Date.now())
        setState(result.state)
        lastSync = Date.now()
        await writeStores(result.writes)
      } catch (e) {
        console.log('Error syncing search data:', e)
        if (!state) setState(emptyState())
      } finally {
        syncing = null
      }
    })()
  }
  return syncing
}

const syncIfStale = () => (Date.now() - lastSync > SYNC_INTERVAL ? sync() : Promise.resolve())

// Syncs, applies a change on top of the fresh state and writes it out
async function commit(change) {
  await sync()
  const result = syncStores(stores, change(state, Date.now()), Date.now())
  setState(result.state)
  await writeStores(result.writes)
}

sync()

let shouldDoTheSearch = false
let lastSearched = 0
let lastSearchUrl = ''
let lastLoadedUrl = ''
function doTheSearch(details) {
  shouldDoTheSearch = false
  lastSearchUrl = ''
  lastSearched = Date.now()
  lastLoadedUrl = details.url
  const searchParam = getSearchParam(details.url, index.settings.searchEngine)
  if (searchParam) {
    const searchUrl = getSearchUrl(searchParam, index)
    if (searchUrl) {
      shouldDoTheSearch = true
      lastSearchUrl = searchUrl
      browser.tabs.update(details.tabId, {
        url: searchUrl
      })
    }
  }
}

const lastInvoked = new Map()
function beforeNavigate(details) {
  if (details.parentFrameId == -1 && details.tabId > 0) {
    const now = Date.now()
    if (now - (lastInvoked.get(details.tabId) || 0) > 500) {
      if (!state) {
        sync().then(() => doTheSearch(details))
      } else {
        doTheSearch(details)
        syncIfStale()
      }
      lastInvoked.set(details.tabId, now)
    }
  }
}

function onCommitted(details, nth = 1) {
  if (
    shouldDoTheSearch &&
    Date.now() - lastSearched < 2000 &&
    lastSearchUrl != '' &&
    lastSearchUrl != lastLoadedUrl &&
    lastLoadedUrl == details.url &&
    nth < 5
  ) {
    doTheSearch(details)
    setTimeout(() => onCommitted(details, nth + 1), 50)
  }
}
