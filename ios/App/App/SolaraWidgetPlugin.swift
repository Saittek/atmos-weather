import Foundation
import Capacitor
import WidgetKit

/**
 * Bridge: React writes a weather JSON snapshot into the App Group;
 * WidgetKit extension reads it for the Home Screen tile.
 *
 * Writes BOTH:
 *  - UserDefaults(suiteName: group)
 *  - App Group container file widget-snapshot.json
 * so the extension can still load if one path fails.
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

    private static let appGroupId = "group.com.solara.weather"
    private static let snapshotKey = "widget.snapshot"
    private static let fileName = "widget-snapshot.json"
    private static let widgetKind = "SolaraHomeWidget"

    @objc func setSnapshot(_ call: CAPPluginCall) {
        guard let json = call.getString("json"), !json.isEmpty else {
            call.reject("json required")
            return
        }

        var wroteDefaults = false
        var wroteFile = false

        if let defaults = UserDefaults(suiteName: Self.appGroupId) {
            defaults.set(json, forKey: Self.snapshotKey)
            // Force flush for extension process
            defaults.synchronize()
            wroteDefaults = true
        }

        if let dir = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: Self.appGroupId
        ) {
            let file = dir.appendingPathComponent(Self.fileName)
            do {
                try json.write(to: file, atomically: true, encoding: .utf8)
                wroteFile = true
            } catch {
                // continue — defaults may still work
            }
        }

        if !wroteDefaults && !wroteFile {
            call.reject(
                "App Group unavailable — enable group.com.solara.weather on App + Widget in Apple Developer + Xcode signing"
            )
            return
        }

        Self.reloadTimelines()
        call.resolve([
            "ok": true,
            "defaults": wroteDefaults,
            "file": wroteFile,
        ])
    }

    @objc func reload(_ call: CAPPluginCall) {
        Self.reloadTimelines()
        call.resolve(["ok": true])
    }

    @objc func getSnapshot(_ call: CAPPluginCall) {
        call.resolve(["json": Self.loadSnapshotJSON() as Any])
    }

    static func loadSnapshotJSON() -> String? {
        if let defaults = UserDefaults(suiteName: appGroupId),
           let raw = defaults.string(forKey: snapshotKey),
           !raw.isEmpty
        {
            return raw
        }
        if let dir = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: appGroupId
        ) {
            let file = dir.appendingPathComponent(fileName)
            if let raw = try? String(contentsOf: file, encoding: .utf8), !raw.isEmpty {
                return raw
            }
        }
        return nil
    }

    static func reloadTimelines() {
        if #available(iOS 14.0, *) {
            WidgetCenter.shared.reloadTimelines(ofKind: widgetKind)
            WidgetCenter.shared.reloadAllTimelines()
        }
    }
}
