import SwiftUI

@MainActor
struct ResultsTelemetryView: View {
    let lastRecord: RunTelemetryRecord?
    let store: TelemetryStore
    let onPlayAgainSameSetup: @MainActor () -> Void
    let onReturnToStart: @MainActor () -> Void
    let onOpenPlayers: @MainActor (String?) -> Void

    @State private var showResetConfirmation = false

    private var stats1985: ModeAggregateStats { store.stats(for: .classic1985) }
    private var stats2026: ModeAggregateStats { store.stats(for: .director2026) }
    private var statsHybrid: ModeAggregateStats { store.stats(for: .hybrid1985x2026) }

    var body: some View {
        ZStack {
            RelicarioPalette.swArenaBG
                .ignoresSafeArea()

            VStack(spacing: 0) {
                ScrollView(showsIndicators: false) {
                    VStack(spacing: 18) {
                        if let record = lastRecord {
                            runSummaryCard(record)
                        } else {
                            telemetryHeaderCard
                        }

                        playersShortcutBanner
                        classComparisonSection
                        classInsightBanner
                        recentRunsSection
                    }
                    .padding(.horizontal, 18)
                    .padding(.top, 14)
                    .padding(.bottom, 24)
                }

                bottomActionBar
            }
        }
        .confirmationDialog(
            "¿Borrar toda la telemetría de clase guardada?",
            isPresented: $showResetConfirmation,
            titleVisibility: .visible
        ) {
            Button("Borrar registros", role: .destructive) {
                store.clearAll()
            }
            Button("Cancelar", role: .cancel) {}
        }
    }

    // MARK: - Resumen de la Última Partida

    private func runSummaryCard(_ record: RunTelemetryRecord) -> some View {
        let statusColor = record.didSurvive ? RelicarioPalette.swGraceJade : RelicarioPalette.swVermilion

        return VStack(spacing: 14) {
            HStack(spacing: 8) {
                if let avatar = record.avatar {
                    AvatarPortraitView(avatar: avatar, size: 28)
                }

                Button(action: {
                    MainActor.assumeIsolated {
                        onOpenPlayers(record.initials)
                    }
                }) {
                    HStack(spacing: 4) {
                        Text(record.initials)
                            .font(.caption.monospaced().weight(.black))
                        Image(systemName: "person.crop.circle")
                            .font(.caption2)
                    }
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(Color.white.opacity(0.10))
                    .foregroundStyle(RelicarioPalette.swIvory)
                    .overlay(
                        RoundedRectangle(cornerRadius: 6)
                            .stroke(RelicarioPalette.swGold.opacity(0.45), lineWidth: 0.9)
                    )
                    .clipShape(RoundedRectangle(cornerRadius: 6))
                }
                .buttonStyle(.plain)

                Text(record.mode.displayTitle)
                    .font(.caption.weight(.bold))
                    .foregroundStyle(record.mode.accentColor)
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)

                Spacer()

                Text(record.didSurvive ? "COMPLETADA" : "DERROTA")
                    .font(.caption2.monospaced().weight(.black))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(statusColor.opacity(0.20))
                    .foregroundStyle(statusColor)
                    .clipShape(Capsule())
            }

            Text(record.didSurvive
                 ? "¡SOBREVIVISTE LOS 60s!"
                 : String(format: "CAÍDO A LOS %.1fs", record.survivedSeconds))
                .font(.system(size: 23, weight: .black, design: .monospaced))
                .foregroundStyle(statusColor)
                .frame(maxWidth: .infinity, alignment: .leading)

            HStack(spacing: 10) {
                metricPill(title: "TIEMPO", value: String(format: "%.1fs", record.survivedSeconds), color: RelicarioPalette.swIvory)
                metricPill(title: "BAJAS", value: "\(record.kills)", color: RelicarioPalette.swColdSilver)
                metricPill(title: "ESTRÉS MEDIO", value: "\(Int(record.averageStress.rounded()))%", color: StressTier.from(index: record.averageStress).color)
                metricPill(title: "CURAS", value: "\(record.medkitsCollected)", color: RelicarioPalette.swGraceJade)
            }
        }
        .padding(16)
        .background(RelicarioPalette.swCardBG)
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .stroke(statusColor.opacity(0.55), lineWidth: 1.4)
        )
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }

    private var telemetryHeaderCard: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text("TELEMETRÍA DE CLASE")
                    .font(.title3.monospaced().weight(.black))
                    .foregroundStyle(RelicarioPalette.swIvory)
                Text("Comparativa acumulada en este dispositivo")
                    .font(.caption)
                    .foregroundStyle(RelicarioPalette.swOldBone.opacity(0.8))
            }
            Spacer()
            Text("\(store.records.count) REG.")
                .font(.caption.monospaced().weight(.bold))
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .background(RelicarioPalette.swColdSilver.opacity(0.15))
                .foregroundStyle(RelicarioPalette.swColdSilver)
                .clipShape(Capsule())
        }
        .padding(16)
        .background(RelicarioPalette.swCardBG)
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .stroke(RelicarioPalette.swCardBorder, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }

    private var playersShortcutBanner: some View {
        Button(action: {
            MainActor.assumeIsolated {
                onOpenPlayers(nil)
            }
        }) {
            HStack(spacing: 10) {
                Image(systemName: "trophy.fill")
                    .font(.subheadline)
                    .foregroundStyle(RelicarioPalette.swGold)
                VStack(alignment: .leading, spacing: 2) {
                    Text("JUGADORES Y RÁNKING DE MEDIAS")
                        .font(.caption.monospaced().weight(.black))
                        .foregroundStyle(RelicarioPalette.swIvory)
                        .lineLimit(1)
                        .minimumScaleFactor(0.82)
                    Text("\(store.uniquePlayerCount) \(store.uniquePlayerCount == 1 ? "jugador registrado" : "jugadores registrados") · Toca para ver perfiles")
                        .font(.caption2)
                        .foregroundStyle(RelicarioPalette.swOldBone.opacity(0.8))
                        .lineLimit(1)
                        .minimumScaleFactor(0.82)
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(RelicarioPalette.swGold)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .background(RelicarioPalette.swGold.opacity(0.09))
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(RelicarioPalette.swGold.opacity(0.42), lineWidth: 1.1)
            )
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.plain)
    }

    private func metricPill(title: String, value: String, color: Color) -> some View {
        VStack(spacing: 3) {
            Text(title)
                .font(.system(size: 9, weight: .bold, design: .monospaced))
                .foregroundStyle(RelicarioPalette.swOldBone.opacity(0.75))
                .lineLimit(1)
                .minimumScaleFactor(0.72)
            Text(value)
                .font(.subheadline.monospacedDigit().weight(.black))
                .foregroundStyle(color)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 8)
        .background(Color.black.opacity(0.35))
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    // MARK: - Tabla Comparativa (1985 vs 2026 vs Híbrido)

    private var classComparisonSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("COMPARATIVA 1985 · 2026 · HÍBR.")
                    .font(.caption.weight(.bold))
                    .tracking(1.3)
                    .foregroundStyle(RelicarioPalette.swGold)
                    .lineLimit(1)
                    .minimumScaleFactor(0.85)
                Spacer()
                Text("EN VIVO")
                    .font(.caption2.monospaced())
                    .foregroundStyle(RelicarioPalette.swOldBone.opacity(0.65))
            }

            Grid(alignment: .leading, horizontalSpacing: 6, verticalSpacing: 10) {
                GridRow {
                    Text("MÉTRICA")
                        .font(.caption2.monospaced().weight(.bold))
                        .foregroundStyle(RelicarioPalette.swOldBone.opacity(0.7))
                        .frame(maxWidth: .infinity, alignment: .leading)
                    Text(GameMode.classic1985.tableHeader)
                        .font(.caption2.monospaced().weight(.black))
                        .foregroundStyle(RelicarioPalette.swOldBone)
                        .frame(width: 48, alignment: .trailing)
                    Text(GameMode.director2026.tableHeader)
                        .font(.caption2.monospaced().weight(.black))
                        .foregroundStyle(RelicarioPalette.swVermilion)
                        .frame(width: 48, alignment: .trailing)
                    Text(GameMode.hybrid1985x2026.tableHeader)
                        .font(.caption2.monospaced().weight(.black))
                        .foregroundStyle(RelicarioPalette.swGold)
                        .frame(width: 48, alignment: .trailing)
                }

                Divider().overlay(RelicarioPalette.swCardBorder)

                comparisonRow(
                    label: "Partidas",
                    val1985: "\(stats1985.runCount)",
                    val2026: "\(stats2026.runCount)",
                    valHybrid: "\(statsHybrid.runCount)"
                )
                comparisonRow(
                    label: "Superv. 60s",
                    val1985: stats1985.runCount > 0 ? String(format: "%.0f%%", stats1985.survivalRatePercent) : "—",
                    val2026: stats2026.runCount > 0 ? String(format: "%.0f%%", stats2026.survivalRatePercent) : "—",
                    valHybrid: statsHybrid.runCount > 0 ? String(format: "%.0f%%", statsHybrid.survivalRatePercent) : "—"
                )
                comparisonRow(
                    label: "Tiempo medio",
                    val1985: stats1985.runCount > 0 ? String(format: "%.1fs", stats1985.avgSurvivedSeconds) : "—",
                    val2026: stats2026.runCount > 0 ? String(format: "%.1fs", stats2026.avgSurvivedSeconds) : "—",
                    valHybrid: statsHybrid.runCount > 0 ? String(format: "%.1fs", statsHybrid.avgSurvivedSeconds) : "—"
                )
                comparisonRow(
                    label: "Bajas medias",
                    val1985: stats1985.runCount > 0 ? String(format: "%.1f", stats1985.avgKills) : "—",
                    val2026: stats2026.runCount > 0 ? String(format: "%.1f", stats2026.avgKills) : "—",
                    valHybrid: statsHybrid.runCount > 0 ? String(format: "%.1f", statsHybrid.avgKills) : "—"
                )
                comparisonRow(
                    label: "Estrés medio",
                    val1985: stats1985.runCount > 0 ? String(format: "%.0f%%", stats1985.avgStress) : "—",
                    val2026: stats2026.runCount > 0 ? String(format: "%.0f%%", stats2026.avgStress) : "—",
                    valHybrid: statsHybrid.runCount > 0 ? String(format: "%.0f%%", statsHybrid.avgStress) : "—"
                )
                comparisonRow(
                    label: "Estrés pico",
                    val1985: stats1985.runCount > 0 ? String(format: "%.0f%%", stats1985.avgPeakStress) : "—",
                    val2026: stats2026.runCount > 0 ? String(format: "%.0f%%", stats2026.avgPeakStress) : "—",
                    valHybrid: statsHybrid.runCount > 0 ? String(format: "%.0f%%", statsHybrid.avgPeakStress) : "—"
                )
            }
        }
        .padding(16)
        .background(RelicarioPalette.swCardBG)
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .stroke(RelicarioPalette.swCardBorder, lineWidth: 1.2)
        )
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }

    private func comparisonRow(label: String, val1985: String, val2026: String, valHybrid: String) -> some View {
        GridRow {
            Text(label)
                .font(.caption.weight(.medium))
                .foregroundStyle(RelicarioPalette.swIvory.opacity(0.9))
                .lineLimit(1)
                .minimumScaleFactor(0.85)
                .frame(maxWidth: .infinity, alignment: .leading)
            Text(val1985)
                .font(.caption.monospacedDigit().weight(.bold))
                .foregroundStyle(RelicarioPalette.swOldBone)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .frame(width: 48, alignment: .trailing)
            Text(val2026)
                .font(.caption.monospacedDigit().weight(.bold))
                .foregroundStyle(RelicarioPalette.swIvory)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .frame(width: 48, alignment: .trailing)
            Text(valHybrid)
                .font(.caption.monospacedDigit().weight(.bold))
                .foregroundStyle(RelicarioPalette.swGold)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .frame(width: 48, alignment: .trailing)
        }
    }

    // MARK: - Lectura para la Exposición Universitaria

    private var classInsightBanner: some View {
        let message: String
        if stats1985.runCount > 0 && stats2026.runCount > 0 {
            let deltaSurvival = stats2026.survivalRatePercent - stats1985.survivalRatePercent
            let sign = deltaSurvival >= 0 ? "+" : ""
            let base = String(
                format: "Con %d partidas: el Modo 2026 logra %@%.0f pp en supervivencia con %.0f%% de estrés medio frente al %.0f%% del Modo 1985.",
                store.records.count,
                sign,
                deltaSurvival,
                stats2026.avgStress,
                stats1985.avgStress
            )
            if statsHybrid.runCount > 0 {
                message = base + String(
                    format: " En Híbrido (%.0f%% superv., %.0f%% estrés) la mezcla eleva el castigo.",
                    statsHybrid.survivalRatePercent,
                    statsHybrid.avgStress
                )
            } else {
                message = base
            }
        } else if statsHybrid.runCount > 0 && (stats1985.runCount > 0 || stats2026.runCount > 0) {
            message = String(
                format: "El Modo Híbrido registra %.0f%% de supervivencia y %.0f%% de estrés medio (%d partidas). Completa pruebas en los 3 motores para la comparativa completa.",
                statsHybrid.survivalRatePercent,
                statsHybrid.avgStress,
                statsHybrid.runCount
            )
        } else {
            message = "Registra partidas en los modos 1985, 2026 e Híbrido con varios compañeros para proyectar la comparativa real en clase."
        }

        return HStack(alignment: .top, spacing: 10) {
            Image(systemName: "waveform.path.ecg")
                .foregroundStyle(RelicarioPalette.swColdSilver)
                .font(.subheadline)
                .padding(.top, 2)
            Text(message)
                .font(.caption)
                .foregroundStyle(RelicarioPalette.swIvory.opacity(0.9))
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RelicarioPalette.swColdSilver.opacity(0.08))
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(RelicarioPalette.swColdSilver.opacity(0.28), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    // MARK: - Historial de Compañeros

    private var recentRunsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("HISTORIAL DE PARTIDAS (\(store.records.count))")
                    .font(.caption.weight(.bold))
                    .tracking(1.4)
                    .foregroundStyle(RelicarioPalette.swOldBone)
                Spacer()
                if !store.records.isEmpty {
                    Button(role: .destructive) {
                        showResetConfirmation = true
                    } label: {
                        Text("Reiniciar datos")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(RelicarioPalette.swVermilion)
                    }
                    .buttonStyle(.plain)
                }
            }

            if store.records.isEmpty {
                Text("Todavía no hay partidas guardadas. Juega una ronda de 60 segundos para registrar datos.")
                    .font(.caption)
                    .foregroundStyle(RelicarioPalette.swOldBone.opacity(0.65))
                    .padding(.vertical, 12)
            } else {
                VStack(spacing: 8) {
                    ForEach(store.records) { rec in
                        Button(action: {
                            MainActor.assumeIsolated {
                                onOpenPlayers(rec.initials)
                            }
                        }) {
                            HStack(spacing: 6) {
                                if let avatar = rec.avatar {
                                    AvatarPortraitView(avatar: avatar, size: 22, showAuraRing: false)
                                } else {
                                    Circle()
                                        .fill(Color.white.opacity(0.08))
                                        .frame(width: 22, height: 22)
                                        .overlay(
                                            Text("·")
                                                .font(.caption2.bold())
                                                .foregroundStyle(RelicarioPalette.swOldBone.opacity(0.6))
                                        )
                                }

                                Text(rec.initials)
                                    .font(.caption.monospaced().weight(.black))
                                    .frame(width: 32, alignment: .leading)
                                    .foregroundStyle(RelicarioPalette.swIvory)
                                    .lineLimit(1)

                                Text(rec.mode.shortBadge)
                                    .font(.system(size: 10, weight: .bold, design: .monospaced))
                                    .lineLimit(1)
                                    .minimumScaleFactor(0.75)
                                    .padding(.horizontal, 6)
                                    .padding(.vertical, 3)
                                    .background(rec.mode.accentColor.opacity(0.18))
                                    .foregroundStyle(rec.mode.accentColor)
                                    .clipShape(Capsule())

                                Spacer(minLength: 4)

                                Text(String(format: "%.1fs", rec.survivedSeconds))
                                    .font(.caption.monospacedDigit().weight(.bold))
                                    .foregroundStyle(rec.didSurvive ? RelicarioPalette.swGraceJade : RelicarioPalette.swVermilion)

                                Text("\(rec.kills)B")
                                    .font(.caption.monospacedDigit())
                                    .foregroundStyle(RelicarioPalette.swColdSilver)
                                    .frame(width: 30, alignment: .trailing)

                                Text("\(Int(rec.averageStress.rounded()))%")
                                    .font(.caption.monospacedDigit().weight(.semibold))
                                    .foregroundStyle(StressTier.from(index: rec.averageStress).color)
                                    .frame(width: 32, alignment: .trailing)

                                Image(systemName: "chevron.right")
                                    .font(.system(size: 10, weight: .bold))
                                    .foregroundStyle(RelicarioPalette.swOldBone.opacity(0.45))
                            }
                            .padding(.horizontal, 10)
                            .padding(.vertical, 9)
                            .background(RelicarioPalette.swCardBG)
                            .overlay(
                                RoundedRectangle(cornerRadius: 10)
                                    .stroke(RelicarioPalette.swCardBorder, lineWidth: 1)
                            )
                            .clipShape(RoundedRectangle(cornerRadius: 10))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    // MARK: - Botonera Inferior

    private var bottomActionBar: some View {
        HStack(spacing: 10) {
            Button(action: {
                MainActor.assumeIsolated {
                    onReturnToStart()
                }
            }) {
                Text("CAMBIAR JUGADOR")
                    .font(.caption.monospaced().weight(.bold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(RelicarioPalette.swCardBG)
                    .foregroundStyle(RelicarioPalette.swOldBone)
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(RelicarioPalette.swCardBorder, lineWidth: 1.2)
                    )
                    .clipShape(RoundedRectangle(cornerRadius: 12))
            }
            .buttonStyle(.plain)

            if lastRecord != nil {
                Button(action: {
                    MainActor.assumeIsolated {
                        onPlayAgainSameSetup()
                    }
                }) {
                    Text("REPETIR (60s)")
                        .font(.caption.monospaced().weight(.black))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(RelicarioPalette.swVermilion)
                        .foregroundStyle(RelicarioPalette.swIvory)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 12)
        .background(RelicarioPalette.swArenaBG.opacity(0.95))
    }
}

// MARK: - Directorio de Jugadores, Ránking por Medias y Perfiles

private struct RankedPlayerEntry: Identifiable {
    let rank: Int
    let profile: PlayerAggregateProfile
    var id: String { profile.initials }
}

@MainActor
struct PlayersDirectoryView: View {
    let store: TelemetryStore
    let onReturnToStart: @MainActor () -> Void
    let onUsePlayerSetup: @MainActor (String, PlayerAvatar?) -> Void

    @State private var selectedModeFilter: GameMode? = nil
    @State private var sortMetric: LeaderboardSortMetric = .overallRanking
    @State private var searchText: String = ""
    @State private var activeProfileInitials: String?

    init(
        store: TelemetryStore,
        initialPlayerInitials: String? = nil,
        onReturnToStart: @escaping @MainActor () -> Void,
        onUsePlayerSetup: @escaping @MainActor (String, PlayerAvatar?) -> Void
    ) {
        self.store = store
        self.onReturnToStart = onReturnToStart
        self.onUsePlayerSetup = onUsePlayerSetup
        _activeProfileInitials = State(initialValue: initialPlayerInitials)
    }

    private var rankedEntries: [RankedPlayerEntry] {
        let sortedProfiles = store.playerProfiles(modeFilter: selectedModeFilter, sortBy: sortMetric)
        return sortedProfiles.enumerated().map { idx, profile in
            RankedPlayerEntry(rank: idx + 1, profile: profile)
        }
    }

    private var filteredEntries: [RankedPlayerEntry] {
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        guard !query.isEmpty else { return rankedEntries }
        return rankedEntries.filter { $0.profile.initials.contains(query) }
    }

    var body: some View {
        ZStack {
            RelicarioPalette.swArenaBG
                .ignoresSafeArea()

            if let targetInitials = activeProfileInitials,
               let profile = store.profile(forInitials: targetInitials) {
                PlayerProfileView(
                    profile: profile,
                    globalRank: store.globalRank(forInitials: profile.initials),
                    onBack: {
                        activeProfileInitials = nil
                    },
                    onUsePlayerSetup: onUsePlayerSetup
                )
            } else {
                directoryContent
            }
        }
    }

    private var directoryContent: some View {
        VStack(spacing: 0) {
            topNavHeader

            ScrollView(showsIndicators: false) {
                VStack(spacing: 14) {
                    if !rankedEntries.isEmpty {
                        leaderHighlightCard(rankedEntries[0])
                    }

                    searchAndFilterSection

                    if rankedEntries.isEmpty {
                        emptyDirectoryCard
                    } else if filteredEntries.isEmpty {
                        noSearchMatchCard
                    } else {
                        LazyVStack(spacing: 10) {
                            ForEach(filteredEntries) { entry in
                                playerRankingRow(entry)
                            }
                        }
                    }
                }
                .padding(.horizontal, 18)
                .padding(.top, 10)
                .padding(.bottom, 24)
            }
        }
    }

    private var topNavHeader: some View {
        HStack(spacing: 8) {
            Button(action: {
                MainActor.assumeIsolated {
                    onReturnToStart()
                }
            }) {
                HStack(spacing: 4) {
                    Image(systemName: "chevron.left")
                        .font(.caption.weight(.bold))
                    Text("Inicio")
                        .font(.caption.monospaced().weight(.bold))
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 7)
                .background(RelicarioPalette.swCardBG)
                .foregroundStyle(RelicarioPalette.swOldBone)
                .overlay(
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(RelicarioPalette.swCardBorder, lineWidth: 1)
                )
                .clipShape(RoundedRectangle(cornerRadius: 8))
            }
            .buttonStyle(.plain)

            Spacer(minLength: 4)

            Text("JUGADORES Y RÁNKING")
                .font(.subheadline.monospaced().weight(.black))
                .foregroundStyle(RelicarioPalette.swIvory)
                .lineLimit(1)
                .minimumScaleFactor(0.78)

            Spacer(minLength: 4)

            Text("\(store.uniquePlayerCount) JUG.")
                .font(.caption2.monospaced().weight(.bold))
                .lineLimit(1)
                .padding(.horizontal, 8)
                .padding(.vertical, 5)
                .background(RelicarioPalette.swGold.opacity(0.16))
                .foregroundStyle(RelicarioPalette.swGold)
                .clipShape(Capsule())
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 10)
        .background(RelicarioPalette.swArenaBG.opacity(0.96))
    }

    private func leaderHighlightCard(_ leader: RankedPlayerEntry) -> some View {
        let p = leader.profile
        return Button(action: {
            activeProfileInitials = p.initials
        }) {
            HStack(spacing: 12) {
                if let avatar = p.favoriteAvatar {
                    AvatarPortraitView(avatar: avatar, size: 42)
                } else {
                    monogramBadge(p.initials, size: 42)
                }

                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 6) {
                        Text("LÍDER #1 · \(sortMetric.title.uppercased())")
                            .font(.system(size: 10, weight: .black, design: .monospaced))
                            .foregroundStyle(RelicarioPalette.swGold)
                            .lineLimit(1)
                        if let modeFilter = selectedModeFilter {
                            Text(modeFilter.tableHeader)
                                .font(.system(size: 9, weight: .bold, design: .monospaced))
                                .padding(.horizontal, 5)
                                .padding(.vertical, 2)
                                .background(modeFilter.accentColor.opacity(0.20))
                                .foregroundStyle(modeFilter.accentColor)
                                .clipShape(Capsule())
                        }
                    }

                    Text("\(p.initials) · \(Int(p.rankingScore.rounded())) pts")
                        .font(.subheadline.monospaced().weight(.black))
                        .foregroundStyle(RelicarioPalette.swIvory)
                        .lineLimit(1)
                        .minimumScaleFactor(0.82)

                    Text(String(format: "%.1fs medio · %.1f bajas/part. · %.0f%% superv.", p.avgSurvivedSeconds, p.avgKills, p.survivalRatePercent))
                        .font(.caption2)
                        .foregroundStyle(RelicarioPalette.swOldBone.opacity(0.85))
                        .lineLimit(1)
                        .minimumScaleFactor(0.75)
                }

                Spacer(minLength: 4)

                Image(systemName: "crown.fill")
                    .font(.subheadline)
                    .foregroundStyle(RelicarioPalette.swGold)
            }
            .padding(12)
            .background(RelicarioPalette.swGold.opacity(0.09))
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(RelicarioPalette.swGold.opacity(0.45), lineWidth: 1.2)
            )
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.plain)
    }

    private var searchAndFilterSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            // Buscador por iniciales
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(RelicarioPalette.swOldBone.opacity(0.7))

                TextField("Buscar jugador por iniciales (ej. VLF)...", text: $searchText)
                    .font(.caption.monospaced().weight(.semibold))
                    .foregroundStyle(RelicarioPalette.swIvory)
                    .textInputAutocapitalization(.characters)
                    .autocorrectionDisabled(true)

                if !searchText.isEmpty {
                    Button(action: {
                        searchText = ""
                    }) {
                        Image(systemName: "xmark.circle.fill")
                            .font(.caption)
                            .foregroundStyle(RelicarioPalette.swOldBone.opacity(0.7))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 9)
            .background(RelicarioPalette.swCardBG)
            .overlay(
                RoundedRectangle(cornerRadius: 10)
                    .stroke(RelicarioPalette.swCardBorder, lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: 10))

            // Filtro por modo
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    filterChip(
                        title: "Todos",
                        isSelected: selectedModeFilter == nil,
                        accent: RelicarioPalette.swColdSilver
                    ) {
                        selectedModeFilter = nil
                    }
                    ForEach(GameMode.allCases) { mode in
                        filterChip(
                            title: mode.tableHeader,
                            isSelected: selectedModeFilter == mode,
                            accent: mode.accentColor
                        ) {
                            selectedModeFilter = mode
                        }
                    }
                }
            }

            // Orden del ránking por medias
            VStack(alignment: .leading, spacing: 5) {
                Text("ORDENAR RÁNKING POR MEDIAS")
                    .font(.system(size: 10, weight: .bold, design: .monospaced))
                    .foregroundStyle(RelicarioPalette.swOldBone.opacity(0.75))

                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(LeaderboardSortMetric.allCases) { metric in
                            filterChip(
                                title: metric.title,
                                isSelected: sortMetric == metric,
                                accent: RelicarioPalette.swGold
                            ) {
                                sortMetric = metric
                            }
                        }
                    }
                }

                Text("Índice global = Tiempo medio × 10 + Bajas medias × 12 + Superv. % × 2.5")
                    .font(.system(size: 10))
                    .foregroundStyle(RelicarioPalette.swOldBone.opacity(0.62))
                    .lineLimit(2)
            }
        }
    }

    private func filterChip(title: String, isSelected: Bool, accent: Color, action: @escaping @MainActor () -> Void) -> some View {
        Button(action: {
            MainActor.assumeIsolated {
                action()
            }
        }) {
            Text(title)
                .font(.caption2.monospaced().weight(isSelected ? .black : .semibold))
                .lineLimit(1)
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(isSelected ? accent.opacity(0.22) : RelicarioPalette.swCardBG)
                .foregroundStyle(isSelected ? accent : RelicarioPalette.swOldBone.opacity(0.85))
                .overlay(
                    Capsule()
                        .stroke(isSelected ? accent : RelicarioPalette.swCardBorder, lineWidth: isSelected ? 1.3 : 1.0)
                )
                .clipShape(Capsule())
        }
        .buttonStyle(.plain)
    }

    private func playerRankingRow(_ entry: RankedPlayerEntry) -> some View {
        let p = entry.profile
        let rankColor = medalColor(for: entry.rank)
        let avatarLabel = p.favoriteAvatar?.shortLabel ?? "Clásico"

        return Button(action: {
            activeProfileInitials = p.initials
        }) {
            VStack(spacing: 10) {
                HStack(spacing: 10) {
                    Text("#\(entry.rank)")
                        .font(.caption.monospacedDigit().weight(.black))
                        .frame(minWidth: 30)
                        .padding(.vertical, 5)
                        .background(rankColor.opacity(0.16))
                        .foregroundStyle(rankColor)
                        .clipShape(RoundedRectangle(cornerRadius: 7))

                    if let fav = p.favoriteAvatar {
                        AvatarPortraitView(avatar: fav, size: 34)
                    } else {
                        monogramBadge(p.initials, size: 34)
                    }

                    VStack(alignment: .leading, spacing: 2) {
                        HStack(spacing: 6) {
                            Text(p.initials)
                                .font(.headline.monospaced().weight(.black))
                                .foregroundStyle(RelicarioPalette.swIvory)
                                .lineLimit(1)

                            Text(avatarLabel)
                                .font(.system(size: 10, weight: .bold, design: .monospaced))
                                .lineLimit(1)
                                .minimumScaleFactor(0.8)
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background((p.favoriteAvatar?.auraSwiftColor ?? RelicarioPalette.swOldBone).opacity(0.16))
                                .foregroundStyle(p.favoriteAvatar?.auraSwiftColor ?? RelicarioPalette.swOldBone)
                                .clipShape(Capsule())
                        }

                        Text("\(p.runCount) \(p.runCount == 1 ? "partida" : "partidas") · \(p.survivedCount) \(p.survivedCount == 1 ? "superv." : "supervs.")")
                            .font(.caption2)
                            .foregroundStyle(RelicarioPalette.swOldBone.opacity(0.78))
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)
                    }

                    Spacer(minLength: 4)

                    VStack(alignment: .trailing, spacing: 1) {
                        Text("\(Int(p.rankingScore.rounded()))")
                            .font(.subheadline.monospacedDigit().weight(.black))
                            .foregroundStyle(RelicarioPalette.swGold)
                        Text("PTS")
                            .font(.system(size: 9, weight: .bold, design: .monospaced))
                            .foregroundStyle(RelicarioPalette.swOldBone.opacity(0.65))
                    }

                    Image(systemName: "chevron.right")
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(RelicarioPalette.swOldBone.opacity(0.5))
                }

                // 4 Medias por Jugador
                HStack(spacing: 6) {
                    directoryAverageCell(
                        title: "T. MEDIO",
                        value: String(format: "%.1fs", p.avgSurvivedSeconds),
                        color: RelicarioPalette.swIvory,
                        highlighted: sortMetric == .avgTime
                    )
                    directoryAverageCell(
                        title: "BAJAS MED.",
                        value: String(format: "%.1f", p.avgKills),
                        color: RelicarioPalette.swColdSilver,
                        highlighted: sortMetric == .avgKills
                    )
                    directoryAverageCell(
                        title: "SUPERV.",
                        value: String(format: "%.0f%%", p.survivalRatePercent),
                        color: RelicarioPalette.swGraceJade,
                        highlighted: sortMetric == .survivalRate
                    )
                    directoryAverageCell(
                        title: "ESTRÉS MED.",
                        value: String(format: "%.0f%%", p.avgStress),
                        color: StressTier.from(index: p.avgStress).color,
                        highlighted: sortMetric == .avgStress
                    )
                }
            }
            .padding(12)
            .background(RelicarioPalette.swCardBG)
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(entry.rank == 1 ? RelicarioPalette.swGold.opacity(0.55) : RelicarioPalette.swCardBorder, lineWidth: entry.rank == 1 ? 1.4 : 1.0)
            )
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.plain)
    }

    private func directoryAverageCell(title: String, value: String, color: Color, highlighted: Bool) -> some View {
        VStack(spacing: 2) {
            Text(title)
                .font(.system(size: 9, weight: .bold, design: .monospaced))
                .foregroundStyle(RelicarioPalette.swOldBone.opacity(0.72))
                .lineLimit(1)
                .minimumScaleFactor(0.72)
            Text(value)
                .font(.caption.monospacedDigit().weight(.black))
                .foregroundStyle(color)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 6)
        .padding(.horizontal, 4)
        .background(highlighted ? color.opacity(0.14) : Color.black.opacity(0.32))
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .stroke(highlighted ? color.opacity(0.5) : Color.clear, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    private func monogramBadge(_ initials: String, size: CGFloat) -> some View {
        Circle()
            .fill(Color.white.opacity(0.08))
            .frame(width: size, height: size)
            .overlay(
                Text(String(initials.prefix(2)))
                    .font(.caption.monospaced().weight(.black))
                    .foregroundStyle(RelicarioPalette.swOldBone)
            )
    }

    private func medalColor(for rank: Int) -> Color {
        switch rank {
        case 1: return RelicarioPalette.swGold
        case 2: return RelicarioPalette.swColdSilver
        case 3: return RelicarioPalette.swOrange
        default: return RelicarioPalette.swOldBone
        }
    }

    private var emptyDirectoryCard: some View {
        VStack(spacing: 10) {
            Image(systemName: "person.3.fill")
                .font(.title2)
                .foregroundStyle(RelicarioPalette.swOldBone.opacity(0.55))
            Text("Sin jugadores registrados todavía")
                .font(.subheadline.monospaced().weight(.bold))
                .foregroundStyle(RelicarioPalette.swIvory)
            Text(selectedModeFilter == nil
                 ? "Completa partidas con distintas iniciales para ver el listado de jugadores, sus medias y su perfil individual."
                 : "Ningún jugador ha registrado partidas en este modo todavía.")
                .font(.caption)
                .foregroundStyle(RelicarioPalette.swOldBone.opacity(0.75))
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(24)
        .background(RelicarioPalette.swCardBG)
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .stroke(RelicarioPalette.swCardBorder, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }

    private var noSearchMatchCard: some View {
        VStack(spacing: 8) {
            Text("Sin resultados para \"\(searchText.uppercased())\"")
                .font(.subheadline.monospaced().weight(.bold))
                .foregroundStyle(RelicarioPalette.swIvory)
            Button(action: {
                searchText = ""
            }) {
                Text("Limpiar búsqueda")
                    .font(.caption.monospaced().weight(.bold))
                    .foregroundStyle(RelicarioPalette.swColdSilver)
            }
            .buttonStyle(.plain)
        }
        .frame(maxWidth: .infinity)
        .padding(20)
        .background(RelicarioPalette.swCardBG)
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }
}

// MARK: - Perfil Estadístico Individual del Jugador

@MainActor
struct PlayerProfileView: View {
    let profile: PlayerAggregateProfile
    let globalRank: Int?
    let onBack: @MainActor () -> Void
    let onUsePlayerSetup: @MainActor (String, PlayerAvatar?) -> Void

    private var displayAvatar: PlayerAvatar? {
        profile.favoriteAvatar ?? profile.latestAvatar
    }

    var body: some View {
        VStack(spacing: 0) {
            topProfileBar

            ScrollView(showsIndicators: false) {
                VStack(spacing: 16) {
                    heroIdentityCard
                    averagesAndRecordsSection
                    modeBreakdownSection

                    if !profile.usedAvatars.isEmpty {
                        usedAvatarsSection
                    }

                    playerHistorySection
                }
                .padding(.horizontal, 18)
                .padding(.top, 10)
                .padding(.bottom, 26)
            }
        }
    }

    private var topProfileBar: some View {
        HStack(spacing: 8) {
            Button(action: {
                MainActor.assumeIsolated {
                    onBack()
                }
            }) {
                HStack(spacing: 4) {
                    Image(systemName: "chevron.left")
                        .font(.caption.weight(.bold))
                    Text("Ránking")
                        .font(.caption.monospaced().weight(.bold))
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 7)
                .background(RelicarioPalette.swCardBG)
                .foregroundStyle(RelicarioPalette.swOldBone)
                .overlay(
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(RelicarioPalette.swCardBorder, lineWidth: 1)
                )
                .clipShape(RoundedRectangle(cornerRadius: 8))
            }
            .buttonStyle(.plain)

            Spacer(minLength: 4)

            Text("PERFIL · \(profile.initials)")
                .font(.subheadline.monospaced().weight(.black))
                .foregroundStyle(RelicarioPalette.swIvory)
                .lineLimit(1)

            Spacer(minLength: 4)

            if let rank = globalRank {
                Text("#\(rank) GLOBAL")
                    .font(.caption2.monospaced().weight(.black))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 5)
                    .background((rank == 1 ? RelicarioPalette.swGold : RelicarioPalette.swColdSilver).opacity(0.18))
                    .foregroundStyle(rank == 1 ? RelicarioPalette.swGold : RelicarioPalette.swColdSilver)
                    .clipShape(Capsule())
            }
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 10)
        .background(RelicarioPalette.swArenaBG.opacity(0.96))
    }

    private var heroIdentityCard: some View {
        let accent = displayAvatar?.auraSwiftColor ?? RelicarioPalette.swGold

        return VStack(spacing: 14) {
            HStack(spacing: 14) {
                if let avatar = displayAvatar {
                    AvatarPortraitView(avatar: avatar, size: 56)
                        .overlay(
                            Circle()
                                .stroke(accent.opacity(0.8), lineWidth: 1.5)
                        )
                } else {
                    Circle()
                        .fill(Color.white.opacity(0.08))
                        .frame(width: 56, height: 56)
                        .overlay(
                            Text(profile.initials)
                                .font(.headline.monospaced().weight(.black))
                                .foregroundStyle(RelicarioPalette.swIvory)
                        )
                }

                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 8) {
                        Text(profile.initials)
                            .font(.system(size: 24, weight: .black, design: .monospaced))
                            .foregroundStyle(RelicarioPalette.swIvory)

                        if let fav = profile.favoriteAvatar {
                            Text(fav.displayName)
                                .font(.caption2.monospaced().weight(.bold))
                                .lineLimit(1)
                                .padding(.horizontal, 7)
                                .padding(.vertical, 3)
                                .background(accent.opacity(0.18))
                                .foregroundStyle(accent)
                                .clipShape(Capsule())
                        }
                    }

                    Text("\(profile.runCount) \(profile.runCount == 1 ? "partida registrada" : "partidas registradas") · \(profile.survivedCount) \(profile.survivedCount == 1 ? "supervivencia" : "supervivencias")")
                        .font(.caption)
                        .foregroundStyle(RelicarioPalette.swOldBone.opacity(0.85))
                        .lineLimit(1)
                        .minimumScaleFactor(0.78)

                    Text("Última sesión: \(profile.lastPlayedAt.formatted(.dateTime.day().month(.abbreviated).hour().minute()))")
                        .font(.caption2)
                        .foregroundStyle(RelicarioPalette.swColdSilver.opacity(0.75))
                        .lineLimit(1)
                }

                Spacer(minLength: 0)
            }

            Button(action: {
                MainActor.assumeIsolated {
                    onUsePlayerSetup(profile.initials, displayAvatar)
                }
            }) {
                HStack(spacing: 8) {
                    Image(systemName: "play.fill")
                        .font(.caption.weight(.black))
                    Text("JUGAR COMO \(profile.initials)")
                        .font(.caption.monospaced().weight(.black))
                        .tracking(0.8)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
                .background(RelicarioPalette.swGold)
                .foregroundStyle(Color.black)
                .clipShape(RoundedRectangle(cornerRadius: 10))
            }
            .buttonStyle(.plain)
        }
        .padding(16)
        .background(RelicarioPalette.swCardBG)
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .stroke(accent.opacity(0.5), lineWidth: 1.3)
        )
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }

    private var averagesAndRecordsSection: some View {
        let columns = [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)]

        return VStack(alignment: .leading, spacing: 10) {
            Text("MEDIAS Y RÉCORDS PERSONALES")
                .font(.caption.weight(.bold))
                .tracking(1.4)
                .foregroundStyle(RelicarioPalette.swGold)

            LazyVGrid(columns: columns, spacing: 10) {
                profileKpiCard(
                    title: "TIEMPO MEDIO",
                    value: String(format: "%.1fs", profile.avgSurvivedSeconds),
                    subtitle: String(format: "Récord: %.1fs", profile.bestSurvivedSeconds),
                    color: RelicarioPalette.swIvory
                )
                profileKpiCard(
                    title: "BAJAS MEDIAS",
                    value: String(format: "%.1f", profile.avgKills),
                    subtitle: "Récord: \(profile.bestKills) bajas",
                    color: RelicarioPalette.swColdSilver
                )
                profileKpiCard(
                    title: "SUPERVIVENCIA 60s",
                    value: String(format: "%.0f%%", profile.survivalRatePercent),
                    subtitle: "\(profile.survivedCount) de \(profile.runCount) rondas",
                    color: RelicarioPalette.swGraceJade
                )
                profileKpiCard(
                    title: "PUNTUACIÓN MEDIA",
                    value: "\(Int(profile.rankingScore.rounded())) pts",
                    subtitle: globalRank.map { "Puesto #\($0) de la clase" } ?? "Sin clasificar",
                    color: RelicarioPalette.swGold
                )
                profileKpiCard(
                    title: "ESTRÉS MEDIO",
                    value: String(format: "%.0f%%", profile.avgStress),
                    subtitle: String(format: "Pico medio: %.0f%%", profile.avgPeakStress),
                    color: StressTier.from(index: profile.avgStress).color
                )
                profileKpiCard(
                    title: "CURAS MEDIAS",
                    value: String(format: "%.1f", profile.avgMedkits),
                    subtitle: "Botiquines por partida",
                    color: RelicarioPalette.swGraceJade
                )
            }
        }
    }

    private func profileKpiCard(title: String, value: String, subtitle: String, color: Color) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.system(size: 10, weight: .bold, design: .monospaced))
                .foregroundStyle(RelicarioPalette.swOldBone.opacity(0.75))
                .lineLimit(1)
                .minimumScaleFactor(0.78)
            Text(value)
                .font(.title3.monospacedDigit().weight(.black))
                .foregroundStyle(color)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
            Text(subtitle)
                .font(.caption2)
                .foregroundStyle(RelicarioPalette.swOldBone.opacity(0.8))
                .lineLimit(1)
                .minimumScaleFactor(0.78)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(RelicarioPalette.swCardBG)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(RelicarioPalette.swCardBorder, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private var modeBreakdownSection: some View {
        let m1985 = profile.statsByMode[.classic1985] ?? .empty(for: .classic1985)
        let m2026 = profile.statsByMode[.director2026] ?? .empty(for: .director2026)
        let mHybrid = profile.statsByMode[.hybrid1985x2026] ?? .empty(for: .hybrid1985x2026)

        return VStack(alignment: .leading, spacing: 12) {
            Text("DESGLOSE POR MOTOR (MEDIAS)")
                .font(.caption.weight(.bold))
                .tracking(1.3)
                .foregroundStyle(RelicarioPalette.swGold)

            Grid(alignment: .leading, horizontalSpacing: 6, verticalSpacing: 10) {
                GridRow {
                    Text("MÉTRICA")
                        .font(.caption2.monospaced().weight(.bold))
                        .foregroundStyle(RelicarioPalette.swOldBone.opacity(0.7))
                        .frame(maxWidth: .infinity, alignment: .leading)
                    Text(GameMode.classic1985.tableHeader)
                        .font(.caption2.monospaced().weight(.black))
                        .foregroundStyle(RelicarioPalette.swOldBone)
                        .frame(width: 48, alignment: .trailing)
                    Text(GameMode.director2026.tableHeader)
                        .font(.caption2.monospaced().weight(.black))
                        .foregroundStyle(RelicarioPalette.swVermilion)
                        .frame(width: 48, alignment: .trailing)
                    Text(GameMode.hybrid1985x2026.tableHeader)
                        .font(.caption2.monospaced().weight(.black))
                        .foregroundStyle(RelicarioPalette.swGold)
                        .frame(width: 48, alignment: .trailing)
                }

                Divider().overlay(RelicarioPalette.swCardBorder)

                profileModeRow(label: "Partidas", val1985: "\(m1985.runCount)", val2026: "\(m2026.runCount)", valHybrid: "\(mHybrid.runCount)")
                profileModeRow(
                    label: "Superv. 60s",
                    val1985: m1985.runCount > 0 ? String(format: "%.0f%%", m1985.survivalRatePercent) : "—",
                    val2026: m2026.runCount > 0 ? String(format: "%.0f%%", m2026.survivalRatePercent) : "—",
                    valHybrid: mHybrid.runCount > 0 ? String(format: "%.0f%%", mHybrid.survivalRatePercent) : "—"
                )
                profileModeRow(
                    label: "Tiempo medio",
                    val1985: m1985.runCount > 0 ? String(format: "%.1fs", m1985.avgSurvivedSeconds) : "—",
                    val2026: m2026.runCount > 0 ? String(format: "%.1fs", m2026.avgSurvivedSeconds) : "—",
                    valHybrid: mHybrid.runCount > 0 ? String(format: "%.1fs", mHybrid.avgSurvivedSeconds) : "—"
                )
                profileModeRow(
                    label: "Bajas medias",
                    val1985: m1985.runCount > 0 ? String(format: "%.1f", m1985.avgKills) : "—",
                    val2026: m2026.runCount > 0 ? String(format: "%.1f", m2026.avgKills) : "—",
                    valHybrid: mHybrid.runCount > 0 ? String(format: "%.1f", mHybrid.avgKills) : "—"
                )
                profileModeRow(
                    label: "Estrés medio",
                    val1985: m1985.runCount > 0 ? String(format: "%.0f%%", m1985.avgStress) : "—",
                    val2026: m2026.runCount > 0 ? String(format: "%.0f%%", m2026.avgStress) : "—",
                    valHybrid: mHybrid.runCount > 0 ? String(format: "%.0f%%", mHybrid.avgStress) : "—"
                )
                profileModeRow(
                    label: "Estrés pico",
                    val1985: m1985.runCount > 0 ? String(format: "%.0f%%", m1985.avgPeakStress) : "—",
                    val2026: m2026.runCount > 0 ? String(format: "%.0f%%", m2026.avgPeakStress) : "—",
                    valHybrid: mHybrid.runCount > 0 ? String(format: "%.0f%%", mHybrid.avgPeakStress) : "—"
                )
            }
        }
        .padding(16)
        .background(RelicarioPalette.swCardBG)
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .stroke(RelicarioPalette.swCardBorder, lineWidth: 1.2)
        )
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }

    private func profileModeRow(label: String, val1985: String, val2026: String, valHybrid: String) -> some View {
        GridRow {
            Text(label)
                .font(.caption.weight(.medium))
                .foregroundStyle(RelicarioPalette.swIvory.opacity(0.9))
                .lineLimit(1)
                .minimumScaleFactor(0.85)
                .frame(maxWidth: .infinity, alignment: .leading)
            Text(val1985)
                .font(.caption.monospacedDigit().weight(.bold))
                .foregroundStyle(RelicarioPalette.swOldBone)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .frame(width: 48, alignment: .trailing)
            Text(val2026)
                .font(.caption.monospacedDigit().weight(.bold))
                .foregroundStyle(RelicarioPalette.swIvory)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .frame(width: 48, alignment: .trailing)
            Text(valHybrid)
                .font(.caption.monospacedDigit().weight(.bold))
                .foregroundStyle(RelicarioPalette.swGold)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .frame(width: 48, alignment: .trailing)
        }
    }

    private var usedAvatarsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("AVATARES UTILIZADOS")
                .font(.caption.weight(.bold))
                .tracking(1.4)
                .foregroundStyle(RelicarioPalette.swOldBone)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(profile.usedAvatars) { stat in
                        HStack(spacing: 8) {
                            AvatarPortraitView(avatar: stat.avatar, size: 30)
                            VStack(alignment: .leading, spacing: 1) {
                                Text(stat.avatar.shortLabel)
                                    .font(.caption.monospaced().weight(.bold))
                                    .foregroundStyle(RelicarioPalette.swIvory)
                                Text("\(stat.count) \(stat.count == 1 ? "uso" : "usos")")
                                    .font(.caption2)
                                    .foregroundStyle(stat.avatar.auraSwiftColor)
                            }
                        }
                        .padding(.horizontal, 10)
                        .padding(.vertical, 8)
                        .background(RelicarioPalette.swCardBG)
                        .overlay(
                            RoundedRectangle(cornerRadius: 10)
                                .stroke(stat.avatar.auraSwiftColor.opacity(0.45), lineWidth: 1)
                        )
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                    }
                }
            }
        }
    }

    private var playerHistorySection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("HISTORIAL DE \(profile.initials) (\(profile.runs.count))")
                .font(.caption.weight(.bold))
                .tracking(1.4)
                .foregroundStyle(RelicarioPalette.swOldBone)

            VStack(spacing: 8) {
                ForEach(profile.runs) { rec in
                    let statusColor = rec.didSurvive ? RelicarioPalette.swGraceJade : RelicarioPalette.swVermilion

                    VStack(spacing: 6) {
                        HStack(spacing: 8) {
                            if let av = rec.avatar {
                                AvatarPortraitView(avatar: av, size: 22, showAuraRing: false)
                            }

                            Text(rec.mode.shortBadge)
                                .font(.system(size: 10, weight: .bold, design: .monospaced))
                                .lineLimit(1)
                                .padding(.horizontal, 6)
                                .padding(.vertical, 3)
                                .background(rec.mode.accentColor.opacity(0.18))
                                .foregroundStyle(rec.mode.accentColor)
                                .clipShape(Capsule())

                            Text(rec.didSurvive ? "COMPLETADA" : "CAÍDA")
                                .font(.system(size: 10, weight: .black, design: .monospaced))
                                .foregroundStyle(statusColor)

                            Spacer()

                            Text(rec.playedAt.formatted(.dateTime.day().month(.abbreviated).hour().minute()))
                                .font(.caption2)
                                .foregroundStyle(RelicarioPalette.swOldBone.opacity(0.65))
                                .lineLimit(1)
                        }

                        HStack(spacing: 12) {
                            Text(String(format: "%.1fs", rec.survivedSeconds))
                                .font(.caption.monospacedDigit().weight(.black))
                                .foregroundStyle(statusColor)
                            Text("\(rec.kills) bajas")
                                .font(.caption.monospacedDigit())
                                .foregroundStyle(RelicarioPalette.swColdSilver)
                            Text("Estrés \(Int(rec.averageStress.rounded()))% (pico \(Int(rec.peakStress.rounded()))%)")
                                .font(.caption2.monospacedDigit())
                                .foregroundStyle(StressTier.from(index: rec.averageStress).color)
                                .lineLimit(1)
                                .minimumScaleFactor(0.8)
                            Spacer()
                            if rec.medkitsCollected > 0 {
                                Text("+\(rec.medkitsCollected)C")
                                    .font(.caption2.monospacedDigit().weight(.bold))
                                    .foregroundStyle(RelicarioPalette.swGraceJade)
                            }
                        }
                    }
                    .padding(11)
                    .background(RelicarioPalette.swCardBG)
                    .overlay(
                        RoundedRectangle(cornerRadius: 10)
                            .stroke(RelicarioPalette.swCardBorder, lineWidth: 1)
                    )
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                }
            }
        }
    }
}

