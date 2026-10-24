// Matches www./m. prefixes and regional Yahoo subdomains (e.g. no.search.yahoo.com)
const searchDomainRegex =
  /^(?:www\.|m\.|[a-z]{2,10}\.(?=search\.yahoo\.))?(search\.yahoo|google|duckduckgo|bing|ecosia|baidu|sogou|so)(\.[a-z]{2,}){1,2}$/

const searchEngineParameters = {
  'search.yahoo': ['p'],
  google: ['q'],
  duckduckgo: ['q'],
  bing: ['q'],
  ecosia: ['q'],
  baidu: ['wd', 'word'],
  sogou: ['query', 'keyword'],
  so: ['q']
}

export function getSearchParam(urlString) {
  const url = new URL(urlString)
  const matches = url.host.match(searchDomainRegex)
  if (matches) {
    for (const param of searchEngineParameters[matches[1]]) {
      const searchParam = url.searchParams.get(param)
      if (searchParam) {
        return searchParam
      }
    }
  }
}

// Lookup structure for getSearchUrl
export function buildIndex(data) {
  const byKeyword = {}
  let defaultSearch = null
  for (const s of data.searches) {
    if (s.isDefault) {
      defaultSearch = s
    }
    for (const k of s.keywords.split(/\s*,\s*/)) {
      byKeyword[k.toLowerCase()] = s
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
