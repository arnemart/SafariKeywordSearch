//
//  Data.swift
//  SafariKeywordSearch
//
//  Created by Arne Martin Aurlien on 10/03/2021.
//

import Foundation
import os.log

// Raw storage for the extension. All merging and upgrading happens in JS (src/sync.js), this only reads and
// writes the stored strings, locally (shared app group) and in iCloud key-value storage.
enum KeywordSearchStore {
    static let keys = ["keywordSearches", "keywordSearchesv3", "keywordSearchesv4"]

    private static var local: UserDefaults? {
        UserDefaults(suiteName: "group.5YSSE2V8P3.net.aurlien.SafariKeywordSearch")
    }

    private static var cloud: NSUbiquitousKeyValueStore {
        NSUbiquitousKeyValueStore.default
    }

    static func load() -> [String: [String: String]] {
        let local = self.local
        let cloud = self.cloud
        cloud.synchronize()

        var localValues: [String: String] = [:]
        var cloudValues: [String: String] = [:]
        for key in keys {
            localValues[key] = local?.string(forKey: key)
            cloudValues[key] = cloud.string(forKey: key)
        }
        return ["local": localValues, "cloud": cloudValues]
    }

    static func save(_ writes: [String: [String: String]]) {
        let local = self.local
        for (key, value) in writes["local"] ?? [:] where keys.contains(key) {
            local?.set(value, forKey: key)
        }

        let cloud = self.cloud
        let cloudWrites = writes["cloud"] ?? [:]
        for (key, value) in cloudWrites where keys.contains(key) {
            cloud.set(value, forKey: key)
        }
        if !cloudWrites.isEmpty {
            cloud.synchronize()
        }
    }

    static func logExternalChange(_ notification: Notification) {
        guard let reason = notification.userInfo?[NSUbiquitousKeyValueStoreChangeReasonKey] as? Int else {
            return
        }
        switch reason {
        case NSUbiquitousKeyValueStoreQuotaViolationChange:
            os_log(.error, "iCloud key-value storage quota exceeded")
        case NSUbiquitousKeyValueStoreAccountChange:
            os_log(.info, "iCloud account changed")
        default:
            break
        }
    }
}
