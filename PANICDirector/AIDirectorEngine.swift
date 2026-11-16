import CoreGraphics
import Foundation

// MARK: - Medidor en Vivo del Índice de Estrés (0-100 %)

struct StressSampleInput {
    let dt: TimeInterval
    let moveVector: CGVector
    let playerHPNormalized: Double
    let nearestEnemyDistance: CGFloat
    let enemiesInsideDangerRing: Int
    let enemiesInsidePanicRing: Int
    let justTookDamage: Bool
}

final class StressMetricsTracker {
    private(set) var currentStress: Double = 18.0
    private(set) var peakStress: Double = 18.0

    private var smoothedMoveDir: CGVector = .zero
    private var reversalScore: Double = 0.0
    private var reversalCooldown: TimeInterval = 0.0
    private var traumaScore: Double = 0.0

    private var stressIntegral: Double = 0.0
    private var elapsedSampleTime: TimeInterval = 0.0

    var averageStress: Double {
        guard elapsedSampleTime > 0.05 else { return currentStress }
        return min(100.0, max(0.0, stressIntegral / elapsedSampleTime))
    }

    var currentTier: StressTier {
        StressTier.from(index: currentStress)
    }

    func reset() {
        currentStress = 18.0
        peakStress = 18.0
        smoothedMoveDir = .zero
        reversalScore = 0.0
        reversalCooldown = 0.0
        traumaScore = 0.0
        stressIntegral = 0.0
        elapsedSampleTime = 0.0
    }

    func update(with input: StressSampleInput) -> Double {
        let dt = min(max(input.dt, 0.0), 0.1)
        guard dt > 0 else { return currentStress }

        // 1. Cambios bruscos de dirección en el joystick flotante
        reversalCooldown = max(0.0, reversalCooldown - dt)
        let moveMag = hypot(input.moveVector.dx, input.moveVector.dy)
        if moveMag > 0.25 {
            let norm = CGVector(dx: input.moveVector.dx / moveMag, dy: input.moveVector.dy / moveMag)
            let smoothMag = hypot(smoothedMoveDir.dx, smoothedMoveDir.dy)
            if smoothMag > 0.25 {
                let prevNorm = CGVector(dx: smoothedMoveDir.dx / smoothMag, dy: smoothedMoveDir.dy / smoothMag)
                let dot = norm.dx * prevNorm.dx + norm.dy * prevNorm.dy
                // Giro brusco (> ~78 grados)
                if dot < 0.20 && reversalCooldown <= 0 {
                    let sharpness = min(1.0, (0.20 - dot) / 1.20)
                    reversalScore = min(22.0, reversalScore + 6.5 + sharpness * 5.5)
                    reversalCooldown = 0.20
                }
            }
            let blend = min(1.0, dt * 6.5)
            smoothedMoveDir = CGVector(
                dx: smoothedMoveDir.dx + (norm.dx - smoothedMoveDir.dx) * blend,
                dy: smoothedMoveDir.dy + (norm.dy - smoothedMoveDir.dy) * blend
            )
        } else {
            let decay = max(0.0, 1.0 - dt * 3.0)
            smoothedMoveDir = CGVector(dx: smoothedMoveDir.dx * decay, dy: smoothedMoveDir.dy * decay)
        }
        reversalScore *= exp(-dt * 0.95)

        // 2. Trauma reciente por daño recibido
        if input.justTookDamage {
            traumaScore = min(28.0, traumaScore + 22.0)
        }
        traumaScore *= exp(-dt * 0.55)

        // 3. Presión espacial por cercanía de criaturas
        let clampedDist = max(0.0, min(180.0, Double(input.nearestEnemyDistance)))
        let proximityTerm = (1.0 - (clampedDist / 180.0)) * 22.0
        let dangerRingTerm = min(18.0, Double(input.enemiesInsideDangerRing) * 3.6)
        let panicRingTerm = min(20.0, Double(input.enemiesInsidePanicRing) * 8.5)
        let proximityScore = min(44.0, proximityTerm + dangerRingTerm + panicRingTerm)

        // 4. Vulnerabilidad por vida restante
        let missingHP = max(0.0, min(1.0, 1.0 - input.playerHPNormalized))
        let lowHPScore = pow(missingHP, 1.35) * 36.0

        let targetStress = min(100.0, max(6.0, proximityScore + lowHPScore + reversalScore + traumaScore))

        // Suavizado asimétrico: sube ágil ante peligro, baja con naturalidad al despejar
        let rate = targetStress > currentStress ? 4.8 : 2.1
        currentStress += (targetStress - currentStress) * min(1.0, dt * rate)
        currentStress = min(100.0, max(0.0, currentStress))
        peakStress = max(peakStress, currentStress)

        stressIntegral += currentStress * dt
        elapsedSampleTime += dt

        return currentStress
    }
}

// MARK: - Protocolo y Directivas de Oleada

struct WaveDirectorInput {
    let dt: TimeInterval
    let elapsedTime: TimeInterval
    let stressIndex: Double
    let stressTier: StressTier
    let playerHPNormalized: Double
    let playerVelocity: CGVector
    let activeEnemyCount: Int
    let activeMedkitCount: Int
}

struct WaveDirective {
    let spawnInterval: TimeInterval
    let maxActiveEnemies: Int
    let enemySpeedMultiplier: CGFloat
    let swarmWeight: Double
    let tankWeight: Double
    let stalkerWeight: Double
    let safeEscapeCenterAngle: CGFloat?
    let safeEscapeHalfConeRadians: CGFloat
    let suppressSimultaneousLunges: Bool
    let spawnEmergencyMedkit: Bool
    let medkitBiasAhead: Bool
    let microMessage: String
    let isInterventionActive: Bool
}

protocol WaveDirectorProtocol: AnyObject {
    func reset()
    func evaluate(input: WaveDirectorInput) -> WaveDirective
}

// MARK: - Motor 1985: Reglas Fijas Rígidas (Ciego al jugador)

final class Classic1985Engine: WaveDirectorProtocol {
    private var didDropScheduledMedkit = false

    func reset() {
        didDropScheduledMedkit = false
    }

    func evaluate(input: WaveDirectorInput) -> WaveDirective {
        let t = input.elapsedTime

        // Cura fija únicamente a los 30s sin importar la vida ni el estrés del jugador
        var shouldDropFixedMedkit = false
        if t >= 30.0 && !didDropScheduledMedkit {
            didDropScheduledMedkit = true
            shouldDropFixedMedkit = true
        }

        if t < 15.0 {
            return WaveDirective(
                spawnInterval: 0.78,
                maxActiveEnemies: 18,
                enemySpeedMultiplier: 1.00,
                swarmWeight: 0.82,
                tankWeight: 0.18,
                stalkerWeight: 0.00,
                safeEscapeCenterAngle: nil,
                safeEscapeHalfConeRadians: 0,
                suppressSimultaneousLunges: false,
                spawnEmergencyMedkit: shouldDropFixedMedkit,
                medkitBiasAhead: false,
                microMessage: "Regla fija [0-15s] → Oleada inicial",
                isInterventionActive: false
            )
        } else if t < 32.0 {
            let msg = shouldDropFixedMedkit
                ? "Regla fija [30s] → Botiquín programado"
                : "Regla fija [15-32s] → Añadiendo Mártires"
            return WaveDirective(
                spawnInterval: 0.54,
                maxActiveEnemies: 28,
                enemySpeedMultiplier: 1.12,
                swarmWeight: 0.62,
                tankWeight: 0.22,
                stalkerWeight: 0.16,
                safeEscapeCenterAngle: nil,
                safeEscapeHalfConeRadians: 0,
                suppressSimultaneousLunges: false,
                spawnEmergencyMedkit: shouldDropFixedMedkit,
                medkitBiasAhead: false,
                microMessage: msg,
                isInterventionActive: false
            )
        } else if t < 48.0 {
            return WaveDirective(
                spawnInterval: 0.38,
                maxActiveEnemies: 38,
                enemySpeedMultiplier: 1.25,
                swarmWeight: 0.52,
                tankWeight: 0.26,
                stalkerWeight: 0.22,
                safeEscapeCenterAngle: nil,
                safeEscapeHalfConeRadians: 0,
                suppressSimultaneousLunges: false,
                spawnEmergencyMedkit: shouldDropFixedMedkit,
                medkitBiasAhead: false,
                microMessage: "Regla fija [32-48s] → Estrés ignorado",
                isInterventionActive: false
            )
        } else {
            return WaveDirective(
                spawnInterval: 0.27,
                maxActiveEnemies: 46,
                enemySpeedMultiplier: 1.38,
                swarmWeight: 0.48,
                tankWeight: 0.28,
                stalkerWeight: 0.24,
                safeEscapeCenterAngle: nil,
                safeEscapeHalfConeRadians: 0,
                suppressSimultaneousLunges: false,
                spawnEmergencyMedkit: shouldDropFixedMedkit,
                medkitBiasAhead: false,
                microMessage: "Regla fija [48-60s] → Saturación ciega",
                isInterventionActive: false
            )
        }
    }
}

// MARK: - Motor 2026: IA Directora Adaptativa (Algoritmo de Retención)

final class Adaptive2026Director: WaveDirectorProtocol {
    private var medkitCooldown: TimeInterval = 4.0
    private var messageHoldTimer: TimeInterval = 0.0
    private var currentMessage: String = "IA activa → Calibrando presión"
    private var currentState: DirectorRegime = .optimalFlow
    private var totalMedkitsGranted: Int = 0

    private enum DirectorRegime {
        case lowStressPush
        case optimalFlow
        case highStressRelief
        case emergencyRescue
    }

    func reset() {
        medkitCooldown = 4.0
        messageHoldTimer = 0.0
        currentMessage = "IA activa → Calibrando presión"
        currentState = .optimalFlow
        totalMedkitsGranted = 0
    }

    func evaluate(input: WaveDirectorInput) -> WaveDirective {
        let dt = min(max(input.dt, 0.0), 0.1)
        medkitCooldown = max(0.0, medkitCooldown - dt)
        messageHoldTimer = max(0.0, messageHoldTimer - dt)

        let stress = input.stressIndex
        let hp = input.playerHPNormalized
        let t = input.elapsedTime

        let moveMag = hypot(input.playerVelocity.dx, input.playerVelocity.dy)
        let escapeAngle: CGFloat? = moveMag > 12.0
            ? atan2(input.playerVelocity.dy, input.playerVelocity.dx)
            : nil

        // Histéresis para evitar cambios nerviosos de estado
        let targetRegime: DirectorRegime
        if stress >= 88.0 || hp <= 0.30 {
            targetRegime = .emergencyRescue
        } else if stress >= 68.0 || (currentState == .emergencyRescue && stress >= 60.0) {
            targetRegime = .highStressRelief
        } else if stress < 35.0 || (currentState == .lowStressPush && stress < 42.0) {
            targetRegime = .lowStressPush
        } else {
            targetRegime = .optimalFlow
        }

        let regimeChanged = targetRegime != currentState
        currentState = targetRegime

        // Decisión táctica de Gota de Gracia (botiquín de emergencia)
        var dropMedkit = false
        let needsEmergencyHeal = (hp <= 0.34 && stress >= 72.0) || (hp <= 0.25)
        let needsLateRelief = (t >= 38.0 && totalMedkitsGranted == 0 && hp <= 0.65)
        if (needsEmergencyHeal || needsLateRelief) && input.activeMedkitCount == 0 && medkitCooldown <= 0 {
            dropMedkit = true
            medkitCooldown = 9.5
            totalMedkitsGranted += 1
        }

        switch currentState {
        case .emergencyRescue:
            let msg = dropMedkit
                ? "Jugador al límite → Soltando cura"
                : "Presión crítica → Abriendo brecha"
            updateMessage(msg, force: dropMedkit || regimeChanged)
            return WaveDirective(
                spawnInterval: 1.28,
                maxActiveEnemies: 22,
                enemySpeedMultiplier: 0.74,
                swarmWeight: 0.85,
                tankWeight: 0.10,
                stalkerWeight: 0.05,
                safeEscapeCenterAngle: escapeAngle,
                safeEscapeHalfConeRadians: .pi * 0.28, // ~100 grados libres para huir
                suppressSimultaneousLunges: true,
                spawnEmergencyMedkit: dropMedkit,
                medkitBiasAhead: true,
                microMessage: currentMessage,
                isInterventionActive: true
            )

        case .highStressRelief:
            let msg = escapeAngle != nil
                ? "Estrés alto → Abriendo vía de escape"
                : "Estrés alto → Frenando enjambre"
            updateMessage(msg, force: regimeChanged)
            return WaveDirective(
                spawnInterval: 0.90,
                maxActiveEnemies: 28,
                enemySpeedMultiplier: 0.84,
                swarmWeight: 0.72,
                tankWeight: 0.18,
                stalkerWeight: 0.10,
                safeEscapeCenterAngle: escapeAngle,
                safeEscapeHalfConeRadians: .pi * 0.22,
                suppressSimultaneousLunges: true,
                spawnEmergencyMedkit: dropMedkit,
                medkitBiasAhead: true,
                microMessage: currentMessage,
                isInterventionActive: true
            )

        case .lowStressPush:
            let msg: String
            if dropMedkit {
                msg = "Desgaste detectado → Gota de Gracia"
            } else if t > 10.0 {
                msg = "Estrés bajo → Inyectando horda"
            } else {
                msg = "Ritmo cómodo → Acelerando amenaza"
            }
            updateMessage(msg, force: dropMedkit || regimeChanged)
            return WaveDirective(
                spawnInterval: 0.35,
                maxActiveEnemies: 38,
                enemySpeedMultiplier: 1.18,
                swarmWeight: 0.50,
                tankWeight: 0.26,
                stalkerWeight: t > 6.0 ? 0.24 : 0.10,
                safeEscapeCenterAngle: nil,
                safeEscapeHalfConeRadians: 0,
                suppressSimultaneousLunges: false,
                spawnEmergencyMedkit: dropMedkit,
                medkitBiasAhead: false,
                microMessage: currentMessage,
                isInterventionActive: true
            )

        case .optimalFlow:
            let isClimax = t >= 50.0
            let msg: String
            if dropMedkit {
                msg = "Desgaste detectado → Gota de Gracia"
            } else if isClimax {
                msg = "Clímax final → Tensión calibrada"
            } else {
                msg = "Tensión óptima → Manteniendo presión"
            }
            updateMessage(msg, force: dropMedkit || regimeChanged)
            return WaveDirective(
                spawnInterval: isClimax ? 0.42 : 0.52,
                maxActiveEnemies: isClimax ? 36 : 32,
                enemySpeedMultiplier: isClimax ? 1.12 : 1.03,
                swarmWeight: 0.58,
                tankWeight: 0.22,
                stalkerWeight: t > 8.0 ? 0.20 : 0.08,
                safeEscapeCenterAngle: nil,
                safeEscapeHalfConeRadians: 0,
                suppressSimultaneousLunges: false,
                spawnEmergencyMedkit: dropMedkit,
                medkitBiasAhead: true,
                microMessage: currentMessage,
                isInterventionActive: false
            )
        }
    }

    private func updateMessage(_ next: String, force: Bool) {
        if force || messageHoldTimer <= 0 {
            currentMessage = next
            messageHoldTimer = 1.55
        }
    }
}
