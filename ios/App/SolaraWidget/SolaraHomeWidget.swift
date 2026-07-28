import SwiftUI
import WidgetKit
import CoreLocation

struct SolaraEntry: TimelineEntry {
    let date: Date
    let snapshot: WidgetSnapshot?
    let placeholder: Bool
}

struct SolaraProvider: TimelineProvider {
    func placeholder(in context: Context) -> SolaraEntry {
        SolaraEntry(date: Date(), snapshot: .preview, placeholder: true)
    }

    func getSnapshot(in context: Context, completion: @escaping (SolaraEntry) -> Void) {
        if let snap = SolaraWidgetStore.loadSnapshot() {
            completion(SolaraEntry(date: Date(), snapshot: snap, placeholder: false))
            return
        }
        // Gallery / first paint: show preview sample rather than empty
        completion(SolaraEntry(date: Date(), snapshot: .preview, placeholder: true))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<SolaraEntry>) -> Void) {
        let finish: (WidgetSnapshot?) -> Void = { snap in
            let entry = SolaraEntry(date: Date(), snapshot: snap, placeholder: false)
            let next = Date().addingTimeInterval(30 * 60)
            completion(Timeline(entries: [entry], policy: .after(next)))
        }

        // 1) Prefer snapshot written by the main app (App Group file / suite)
        if let existing = SolaraWidgetStore.loadSnapshot() {
            let age = Date().timeIntervalSince1970 - existing.updatedAt
            if age <= 15 * 60 {
                finish(existing)
                return
            }
            // Stale — refresh via Open-Meteo using stored coords
            OpenMeteoWidgetFetch.refresh(
                lat: existing.lat,
                lon: existing.lon,
                units: existing.units,
                placeName: existing.placeName
            ) { fresh in
                finish(fresh ?? existing)
            }
            return
        }

        // 2) No app snapshot yet — fetch with device location (widget can still show weather)
        WidgetLocation.once { coord in
            guard let coord = coord else {
                finish(nil)
                return
            }
            OpenMeteoWidgetFetch.refresh(
                lat: coord.latitude,
                lon: coord.longitude,
                units: "metric",
                placeName: "My location"
            ) { fresh in
                finish(fresh)
            }
        }
    }
}

/// One-shot location for widget when the app has not written a snapshot yet.
private enum WidgetLocation {
    private static let manager = CLLocationManager()
    private static var delegateBox: LocDelegate?

    static func once(completion: @escaping (CLLocationCoordinate2D?) -> Void) {
        let status: CLAuthorizationStatus
        if #available(iOS 14.0, *) {
            status = manager.authorizationStatus
        } else {
            status = CLLocationManager.authorizationStatus()
        }

        // Widget cannot prompt for permission; only use if already authorized by main app
        let ok: Bool
        switch status {
        case .authorizedAlways, .authorizedWhenInUse:
            ok = true
        default:
            ok = false
        }
        guard ok else {
            completion(nil)
            return
        }

        let box = LocDelegate { coord in
            delegateBox = nil
            completion(coord)
        }
        delegateBox = box
        manager.delegate = box
        manager.desiredAccuracy = kCLLocationAccuracyKilometer
        manager.requestLocation()

        // Timeout so WidgetKit is never left hanging
        DispatchQueue.main.asyncAfter(deadline: .now() + 4) {
            if delegateBox != nil {
                delegateBox = nil
                completion(manager.location?.coordinate)
            }
        }
    }

    private final class LocDelegate: NSObject, CLLocationManagerDelegate {
        let handler: (CLLocationCoordinate2D?) -> Void
        private var done = false

        init(handler: @escaping (CLLocationCoordinate2D?) -> Void) {
            self.handler = handler
        }

        private func finish(_ c: CLLocationCoordinate2D?) {
            guard !done else { return }
            done = true
            handler(c)
        }

        func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
            finish(locations.last?.coordinate)
        }

        func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
            finish(nil)
        }
    }
}

struct SolaraHomeWidget: Widget {
    let kind: String = SolaraWidgetStore.widgetKind

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: SolaraProvider()) { entry in
            SolaraWidgetView(entry: entry)
                .modifier(SolaraWidgetBackground())
        }
        .configurationDisplayName("Solara Weather")
        .description("Current conditions — temp, high/low, and rain chance.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

private struct SolaraWidgetBackground: ViewModifier {
    private var gradient: LinearGradient {
        LinearGradient(
            gradient: Gradient(colors: [
                Color(red: 0.04, green: 0.07, blue: 0.13),
                Color(red: 0.08, green: 0.12, blue: 0.22),
            ]),
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

    @ViewBuilder
    func body(content: Content) -> some View {
        if #available(iOS 17.0, *) {
            content.containerBackground(for: .widget) { gradient }
        } else {
            content.background(gradient)
        }
    }
}

struct SolaraWidgetView: View {
    var entry: SolaraEntry
    @Environment(\.widgetFamily) private var family

    var body: some View {
        content
            .padding(14)
            .widgetURL(URL(string: entry.snapshot?.deepLink ?? "solara://home"))
    }

    @ViewBuilder
    private var content: some View {
        if let snap = entry.snapshot {
            switch family {
            case .systemMedium:
                mediumView(snap)
            default:
                smallView(snap)
            }
        } else {
            emptyView
        }
    }

    private func smallView(_ snap: WidgetSnapshot) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(snap.placeName)
                .font(.caption)
                .fontWeight(.semibold)
                .foregroundColor(Color.white.opacity(0.85))
                .lineLimit(1)
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(snap.iconDisplay)
                    .font(.title2)
                Text(snap.tempLabel)
                    .font(.system(size: 34, weight: .bold, design: .rounded))
                    .foregroundColor(.white)
                    .minimumScaleFactor(0.7)
            }
            Text(snap.condition)
                .font(.caption2)
                .foregroundColor(Color.white.opacity(0.7))
                .lineLimit(1)
            Spacer(minLength: 0)
            if let pop = snap.pop, pop > 0 {
                Text("Rain \(pop)%")
                    .font(.caption2)
                    .fontWeight(.medium)
                    .foregroundColor(Color(red: 0.49, green: 0.83, blue: 0.99))
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    private func mediumView(_ snap: WidgetSnapshot) -> some View {
        HStack(spacing: 14) {
            VStack(alignment: .leading, spacing: 4) {
                Text("SOLARA")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(Color(red: 0.34, green: 0.78, blue: 0.96))
                Text(snap.placeName)
                    .font(.headline)
                    .fontWeight(.semibold)
                    .foregroundColor(.white)
                    .lineLimit(1)
                Text(snap.condition)
                    .font(.subheadline)
                    .foregroundColor(Color.white.opacity(0.75))
                Spacer(minLength: 0)
                HStack(spacing: 10) {
                    if let hi = snap.highLabel, let lo = snap.lowLabel {
                        Text("H \(hi)  L \(lo)")
                            .font(.caption)
                            .fontWeight(.medium)
                            .foregroundColor(Color.white.opacity(0.8))
                    }
                    if let pop = snap.pop, pop > 0 {
                        Text("💧 \(pop)%")
                            .font(.caption)
                            .fontWeight(.medium)
                            .foregroundColor(Color(red: 0.49, green: 0.83, blue: 0.99))
                    }
                }
            }
            Spacer(minLength: 0)
            VStack(spacing: 2) {
                Text(snap.iconDisplay)
                    .font(.system(size: 40))
                Text(snap.tempLabel)
                    .font(.system(size: 40, weight: .bold, design: .rounded))
                    .foregroundColor(.white)
                if let feels = snap.feelsLabel {
                    Text("Feels \(feels)")
                        .font(.caption2)
                        .foregroundColor(Color.white.opacity(0.65))
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }

    private var emptyView: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Solara")
                .font(.headline)
                .foregroundColor(.white)
            Text("Open Solara once so weather can load on this widget.")
                .font(.caption)
                .foregroundColor(Color.white.opacity(0.75))
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}
