import Foundation
import Capacitor
import WidgetKit

/**
 * Bridge: React writes a weather JSON snapshot into the App Group;
 * WidgetKit extension reads it for the Home Screen tile.
 */
@objc(SolaraWidgetPlugin)
public class SolaraWidgetPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SolaraWidgetPlugin"
    public let jsName = "SolaraWidget"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setSnapshot", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "reload", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getSnapshot", returnType: CAPPluginReturnPromise),
    ]

    private let appGroupId = "group.com.solara.weather"
    private let snapshotKey = "widget.snapshot"
    private let widgetKind = "SolaraHomeWidget"

    @objc func setSnapshot(_ call: CAPPluginCall) {
        guard let json = call.getString("json"), !json.isEmpty else {
            call.reject("json required")
            return
        }
        guard let defaults = UserDefaults(suiteName: appGroupId) else {
            call.reject("App Group unavailable — enable group.com.solara.weather on both targets")
            return
        }
        defaults.set(json, forKey: snapshotKey)
        defaults.synchronize()
        reloadTimelines()
        call.resolve(["ok": true])
    }

    @objc func reload(_ call: CAPPluginCall) {
        reloadTimelines()
        call.resolve(["ok": true])
    }

    @objc func getSnapshot(_ call: CAPPluginCall) {
        let defaults = UserDefaults(suiteName: appGroupId)
        let json = defaults?.string(forKey: snapshotKey)
        call.resolve(["json": json as Any])
    }

    private func reloadTimelines() {
        if #available(iOS 14.0, *) {
            WidgetCenter.shared.reloadTimelines(ofKind: widgetKind)
            WidgetCenter.shared.reloadAllTimelines()
        }
    }
}
