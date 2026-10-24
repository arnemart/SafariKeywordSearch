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
    private let jsonDecoder = JSONDecoder()
    private let data = KeywordSearchData.instance
    
    func beginRequest(with context: NSExtensionContext) {
        let response = NSExtensionItem()
        response.userInfo = [ SFExtensionMessageKey: handle(context.inputItems.first as? NSExtensionItem) ]
        // Always complete, otherwise the JS callback never fires
        context.completeRequest(returningItems: [response], completionHandler: nil)
    }

    private func handle(_ item: NSExtensionItem?) -> String {
        guard let messageString = item?.userInfo?[SFExtensionMessageKey] as? String,
              let messageData = messageString.data(using: .utf8),
              let message = try? self.jsonDecoder.decode(MessageFromBrowser.self, from: messageData) else {
            os_log(.error, "Could not decode message from browser")
            return "error"
        }

        switch (message.message) {
        case "loadData":
            return data.getData()
        case "saveData":
            data.save(data: message.data)
            return "ok!"
        default:
            return "hm"
        }
    }
}
