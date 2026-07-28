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
        let finish: (WidgetSnapshot?) -> Void = { snap in
            let entry = SolaraEntry(date: Date(), snapshot: snap, placeholder: false)
            let next = Date().addingTimeInterval(45 * 60)
            completion(Timeline(entries: [entry], policy: .after(next)))
        }

        guard let existing = SolaraWidgetStore.loadSnapshot() else {
            finish(nil)
            return
        }

        let age = Date().timeIntervalSince1970 - existing.updatedAt
        let needsRefresh = existing.isStale || age > 20 * 60

        if needsRefresh {
            OpenMeteoWidgetFetch.refresh(
                lat: existing.lat,
                lon: existing.lon,
                units: existing.units
            ) { fresh in
                finish(fresh ?? existing)
            }
        } else {
            finish(existing)
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
        .description("Current conditions for your home place — temp, high/low, and rain chance.")
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
            Text("Open the app to load weather for your home place.")
                .font(.caption)
                .foregroundColor(Color.white.opacity(0.75))
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}
