import Foundation

/// Shared App Group + JSON contract between the Capacitor app and WidgetKit extension.
enum SolaraWidgetStore {
    static let appGroupId = "group.com.solara.weather"
    static let snapshotKey = "widget.snapshot"
    static let fileName = "widget-snapshot.json"
    static let widgetKind = "SolaraHomeWidget"
    /// Refresh if snapshot older than this (seconds)
    static let staleAfter: TimeInterval = 45 * 60

    static var defaults: UserDefaults? {
        UserDefaults(suiteName: appGroupId)
    }

    static func saveSnapshotJSON(_ json: String) {
        defaults?.set(json, forKey: snapshotKey)
        defaults?.synchronize()
        if let dir = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: appGroupId
        ) {
            let file = dir.appendingPathComponent(fileName)
            try? json.write(to: file, atomically: true, encoding: .utf8)
        }
    }

    static func loadSnapshotJSON() -> String? {
        if let raw = defaults?.string(forKey: snapshotKey), !raw.isEmpty {
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

    static func loadSnapshot() -> WidgetSnapshot? {
        guard let raw = loadSnapshotJSON(),
              let data = raw.data(using: .utf8)
        else { return nil }
        return try? JSONDecoder().decode(WidgetSnapshot.self, from: data)
    }
}

struct WidgetSnapshot: Codable, Equatable {
    var placeName: String
    var lat: Double
    var lon: Double
    var tempC: Double
    var feelsLikeC: Double?
    var highC: Double?
    var lowC: Double?
    var code: Int
    var condition: String
    var pop: Int?
    var updatedAt: TimeInterval
    var units: String // "metric" | "imperial"
    var deepLink: String?

    var isStale: Bool {
        Date().timeIntervalSince1970 - updatedAt > SolaraWidgetStore.staleAfter
    }

    func displayTemp(_ celsius: Double) -> String {
        if units == "imperial" {
            let f = celsius * 9 / 5 + 32
            return "\(Int(round(f)))°"
        }
        return "\(Int(round(celsius)))°"
    }

    var tempLabel: String { displayTemp(tempC) }
    var highLabel: String? { highC.map { displayTemp($0) } }
    var lowLabel: String? { lowC.map { displayTemp($0) } }
    var feelsLabel: String? { feelsLikeC.map { displayTemp($0) } }

    var iconDisplay: String {
        switch code {
        case 0: return "☀️"
        case 1, 2: return "🌤"
        case 3: return "☁️"
        case 45, 48: return "🌫️"
        case 51, 53, 55, 56, 57: return "🌦"
        case 61, 63, 65, 66, 67, 80, 81, 82: return "🌧"
        case 71, 73, 75, 77, 85, 86: return "❄️"
        case 95, 96, 99: return "⛈"
        default: return "🌡"
        }
    }

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

enum OpenMeteoWidgetFetch {
    /// Completion-based fetch — avoids Swift concurrency issues in app extensions.
    static func refresh(
        lat: Double,
        lon: Double,
        units: String,
        completion: @escaping (WidgetSnapshot?) -> Void
    ) {
        var components = URLComponents(string: "https://api.open-meteo.com/v1/forecast")
        components?.queryItems = [
            URLQueryItem(name: "latitude", value: String(lat)),
            URLQueryItem(name: "longitude", value: String(lon)),
            URLQueryItem(
                name: "current",
                value: "temperature_2m,apparent_temperature,weather_code,precipitation"
            ),
            URLQueryItem(
                name: "daily",
                value: "temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code"
            ),
            URLQueryItem(name: "timezone", value: "auto"),
            URLQueryItem(name: "forecast_days", value: "1"),
        ]
        guard let url = components?.url else {
            completion(nil)
            return
        }

        let task = URLSession.shared.dataTask(with: url) { data, response, error in
            if error != nil || data == nil {
                completion(nil)
                return
            }
            guard let http = response as? HTTPURLResponse,
                  (200 ... 299).contains(http.statusCode),
                  let data = data
            else {
                completion(nil)
                return
            }

            guard let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let current = root["current"] as? [String: Any]
            else {
                completion(nil)
                return
            }

            let temp = (current["temperature_2m"] as? NSNumber)?.doubleValue ?? 0
            let feels = (current["apparent_temperature"] as? NSNumber)?.doubleValue
            let code = (current["weather_code"] as? NSNumber)?.intValue ?? 0

            var high: Double?
            var low: Double?
            var pop: Int?
            if let daily = root["daily"] as? [String: Any] {
                if let arr = daily["temperature_2m_max"] as? [NSNumber], let v = arr.first {
                    high = v.doubleValue
                }
                if let arr = daily["temperature_2m_min"] as? [NSNumber], let v = arr.first {
                    low = v.doubleValue
                }
                if let arr = daily["precipitation_probability_max"] as? [NSNumber], let v = arr.first {
                    pop = v.intValue
                }
            }

            let existing = SolaraWidgetStore.loadSnapshot()
            let place = existing?.placeName ?? String(format: "%.2f, %.2f", lat, lon)

            let snap = WidgetSnapshot(
                placeName: place,
                lat: lat,
                lon: lon,
                tempC: temp,
                feelsLikeC: feels,
                highC: high,
                lowC: low,
                code: code,
                condition: conditionLabel(code: code),
                pop: pop,
                updatedAt: Date().timeIntervalSince1970,
                units: units,
                deepLink: existing?.deepLink ?? "solara://home"
            )

            if let encoded = try? JSONEncoder().encode(snap),
               let str = String(data: encoded, encoding: .utf8)
            {
                SolaraWidgetStore.saveSnapshotJSON(str)
            }
            completion(snap)
        }
        task.resume()
    }

    static func conditionLabel(code: Int) -> String {
        switch code {
        case 0: return "Clear"
        case 1: return "Mainly clear"
        case 2: return "Partly cloudy"
        case 3: return "Overcast"
        case 45, 48: return "Fog"
        case 51, 53, 55: return "Drizzle"
        case 61, 63, 65: return "Rain"
        case 71, 73, 75: return "Snow"
        case 80, 81, 82: return "Showers"
        case 95, 96, 99: return "Thunderstorm"
        default: return "Weather"
        }
    }
}
