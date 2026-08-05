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
            // Match SolaraWidgetStore.staleAfter (45 min) so tile doesn't thrash
            if age <= SolaraWidgetStore.staleAfter {
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
        .description("Today at a glance — temp, high/low, UV, wind, sun times, and rain.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
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
            case .systemLarge:
                largeView(snap)
            case .systemMedium:
                mediumView(snap)
            default:
                smallView(snap)
            }
        } else {
            emptyView
        }
    }

    private var accent: Color { Color(red: 0.49, green: 0.83, blue: 0.99) }
    private var brand: Color { Color(red: 0.34, green: 0.78, blue: 0.96) }

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
            if let hint = snap.dayHint, !hint.isEmpty {
                Text(hint)
                    .font(.system(size: 10, weight: .medium))
                    .foregroundColor(accent.opacity(0.95))
                    .lineLimit(2)
                    .minimumScaleFactor(0.85)
            }
            HStack(spacing: 6) {
                if let hi = snap.highLabel, let lo = snap.lowLabel {
                    Text("H\(hi) L\(lo)")
                        .font(.caption2)
                        .fontWeight(.medium)
                        .foregroundColor(Color.white.opacity(0.8))
                }
                if let pop = snap.pop, pop > 0 {
                    Text("💧\(pop)%")
                        .font(.caption2)
                        .fontWeight(.medium)
                        .foregroundColor(accent)
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    /// Medium = the “big” Home Screen tile: today-relevant detail.
    private func mediumView(_ snap: WidgetSnapshot) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack(alignment: .center, spacing: 10) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("SOLARA · TODAY")
                        .font(.system(size: 9, weight: .bold))
                        .foregroundColor(brand)
                        .tracking(0.4)
                    Text(snap.placeName)
                        .font(.subheadline)
                        .fontWeight(.semibold)
                        .foregroundColor(.white)
                        .lineLimit(1)
                    Text(snap.condition)
                        .font(.caption2)
                        .foregroundColor(Color.white.opacity(0.72))
                        .lineLimit(1)
                    HStack(spacing: 6) {
                        if let hi = snap.highLabel, let lo = snap.lowLabel {
                            Text("H \(hi)  L \(lo)")
                                .font(.caption2)
                                .fontWeight(.semibold)
                                .foregroundColor(Color.white.opacity(0.85))
                        }
                        if let feels = snap.feelsLabel {
                            Text("Feels \(feels)")
                                .font(.caption2)
                                .foregroundColor(Color.white.opacity(0.6))
                        }
                    }
                }
                Spacer(minLength: 4)
                VStack(alignment: .trailing, spacing: 0) {
                    Text(snap.iconDisplay)
                        .font(.system(size: 26))
                    Text(snap.tempLabel)
                        .font(.system(size: 34, weight: .bold, design: .rounded))
                        .foregroundColor(.white)
                        .minimumScaleFactor(0.7)
                }
            }

            // Day-relevant strip: rain, UV, wind, humidity, precip total
            HStack(spacing: 5) {
                if let pop = snap.pop, pop > 0 {
                    metricPill("💧 \(pop)%", color: accent)
                }
                if let uv = snap.uvLabel {
                    metricPill(uv, color: uvColor(snap.uvMax))
                }
                if let w = snap.windFullLabel {
                    metricPill("💨 \(w)")
                }
                if let rh = snap.humidity {
                    metricPill("\(rh)%")
                }
                if let p = snap.precipDayLabel {
                    metricPill(p, color: accent)
                }
            }

            HStack(spacing: 8) {
                if let rise = snap.sunriseLabel {
                    Text("↑ \(rise)")
                        .font(.caption2)
                        .fontWeight(.medium)
                        .foregroundColor(Color.white.opacity(0.78))
                }
                if let set = snap.sunsetLabel {
                    Text("↓ \(set)")
                        .font(.caption2)
                        .fontWeight(.medium)
                        .foregroundColor(Color.white.opacity(0.78))
                }
                if let hint = snap.dayHint, !hint.isEmpty {
                    Text(hint)
                        .font(.caption2)
                        .foregroundColor(accent.opacity(0.95))
                        .lineLimit(1)
                        .minimumScaleFactor(0.85)
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    private func largeView(_ snap: WidgetSnapshot) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("SOLARA · TODAY")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundColor(brand)
                        .tracking(0.5)
                    Text(snap.placeName)
                        .font(.title3)
                        .fontWeight(.semibold)
                        .foregroundColor(.white)
                        .lineLimit(1)
                    Text(snap.condition)
                        .font(.subheadline)
                        .foregroundColor(Color.white.opacity(0.78))
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 2) {
                    Text(snap.iconDisplay)
                        .font(.system(size: 44))
                    Text(snap.tempLabel)
                        .font(.system(size: 48, weight: .bold, design: .rounded))
                        .foregroundColor(.white)
                    if let feels = snap.feelsLabel {
                        Text("Feels like \(feels)")
                            .font(.caption)
                            .foregroundColor(Color.white.opacity(0.65))
                    }
                }
            }

            if let hi = snap.highLabel, let lo = snap.lowLabel {
                Text("High \(hi)  ·  Low \(lo)")
                    .font(.subheadline)
                    .fontWeight(.medium)
                    .foregroundColor(Color.white.opacity(0.88))
            }

            if let hint = snap.dayHint, !hint.isEmpty {
                Text(hint)
                    .font(.caption)
                    .fontWeight(.medium)
                    .foregroundColor(accent)
                    .lineLimit(2)
            }

            Divider().background(Color.white.opacity(0.15))

            LazyVGrid(
                columns: [GridItem(.flexible()), GridItem(.flexible())],
                alignment: .leading,
                spacing: 8
            ) {
                if let pop = snap.pop {
                    largeMetric(title: "Rain chance", value: "\(pop)%")
                }
                if let uv = snap.uvLabel {
                    largeMetric(title: "UV index", value: uv.replacingOccurrences(of: "UV ", with: ""))
                }
                if let w = snap.windFullLabel {
                    largeMetric(title: "Wind", value: w)
                }
                if let rh = snap.humidity {
                    largeMetric(title: "Humidity", value: "\(rh)%")
                }
                if let p = snap.precipDayLabel {
                    largeMetric(title: "Precip today", value: p)
                }
                if let rise = snap.sunriseLabel, let set = snap.sunsetLabel {
                    largeMetric(title: "Sun", value: "↑\(rise)  ↓\(set)")
                } else if let rise = snap.sunriseLabel {
                    largeMetric(title: "Sunrise", value: rise)
                } else if let set = snap.sunsetLabel {
                    largeMetric(title: "Sunset", value: set)
                }
            }

            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    private func metricPill(_ text: String, color: Color = Color.white.opacity(0.82)) -> some View {
        Text(text)
            .font(.system(size: 11, weight: .semibold))
            .foregroundColor(color)
            .padding(.horizontal, 7)
            .padding(.vertical, 3)
            .background(Color.white.opacity(0.08))
            .clipShape(Capsule())
            .lineLimit(1)
    }

    private func largeMetric(title: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title.uppercased())
                .font(.system(size: 9, weight: .bold))
                .foregroundColor(Color.white.opacity(0.5))
                .tracking(0.4)
            Text(value)
                .font(.subheadline)
                .fontWeight(.semibold)
                .foregroundColor(.white)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(8)
        .background(Color.white.opacity(0.06))
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    private func uvColor(_ uv: Double?) -> Color {
        guard let u = uv else { return Color.white.opacity(0.82) }
        if u >= 8 { return Color(red: 1.0, green: 0.45, blue: 0.45) }
        if u >= 6 { return Color(red: 1.0, green: 0.72, blue: 0.35) }
        if u >= 3 { return Color(red: 0.95, green: 0.88, blue: 0.4) }
        return Color.white.opacity(0.82)
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
