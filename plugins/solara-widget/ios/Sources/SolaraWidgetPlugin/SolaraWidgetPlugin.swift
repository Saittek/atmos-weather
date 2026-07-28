import Foundation
import Capacitor
import WidgetKit

/**
 * Writes weather JSON into the App Group for SolaraWidgetExtension.
 * Primary store: App Group container file (shared reliably).
 * Secondary: UserDefaults suite.
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

    @objc public func setSnapshot(_ call: CAPPluginCall) {
        guard let json = call.getString("json"), !json.isEmpty else {
            call.reject("json required")
            return
        }

        var wroteFile = false
        var wroteDefaults = false
        var groupError: String?

        if let dir = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: Self.appGroupId
        ) {
            let file = dir.appendingPathComponent(Self.fileName)
            do {
                try json.write(to: file, atomically: true, encoding: .utf8)
                wroteFile = true
            } catch {
                groupError = "file write failed: \(error.localizedDescription)"
            }
        } else {
            groupError = "App Group container nil — enable group.com.solara.weather on both App IDs and re-sign"
        }

        if let defaults = UserDefaults(suiteName: Self.appGroupId) {
            defaults.set(json, forKey: Self.snapshotKey)
            defaults.synchronize()
            wroteDefaults = true
        }

        // File is the reliable cross-process store; require it
        if !wroteFile {
            call.reject(groupError ?? "App Group unavailable")
            return
        }

        Self.reloadTimelines()
        call.resolve([
            "ok": true,
            "file": wroteFile,
            "defaults": wroteDefaults,
        ])
    }

    @objc public func reload(_ call: CAPPluginCall) {
        Self.reloadTimelines()
        call.resolve(["ok": true])
    }

    @objc public func getSnapshot(_ call: CAPPluginCall) {
        call.resolve(["json": Self.loadSnapshotJSON() as Any])
    }

    public static func loadSnapshotJSON() -> String? {
        if let dir = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: appGroupId
        ) {
            let file = dir.appendingPathComponent(fileName)
            if let raw = try? String(contentsOf: file, encoding: .utf8), !raw.isEmpty {
                return raw
            }
        }
        if let defaults = UserDefaults(suiteName: appGroupId),
           let raw = defaults.string(forKey: snapshotKey),
           !raw.isEmpty
        {
            return raw
        }
        return nil
    }

    public static func reloadTimelines() {
        if #available(iOS 14.0, *) {
            DispatchQueue.main.async {
                WidgetCenter.shared.reloadTimelines(ofKind: widgetKind)
                WidgetCenter.shared.reloadAllTimelines()
            }
        }
    }
}
