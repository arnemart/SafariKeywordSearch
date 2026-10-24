export const CURRENT_VERSION = 3

export const defaultSearches = {
  version: CURRENT_VERSION,
  timestamp: 0,
  settings: {
    allowedLocations: 'frontOnly',
    searchEngine: 'any'
  },
  searches: [
    { name: 'Amazon', keywords: 'az', expansion: 'https://www.amazon.com/s?k=@@@' },
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
    { name: 'Google images', keywords: 'gi', expansion: 'https://www.google.com/search?udm=2&q=@@@' },
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

export function upgradeData(oldData) {
  let newData

  if (oldData.version && oldData.version == 2) {
    newData = {
      ...oldData,
      version: CURRENT_VERSION,
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
          name: d.name || '',
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

export function validateData(json) {
  try {
    return (
      typeof json.version == 'number' &&
      json.searches instanceof Array &&
      json.settings instanceof Object &&
      json.searches.every(
        s => typeof s.name == 'string' && typeof s.keywords == 'string' && typeof s.expansion == 'string'
      )
    )
  } catch (e) {
    return false
  }
}

// FNV-1a, used for deterministic ids so all devices derive the same ids from the same data
function hash(str) {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}

// Gives searches without an id a deterministic one based on their content
export function ensureIds(searches) {
  const seen = new Set()
  return searches.map(s => {
    let id = s.id
    if (!id) {
      const base = 'h' + hash([s.name, s.keywords, s.expansion].join('\n'))
      id = base
      for (let n = 2; seen.has(id); n++) id = `${base}-${n}`
    }
    seen.add(id)
    return id == s.id ? s : { ...s, id }
  })
}
