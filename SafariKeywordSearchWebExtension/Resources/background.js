const searchDomains = {
    "search.yahoo.com": "p",
    "www.search.yahoo.com": "p",
    "google.com": "q",
    "www.google.com": "q",
    "duckduckgo.com": "q",
    "www.duckduckgo.com": "q",
    "bing.com": "q",
    "www.bing.com": "q"
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
        let [first, ...rest] = searchParam.split(/\s+/)
        if (searchData[first]) {
            andThen(searchData[first]
                .replaceAll('%%%', rest.join('+'))
                .replaceAll('@@@', escape(rest.join('+')))
                .replaceAll(/\{\{@(.+?)@\}\}/g, (...m) => escape(rest.join(m[1])))
                .replaceAll(/\{\{%(.+?)%\}\}/g, (...m) => rest.join(m[1])))
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
