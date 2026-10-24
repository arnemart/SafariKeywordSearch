//
//  ViewController.swift
//  Shared (App)
//
//  Created by Arne Martin Aurlien on 09/06/2021.
//

import WebKit

#if os(iOS)
import UIKit
typealias PlatformViewController = UIViewController
#elseif os(macOS)
import Cocoa
import SafariServices
typealias PlatformViewController = NSViewController
#endif

let extensionBundleIdentifier = "net.aurlien.SafariKeywordSearch.SafariKeywordSearchWebExtension"

class ViewController: PlatformViewController, WKNavigationDelegate, WKScriptMessageHandler {

    @IBOutlet var webView: WKWebView!

    override func viewDidLoad() {
        super.viewDidLoad()

        self.webView.navigationDelegate = self

        self.webView.configuration.userContentController.add(self, name: "controller")

        self.webView.loadFileURL(Bundle.main.url(forResource: "Main", withExtension: "html")!, allowingReadAccessTo: Bundle.main.resourceURL!)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
#if os(iOS)
        if UIDevice.current.userInterfaceIdiom == .pad {
            webView.evaluateJavaScript("show('ipad')")
        } else {
            webView.evaluateJavaScript("show('ios')")
        }
#elseif os(macOS)
        webView.evaluateJavaScript("show('mac')")

        // async instead of a completion handler: under Swift 6 the handler would be main-actor isolated but
        // called on a background queue, which traps at runtime
        Task {
            guard let state = try? await SFSafariExtensionManager.stateOfSafariExtension(withIdentifier: extensionBundleIdentifier) else {
                return
            }
            _ = try? await webView.evaluateJavaScript("show('mac', \(state.isEnabled))")
        }
#endif
    }

    // Links (the privacy policy) open in the default browser instead of inside the app
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping @MainActor @Sendable (WKNavigationActionPolicy) -> Void) {
        guard navigationAction.navigationType == .linkActivated,
              let url = navigationAction.request.url,
              url.scheme == "https" else {
            decisionHandler(.allow)
            return
        }
#if os(macOS)
        NSWorkspace.shared.open(url)
#elseif os(iOS)
        UIApplication.shared.open(url)
#endif
        decisionHandler(.cancel)
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        if (message.body as? String != "open-preferences") {
            return;
        }
#if os(macOS)
        Task {
            try? await SFSafariApplication.showPreferencesForExtension(withIdentifier: extensionBundleIdentifier)
        }
#elseif os(iOS)
        guard let settingsUrl = URL(string: UIApplication.openSettingsURLString) else {
            return
        }
        
        if UIApplication.shared.canOpenURL(settingsUrl) {
            UIApplication.shared.open(settingsUrl)
        }
#endif
    }

}
