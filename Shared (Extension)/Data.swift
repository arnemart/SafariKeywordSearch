//
//  Data.swift
//  SafariKeywordSearch
//
//  Created by Arne Martin Aurlien on 10/03/2021.
//

import Foundation
import SafariServices.SFSafariApplication

struct StoredData: Decodable {
    var timestamp: Int
}

private func nilOrEmpty(s: String?) -> Bool {
    return s == nil || s == "" || s == "{}"
}

private func getTimestamp(json: String) -> Int {
    if let ts = try? JSONDecoder().decode(StoredData.self, from: json.data(using: .utf8)!) {
        return ts.timestamp
    } else {
        return 0
    }
}

class KeywordSearchData {
    static let instance = KeywordSearchData()

    private let keyv1 = "keywordSearches"
    private let key = "keywordSearchesv3"
    private let userDefaults: UserDefaults? = UserDefaults(suiteName: "group.5YSSE2V8P3.net.aurlien.SafariKeywordSearch")
    private let icloudData: NSUbiquitousKeyValueStore = NSUbiquitousKeyValueStore.default
    private var jsonData: String = ""
    private var lastSave: Int = 0

    private init() {
        NotificationCenter.default.addObserver(self,
                                               selector: #selector(icloudNotify(_:)),
                                               name: NSUbiquitousKeyValueStore.didChangeExternallyNotification,
                                               object: self.icloudData)

        self.initData(keyToCheck: self.key)
    }

    private func initData(keyToCheck: String) {
        let checkingOldKey = keyToCheck != self.key
        
        let storedData = self.userDefaults?.string(forKey: keyToCheck)

        self.icloudData.synchronize()
        let icloudData = self.icloudData.string(forKey: keyToCheck)

        if (nilOrEmpty(s: storedData) && !nilOrEmpty(s: icloudData)) {
            self.save(data: icloudData!, skipIcloud: !checkingOldKey)
        } else if (!nilOrEmpty(s: storedData) && nilOrEmpty(s: icloudData)) {
            self.save(data: storedData!)
        } else if (!nilOrEmpty(s: storedData) && !nilOrEmpty(s: icloudData)) {
            let icloudLastSave = getTimestamp(json: icloudData!)
            let storedLastSave = getTimestamp(json: storedData!)
            if (storedLastSave > icloudLastSave) {
                self.save(data: storedData!)
            } else {
                self.save(data: icloudData!, skipIcloud: !checkingOldKey)
            }
        } else if (!checkingOldKey) {
            self.initData(keyToCheck: self.keyv1)
        }
    }
    
    @objc
    func icloudNotify(_ notification: Notification) {
        self.checkIcloudData()
    }

    func checkIcloudData() {
        self.icloudData.synchronize()
        let icloudData = self.icloudData.string(forKey: self.key)

        if (!nilOrEmpty(s: icloudData)) {
            let icloudLastSave = getTimestamp(json: icloudData!)
            if (icloudLastSave > self.lastSave) {
                self.save(data: icloudData!, skipIcloud: true)
            }
        }
    }

    func getData() -> String {
        self.checkIcloudData()
        return self.jsonData
    }

    func save(data: String, skipIcloud: Bool = false) {
        self.jsonData = data
        self.lastSave = getTimestamp(json: data)
        self.userDefaults?.set(data, forKey: self.key)
        if (!skipIcloud && self.lastSave > 0) {
            self.icloudData.set(data, forKey: self.key)
            self.icloudData.synchronize()
        }
    }
}
