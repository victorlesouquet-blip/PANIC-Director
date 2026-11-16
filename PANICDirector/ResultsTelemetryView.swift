import SwiftUI

@MainActor
struct ResultsTelemetryView: View {
    let lastRecord: RunTelemetryRecord?
    let store: TelemetryStore
    let onPlayAgainSameSetup: @MainActor () -> Void
    let onReturnToStart: @MainActor () -> Void

    @State private var showResetConfirmation = false

    private var stats1985: ModeAggregateStats { store.stats(for: .classic1985) }
    private var stats2026: ModeAggregateStats { store.stats(for: .director2026) }

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
            HStack {
                Text(record.initials)
                    .font(.caption.monospaced().weight(.black))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(Color.white.opacity(0.08))
                    .foregroundStyle(RelicarioPalette.swIvory)
                    .clipShape(RoundedRectangle(cornerRadius: 6))

                Text(record.mode.displayTitle)
                    .font(.caption.weight(.bold))
                    .foregroundStyle(record.mode.accentColor)

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

    private func metricPill(title: String, value: String, color: Color) -> some View {
        VStack(spacing: 3) {
            Text(title)
                .font(.system(size: 9, weight: .bold, design: .monospaced))
                .foregroundStyle(RelicarioPalette.swOldBone.opacity(0.75))
            Text(value)
                .font(.subheadline.monospacedDigit().weight(.black))
                .foregroundStyle(color)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 8)
        .background(Color.black.opacity(0.35))
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    // MARK: - Tabla Comparativa (1985 vs 2026)

    private var classComparisonSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("COMPARATIVA 1985 vs 2026")
                    .font(.caption.weight(.bold))
                    .tracking(1.5)
                    .foregroundStyle(RelicarioPalette.swGold)
                Spacer()
                Text("TELEMETRÍA EN VIVO")
                    .font(.caption2.monospaced())
                    .foregroundStyle(RelicarioPalette.swOldBone.opacity(0.65))
            }

            Grid(alignment: .leading, horizontalSpacing: 10, verticalSpacing: 10) {
                GridRow {
                    Text("MÉTRICA")
                        .font(.caption2.monospaced().weight(.bold))
                        .foregroundStyle(RelicarioPalette.swOldBone.opacity(0.7))
                    Text("1985 (FIJO)")
                        .font(.caption2.monospaced().weight(.black))
                        .foregroundStyle(RelicarioPalette.swOldBone)
                        .frame(maxWidth: .infinity, alignment: .trailing)
                    Text("2026 (IA)")
                        .font(.caption2.monospaced().weight(.black))
                        .foregroundStyle(RelicarioPalette.swVermilion)
                        .frame(maxWidth: .infinity, alignment: .trailing)
                }

                Divider().overlay(RelicarioPalette.swCardBorder)

                comparisonRow(
                    label: "Partidas",
                    val1985: "\(stats1985.runCount)",
                    val2026: "\(stats2026.runCount)"
                )
                comparisonRow(
                    label: "Supervivencia 60s",
                    val1985: stats1985.runCount > 0 ? String(format: "%.0f%%", stats1985.survivalRatePercent) : "—",
                    val2026: stats2026.runCount > 0 ? String(format: "%.0f%%", stats2026.survivalRatePercent) : "—"
                )
                comparisonRow(
                    label: "Tiempo medio",
                    val1985: stats1985.runCount > 0 ? String(format: "%.1fs", stats1985.avgSurvivedSeconds) : "—",
                    val2026: stats2026.runCount > 0 ? String(format: "%.1fs", stats2026.avgSurvivedSeconds) : "—"
                )
                comparisonRow(
                    label: "Bajas medias",
                    val1985: stats1985.runCount > 0 ? String(format: "%.1f", stats1985.avgKills) : "—",
                    val2026: stats2026.runCount > 0 ? String(format: "%.1f", stats2026.avgKills) : "—"
                )
                comparisonRow(
                    label: "Estrés medio",
                    val1985: stats1985.runCount > 0 ? String(format: "%.0f%%", stats1985.avgStress) : "—",
                    val2026: stats2026.runCount > 0 ? String(format: "%.0f%%", stats2026.avgStress) : "—"
                )
                comparisonRow(
                    label: "Estrés pico medio",
                    val1985: stats1985.runCount > 0 ? String(format: "%.0f%%", stats1985.avgPeakStress) : "—",
                    val2026: stats2026.runCount > 0 ? String(format: "%.0f%%", stats2026.avgPeakStress) : "—"
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

    private func comparisonRow(label: String, val1985: String, val2026: String) -> some View {
        GridRow {
            Text(label)
                .font(.caption.weight(.medium))
                .foregroundStyle(RelicarioPalette.swIvory.opacity(0.9))
            Text(val1985)
                .font(.subheadline.monospacedDigit().weight(.bold))
                .foregroundStyle(RelicarioPalette.swOldBone)
                .frame(maxWidth: .infinity, alignment: .trailing)
            Text(val2026)
                .font(.subheadline.monospacedDigit().weight(.bold))
                .foregroundStyle(RelicarioPalette.swIvory)
                .frame(maxWidth: .infinity, alignment: .trailing)
        }
    }

    // MARK: - Lectura para la Exposición Universitaria

    private var classInsightBanner: some View {
        let message: String
        if stats1985.runCount == 0 || stats2026.runCount == 0 {
            message = "Registra partidas en ambos modos con varios compañeros para proyectar la comparativa real 1985 vs 2026."
        } else {
            let deltaSurvival = stats2026.survivalRatePercent - stats1985.survivalRatePercent
            let sign = deltaSurvival >= 0 ? "+" : ""
            message = String(
                format: "Con %d partidas registradas: el Modo 2026 logra %@%.0f pp en supervivencia manteniendo un estrés medio del %.0f%% frente al %.0f%% del Modo 1985.",
                store.records.count,
                sign,
                deltaSurvival,
                stats2026.avgStress,
                stats1985.avgStress
            )
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
                        HStack(spacing: 10) {
                            Text(rec.initials)
                                .font(.caption.monospaced().weight(.black))
                                .frame(width: 38, alignment: .leading)
                                .foregroundStyle(RelicarioPalette.swIvory)

                            Text(rec.mode.shortBadge)
                                .font(.system(size: 10, weight: .bold, design: .monospaced))
                                .padding(.horizontal, 6)
                                .padding(.vertical, 3)
                                .background(rec.mode.accentColor.opacity(0.18))
                                .foregroundStyle(rec.mode.accentColor)
                                .clipShape(Capsule())

                            Spacer()

                            Text(String(format: "%.1fs", rec.survivedSeconds))
                                .font(.caption.monospacedDigit().weight(.bold))
                                .foregroundStyle(rec.didSurvive ? RelicarioPalette.swGraceJade : RelicarioPalette.swVermilion)

                            Text("\(rec.kills)B")
                                .font(.caption.monospacedDigit())
                                .foregroundStyle(RelicarioPalette.swColdSilver)
                                .frame(width: 34, alignment: .trailing)

                            Text("\(Int(rec.averageStress.rounded()))%")
                                .font(.caption.monospacedDigit().weight(.semibold))
                                .foregroundStyle(StressTier.from(index: rec.averageStress).color)
                                .frame(width: 36, alignment: .trailing)
                        }
                        .padding(.horizontal, 12)
                        .padding(.vertical, 9)
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

    // MARK: - Botonera Inferior

    private var bottomActionBar: some View {
        HStack(spacing: 10) {
            Button(action: onReturnToStart) {
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
                Button(action: onPlayAgainSameSetup) {
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
