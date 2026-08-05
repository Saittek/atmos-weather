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
        // Prefer App Group file (plugin writes file first; UserDefaults can lag)
        if let dir = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: appGroupId
        ) {
            let file = dir.appendingPathComponent(fileName)
            if let raw = try? String(contentsOf: file, encoding: .utf8), !raw.isEmpty {
                return raw
            }
        }
        if let raw = defaults?.string(forKey: snapshotKey), !raw.isEmpty {
            return raw
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

    // Day-relevant extras (optional for older snapshots)
    var humidity: Int?
    /// Wind speed in km/h (Open-Meteo default)
    var windKmh: Double?
    var windDeg: Int?
    var windGustKmh: Double?
    var uvMax: Double?
    /// ISO local time strings from Open-Meteo, e.g. 2026-07-28T06:42
    var sunrise: String?
    var sunset: String?
    /// Daily precip sum in mm
    var precipMm: Double?
    /// Short day-relevant tip, e.g. "High UV this afternoon"
    var dayHint: String?
    /// Tonight stargaze score 0–100 (optional)
    var stargazeScore: Int?
    var stargazeLabel: String?

    var isStale: Bool {
        Date().timeIntervalSince1970 - updatedAt > SolaraWidgetStore.staleAfter
    }

    var isImperial: Bool { units == "imperial" }

    func displayTemp(_ celsius: Double) -> String {
        if isImperial {
            let f = celsius * 9 / 5 + 32
            return "\(Int(round(f)))°"
        }
        return "\(Int(round(celsius)))°"
    }

    var tempLabel: String { displayTemp(tempC) }
    var highLabel: String? { highC.map { displayTemp($0) } }
    var lowLabel: String? { lowC.map { displayTemp($0) } }
    var feelsLabel: String? { feelsLikeC.map { displayTemp($0) } }

    var windLabel: String? {
        guard let k = windKmh, k.isFinite else { return nil }
        if isImperial {
            let mph = k * 0.621371
            return "\(Int(round(mph))) mph"
        }
        return "\(Int(round(k))) km/h"
    }

    var windDirLabel: String? {
        guard let d = windDeg else { return nil }
        let dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
        let i = Int((Double(d) / 45.0).rounded()) % 8
        return dirs[(i + 8) % 8]
    }

    var windFullLabel: String? {
        guard let speed = windLabel else { return nil }
        if let dir = windDirLabel {
            return "\(dir) \(speed)"
        }
        return speed
    }

    var uvLabel: String? {
        guard let u = uvMax, u.isFinite else { return nil }
        let n = Int(round(u))
        let band: String
        switch n {
        case ..<3: band = "Low"
        case 3 ... 5: band = "Mod"
        case 6 ... 7: band = "High"
        case 8 ... 10: band = "V.High"
        default: band = "Ext"
        }
        return "UV \(n) \(band)"
    }

    var humidityLabel: String? {
        guard let h = humidity else { return nil }
        return "\(h)% RH"
    }

    var precipDayLabel: String? {
        guard let mm = precipMm, mm.isFinite, mm >= 0.1 else { return nil }
        if isImperial {
            let inches = mm / 25.4
            if inches < 0.05 { return nil }
            return String(format: "%.2f\" rain", inches)
        }
        if mm < 0.5 {
            return "<1 mm"
        }
        return "\(Int(round(mm))) mm"
    }

    var sunriseLabel: String? { Self.formatClock(sunrise) }
    var sunsetLabel: String? { Self.formatClock(sunset) }

    private static func formatClock(_ iso: String?) -> String? {
        guard let iso = iso, !iso.isEmpty else { return nil }
        // Accept "2026-07-28T06:42" or full ISO with seconds / offset
        let tail: String
        if let t = iso.split(separator: "T").last {
            tail = String(t)
        } else {
            return nil
        }
        let parts = tail.split(separator: ":")
        guard parts.count >= 2 else { return nil }
        let hh = String(parts[0])
        let mm = String(parts[1].prefix(2))
        return "\(hh):\(mm)"
    }

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
        deepLink: "solara://home",
        humidity: 72,
        windKmh: 18,
        windDeg: 320,
        windGustKmh: 28,
        uvMax: 1.2,
        sunrise: "2026-01-15T09:42",
        sunset: "2026-01-15T15:58",
        precipMm: 1.4,
        dayHint: "Snow tapering off this afternoon"
    )
}

enum OpenMeteoWidgetFetch {
    /// Completion-based fetch — avoids Swift concurrency issues in app extensions.
    static func refresh(
        lat: Double,
        lon: Double,
        units: String,
        placeName: String? = nil,
        completion: @escaping (WidgetSnapshot?) -> Void
    ) {
        var components = URLComponents(string: "https://api.open-meteo.com/v1/forecast")
        components?.queryItems = [
            URLQueryItem(name: "latitude", value: String(lat)),
            URLQueryItem(name: "longitude", value: String(lon)),
            URLQueryItem(
                name: "current",
                value: "temperature_2m,apparent_temperature,weather_code,precipitation,relative_humidity_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m"
            ),
            URLQueryItem(
                name: "daily",
                value: "temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code,uv_index_max,precipitation_sum,sunrise,sunset,wind_speed_10m_max"
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
            let humidity = (current["relative_humidity_2m"] as? NSNumber)?.intValue
            let windKmh = (current["wind_speed_10m"] as? NSNumber)?.doubleValue
            let windDeg = (current["wind_direction_10m"] as? NSNumber)?.intValue
            let windGust = (current["wind_gusts_10m"] as? NSNumber)?.doubleValue

            var high: Double?
            var low: Double?
            var pop: Int?
            var uvMax: Double?
            var precipMm: Double?
            var sunrise: String?
            var sunset: String?
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
                if let arr = daily["uv_index_max"] as? [NSNumber], let v = arr.first {
                    uvMax = v.doubleValue
                }
                if let arr = daily["precipitation_sum"] as? [NSNumber], let v = arr.first {
                    precipMm = v.doubleValue
                }
                if let arr = daily["sunrise"] as? [String], let v = arr.first {
                    sunrise = v
                }
                if let arr = daily["sunset"] as? [String], let v = arr.first {
                    sunset = v
                }
            }

            let existing = SolaraWidgetStore.loadSnapshot()
            let place =
                placeName
                ?? existing?.placeName
                ?? String(format: "%.2f, %.2f", lat, lon)

            let hint = dayHint(
                code: code,
                pop: pop,
                uvMax: uvMax,
                windKmh: windKmh,
                precipMm: precipMm,
                highC: high
            )

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
                deepLink: existing?.deepLink ?? "solara://home",
                humidity: humidity,
                windKmh: windKmh,
                windDeg: windDeg,
                windGustKmh: windGust,
                uvMax: uvMax,
                sunrise: sunrise,
                sunset: sunset,
                precipMm: precipMm,
                dayHint: hint
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

    /// Compact day-relevant line for the medium/large widget.
    static func dayHint(
        code: Int,
        pop: Int?,
        uvMax: Double?,
        windKmh: Double?,
        precipMm: Double?,
        highC: Double?
    ) -> String? {
        if code >= 95 { return "Thunderstorm risk today" }
        if code >= 71 && code <= 77 { return "Snow in the forecast" }
        if let p = pop, p >= 60 { return "Rain likely · \(p)% chance" }
        if let p = pop, p >= 40 { return "Showers possible today" }
        if let mm = precipMm, mm >= 5 { return "Wet day · ~\(Int(round(mm))) mm" }
        if let uv = uvMax, uv >= 8 { return "Very high UV — cover up" }
        if let uv = uvMax, uv >= 6 { return "High UV this afternoon" }
        if let w = windKmh, w >= 45 { return "Windy — gusty conditions" }
        if let w = windKmh, w >= 30 { return "Breezy day" }
        if let h = highC, h >= 30 { return "Hot day — stay hydrated" }
        if let h = highC, h <= -15 { return "Bitter cold — dress in layers" }
        if code == 0 || code == 1 { return "Nice day overall" }
        if code == 45 || code == 48 { return "Foggy — watch visibility" }
        return nil
    }
}
