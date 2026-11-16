import Foundation
import Observation
import SwiftUI
import UIKit

// MARK: - Paleta Relicario de Ceniza y Carmesí (Alto contraste OLED / Proyector)

enum RelicarioPalette {
    // Hex referencias:
    // Arena: #110E0E | Losas: #1C1616 | Sello: #261D1D
    // Jugador Marfil: #F5EFE6 | Plata fría: #72EFDD | Proyectiles: #E0FBFC / #98C1D9
    // Cura Jade: #34F5C5
    // Enjambre Bermellón: #FF1E42 | Tanque Hueso: #E6CCB2 / Núcleo #D90429 | Acosador Vacío #080606 + Oro #FFB800

    static let arenaBG = UIColor(red: 0x11 / 255.0, green: 0x0E / 255.0, blue: 0x0E / 255.0, alpha: 1.0)
    static let basaltSlab = UIColor(red: 0x1C / 255.0, green: 0x16 / 255.0, blue: 0x16 / 255.0, alpha: 1.0)
    static let ritualSeal = UIColor(red: 0x26 / 255.0, green: 0x1D / 255.0, blue: 0x1D / 255.0, alpha: 1.0)

    static let ivory = UIColor(red: 0xF5 / 255.0, green: 0xEF / 255.0, blue: 0xE6 / 255.0, alpha: 1.0)
    static let coldSilver = UIColor(red: 0x72 / 255.0, green: 0xEF / 255.0, blue: 0xDD / 255.0, alpha: 1.0)
    static let projectileCore = UIColor(red: 0xE0 / 255.0, green: 0xFB / 255.0, blue: 0xFC / 255.0, alpha: 1.0)
    static let projectileTrail = UIColor(red: 0x98 / 255.0, green: 0xC1 / 255.0, blue: 0xD9 / 255.0, alpha: 1.0)

    static let graceJade = UIColor(red: 0x34 / 255.0, green: 0xF5 / 255.0, blue: 0xC5 / 255.0, alpha: 1.0)

    static let vermilion = UIColor(red: 0xFF / 255.0, green: 0x1E / 255.0, blue: 0x42 / 255.0, alpha: 1.0)
    static let darkFlesh = UIColor(red: 0x1A / 255.0, green: 0x10 / 255.0, blue: 0x12 / 255.0, alpha: 1.0)
    static let oldBone = UIColor(red: 0xE6 / 255.0, green: 0xCC / 255.0, blue: 0xB2 / 255.0, alpha: 1.0)
    static let visceralCore = UIColor(red: 0xD9 / 255.0, green: 0x04 / 255.0, blue: 0x29 / 255.0, alpha: 1.0)
    static let voidBlack = UIColor(red: 0x08 / 255.0, green: 0x06 / 255.0, blue: 0x06 / 255.0, alpha: 1.0)
    static let liturgicalGold = UIColor(red: 0xFF / 255.0, green: 0xB8 / 255.0, blue: 0x00 / 255.0, alpha: 1.0)
    static let emberOrange = UIColor(red: 0xFF / 255.0, green: 0x6B / 255.0, blue: 0x2B / 255.0, alpha: 1.0)

    // Colores SwiftUI equivalentes
    static let swArenaBG = Color(uiColor: arenaBG)
    static let swCardBG = Color(red: 0x19 / 255.0, green: 0x14 / 255.0, blue: 0x15 / 255.0)
    static let swCardBorder = Color(red: 0x33 / 255.0, green: 0x24 / 255.0, blue: 0x26 / 255.0)
    static let swIvory = Color(uiColor: ivory)
    static let swColdSilver = Color(uiColor: coldSilver)
    static let swGraceJade = Color(uiColor: graceJade)
    static let swVermilion = Color(uiColor: vermilion)
    static let swOldBone = Color(uiColor: oldBone)
    static let swGold = Color(uiColor: liturgicalGold)
    static let swOrange = Color(uiColor: emberOrange)
}

// MARK: - Modos, Arquetipos y Niveles de Estrés

enum GameMode: String, Codable, CaseIterable, Identifiable {
    case classic1985
    case director2026

    var id: String { rawValue }

    var displayTitle: String {
        switch self {
        case .classic1985:
            return "Modo 1985 (Clásico)"
        case .director2026:
            return "Modo 2026 (IA Directora)"
        }
    }

    var shortBadge: String {
        switch self {
        case .classic1985:
            return "1985 · FIJO"
        case .director2026:
            return "2026 · IA"
        }
    }

    var subtitle: String {
        switch self {
        case .classic1985:
            return "Reglas fijas y oleadas matemáticas que ignoran al jugador"
        case .director2026:
            return "IA Directora que mide tu estrés en vivo y moldea la partida"
        }
    }

    var accentColor: Color {
        switch self {
        case .classic1985:
            return RelicarioPalette.swOldBone
        case .director2026:
            return RelicarioPalette.swVermilion
        }
    }
}

enum EnemyArchetype: String, Codable, CaseIterable {
    case desollado // Enjambre rápido: Querubín Desollado (ojo con alas óseas asimétricas)
    case jaula     // Tanque lento: Jaula de Vísceras (núcleo palpitante entre 4 costillas dentadas)
    case martir    // Acosador impredecible: Mártir Descoyuntado (silueta torcida con halo roto y láser)
}

enum StressTier: Int, Codable, Comparable {
    case bajo = 0
    case optimo = 1
    case alto = 2
    case critico = 3

    static func < (lhs: StressTier, rhs: StressTier) -> Bool {
        lhs.rawValue < rhs.rawValue
    }

    static func from(index: Double) -> StressTier {
        switch index {
        case ..<35:
            return .bajo
        case 35..<68:
            return .optimo
        case 68..<88:
            return .alto
        default:
            return .critico
        }
    }

    var label: String {
        switch self {
        case .bajo: return "BAJO"
        case .optimo: return "ÓPTIMO"
        case .alto: return "ALTO"
        case .critico: return "CRÍTICO"
        }
    }

    var color: Color {
        switch self {
        case .bajo: return RelicarioPalette.swColdSilver
        case .optimo: return RelicarioPalette.swGold
        case .alto: return RelicarioPalette.swOrange
        case .critico: return RelicarioPalette.swVermilion
        }
    }
}

// MARK: - Telemetría de Partida y Estadísticas de Clase

struct RunTelemetryRecord: Codable, Identifiable, Equatable {
    let id: UUID
    let initials: String
    let mode: GameMode
    let survivedSeconds: Double
    let didSurvive: Bool
    let kills: Int
    let averageStress: Double
    let peakStress: Double
    let medkitsCollected: Int
    let playedAt: Date
}

struct ModeAggregateStats {
    let mode: GameMode
    let runCount: Int
    let survivalRatePercent: Double
    let avgSurvivedSeconds: Double
    let avgKills: Double
    let avgStress: Double
    let avgPeakStress: Double

    static func empty(for mode: GameMode) -> ModeAggregateStats {
        ModeAggregateStats(
            mode: mode,
            runCount: 0,
            survivalRatePercent: 0,
            avgSurvivedSeconds: 0,
            avgKills: 0,
            avgStress: 0,
            avgPeakStress: 0
        )
    }
}

@Observable
@MainActor
final class TelemetryStore {
    private static let storageKey = "panic_director_class_telemetry_v1"

    private(set) var records: [RunTelemetryRecord] = []

    init() {
        load()
    }

    func recordRun(_ record: RunTelemetryRecord) {
        records.insert(record, at: 0)
        save()
    }

    func stats(for mode: GameMode) -> ModeAggregateStats {
        let filtered = records.filter { $0.mode == mode }
        guard !filtered.isEmpty else {
            return .empty(for: mode)
        }
        let count = Double(filtered.count)
        let survivedCount = Double(filtered.filter(\.didSurvive).count)
        let totalTime = filtered.reduce(0.0) { $0 + $1.survivedSeconds }
        let totalKills = filtered.reduce(0) { $0 + $1.kills }
        let totalAvgStress = filtered.reduce(0.0) { $0 + $1.averageStress }
        let totalPeakStress = filtered.reduce(0.0) { $0 + $1.peakStress }

        return ModeAggregateStats(
            mode: mode,
            runCount: filtered.count,
            survivalRatePercent: (survivedCount / count) * 100.0,
            avgSurvivedSeconds: totalTime / count,
            avgKills: Double(totalKills) / count,
            avgStress: totalAvgStress / count,
            avgPeakStress: totalPeakStress / count
        )
    }

    func deleteRecords(at offsets: IndexSet) {
        records.remove(atOffsets: offsets)
        save()
    }

    func clearAll() {
        records.removeAll()
        UserDefaults.standard.removeObject(forKey: Self.storageKey)
    }

    private func load() {
        guard let data = UserDefaults.standard.data(forKey: Self.storageKey) else { return }
        if let decoded = try? JSONDecoder().decode([RunTelemetryRecord].self, from: data) {
            records = decoded
        }
    }

    private func save() {
        if let encoded = try? JSONEncoder().encode(records) {
            UserDefaults.standard.set(encoded, forKey: Self.storageKey)
        }
    }
}

// MARK: - Gestor Háptico Nativo (UIImpactFeedbackGenerator)

@MainActor
final class HapticManager {
    static let shared = HapticManager()

    private let lightImpact = UIImpactFeedbackGenerator(style: .light)
    private let mediumImpact = UIImpactFeedbackGenerator(style: .medium)
    private let heavyImpact = UIImpactFeedbackGenerator(style: .heavy)
    private let rigidImpact = UIImpactFeedbackGenerator(style: .rigid)
    private let notification = UINotificationFeedbackGenerator()

    private var lastShootHapticTime: TimeInterval = 0
    private var lastStressHapticTime: TimeInterval = 0

    private init() {
        prepareAll()
    }

    func prepareAll() {
        lightImpact.prepare()
        mediumImpact.prepare()
        heavyImpact.prepare()
        rigidImpact.prepare()
        notification.prepare()
    }

    func triggerShoot() {
        let now = ProcessInfo.processInfo.systemUptime
        guard now - lastShootHapticTime >= 0.14 else { return }
        lastShootHapticTime = now
        lightImpact.impactOccurred(intensity: 0.55)
        lightImpact.prepare()
    }

    func triggerDamage() {
        heavyImpact.impactOccurred(intensity: 1.0)
        heavyImpact.prepare()
    }

    func triggerStressTierUp(to tier: StressTier) {
        let now = ProcessInfo.processInfo.systemUptime
        guard now - lastStressHapticTime >= 0.75 else { return }
        lastStressHapticTime = now

        switch tier {
        case .bajo:
            break
        case .optimo:
            mediumImpact.impactOccurred(intensity: 0.75)
            mediumImpact.prepare()
        case .alto:
            mediumImpact.impactOccurred(intensity: 1.0)
            mediumImpact.prepare()
        case .critico:
            rigidImpact.impactOccurred(intensity: 1.0)
            Task { @MainActor [weak self] in
                try? await Task.sleep(for: .milliseconds(80))
                self?.rigidImpact.impactOccurred(intensity: 0.85)
                self?.rigidImpact.prepare()
            }
        }
    }

    func triggerHeal() {
        notification.notificationOccurred(.success)
        notification.prepare()
    }

    func triggerRunEnd(survived: Bool) {
        notification.notificationOccurred(survived ? .success : .error)
        notification.prepare()
    }
}
