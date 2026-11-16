import SwiftUI
import UIKit

// MARK: - Pantalla de Inicio Tipo Recreativa

@MainActor
struct StartScreenView: View {
    @Binding var initialsChars: [Character]
    @Binding var selectedMode: GameMode
    let recordedCount: Int
    let onStartGame: @MainActor () -> Void
    let onOpenTelemetry: @MainActor () -> Void

    var body: some View {
        ZStack {
            RelicarioPalette.swArenaBG
                .ignoresSafeArea()

            ScrollView(showsIndicators: false) {
                VStack(spacing: 22) {
                    // Cabecera Editorial Arcade
                    VStack(spacing: 8) {
                        HStack(spacing: 8) {
                            ReliquaryEmblemView()
                                .frame(width: 22, height: 22)
                            Text("LABORATORIO DE IA · DEMO 60s")
                                .font(.caption.weight(.bold))
                                .tracking(2.0)
                                .foregroundStyle(RelicarioPalette.swGold)
                        }

                        Text("PANIC DIRECTOR")
                            .font(.system(size: 34, weight: .black, design: .monospaced))
                            .tracking(2.5)
                            .foregroundStyle(RelicarioPalette.swIvory)
                            .multilineTextAlignment(.center)

                        Text("Relicario de Ceniza y Carmesí")
                            .font(.subheadline.weight(.medium))
                            .foregroundStyle(RelicarioPalette.swOldBone.opacity(0.8))
                    }
                    .padding(.top, 16)

                    // Selector de 3 Iniciales del Jugador
                    VStack(spacing: 12) {
                        HStack {
                            Text("INICIALES DEL JUGADOR")
                                .font(.caption.weight(.bold))
                                .tracking(1.6)
                                .foregroundStyle(RelicarioPalette.swOldBone)
                            Spacer()
                            Text("REGISTRO RECREATIVA")
                                .font(.caption2.monospaced())
                                .foregroundStyle(RelicarioPalette.swColdSilver.opacity(0.8))
                        }

                        HStack(spacing: 14) {
                            ForEach(0..<3, id: \.self) { index in
                                ArcadeLetterWheel(letter: $initialsChars[index])
                            }
                        }
                    }
                    .padding(16)
                    .background(RelicarioPalette.swCardBG)
                    .overlay(
                        RoundedRectangle(cornerRadius: 14)
                            .stroke(RelicarioPalette.swCardBorder, lineWidth: 1.2)
                    )
                    .clipShape(RoundedRectangle(cornerRadius: 14))

                    // Selector de Motor de IA (1985 vs 2026)
                    VStack(alignment: .leading, spacing: 10) {
                        Text("SELECCIONA MOTOR DE IA")
                            .font(.caption.weight(.bold))
                            .tracking(1.6)
                            .foregroundStyle(RelicarioPalette.swOldBone)

                        ForEach(GameMode.allCases) { mode in
                            ModeSelectionCard(
                                mode: mode,
                                isSelected: selectedMode == mode,
                                onSelect: {
                                    let gen = UIImpactFeedbackGenerator(style: .light)
                                    gen.impactOccurred()
                                    selectedMode = mode
                                }
                            )
                        }
                    }

                    // Botón Principal de Inicio
                    Button(action: {
                        let gen = UIImpactFeedbackGenerator(style: .medium)
                        gen.impactOccurred()
                        onStartGame()
                    }) {
                        HStack(spacing: 10) {
                            Image(systemName: "play.fill")
                                .font(.headline)
                            Text("INICIAR PARTIDA (60s)")
                                .font(.headline.monospaced().weight(.heavy))
                                .tracking(1.2)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 16)
                        .background(selectedMode == .director2026 ? RelicarioPalette.swVermilion : RelicarioPalette.swOldBone)
                        .foregroundStyle(selectedMode == .director2026 ? RelicarioPalette.swIvory : Color.black)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                    }
                    .buttonStyle(.plain)

                    // Acceso directo a Telemetría de Clase
                    Button(action: onOpenTelemetry) {
                        HStack(spacing: 8) {
                            Image(systemName: "chart.bar.xaxis")
                            Text("Telemetría de Clase (\(recordedCount))")
                                .font(.subheadline.weight(.semibold))
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(RelicarioPalette.swCardBG)
                        .foregroundStyle(RelicarioPalette.swColdSilver)
                        .overlay(
                            RoundedRectangle(cornerRadius: 12)
                                .stroke(RelicarioPalette.swColdSilver.opacity(0.35), lineWidth: 1.0)
                        )
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                    }
                    .buttonStyle(.plain)
                    .padding(.bottom, 20)
                }
                .padding(.horizontal, 20)
            }
        }
    }
}

@MainActor
private struct ArcadeLetterWheel: View {
    @Binding var letter: Character
    private let alphabet: [Character] = Array("ABCDEFGHIJKLMNOPQRSTUVWXYZ")

    var body: some View {
        VStack(spacing: 6) {
            Button(action: { step(by: 1) }) {
                Image(systemName: "chevron.up")
                    .font(.caption.weight(.bold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
                    .background(Color.white.opacity(0.05))
                    .foregroundStyle(RelicarioPalette.swGold)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
            }
            .buttonStyle(.plain)

            Text(String(letter))
                .font(.system(size: 32, weight: .black, design: .monospaced))
                .foregroundStyle(RelicarioPalette.swIvory)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 6)
                .background(Color.black.opacity(0.45))
                .overlay(
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(RelicarioPalette.swGold.opacity(0.55), lineWidth: 1.2)
                )
                .clipShape(RoundedRectangle(cornerRadius: 8))
                .onTapGesture { step(by: 1) }

            Button(action: { step(by: -1) }) {
                Image(systemName: "chevron.down")
                    .font(.caption.weight(.bold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
                    .background(Color.white.opacity(0.05))
                    .foregroundStyle(RelicarioPalette.swGold)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
            }
            .buttonStyle(.plain)
        }
    }

    private func step(by delta: Int) {
        let currentIndex = alphabet.firstIndex(of: letter) ?? 0
        let nextIndex = (currentIndex + delta + alphabet.count) % alphabet.count
        letter = alphabet[nextIndex]
        let gen = UIImpactFeedbackGenerator(style: .light)
        gen.impactOccurred(intensity: 0.65)
    }
}

@MainActor
private struct ModeSelectionCard: View {
    let mode: GameMode
    let isSelected: Bool
    let onSelect: @MainActor () -> Void

    var body: some View {
        Button(action: onSelect) {
            HStack(alignment: .top, spacing: 12) {
                Circle()
                    .strokeBorder(isSelected ? mode.accentColor : Color.white.opacity(0.25), lineWidth: 2)
                    .background(Circle().fill(isSelected ? mode.accentColor : Color.clear).padding(4))
                    .frame(width: 22, height: 22)
                    .padding(.top, 2)

                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text(mode.displayTitle)
                            .font(.headline.weight(.bold))
                            .foregroundStyle(RelicarioPalette.swIvory)
                        Spacer()
                        Text(mode.shortBadge)
                            .font(.caption2.monospaced().weight(.bold))
                            .padding(.horizontal, 7)
                            .padding(.vertical, 3)
                            .background(mode.accentColor.opacity(0.18))
                            .foregroundStyle(mode.accentColor)
                            .clipShape(Capsule())
                    }
                    Text(mode.subtitle)
                        .font(.caption)
                        .foregroundStyle(RelicarioPalette.swOldBone.opacity(0.85))
                        .multilineTextAlignment(.leading)
                }
            }
            .padding(14)
            .background(isSelected ? mode.accentColor.opacity(0.10) : RelicarioPalette.swCardBG)
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(isSelected ? mode.accentColor : RelicarioPalette.swCardBorder, lineWidth: isSelected ? 1.8 : 1.0)
            )
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.plain)
    }
}

private struct ReliquaryEmblemView: View {
    var body: some View {
        Canvas { ctx, size in
            let midX = size.width * 0.5
            let midY = size.height * 0.5
            var diamond = Path()
            diamond.move(to: CGPoint(x: midX, y: 1))
            diamond.addLine(to: CGPoint(x: size.width - 1, y: midY))
            diamond.addLine(to: CGPoint(x: midX, y: size.height - 1))
            diamond.addLine(to: CGPoint(x: 1, y: midY))
            diamond.closeSubpath()
            ctx.stroke(diamond, with: .color(RelicarioPalette.swVermilion), lineWidth: 1.8)

            let inner = Path(ellipseIn: CGRect(x: midX - 3, y: midY - 4.5, width: 6, height: 9))
            ctx.fill(inner, with: .color(RelicarioPalette.swGold))
        }
    }
}

// MARK: - Vista en Partida + HUD Reactivo en Español

@MainActor
struct GamePlayView: View {
    let viewModel: GameSessionViewModel
    @State private var showTouchHint = true

    var body: some View {
        ZStack {
            GeometryReader { fullProxy in
                SpriteKitHostView(scene: viewModel.scene)
                    .onAppear {
                        viewModel.updateSafeMargins(
                            top: fullProxy.safeAreaInsets.top,
                            bottom: fullProxy.safeAreaInsets.bottom
                        )
                    }
                    .onChange(of: fullProxy.safeAreaInsets) { _, newInsets in
                        viewModel.updateSafeMargins(top: newInsets.top, bottom: newInsets.bottom)
                    }
            }
            .ignoresSafeArea()

            // Capa HUD superior
            VStack(spacing: 8) {
                topHUDHeader
                stressDirectorPanel
                Spacer()

                if showTouchHint {
                    Text("Arrastra el pulgar donde quieras · Disparo automático")
                        .font(.caption.weight(.semibold))
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .background(Color.black.opacity(0.62))
                        .foregroundStyle(RelicarioPalette.swColdSilver)
                        .clipShape(Capsule())
                        .padding(.bottom, 16)
                        .allowsHitTesting(false)
                        .transition(.opacity)
                }
            }
            .padding(.horizontal, 14)
            .padding(.top, 6)

            // Superposición de Pausa
            if viewModel.isPaused {
                pauseOverlay
            }
        }
        .task {
            try? await Task.sleep(for: .seconds(4))
            withAnimation(.easeOut(duration: 0.6)) {
                showTouchHint = false
            }
        }
    }

    private var topHUDHeader: some View {
        HStack(spacing: 10) {
            // Vida + Iniciales + Modo
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    Text(viewModel.initials)
                        .font(.caption.monospaced().weight(.black))
                        .foregroundStyle(RelicarioPalette.swIvory)
                        .lineLimit(1)
                    Text("NV.\(viewModel.snapshot.playerLevel)")
                        .font(.caption2.monospaced().weight(.black))
                        .lineLimit(1)
                        .padding(.horizontal, 5)
                        .padding(.vertical, 2)
                        .background(RelicarioPalette.swGold.opacity(0.22))
                        .foregroundStyle(RelicarioPalette.swGold)
                        .clipShape(Capsule())
                    Text(viewModel.mode.shortBadge)
                        .font(.caption2.monospaced().weight(.bold))
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(viewModel.mode.accentColor.opacity(0.22))
                        .foregroundStyle(viewModel.mode.accentColor)
                        .clipShape(Capsule())
                }

                // Barra de vida
                HStack(spacing: 6) {
                    GeometryReader { geo in
                        let ratio = CGFloat(viewModel.snapshot.hp) / CGFloat(max(1, viewModel.snapshot.maxHP))
                        ZStack(alignment: .leading) {
                            RoundedRectangle(cornerRadius: 4)
                                .fill(Color.white.opacity(0.12))
                            RoundedRectangle(cornerRadius: 4)
                                .fill(ratio <= 0.30 ? RelicarioPalette.swVermilion : RelicarioPalette.swGraceJade)
                                .frame(width: max(0, geo.size.width * ratio))
                                .animation(.easeOut(duration: 0.12), value: viewModel.snapshot.hp)
                        }
                    }
                    .frame(width: 84, height: 9)

                    Text("\(viewModel.snapshot.hp)")
                        .font(.caption.monospacedDigit().weight(.bold))
                        .foregroundStyle(viewModel.snapshot.hp <= 30 ? RelicarioPalette.swVermilion : RelicarioPalette.swIvory)
                }
            }
            .allowsHitTesting(false)

            Spacer()

            // Temporizador cuenta atrás (60s)
            VStack(spacing: 1) {
                Text("TIEMPO")
                    .font(.system(size: 9, weight: .bold, design: .monospaced))
                    .foregroundStyle(RelicarioPalette.swOldBone.opacity(0.75))
                Text(formattedTimer)
                    .font(.system(size: 24, weight: .black, design: .monospaced))
                    .monospacedDigit()
                    .foregroundStyle(viewModel.snapshot.timeRemaining <= 10 ? RelicarioPalette.swVermilion : RelicarioPalette.swIvory)
            }
            .allowsHitTesting(false)

            Spacer()

            // Contador de bajas + Botón Pausa
            HStack(spacing: 8) {
                VStack(alignment: .trailing, spacing: 1) {
                    Text("BAJAS")
                        .font(.system(size: 9, weight: .bold, design: .monospaced))
                        .foregroundStyle(RelicarioPalette.swOldBone.opacity(0.75))
                    Text("\(viewModel.snapshot.kills)")
                        .font(.headline.monospacedDigit().weight(.black))
                        .foregroundStyle(RelicarioPalette.swIvory)
                }
                .allowsHitTesting(false)

                Button(action: { viewModel.togglePause() }) {
                    Image(systemName: viewModel.isPaused ? "play.fill" : "pause.fill")
                        .font(.caption.weight(.bold))
                        .frame(width: 32, height: 32)
                        .background(Color.black.opacity(0.55))
                        .foregroundStyle(RelicarioPalette.swIvory)
                        .overlay(Circle().stroke(Color.white.opacity(0.22), lineWidth: 1))
                        .clipShape(Circle())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background {
            RoundedRectangle(cornerRadius: 12)
                .fill(Color.black.opacity(0.62))
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(Color.white.opacity(0.12), lineWidth: 1)
                )
                .allowsHitTesting(false)
        }
    }

    private var stressDirectorPanel: some View {
        let stress = Int(viewModel.snapshot.stressIndex.rounded())
        let tier = viewModel.snapshot.stressTier

        return VStack(spacing: 6) {
            HStack(spacing: 8) {
                Text("ÍNDICE DE ESTRÉS")
                    .font(.caption2.monospaced().weight(.bold))
                    .foregroundStyle(RelicarioPalette.swOldBone)

                Text(tier.label)
                    .font(.caption2.monospaced().weight(.black))
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(tier.color.opacity(0.20))
                    .foregroundStyle(tier.color)
                    .clipShape(Capsule())

                Spacer()

                Text("\(stress) %")
                    .font(.subheadline.monospacedDigit().weight(.black))
                    .foregroundStyle(tier.color)
            }

            GeometryReader { geo in
                let ratio = CGFloat(min(100, max(0, viewModel.snapshot.stressIndex))) / 100.0
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 4)
                        .fill(Color.white.opacity(0.10))
                    RoundedRectangle(cornerRadius: 4)
                        .fill(tier.color)
                        .frame(width: max(4, geo.size.width * ratio))
                        .animation(.easeOut(duration: 0.10), value: stress)
                }
            }
            .frame(height: 7)

            HStack(spacing: 6) {
                Circle()
                    .fill(viewModel.mode == .director2026 ? tier.color : RelicarioPalette.swOldBone.opacity(0.6))
                    .frame(width: 7, height: 7)
                Text(viewModel.snapshot.directorMessage)
                    .font(.caption.monospaced().weight(.semibold))
                    .foregroundStyle(RelicarioPalette.swIvory)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                Spacer()
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(Color.black.opacity(0.66))
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(
                    viewModel.snapshot.isInterventionActive ? tier.color.opacity(0.55) : Color.white.opacity(0.12),
                    lineWidth: viewModel.snapshot.isInterventionActive ? 1.4 : 1.0
                )
        )
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .allowsHitTesting(false)
    }

    private var pauseOverlay: some View {
        ZStack {
            Color.black.opacity(0.72)
                .ignoresSafeArea()

            VStack(spacing: 14) {
                Text("EXPERIMENTO EN PAUSA")
                    .font(.title3.monospaced().weight(.black))
                    .foregroundStyle(RelicarioPalette.swIvory)

                Text("\(viewModel.initials) · \(viewModel.mode.displayTitle)")
                    .font(.caption)
                    .foregroundStyle(RelicarioPalette.swOldBone)

                Button(action: { viewModel.togglePause() }) {
                    Text("REANUDAR")
                        .font(.headline.monospaced().weight(.bold))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(RelicarioPalette.swGraceJade)
                        .foregroundStyle(Color.black)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                }
                .buttonStyle(.plain)

                Button(action: { viewModel.abortRun() }) {
                    Text("FINALIZAR Y REGISTRAR")
                        .font(.subheadline.monospaced().weight(.bold))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 11)
                        .background(RelicarioPalette.swVermilion.opacity(0.22))
                        .foregroundStyle(RelicarioPalette.swVermilion)
                        .overlay(
                            RoundedRectangle(cornerRadius: 10)
                                .stroke(RelicarioPalette.swVermilion.opacity(0.6), lineWidth: 1)
                        )
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                }
                .buttonStyle(.plain)
            }
            .padding(20)
            .frame(maxWidth: 300)
            .background(RelicarioPalette.swCardBG)
            .overlay(
                RoundedRectangle(cornerRadius: 16)
                    .stroke(RelicarioPalette.swCardBorder, lineWidth: 1.4)
            )
            .clipShape(RoundedRectangle(cornerRadius: 16))
        }
    }

    private var formattedTimer: String {
        let t = max(0, viewModel.snapshot.timeRemaining)
        if t < 9.95 {
            return String(format: "%.1fs", t)
        }
        return "\(Int(ceil(t)))s"
    }
}
