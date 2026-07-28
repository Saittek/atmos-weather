import SwiftUI
import WidgetKit

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
        let snap = SolaraWidgetStore.loadSnapshot() ?? .preview
        completion(SolaraEntry(date: Date(), snapshot: snap, placeholder: false))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<SolaraEntry>) -> Void) {
        Task {
            var snap = SolaraWidgetStore.loadSnapshot()

            // Self-refresh from Open-Meteo when we have coords and data is stale
            if let existing = snap, (existing.isStale || context.isPreview == false) {
                if existing.isStale || Date().timeIntervalSince1970 - existing.updatedAt > 20 * 60 {
                    if let fresh = await OpenMeteoWidgetFetch.refresh(
                        lat: existing.lat,
                        lon: existing.lon,
                        units: existing.units
                    ) {
                        snap = fresh
                    }
                }
            }

            let entry = SolaraEntry(date: Date(), snapshot: snap, placeholder: false)
            let next = Date().addingTimeInterval(45 * 60)
            let timeline = Timeline(entries: [entry], policy: .after(next))
            completion(timeline)
        }
    }
}

struct SolaraHomeWidget: Widget {
    let kind = SolaraWidgetStore.widgetKind

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: SolaraProvider()) { entry in
            SolaraWidgetView(entry: entry)
                .modifier(SolaraWidgetBackground())
        }
        .configurationDisplayName("Solara Weather")
        .description("Current conditions for your home place — temp, high/low, and rain chance.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

private struct SolaraWidgetBackground: ViewModifier {
    private var gradient: LinearGradient {
        LinearGradient(
            colors: [
                Color(red: 0.04, green: 0.07, blue: 0.13),
                Color(red: 0.08, green: 0.12, blue: 0.22),
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

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
        let snap = entry.snapshot

        Group {
            if let snap {
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
        .padding(14)
        .widgetURL(URL(string: snap?.deepLink ?? "solara://home"))
    }

    private func smallView(_ snap: WidgetSnapshot) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(snap.placeName)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.white.opacity(0.85))
                .lineLimit(1)
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(snap.iconDisplay)
                    .font(.title2)
                Text(snap.tempLabel)
                    .font(.system(size: 34, weight: .bold, design: .rounded))
                    .foregroundStyle(.white)
                    .minimumScaleFactor(0.7)
            }
            Text(snap.condition)
                .font(.caption2)
                .foregroundStyle(.white.opacity(0.7))
                .lineLimit(1)
            Spacer(minLength: 0)
            if let pop = snap.pop, pop > 0 {
                Text("Rain \(pop)%")
                    .font(.caption2.weight(.medium))
                    .foregroundStyle(Color(red: 0.49, green: 0.83, blue: 0.99))
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    private func mediumView(_ snap: WidgetSnapshot) -> some View {
        HStack(spacing: 14) {
            VStack(alignment: .leading, spacing: 4) {
                Text("SOLARA")
                    .font(.system(size: 10, weight: .bold))
                    .tracking(1.2)
                    .foregroundStyle(Color(red: 0.34, green: 0.78, blue: 0.96))
                Text(snap.placeName)
                    .font(.headline.weight(.semibold))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                Text(snap.condition)
                    .font(.subheadline)
                    .foregroundStyle(.white.opacity(0.75))
                Spacer(minLength: 0)
                HStack(spacing: 10) {
                    if let hi = snap.highLabel, let lo = snap.lowLabel {
                        Text("H \(hi)  L \(lo)")
                            .font(.caption.weight(.medium))
                            .foregroundStyle(.white.opacity(0.8))
                    }
                    if let pop = snap.pop, pop > 0 {
                        Text("💧 \(pop)%")
                            .font(.caption.weight(.medium))
                            .foregroundStyle(Color(red: 0.49, green: 0.83, blue: 0.99))
                    }
                }
            }
            Spacer(minLength: 0)
            VStack(spacing: 2) {
                Text(snap.iconDisplay)
                    .font(.system(size: 40))
                Text(snap.tempLabel)
                    .font(.system(size: 40, weight: .bold, design: .rounded))
                    .foregroundStyle(.white)
                if let feels = snap.feelsLabel {
                    Text("Feels \(feels)")
                        .font(.caption2)
                        .foregroundStyle(.white.opacity(0.65))
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }

    private var emptyView: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Solara")
                .font(.headline)
                .foregroundStyle(.white)
            Text("Open the app to load weather for your home place.")
                .font(.caption)
                .foregroundStyle(.white.opacity(0.75))
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

extension WidgetSnapshot {
    static let preview = WidgetSnapshot(
        placeName: "Yellowknife",
        lat: 62.45,
        lon: -114.38,
        tempC: -12,
        feelsLikeC: -18,
        highC: -8,
        lowC: -19,
        code: 71,
        condition: "Snow",
        pop: 40,
        updatedAt: Date().timeIntervalSince1970,
        units: "metric",
        deepLink: "solara://home"
    )
}

#Preview(as: .systemSmall) {
    SolaraHomeWidget()
} timeline: {
    SolaraEntry(date: .now, snapshot: .preview, placeholder: false)
}

#Preview(as: .systemMedium) {
    SolaraHomeWidget()
} timeline: {
    SolaraEntry(date: .now, snapshot: .preview, placeholder: false)
}
