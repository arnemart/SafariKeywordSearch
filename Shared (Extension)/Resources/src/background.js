import { CURRENT_VERSION, defaultSearches, upgradeData, validateData, ensureIds } from './data.js'
import { getSearchParam, getSearchUrl, buildIndex } from './search.js'

let latestFullData = {}
let index = buildIndex({ searches: [] })
let lastUpdate = -1

try {
  // See if we have cached data in local storage, use that until we have loaded data from the app
  const cachedFullData = localStorage.getItem('latestFullData')
  if (cachedFullData) {
    const parsedFullData = JSON.parse(cachedFullData)
    if (parsedFullData.version == CURRENT_VERSION) {
      // Cache may predate ids
      latestFullData = { ...parsedFullData, searches: ensureIds(parsedFullData.searches) }
      index = buildIndex(latestFullData)
      const cachedLastUpdate = localStorage.getItem('lastUpdate')
      if (cachedLastUpdate) lastUpdate = parseInt(cachedLastUpdate, 10)
    }
  }
} catch (e) {}

browser.webNavigation.onBeforeNavigate.addListener(beforeNavigate)

browser.webNavigation.onCommitted.addListener(onCommitted)

// Listener must return true when responding asynchronously
browser.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  switch (request.message) {
    case 'popupWantsData': {
      loadData(() => sendResponse({ data: latestFullData }))
      return true
    }
    case 'popupWantsToSave': {
      saveData({
        version: CURRENT_VERSION,
        timestamp: Date.now(),
        searches: request.data.searches,
        settings: request.data.settings
      })
      break
    }
    case 'popupWantsToImport': {
      try {
        let json = JSON.parse(request.data)
        if (!json.version || json.version < CURRENT_VERSION) {
          json = upgradeData(json)
        }
        if (json.version == CURRENT_VERSION && validateData(json)) {
          saveData({ ...json, timestamp: Date.now() }, () => sendResponse({ success: true }))
          return true
        }
        console.log('Error importing search data: invalid data', request.data)
      } catch (e) {
        console.log('Error importing search data:', e, request.data)
      }
      sendResponse({ success: false })
      break
    }
    case 'popupWantsToReset': {
      saveData(
        {
          ...defaultSearches,
          timestamp: Date.now()
        },
        () => sendResponse({ success: true })
      )
      return true
    }
  }
})

const message = (message, data = '') =>
  JSON.stringify({
    message: message,
    data: data
  })

function saveData(data, andThen) {
  setData(data, andThen)
  browser.runtime.sendNativeMessage('application.id', message('saveData', JSON.stringify(data)))
}

let lastLoad = 0
// Callbacks waiting for an in-flight load, null when no load is running
let pendingLoadCallbacks = null
function loadData(andThen) {
  if (pendingLoadCallbacks) {
    if (andThen) pendingLoadCallbacks.push(andThen)
    return
  }
  const now = Date.now()
  if (now - lastLoad <= 200) {
    if (andThen) andThen()
    return
  }
  lastLoad = now
  pendingLoadCallbacks = andThen ? [andThen] : []

  const done = () => {
    if (!pendingLoadCallbacks) return
    const callbacks = pendingLoadCallbacks
    pendingLoadCallbacks = null
    callbacks.forEach(cb => cb())
  }
  // Fall back to cached data if the native side never answers
  setTimeout(done, 2000)

  browser.runtime.sendNativeMessage('application.id', message('loadData'), response => {
    if (response === undefined) {
      console.log('Error loading search data:', browser.runtime.lastError)
      done()
    } else if (response == '') {
      saveData(defaultSearches, done)
    } else {
      try {
        const json = JSON.parse(response)
        if (json.version && json.version == CURRENT_VERSION) {
          setData(json, done)
        } else {
          const upgradedData = upgradeData(json)
          saveData(upgradedData, done)
        }
      } catch (e) {
        console.log('Error parsing search data:', e, response)
        done()
      }
    }
  })
}

loadData()

function setData(data, andThen) {
  if (data.timestamp > lastUpdate) {
    latestFullData = { ...data, searches: ensureIds(data.searches) }
    lastUpdate = data.timestamp
    index = buildIndex(latestFullData)
    try {
      localStorage.setItem('latestFullData', JSON.stringify(latestFullData))
      localStorage.setItem('lastUpdate', lastUpdate)
    } catch (e) {}
  }
  if (andThen) andThen()
}

let shouldDoTheSearch = false
let lastSearched = 0
let lastSearchUrl = ''
let lastLoadedUrl = ''
function doTheSearch(details) {
  shouldDoTheSearch = false
  lastSearchUrl = ''
  lastSearched = Date.now()
  lastLoadedUrl = details.url
  const searchParam = getSearchParam(details.url)
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
      if (lastUpdate == -1) {
        loadData(() => doTheSearch(details))
      } else {
        doTheSearch(details)
        loadData()
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
