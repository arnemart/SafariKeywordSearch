//
//  Data.swift
//  SafariKeywordSearch
//
//  Created by Arne Martin Aurlien on 10/03/2021.
//

import Foundation
import SafariServices.SFSafariApplication

struct StoredData: Codable {
    var data: [KeywordSearch]
    var timestamp: TimeInterval
}

struct KeywordSearch: Codable {
    var name: String
    var keyword: String
    var expansion: String
}

let defaultSearches = [
    ["Amazon", "a", "https://www.amazon.com/s?k=@@@"],
    ["DuckDuckGo", "d, ddg", "https://duckduckgo.com/?q=@@@"],
    ["Down for everyone or just me", "down", "https://downforeveryoneorjustme.com/@@@"],
    ["Ebay", "e, ebay", "https://www.ebay.com/sch/i.html?_nkw=@@@"],
    ["Google", "g", "https://www.google.com/search?q=@@@"],
    ["Google maps", "gm, gmaps", "https://www.google.com/maps?oi=map&q=@@@"],
    ["IMDB", "imdb", "https://imdb.com/find?s=all&q=@@@"],
    ["Stack Overflow", "so", "https://stackoverflow.com/search?q=@@@"],
    ["Wikipedia", "w, wi", "https://en.wikipedia.org/wiki/Special:Search/{{@_@}}"],
    ["Wolfram Alpha", "wa", "https://www.wolframalpha.com/input/?i=@@@"],
    ["YouTube", "y, yt", "https://www.youtube.com/results?search_query=@@@"]
]

class KeywordSearchData {
    static let instance = KeywordSearchData()
    private let key = "keywordSearches"
    private var data: [KeywordSearch] = []
    private var selected: Int = 0
    private var listeners: [(() -> Void)?] = []
    private let userDefaults: UserDefaults? = UserDefaults(suiteName: "group.5YSSE2V8P3.net.aurlien.SafariKeywordSearch")
    private let jsonEncoder = JSONEncoder()
    private let jsonDecoder = JSONDecoder()
    private var timer: Timer?
    private var lastSave: TimeInterval = NSDate().timeIntervalSince1970

    private init() {
        self.initData()
        self.actuallySave()
    }
    
    private func initData() {
        if let storedData = self.userDefaults?.value(forKey: self.key) as? Data {
            if let decodedData = try? self.jsonDecoder.decode(StoredData.self, from: storedData) {
                self.data = decodedData.data
                self.lastSave = decodedData.timestamp
            }
        }
        
        if (self.data.count == 0) {
            self.data = defaultSearches.map { (search) in
                KeywordSearch(name: search[0], keyword: search[1], expansion: search[2])
            }
        }
    }
    
    func listen(listener: (() -> Void)?) {
        listeners.append(listener)
        self.notify()
    }
    
    func notify() {
        for listener in self.listeners {
            listener?()
        }
    }
    
    func getSearches() -> [KeywordSearch] {
        return self.data
    }
    
    func addSearch() {
        self.data.append(KeywordSearch(name: "", keyword: "keyword", expansion: "http://example.com/?q=@@@"))
        self.setSelected(sel: self.data.count - 1)
        self.notify()
    }
    
    func deleteSearch() {
        self.data.remove(at: self.selected)
        self.setSelected(sel: [self.selected - 1, 0].max()!)
        self.notify()
    }
    
    func setSelected(sel: Int) {
        self.selected = sel
        self.notify()
    }
    
    func getSelected() -> Int {
        return self.selected
    }
    
    func getCurrent() -> KeywordSearch {
        return self.data[self.selected]
    }
    
    func updateValue(field: String, value: String) {
        var current = self.getCurrent()

        switch field {
        case "name":
            current.name = value
        case "keyword":
            current.keyword = value
        case "expansion":
            current.expansion = value
        default:
            break
        }
        self.data[self.selected] = current
        
        self.notify()
        self.save()
    }
    
    func changedSince(timestamp: TimeInterval) -> Bool {
        self.initData()
        return self.lastSave > timestamp
    }
    
    func asJsonString() -> String {
        if let encodedData = try? jsonEncoder.encode(StoredData(data: self.data, timestamp: self.lastSave)) {
            return String(decoding: encodedData, as: UTF8.self)
        }
        
        return ""
    }
    
    private func save() {
        self.timer?.invalidate()
        self.timer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: false, block: { _ in
            self.actuallySave()
        })
    }
    
    private func actuallySave() {
        self.lastSave = NSDate().timeIntervalSince1970
        if let encodedData = try? jsonEncoder.encode(StoredData(data: self.data, timestamp: self.lastSave)) {
            self.userDefaults?.setValue(encodedData, forKey: self.key)
            
        }
    }
}
