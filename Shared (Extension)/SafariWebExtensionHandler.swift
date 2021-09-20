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
        let item = context.inputItems[0] as! NSExtensionItem
        
        if let messageString = item.userInfo?[SFExtensionMessageKey] as? String {
        
            if let messageData = messageString.data(using: .utf8) {
                if let message = try? self.jsonDecoder.decode(MessageFromBrowser.self, from: messageData) {
                    let response = NSExtensionItem()
                    
                    switch (message.message) {
                    case "loadData":
                        response.userInfo = [ SFExtensionMessageKey: data.getData() ]
                    case "saveData":
                        data.save(data: message.data)
                        response.userInfo = [ SFExtensionMessageKey: "ok!" ]
                    default:
                        response.userInfo = [ SFExtensionMessageKey: "hm" ]
                    }
                    
                    
                    context.completeRequest(returningItems: [response], completionHandler: nil)
                }
            }
        }
    }
}
