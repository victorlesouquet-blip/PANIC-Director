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

enum GameMode: String, Codable, CaseIterable, Identifiable, Sendable {
    case classic1985
    case director2026
    case hybrid1985x2026

    var id: String { rawValue }

    var displayTitle: String {
        switch self {
        case .classic1985:
            return "Modo 1985 (Clásico)"
        case .director2026:
            return "Modo 2026 (IA Directora)"
        case .hybrid1985x2026:
            return "Modo Híbrido (1985 × 2026)"
        }
    }

    var shortBadge: String {
        switch self {
        case .classic1985:
            return "1985 · FIJO"
        case .director2026:
            return "2026 · IA"
        case .hybrid1985x2026:
            return "85 × 26 · MIX"
        }
    }

    var tableHeader: String {
        switch self {
        case .classic1985:
            return "1985"
        case .director2026:
            return "2026"
        case .hybrid1985x2026:
            return "HÍBR."
        }
    }

    var subtitle: String {
        switch self {
        case .classic1985:
            return "Reglas fijas y oleadas implacables que ignoran al jugador"
        case .director2026:
            return "IA Directora que mide tu estrés en vivo y moldea la partida"
        case .hybrid1985x2026:
            return "Oleadas fijas y ráfagas de reloj 1985 mutadas por la IA Directora 2026"
        }
    }

    var accentColor: Color {
        switch self {
        case .classic1985:
            return RelicarioPalette.swOldBone
        case .director2026:
            return RelicarioPalette.swVermilion
        case .hybrid1985x2026:
            return RelicarioPalette.swGold
        }
    }
}

// MARK: - 12 Avatares Seleccionables del Jugador

enum PlayerAvatar: String, Codable, CaseIterable, Identifiable, Sendable {
    case penitente
    case inquisidor
    case serafin
    case cuervo
    case verdugo
    case oraculo
    case golem
    case espectro
    case automata
    case templario
    case brujo
    case heraldo

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .penitente:  return "Penitente"
        case .inquisidor: return "Inquisidor"
        case .serafin:    return "Serafín"
        case .cuervo:     return "Cuervo"
        case .verdugo:    return "Verdugo"
        case .oraculo:    return "Oráculo"
        case .golem:      return "Gólem Óseo"
        case .espectro:   return "Espectro"
        case .automata:   return "Autómata"
        case .templario:  return "Templario"
        case .brujo:      return "Brujo"
        case .heraldo:    return "Heraldo"
        }
    }

    var shortLabel: String {
        switch self {
        case .golem: return "Gólem"
        default:     return displayName
        }
    }

    var roleSubtitle: String {
        switch self {
        case .penitente:  return "Capucha de ceniza y ojo consagrado"
        case .inquisidor: return "Cazador de herejías con doble sello"
        case .serafin:    return "Alas de hueso y tercer ojo áureo"
        case .cuervo:     return "Máscara de plaga y lentes carmesí"
        case .verdugo:    return "Yelmo de hierro y visera de brasa"
        case .oraculo:    return "Tiara lunar y visión espectral"
        case .golem:      return "Cráneo astado forjado en osario"
        case .espectro:   return "Sudario errante de tres miradas"
        case .automata:   return "Astrolabio viviente de bronce"
        case .templario:  return "Gran yelmo sellado en oro y sangre"
        case .brujo:      return "Corona torcida de fuego abisal"
        case .heraldo:    return "Efigie nocturna bajo media luna"
        }
    }

    var auraUIColor: UIColor {
        switch self {
        case .penitente:  return RelicarioPalette.coldSilver
        case .inquisidor: return RelicarioPalette.graceJade
        case .serafin:    return RelicarioPalette.liturgicalGold
        case .cuervo:     return RelicarioPalette.vermilion
        case .verdugo:    return RelicarioPalette.emberOrange
        case .oraculo:    return RelicarioPalette.coldSilver
        case .golem:      return RelicarioPalette.vermilion
        case .espectro:   return RelicarioPalette.graceJade
        case .automata:   return RelicarioPalette.liturgicalGold
        case .templario:  return RelicarioPalette.liturgicalGold
        case .brujo:      return RelicarioPalette.vermilion
        case .heraldo:    return RelicarioPalette.coldSilver
        }
    }

    var auraSwiftColor: Color {
        Color(uiColor: auraUIColor)
    }
}

enum EnemyArchetype: String, Codable, CaseIterable {
    case desollado // Enjambre rápido: Querubín Desollado (ojo con alas óseas asimétricas)
    case jaula     // Tanque lento: Jaula de Vísceras (núcleo palpitante entre 4 costillas dentadas)
    case martir    // Acosador impredecible: Mártir Descoyuntado (silueta torcida con halo roto y láser)
}

enum StressTier: Int, Codable, Comparable, Sendable {
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

struct RunTelemetryRecord: Codable, Identifiable, Equatable, Sendable {
    let id: UUID
    let initials: String
    let avatar: PlayerAvatar?
    let mode: GameMode
    let survivedSeconds: Double
    let didSurvive: Bool
    let kills: Int
    let averageStress: Double
    let peakStress: Double
    let medkitsCollected: Int
    let playedAt: Date
}

struct ModeAggregateStats: Sendable {
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

enum LeaderboardSortMetric: String, CaseIterable, Identifiable, Sendable {
    case overallRanking
    case avgKills
    case avgTime
    case survivalRate
    case avgStress
    case alphabetical

    var id: String { rawValue }

    var title: String {
        switch self {
        case .overallRanking: return "Ránking"
        case .avgKills:       return "Bajas"
        case .avgTime:        return "Tiempo"
        case .survivalRate:   return "Superv."
        case .avgStress:      return "Estrés"
        case .alphabetical:   return "A–Z"
        }
    }
}

struct AvatarUsageStat: Identifiable, Hashable, Sendable {
    let avatar: PlayerAvatar
    let count: Int
    var id: PlayerAvatar { avatar }
}

struct PlayerAggregateProfile: Identifiable, Sendable {
    let initials: String
    let runCount: Int
    let survivedCount: Int
    let survivalRatePercent: Double
    let avgSurvivedSeconds: Double
    let bestSurvivedSeconds: Double
    let avgKills: Double
    let bestKills: Int
    let avgStress: Double
    let avgPeakStress: Double
    let avgMedkits: Double
    let rankingScore: Double
    let favoriteAvatar: PlayerAvatar?
    let latestAvatar: PlayerAvatar?
    let usedAvatars: [AvatarUsageStat]
    let statsByMode: [GameMode: ModeAggregateStats]
    let runs: [RunTelemetryRecord]
    let lastPlayedAt: Date

    var id: String { initials }
}

@Observable
@MainActor
final class TelemetryStore {
    private static let storageKey = "panic_director_class_telemetry_v1"

    private(set) var records: [RunTelemetryRecord] = []

    init() {
        load()
    }

    var uniquePlayerCount: Int {
        Set(records.map { Self.normalizedInitials($0.initials) }).count
    }

    func recordRun(_ record: RunTelemetryRecord) {
        records.insert(record, at: 0)
        save()
    }

    func stats(for mode: GameMode) -> ModeAggregateStats {
        Self.aggregate(records: records, mode: mode)
    }

    func playerProfiles(
        modeFilter: GameMode? = nil,
        sortBy metric: LeaderboardSortMetric = .overallRanking
    ) -> [PlayerAggregateProfile] {
        let scopedRecords = modeFilter.map { mode in
            records.filter { $0.mode == mode }
        } ?? records

        let grouped = Dictionary(grouping: scopedRecords) {
            Self.normalizedInitials($0.initials)
        }

        let profiles = grouped.compactMap { (key, playerRuns) -> PlayerAggregateProfile? in
            Self.buildProfile(initials: key, runs: playerRuns)
        }

        return profiles.sorted { lhs, rhs in
            switch metric {
            case .overallRanking:
                if abs(lhs.rankingScore - rhs.rankingScore) > 0.01 {
                    return lhs.rankingScore > rhs.rankingScore
                }
                if abs(lhs.avgSurvivedSeconds - rhs.avgSurvivedSeconds) > 0.01 {
                    return lhs.avgSurvivedSeconds > rhs.avgSurvivedSeconds
                }
                return lhs.initials < rhs.initials

            case .avgKills:
                if abs(lhs.avgKills - rhs.avgKills) > 0.01 {
                    return lhs.avgKills > rhs.avgKills
                }
                if lhs.bestKills != rhs.bestKills {
                    return lhs.bestKills > rhs.bestKills
                }
                return lhs.initials < rhs.initials

            case .avgTime:
                if abs(lhs.avgSurvivedSeconds - rhs.avgSurvivedSeconds) > 0.01 {
                    return lhs.avgSurvivedSeconds > rhs.avgSurvivedSeconds
                }
                if abs(lhs.bestSurvivedSeconds - rhs.bestSurvivedSeconds) > 0.01 {
                    return lhs.bestSurvivedSeconds > rhs.bestSurvivedSeconds
                }
                return lhs.initials < rhs.initials

            case .survivalRate:
                if abs(lhs.survivalRatePercent - rhs.survivalRatePercent) > 0.01 {
                    return lhs.survivalRatePercent > rhs.survivalRatePercent
                }
                if abs(lhs.avgSurvivedSeconds - rhs.avgSurvivedSeconds) > 0.01 {
                    return lhs.avgSurvivedSeconds > rhs.avgSurvivedSeconds
                }
                return lhs.initials < rhs.initials

            case .avgStress:
                if abs(lhs.avgStress - rhs.avgStress) > 0.01 {
                    return lhs.avgStress > rhs.avgStress
                }
                if abs(lhs.avgPeakStress - rhs.avgPeakStress) > 0.01 {
                    return lhs.avgPeakStress > rhs.avgPeakStress
                }
                return lhs.initials < rhs.initials

            case .alphabetical:
                return lhs.initials < rhs.initials
            }
        }
    }

    func profile(forInitials initials: String) -> PlayerAggregateProfile? {
        let normalized = Self.normalizedInitials(initials)
        let matching = records.filter { Self.normalizedInitials($0.initials) == normalized }
        return Self.buildProfile(initials: normalized, runs: matching)
    }

    func globalRank(forInitials initials: String) -> Int? {
        let normalized = Self.normalizedInitials(initials)
        let ranked = playerProfiles(modeFilter: nil, sortBy: .overallRanking)
        guard let idx = ranked.firstIndex(where: { $0.initials == normalized }) else {
            return nil
        }
        return idx + 1
    }

    func deleteRecords(at offsets: IndexSet) {
        records.remove(atOffsets: offsets)
        save()
    }

    func clearAll() {
        records.removeAll()
        UserDefaults.standard.removeObject(forKey: Self.storageKey)
    }

    private static func normalizedInitials(_ raw: String) -> String {
        let cleaned = raw.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        return cleaned.isEmpty ? "---" : cleaned
    }

    private static func aggregate(records: [RunTelemetryRecord], mode: GameMode) -> ModeAggregateStats {
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

    private static func buildProfile(initials: String, runs: [RunTelemetryRecord]) -> PlayerAggregateProfile? {
        guard !runs.isEmpty else { return nil }
        let sortedRuns = runs.sorted { $0.playedAt > $1.playedAt }
        let count = Double(sortedRuns.count)
        let survivedCount = sortedRuns.filter(\.didSurvive).count
        let survivalRatePercent = (Double(survivedCount) / count) * 100.0

        let totalTime = sortedRuns.reduce(0.0) { $0 + $1.survivedSeconds }
        let avgSurvived = totalTime / count
        let bestSurvived = sortedRuns.map(\.survivedSeconds).max() ?? 0.0

        let totalKills = sortedRuns.reduce(0) { $0 + $1.kills }
        let avgKills = Double(totalKills) / count
        let bestKills = sortedRuns.map(\.kills).max() ?? 0

        let avgStress = sortedRuns.reduce(0.0) { $0 + $1.averageStress } / count
        let avgPeakStress = sortedRuns.reduce(0.0) { $0 + $1.peakStress } / count
        let avgMedkits = Double(sortedRuns.reduce(0) { $0 + $1.medkitsCollected }) / count

        // Índice compuesto de rendimiento medio para el ránking de clase
        let rankingScore = avgSurvived * 10.0 + avgKills * 12.0 + survivalRatePercent * 2.5

        var avatarCounts: [PlayerAvatar: Int] = [:]
        var latestIndexByAvatar: [PlayerAvatar: Int] = [:]
        for (idx, run) in sortedRuns.enumerated() {
            guard let av = run.avatar else { continue }
            avatarCounts[av, default: 0] += 1
            if latestIndexByAvatar[av] == nil {
                latestIndexByAvatar[av] = idx
            }
        }

        let usedAvatars = avatarCounts
            .map { AvatarUsageStat(avatar: $0.key, count: $0.value) }
            .sorted { lhs, rhs in
                if lhs.count != rhs.count { return lhs.count > rhs.count }
                return (latestIndexByAvatar[lhs.avatar] ?? Int.max) < (latestIndexByAvatar[rhs.avatar] ?? Int.max)
            }

        let modeStats = Dictionary(
            uniqueKeysWithValues: GameMode.allCases.map { ($0, aggregate(records: sortedRuns, mode: $0)) }
        )

        return PlayerAggregateProfile(
            initials: initials,
            runCount: sortedRuns.count,
            survivedCount: survivedCount,
            survivalRatePercent: survivalRatePercent,
            avgSurvivedSeconds: avgSurvived,
            bestSurvivedSeconds: bestSurvived,
            avgKills: avgKills,
            bestKills: bestKills,
            avgStress: avgStress,
            avgPeakStress: avgPeakStress,
            avgMedkits: avgMedkits,
            rankingScore: rankingScore,
            favoriteAvatar: usedAvatars.first?.avatar,
            latestAvatar: sortedRuns.first(where: { $0.avatar != nil })?.avatar,
            usedAvatars: usedAvatars,
            statsByMode: modeStats,
            runs: sortedRuns,
            lastPlayedAt: sortedRuns.first?.playedAt ?? Date()
        )
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

    func triggerLevelUp() {
        mediumImpact.impactOccurred(intensity: 0.9)
        Task { @MainActor [weak self] in
            try? await Task.sleep(for: .milliseconds(70))
            self?.rigidImpact.impactOccurred(intensity: 1.0)
            self?.rigidImpact.prepare()
        }
    }

    func triggerRunEnd(survived: Bool) {
        notification.notificationOccurred(survived ? .success : .error)
        notification.prepare()
    }
}
