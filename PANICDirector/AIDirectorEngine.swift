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

// MARK: - Motor 1985: Reglas Fijas Rígidas (Ciego al jugador, escalado continuo)

final class Classic1985Engine: WaveDirectorProtocol {
    private var nextScheduledMedkitTime: TimeInterval = 9.0
    private var medkitMsgTimer: TimeInterval = 0.0
    private var lastMedkitSecond: Int = 9

    func reset() {
        nextScheduledMedkitTime = 9.0
        medkitMsgTimer = 0.0
        lastMedkitSecond = 9
    }

    func evaluate(input: WaveDirectorInput) -> WaveDirective {
        let dt = min(max(input.dt, 0.0), 0.1)
        let t = input.elapsedTime
        let progress = min(1.0, max(0.0, t / 60.0))
        medkitMsgTimer = max(0.0, medkitMsgTimer - dt)

        // Curas fijas cada 9s (9s, 18s, 27s, 36s, 45s, 54s) sin leer vida ni estrés
        var shouldDropFixedMedkit = false
        if t >= nextScheduledMedkitTime && nextScheduledMedkitTime <= 55.0 {
            let scheduledSec = Int(nextScheduledMedkitTime.rounded())
            nextScheduledMedkitTime += 9.0
            if input.activeMedkitCount < 3 {
                shouldDropFixedMedkit = true
                lastMedkitSecond = scheduledSec
                medkitMsgTimer = 1.35
            }
        }

        // Progresión matemática estrictamente creciente con el tiempo (0.60s -> 0.133s, 24 -> 74 enemigos, 1.08x -> 1.68x)
        let interval = 0.60 / (1.0 + 3.5 * progress)
        let maxEnemies = 24 + Int(50.0 * progress)
        let speedMultiplier: CGFloat = 1.08 + CGFloat(0.60 * progress)

        let swarmW = max(0.38, 0.74 - 0.36 * progress)
        let tankW = 0.20 + 0.11 * progress
        let stalkerW = 0.06 + 0.25 * progress

        let msg: String
        if medkitMsgTimer > 0 {
            msg = "Regla fija [\(lastMedkitSecond)s] → Botiquín programado"
        } else if t < 15.0 {
            msg = "Regla fija [0-15s] → Escalamiento continuo"
        } else if t < 30.0 {
            msg = "Regla fija [15-30s] → Mártires acelerando"
        } else if t < 45.0 {
            msg = "Regla fija [30-45s] → Asedio en aumento"
        } else {
            msg = "Regla fija [45-60s] → Enjambre implacable"
        }

        return WaveDirective(
            spawnInterval: interval,
            maxActiveEnemies: maxEnemies,
            enemySpeedMultiplier: speedMultiplier,
            swarmWeight: swarmW,
            tankWeight: tankW,
            stalkerWeight: stalkerW,
            safeEscapeCenterAngle: nil,
            safeEscapeHalfConeRadians: 0,
            suppressSimultaneousLunges: false,
            spawnEmergencyMedkit: shouldDropFixedMedkit,
            medkitBiasAhead: false,
            microMessage: msg,
            isInterventionActive: false
        )
    }
}

// MARK: - Motor 2026: IA Directora Adaptativa (Presión Monotónica + Táctica de Estrés)

final class Adaptive2026Director: WaveDirectorProtocol {
    private var timeSinceLastMedkit: TimeInterval = 2.0
    private var messageHoldTimer: TimeInterval = 0.0
    private var currentMessage: String = "IA activa → Calibrando presión"
    private var currentState: DirectorRegime = .optimalFlow

    // Trinquete monotónico: la dificultad jamás retrocede durante la partida
    private var hardestSpawnInterval: TimeInterval = 0.41
    private var highestMaxEnemies: Int = 38
    private var highestSpeedMultiplier: CGFloat = 1.12

    private enum DirectorRegime {
        case lowStressPush
        case optimalFlow
        case highStressRelief
        case emergencyRescue
    }

    func reset() {
        timeSinceLastMedkit = 2.0
        messageHoldTimer = 0.0
        currentMessage = "IA activa → Calibrando presión"
        currentState = .optimalFlow
        hardestSpawnInterval = 0.41
        highestMaxEnemies = 38
        highestSpeedMultiplier = 1.12
    }

    func evaluate(input: WaveDirectorInput) -> WaveDirective {
        let dt = min(max(input.dt, 0.0), 0.1)
        timeSinceLastMedkit += dt
        messageHoldTimer = max(0.0, messageHoldTimer - dt)

        let stress = input.stressIndex
        let hp = input.playerHPNormalized
        let t = input.elapsedTime
        let progress = min(1.0, max(0.0, t / 60.0))

        let moveMag = hypot(input.playerVelocity.dx, input.playerVelocity.dy)
        let escapeAngle: CGFloat? = moveMag > 12.0
            ? atan2(input.playerVelocity.dy, input.playerVelocity.dx)
            : nil

        // Histéresis para evitar cambios nerviosos de estado
        let targetRegime: DirectorRegime
        if stress >= 88.0 || hp <= 0.28 {
            targetRegime = .emergencyRescue
        } else if stress >= 68.0 || (currentState == .emergencyRescue && stress >= 62.0) {
            targetRegime = .highStressRelief
        } else if stress < 38.0 || (currentState == .lowStressPush && stress < 45.0) {
            targetRegime = .lowStressPush
        } else {
            targetRegime = .optimalFlow
        }

        let regimeChanged = targetRegime != currentState
        currentState = targetRegime

        // Decisión táctica frecuente de Gotas de Gracia (sin frenar la presión enemiga)
        var dropMedkit = false
        let needsCriticalSave = (hp <= 0.44)
        let needsTacticalHeal = (hp <= 0.74 && stress >= 45.0) || (hp <= 0.60)
        let needsFlowSustain = (t >= 9.0 && hp <= 0.88)

        let emergencyReady = needsCriticalSave && timeSinceLastMedkit >= 3.4
        let tacticalReady = needsTacticalHeal && timeSinceLastMedkit >= 4.8
        let sustainReady = needsFlowSustain && timeSinceLastMedkit >= 6.4

        if input.activeMedkitCount < 3 && (emergencyReady || tacticalReady || sustainReady) {
            dropMedkit = true
            timeSinceLastMedkit = 0.0
        }

        // Suelo progresivo con el tiempo (parte en el nivel actual y sube sin parar hasta 60s)
        let timeBaseInterval = 0.41 / (1.0 + 1.56 * progress)
        let timeBaseMaxEnemies = 38 + Int((30.0 * progress).rounded())
        let timeBaseSpeed: CGFloat = 1.12 + CGFloat(0.46 * progress)

        let candidateInterval: TimeInterval
        let candidateMaxEnemies: Int
        let candidateSpeed: CGFloat
        let swarmW: Double
        let tankW: Double
        let stalkerW: Double
        let safeAngle: CGFloat?
        let safeHalfCone: CGFloat
        let suppressLunges: Bool
        let interventionActive: Bool

        switch currentState {
        case .emergencyRescue:
            // No reduce la dificultad actual: ayuda tácticamente abriendo corredor y soltando cura
            candidateInterval = timeBaseInterval
            candidateMaxEnemies = timeBaseMaxEnemies
            candidateSpeed = timeBaseSpeed
            swarmW = max(0.46, 0.70 - 0.24 * progress)
            tankW = 0.18 + 0.08 * progress
            stalkerW = 0.12 + 0.16 * progress
            safeAngle = escapeAngle
            safeHalfCone = .pi * 0.25
            suppressLunges = true
            interventionActive = true
            let msg = dropMedkit
                ? "Jugador al límite → Cura de emergencia"
                : "Presión crítica → Corredor de escape"
            updateMessage(msg, force: dropMedkit || regimeChanged)

        case .highStressRelief:
            // Mantiene el ritmo ascendente abriendo ángulo de evasión y entregando botiquín en ruta
            candidateInterval = timeBaseInterval
            candidateMaxEnemies = timeBaseMaxEnemies
            candidateSpeed = timeBaseSpeed
            swarmW = max(0.42, 0.62 - 0.20 * progress)
            tankW = 0.22 + 0.08 * progress
            stalkerW = 0.16 + 0.12 * progress
            safeAngle = escapeAngle
            safeHalfCone = .pi * 0.20
            suppressLunges = true
            interventionActive = true
            let msg: String
            if dropMedkit {
                msg = "Estrés alto → Botiquín en ruta"
            } else if escapeAngle != nil {
                msg = "Estrés alto → Brecha táctica activa"
            } else {
                msg = "Estrés alto → Presión sostenida"
            }
            updateMessage(msg, force: dropMedkit || regimeChanged)

        case .lowStressPush:
            // El estrés bajo inyecta aceleración permanente nunca inferior a 0.26s / 46 / 1.28x
            candidateInterval = max(0.12, min(0.26 * (1.0 - 0.35 * progress), timeBaseInterval * 0.74))
            candidateMaxEnemies = max(46 + Int((16.0 * progress).rounded()), timeBaseMaxEnemies + 7)
            candidateSpeed = max(1.28 + CGFloat(0.32 * progress), timeBaseSpeed + 0.13)
            swarmW = 0.40
            tankW = 0.30
            stalkerW = t > 4.0 ? 0.30 : 0.14
            safeAngle = nil
            safeHalfCone = 0
            suppressLunges = false
            interventionActive = true
            let msg: String
            if dropMedkit {
                msg = "Desgaste detectado → Gota de Gracia"
            } else if t > 8.0 {
                msg = "Estrés bajo → Escalamiento letal"
            } else {
                msg = "Ritmo cómodo → Acelerando amenaza"
            }
            updateMessage(msg, force: dropMedkit || regimeChanged)

        case .optimalFlow:
            let isClimax = t >= 42.0
            candidateInterval = timeBaseInterval * (isClimax ? 0.90 : 1.0)
            candidateMaxEnemies = timeBaseMaxEnemies + (isClimax ? 4 : 0)
            candidateSpeed = timeBaseSpeed + (isClimax ? 0.05 : 0.0)
            swarmW = max(0.38, 0.52 - 0.14 * progress)
            tankW = 0.26 + 0.06 * progress
            stalkerW = t > 5.0 ? (0.22 + 0.08 * progress) : 0.12
            safeAngle = nil
            safeHalfCone = 0
            suppressLunges = false
            interventionActive = isClimax || dropMedkit
            let msg: String
            if dropMedkit {
                msg = "Ritmo intenso → Gota de Gracia"
            } else if isClimax {
                msg = "Clímax final → Presión máxima"
            } else {
                msg = "Tensión óptima → Escalando oleada"
            }
            updateMessage(msg, force: dropMedkit || regimeChanged)
        }

        // Aplicar trinquete monotónico: nunca baja la cadencia, el tope ni la velocidad ya alcanzados
        hardestSpawnInterval = min(hardestSpawnInterval, candidateInterval)
        highestMaxEnemies = max(highestMaxEnemies, candidateMaxEnemies)
        highestSpeedMultiplier = max(highestSpeedMultiplier, candidateSpeed)

        return WaveDirective(
            spawnInterval: hardestSpawnInterval,
            maxActiveEnemies: highestMaxEnemies,
            enemySpeedMultiplier: highestSpeedMultiplier,
            swarmWeight: swarmW,
            tankWeight: tankW,
            stalkerWeight: stalkerW,
            safeEscapeCenterAngle: safeAngle,
            safeEscapeHalfConeRadians: safeHalfCone,
            suppressSimultaneousLunges: suppressLunges,
            spawnEmergencyMedkit: dropMedkit,
            medkitBiasAhead: true,
            microMessage: currentMessage,
            isInterventionActive: interventionActive
        )
    }

    private func updateMessage(_ next: String, force: Bool) {
        if force || messageHoldTimer <= 0 {
            currentMessage = next
            messageHoldTimer = 1.55
        }
    }
}

// MARK: - Motor Híbrido (1985 × 2026): Reloj Rígido + IA Directora Monotónica

final class HybridMixDirector: WaveDirectorProtocol {
    private let fixed1985 = Classic1985Engine()
    private let adaptive2026 = Adaptive2026Director()
    private var messageHoldTimer: TimeInterval = 0.0
    private var currentMessage: String = "Mix 85×26 → Reloj fijo + IA"
    private var wasInClockSurge = false
    private var hybridMedkitGapTimer: TimeInterval = 2.0

    // Trinquete monotónico: cada ráfaga cronometrada consolida el nuevo piso de dificultad
    private var hardestSpawnInterval: TimeInterval = 0.41
    private var highestMaxEnemies: Int = 38
    private var highestSpeedMultiplier: CGFloat = 1.15

    func reset() {
        fixed1985.reset()
        adaptive2026.reset()
        messageHoldTimer = 0.0
        currentMessage = "Mix 85×26 → Reloj fijo + IA"
        wasInClockSurge = false
        hybridMedkitGapTimer = 2.0
        hardestSpawnInterval = 0.41
        highestMaxEnemies = 38
        highestSpeedMultiplier = 1.15
    }

    func evaluate(input: WaveDirectorInput) -> WaveDirective {
        let dt = min(max(input.dt, 0.0), 0.1)
        messageHoldTimer = max(0.0, messageHoldTimer - dt)
        hybridMedkitGapTimer += dt

        let baseFixed = fixed1985.evaluate(input: input)
        let adaptive = adaptive2026.evaluate(input: input)
        let t = input.elapsedTime
        let progress = min(1.0, max(0.0, t / 60.0))
        let stress = input.stressIndex

        // Pulsos fijos del reloj 1985 cada 15s (15s, 30s, 45s) durante 3.2s
        let inClockSurge = (t >= 14.5 && t <= 17.7)
            || (t >= 29.5 && t <= 32.7)
            || (t >= 44.5 && t <= 47.7)
        let prevInSurge = wasInClockSurge
        let surgeChanged = inClockSurge != prevInSurge
        let surgeJustEnded = prevInSurge && !inClockSurge
        wasInClockSurge = inClockSurge

        let timeFloorInterval = 0.41 / (1.0 + 2.42 * progress)
        let timeFloorEnemies = 38 + Int((36.0 * progress).rounded())
        let timeFloorSpeed: CGFloat = 1.15 + CGFloat(0.55 * progress)

        let rawInterval: TimeInterval
        if inClockSurge {
            rawInterval = min(timeFloorInterval, min(baseFixed.spawnInterval, adaptive.spawnInterval)) * 0.72
        } else if stress < 42.0 {
            rawInterval = min(timeFloorInterval, min(baseFixed.spawnInterval, adaptive.spawnInterval)) * 0.90
        } else {
            rawInterval = min(timeFloorInterval, baseFixed.spawnInterval * 0.45 + adaptive.spawnInterval * 0.55)
        }
        let candidateInterval = max(0.11, rawInterval)

        let candidateMaxEnemies = max(
            timeFloorEnemies,
            max(baseFixed.maxActiveEnemies, adaptive.maxActiveEnemies)
        ) + (inClockSurge ? 6 : 2)

        let speedBase = max(
            timeFloorSpeed,
            baseFixed.enemySpeedMultiplier * 0.48 + adaptive.enemySpeedMultiplier * 0.52
        )
        let candidateSpeed = speedBase + (inClockSurge ? 0.10 : 0.03)

        hardestSpawnInterval = min(hardestSpawnInterval, candidateInterval)
        highestMaxEnemies = max(highestMaxEnemies, candidateMaxEnemies)
        highestSpeedMultiplier = max(highestSpeedMultiplier, candidateSpeed)

        // Las ráfagas cronometradas 1985 no perdonan; fuera de ellas la IA 2026 abre brecha parcial sin bajar el ritmo
        let partialEscapeAngle: CGFloat? = (!inClockSurge && (stress >= 72.0 || input.playerHPNormalized <= 0.30))
            ? adaptive.safeEscapeCenterAngle
            : nil
        let partialHalfCone: CGFloat = partialEscapeAngle != nil ? (.pi * 0.17) : 0.0
        let suppressLunges = !inClockSurge && adaptive.suppressSimultaneousLunges

        // Combina botiquines del reloj 1985, curas reactivas 2026 y recompensa post-ráfaga sin apilar dos juntos
        let fixedTrigger = baseFixed.spawnEmergencyMedkit && input.playerHPNormalized <= 0.94
        let postSurgeTrigger = surgeJustEnded && input.playerHPNormalized <= 0.88
        let wantsMedkit = adaptive.spawnEmergencyMedkit || fixedTrigger || postSurgeTrigger
        let minGap: TimeInterval = input.playerHPNormalized <= 0.42 ? 1.5 : 2.3
        let dropMedkit = wantsMedkit && input.activeMedkitCount < 3 && hybridMedkitGapTimer >= minGap
        if dropMedkit {
            hybridMedkitGapTimer = 0.0
        }

        let nextMsg: String
        var forceMsg = surgeChanged || dropMedkit
        if dropMedkit {
            nextMsg = "Mix 85×26 → Cura táctica en oleada"
        } else if inClockSurge {
            nextMsg = "Mix 85×26 → ¡RÁFAGA FIJA 1985!"
            forceMsg = true
        } else if stress < 38.0 {
            nextMsg = "Mix 85×26 → Doble presión (+horda)"
        } else if partialEscapeAngle != nil {
            nextMsg = "Mix 85×26 → Brecha parcial 2026"
        } else {
            nextMsg = "Mix 85×26 → Presión creciente"
        }

        if forceMsg || messageHoldTimer <= 0 {
            currentMessage = nextMsg
            messageHoldTimer = 1.35
        }

        let swarmW = baseFixed.swarmWeight * 0.5 + adaptive.swarmWeight * 0.5
        let tankW = baseFixed.tankWeight * 0.5 + adaptive.tankWeight * 0.5 + (inClockSurge ? 0.05 : 0.0)
        let stalkerW = baseFixed.stalkerWeight * 0.5 + adaptive.stalkerWeight * 0.5 + (inClockSurge ? 0.05 : 0.0)

        return WaveDirective(
            spawnInterval: hardestSpawnInterval,
            maxActiveEnemies: highestMaxEnemies,
            enemySpeedMultiplier: highestSpeedMultiplier,
            swarmWeight: swarmW,
            tankWeight: tankW,
            stalkerWeight: stalkerW,
            safeEscapeCenterAngle: partialEscapeAngle,
            safeEscapeHalfConeRadians: partialHalfCone,
            suppressSimultaneousLunges: suppressLunges,
            spawnEmergencyMedkit: dropMedkit,
            medkitBiasAhead: adaptive.spawnEmergencyMedkit || input.playerHPNormalized < 0.78,
            microMessage: currentMessage,
            isInterventionActive: inClockSurge || dropMedkit || adaptive.isInterventionActive
        )
    }
}
