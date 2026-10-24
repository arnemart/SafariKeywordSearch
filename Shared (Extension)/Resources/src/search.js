// Matches www./m. prefixes and regional Yahoo subdomains (e.g. no.search.yahoo.com)
const searchDomainRegex =
  /^(?:www\.|m\.|[a-z]{2,10}\.(?=search\.yahoo\.))?(search\.yahoo|google|duckduckgo|bing|ecosia|baidu|sogou|so)(\.[a-z]{2,}){1,2}$/

// The search engines Safari can use. `fromSafari` recognizes the parameters Safari adds to searches from the
// address bar (see the URLs in search.test.js); engines without it could not be tested and match on domain only.
export const searchEngines = {
  google: {
    name: 'Google',
    domain: 'google',
    params: ['q'],
    fromSafari: p => p.get('client') == 'safari'
  },
  bing: {
    name: 'Bing',
    domain: 'bing',
    params: ['q'],
    fromSafari: p => /^AP/.test(p.get('form') || '')
  },
  duckduckgo: {
    name: 'DuckDuckGo',
    domain: 'duckduckgo',
    params: ['q'],
    fromSafari: p => ['osx', 'iphone', 'ipad'].includes(p.get('t'))
  },
  ecosia: {
    name: 'Ecosia',
    domain: 'ecosia',
    params: ['q'],
    fromSafari: p => (p.get('tts') || '').startsWith('st_asaf_')
  },
  yahoo: {
    name: 'Yahoo',
    domain: 'search.yahoo',
    params: ['p'],
    fromSafari: p => /^(aapl|iphone$|ipad$)/.test(p.get('fr') || '') || p.get('.tsrc') == 'apple'
  },
  baidu: { name: 'Baidu', domain: 'baidu', params: ['wd', 'word'] },
  sogou: { name: 'Sogou', domain: 'sogou', params: ['query', 'keyword'] },
  so: { name: '360 Search', domain: 'so', params: ['q'] }
}

const enginesByDomain = Object.fromEntries(Object.entries(searchEngines).map(([id, e]) => [e.domain, id]))

// `engine` is the searchEngine setting: 'any' matches all engines, including searches made on the engine's own
// site. A specific engine only matches searches Safari made from the address bar, where that can be recognized.
export function getSearchParam(urlString, engine = 'any') {
  const url = new URL(urlString)
  const matches = url.host.match(searchDomainRegex)
  if (!matches) return

  const id = enginesByDomain[matches[1]]
  const definition = searchEngines[id]
  if (engine != 'any' && (id != engine || (definition.fromSafari && !definition.fromSafari(url.searchParams)))) {
    return
  }
  for (const param of definition.params) {
    const searchParam = url.searchParams.get(param)
    if (searchParam) {
      return searchParam
    }
  }
}

// The keywords of a search, lowercased, as they are matched
export const splitKeywords = keywords =>
  keywords
    .split(',')
    .map(k => k.trim().toLowerCase())
    .filter(Boolean)

// Lookup structure for getSearchUrl
export function buildIndex(data) {
  const byKeyword = {}
  let defaultSearch = null
  for (const s of data.searches) {
    if (s.isDefault) {
      defaultSearch = s
    }
    for (const k of splitKeywords(s.keywords)) {
      byKeyword[k] = s
    }
  }
  return { byKeyword, defaultSearch, settings: data.settings || {} }
}

export function getSearchUrl(searchParam, index) {
  const parts = searchParam.trim().split(/\s+/)
  let match = index.byKeyword[parts[0].toLowerCase()]
  let searchPhrase = parts.slice(1)

  if (!match && parts.length > 1) {
    const tentativeMatch = index.byKeyword[parts[parts.length - 1].toLowerCase()]
    if (
      tentativeMatch &&
      (tentativeMatch.allowedLocations == 'frontAndEnd' ||
        ((tentativeMatch.allowedLocations || 'default') == 'default' &&
          index.settings.allowedLocations == 'frontAndEnd'))
    ) {
      match = tentativeMatch
      searchPhrase = parts.slice(0, -1)
    }
  }

  if (!match && index.defaultSearch) {
    match = index.defaultSearch
    searchPhrase = parts
  }

  if (match) {
    const spaceReplacer = match.spaceReplacer || '+'
    const phrase = match.escape === false ? searchPhrase : searchPhrase.map(s => encodeURIComponent(s))
    return match.expansion.replaceAll('@@@', phrase.join(spaceReplacer))
  }
}
