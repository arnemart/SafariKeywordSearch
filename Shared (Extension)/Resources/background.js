const CURRENT_VERSION = 3

const searchDomainRegex = /^(www\.)?(search\.yahoo|google|duckduckgo|bing|ecosia|baidu|soguo|so)(\.[a-z]{2,}){1,2}$/

const searchEngineParameters = {
  'search.yahoo': 'p',
  google: 'q',
  duckduckgo: 'q',
  bing: 'q',
  ecosia: 'q',
  baidu: 'word',
  soguo: 'keyword',
  so: 'q'
}

let latestFullData = {}
let searchData = {}
let lastUpdate = -1

try {
  // See if we have cached data in local storage, use that until we have loaded data from the app
  const cachedFullData = localStorage.getItem('latestFullData')
  if (cachedFullData) {
    const parsedFullData = JSON.parse(cachedFullData)
    if (parsedFullData.version == CURRENT_VERSION) {
      latestFullData = parsedFullData
      const cachedData = localStorage.getItem('searchData')
      if (cachedData) searchData = JSON.parse(cachedData)
      const cachedLastUpdate = localStorage.getItem('lastUpdate')
      if (cachedLastUpdate) lastUpdate = parseInt(cachedLastUpdate, 10)
    }
  }
} catch (e) {}

browser.webNavigation.onBeforeNavigate.addListener(beforeNavigate)

browser.webNavigation.onCommitted.addListener(onCommitted)

browser.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  switch (request.message) {
    case 'popupWantsData': {
      loadData(() => sendResponse({ data: latestFullData }))
      break
    }
    case 'popupWantsToSave': {
      saveData({
        version: CURRENT_VERSION,
        timestamp: Date.now(),
        searches: request.data.searches,
        settings: request.data.settings
      })
    }
  }
})

const defaultSearches = {
  version: CURRENT_VERSION,
  timestamp: 0,
  settings: {
    allowedLocations: 'frontOnly'
  },
  searches: [
    { name: 'Amazon', keywords: 'a', expansion: 'https://www.amazon.com/s?k=@@@' },
    {
      name: 'Archive.org Wayback Machine',
      keywords: 'ao, wm',
      expansion: 'https://web.archive.org/web/*/@@@',
      escape: false
    },
    { name: 'DuckDuckGo', keywords: 'd, ddg', expansion: 'https://duckduckgo.com/?q=@@@' },
    {
      name: 'Down for everyone or just me',
      keywords: 'down',
      expansion: 'https://downforeveryoneorjustme.com/@@@',
      escape: false
    },
    { name: 'Ebay', keywords: 'e, ebay', expansion: 'https://www.ebay.com/sch/i.html?_nkw=@@@' },
    { name: 'Google', keywords: 'g', expansion: 'https://www.google.com/search?q=@@@' },
    { name: 'Google maps', keywords: 'gm, gmaps', expansion: 'https://www.google.com/maps?oi=map&q=@@@' },
    { name: 'Google images', keywords: 'i, gi', expansion: 'https://www.google.com/search?tbm=isch&q=@@@&tbs=imgo:1' },
    { name: 'IMDB', keywords: 'imdb', expansion: 'https://imdb.com/find?s=all&q=@@@' },
    { name: 'Stack Overflow', keywords: 'so', expansion: 'https://stackoverflow.com/search?q=@@@' },
    {
      name: 'Wikipedia',
      keywords: 'w, wi',
      expansion: 'https://en.wikipedia.org/wiki/Special:Search/@@@',
      spaceReplacer: '_'
    },
    { name: 'Wolfram Alpha', keywords: 'wa', expansion: 'https://www.wolframalpha.com/input/?i=@@@' },
    { name: 'YouTube', keywords: 'y, yt', expansion: 'https://www.youtube.com/results?search_query=@@@' }
  ]
}

function upgradeData(oldData) {
  let newData

  if (oldData.version && oldData.version == 2) {
    newData = {
      ...oldData,
      settings: {
        allowedLocations: 'frontOnly'
      }
    }
  } else {
    const normalCustomPattern = /\{\{@(.*)@\}\}/
    const noEscapeCustomPattern = /\{\{%(.*)%\}\}/

    newData = {
      version: CURRENT_VERSION,
      timestamp: Date.now(),
      settings: {
        allowedLocations: 'frontOnly'
      },
      searches: oldData.data.map(d => {
        const n = {
          name: d.name,
          keywords: d.keyword,
          expansion: d.expansion,
          allowedLocations: 'default'
        }

        if (d.expansion.match(/%%%/)) {
          n.expansion = d.expansion.replace(/%%%/g, '@@@')
          n.escape = false
        }

        const normalCustomMatches = d.expansion.match(normalCustomPattern)
        if (normalCustomMatches) {
          n.expansion = d.expansion.replace(normalCustomPattern, '@@@')
          n.spaceReplacer = normalCustomMatches[1]
        }

        const noEscapeCustomMatches = d.expansion.match(noEscapeCustomPattern)
        if (noEscapeCustomMatches) {
          n.expansion = d.expansion.replace(noEscapeCustomPattern, '@@@')
          n.spaceReplacer = noEscapeCustomMatches[1]
          n.escape = false
        }
        return n
      })
    }
  }
  return newData
}

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
function loadData(andThen) {
  const now = Date.now()
  if (now - lastLoad > 200) {
    lastLoad = now
    browser.runtime.sendNativeMessage('application.id', message('loadData'), response => {
      if (response == '') {
        saveData(defaultSearches, andThen)
      } else {
        try {
          const json = JSON.parse(response)
          if (json.version && json.version == CURRENT_VERSION) {
            setData(json, andThen)
          } else {
            const upgradedData = upgradeData(json)
            saveData(upgradedData, andThen)
          }
        } catch (e) {
          console.log('Error parsing search data:', e, response)
        }
      }
    })
  } else {
    if (andThen) andThen()
  }
}

loadData()

function setData(data, andThen) {
  if (data.timestamp > lastUpdate) {
    latestFullData = data
    lastUpdate = data.timestamp
    searchData = {}
    for (const s of data.searches) {
      for (const k of s.keywords.split(/\s*,\s*/)) {
        searchData[k] = s
      }
    }
    localStorage.setItem('latestFullData', JSON.stringify(latestFullData))
    localStorage.setItem('searchData', JSON.stringify(searchData))
    localStorage.setItem('lastUpdate', lastUpdate)
  }
  if (andThen) andThen()
}

function getSearchParam(urlString) {
  const url = new URL(urlString)
  const matches = url.host.match(searchDomainRegex)
  if (matches) {
    const urlParams = new URLSearchParams(url.search)
    const searchParam = urlParams.get(searchEngineParameters[matches[2]])
    if (searchParam) {
      return searchParam
    }
  }
}

function getSearchUrl(searchParam) {
  let parts = searchParam.split(/\s+/)
  let match = searchData[parts[0]]
  let searchPhrase = parts.slice(1)

  if (!match && parts.length > 1) {
    const tentativeMatch = searchData[parts[parts.length - 1]]
    if (
      (tentativeMatch && tentativeMatch.allowedLocations == 'frontAndEnd') ||
      latestFullData.settings.allowedLocations == 'frontAndEnd'
    ) {
      match = tentativeMatch
      searchPhrase = parts.slice(0, -1)
    }
  }

  if (match) {
    const spaceReplacer = match.spaceReplacer || '+'
    if (match.escape === false) {
      return match.expansion.replaceAll('@@@', searchPhrase.join(spaceReplacer))
    } else {
      const encodedSearchPhrase = searchPhrase.map(s => encodeURIComponent(s))
      return match.expansion.replaceAll('@@@', encodedSearchPhrase.join(spaceReplacer))
    }
  }
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
    const searchUrl = getSearchUrl(searchParam)
    if (searchUrl) {
      shouldDoTheSearch = true
      lastSearchUrl = searchUrl
      browser.tabs.update(details.tabId, {
        url: searchUrl
      })
    }
  }
}

let lastInvoked = 0
function beforeNavigate(details) {
  if (details.parentFrameId == -1 && details.tabId > 0) {
    const now = Date.now()
    if (now - lastInvoked > 500) {
      if (lastUpdate == -1) {
        loadData(() => doTheSearch(details))
      } else {
        doTheSearch(details)
        loadData()
      }
      lastInvoked = now
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
