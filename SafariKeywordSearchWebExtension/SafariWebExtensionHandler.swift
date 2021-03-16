//
//  SafariWebExtensionHandler.swift
//  SafariKeywordSearchWebExtension
//
//  Created by Arne Martin Aurlien on 07/03/2021.
//

import SafariServices
import os.log

let SFExtensionMessageKey = "message"
let extensionBundleIdentifier = "net.aurlien.SafariKeywordSearch.SafariKeywordSearchWebExtension"

class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {
    
	func beginRequest(with context: NSExtensionContext) {
        let data = KeywordSearchData.instance
        let item = context.inputItems[0] as! NSExtensionItem
        let message = item.userInfo?[SFExtensionMessageKey] as? String
        let response = NSExtensionItem()
        if (message != nil) {
            let timestamp = TimeInterval(message!)
            if (timestamp != nil && data.changedSince(timestamp: timestamp!)) {
                response.userInfo = [SFExtensionMessageKey: data.asJsonString()]
            }
        }

        context.completeRequest(returningItems: [response], completionHandler: nil)
    }
    
}
