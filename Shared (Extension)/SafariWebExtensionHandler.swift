//
//  SafariWebExtensionHandler.swift
//  Shared (Extension)
//
//  Created by Arne Martin Aurlien on 09/06/2021.
//

import SafariServices
import os.log

let SFExtensionMessageKey = "message"

struct MessageFromBrowser: Decodable {
    var message: String
    var data: String
}

class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {
    private let observer = NotificationCenter.default.addObserver(
        forName: NSUbiquitousKeyValueStore.didChangeExternallyNotification,
        object: nil,
        queue: nil,
        using: KeywordSearchStore.logExternalChange
    )

    deinit {
        NotificationCenter.default.removeObserver(observer)
    }

    func beginRequest(with context: NSExtensionContext) {
        let response = NSExtensionItem()
        response.userInfo = [ SFExtensionMessageKey: handle(context.inputItems.first as? NSExtensionItem) ]
        // Always complete, otherwise the JS callback never fires
        context.completeRequest(returningItems: [response], completionHandler: nil)
    }

    private func handle(_ item: NSExtensionItem?) -> String {
        guard let messageString = item?.userInfo?[SFExtensionMessageKey] as? String,
              let messageData = messageString.data(using: .utf8),
              let message = try? JSONDecoder().decode(MessageFromBrowser.self, from: messageData) else {
            os_log(.error, "Could not decode message from browser")
            return "error"
        }

        switch (message.message) {
        case "load":
            guard let json = try? JSONSerialization.data(withJSONObject: KeywordSearchStore.load()) else {
                return "error"
            }
            return String(decoding: json, as: UTF8.self)
        case "save":
            guard let writes = try? JSONDecoder().decode([String: [String: String]].self, from: Data(message.data.utf8)) else {
                os_log(.error, "Could not decode data to save")
                return "error"
            }
            KeywordSearchStore.save(writes)
            return "ok"
        default:
            return "unknown message"
        }
    }
}
