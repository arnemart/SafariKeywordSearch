const searchDomains = {
    "search.yahoo.com": "p",
    "www.search.yahoo.com": "p",
    "google.com": "q",
    "www.google.com": "q",
    "duckduckgo.com": "q",
    "www.duckduckgo.com": "q",
    "bing.com": "q",
    "www.bing.com": "q",
    "ecosia.org": "q",
    "www.ecosia.org": "q"
}

let searchData = {}
let latestData = "0"

function loadData(andThen) {
    browser.runtime.sendNativeMessage("application.id", latestData, response => {
        if (response) {
            try {
                const json = JSON.parse(response)
                if (json.timestamp > latestData) {
                    searchData = {}
                    latestData = json.timestamp.toString()
                    for (const s of json.data) {
                        for (const k of s.keyword.split(/\s*,\s*/)) {
                            searchData[k] = s.expansion
                        }
                    }
                }
            } catch (e) {
                console.log('Error parsing search data:', e, response)
            }
        }
        if (andThen) {
            andThen()
        }
    })
}

loadData()

function getSearchParam(urlString) {
    const url = new URL(urlString)
    const host = url.host
    if (host in searchDomains) {
        const urlParams = new URLSearchParams(url.search)
        const searchParam = urlParams.get(searchDomains[host])
        if (searchParam) {
            return searchParam
        }
    }
}

function getSearch(searchParam, andThen) {
    loadData(() => {
        let parts = searchParam.split(/\s+/)
        let match = searchData[parts[0]]
        let searchPhrase = parts.slice(1)

        if (!match && parts.length > 1) {
            match = searchData[parts[parts.length - 1]]
            searchPhrase = parts.slice(0, -1)
        }

        if (match) {
            const encodedSearchPhrase = searchPhrase.map(s => encodeURIComponent(s))
            andThen(match
                .replace('%%%', searchPhrase.join('+'))
                .replace('@@@', encodedSearchPhrase.join('+'))
                .replace(/\{\{@(.+?)@\}\}/g, (...m) => encodedSearchPhrase.join(m[1]))
                .replace(/\{\{%(.+?)%\}\}/g, (...m) => searchPhrase.join(m[1])))
        }

    })
}

function beforeNavigate(details) {
    if (details.parentFrameId == -1 && details.tabId > 0) {
        const searchParam = getSearchParam(details.url)
        if (searchParam) {
            getSearch(searchParam, searchUrl => {
                if (searchUrl) {
                    browser.tabs.update(
                        details.tabId,
                        {
                            url: searchUrl,
                            loadReplace: true
                        }
                    )
                }
            })
        }
    }
}

browser.webNavigation.onBeforeNavigate.addListener(
    beforeNavigate,
    { url: Object.keys(searchDomains).map(domain => ({hostContains: domain})) }
)       
