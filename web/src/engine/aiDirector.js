// Réplica matemática exacta de AIDirectorEngine.swift:
// StressMetricsTracker, Classic1985Engine, Adaptive2026Director y HybridMixDirector

import { stressTierFromIndex } from './constants.js';

export class StressMetricsTracker {
  constructor() {
    this.reset();
  }

  reset() {
    this.currentStress = 18.0;
    this.peakStress = 18.0;
    this.smoothedMoveDir = { dx: 0.0, dy: 0.0 };
    this.reversalScore = 0.0;
    this.reversalCooldown = 0.0;
    this.traumaScore = 0.0;
    this.stressIntegral = 0.0;
    this.elapsedSampleTime = 0.0;
  }

  get averageStress() {
    if (this.elapsedSampleTime <= 0.05) return this.currentStress;
    return Math.min(100.0, Math.max(0.0, this.stressIntegral / this.elapsedSampleTime));
  }

  get currentTier() {
    return stressTierFromIndex(this.currentStress);
  }

  update(input) {
    const dt = Math.min(Math.max(input.dt, 0.0), 0.1);
    if (dt <= 0) return this.currentStress;

    // 1. Cambios bruscos de dirección
    this.reversalCooldown = Math.max(0.0, this.reversalCooldown - dt);
    const moveMag = Math.hypot(input.moveVector.dx, input.moveVector.dy);
    if (moveMag > 0.25) {
      const norm = {
        dx: input.moveVector.dx / moveMag,
        dy: input.moveVector.dy / moveMag
      };
      const smoothMag = Math.hypot(this.smoothedMoveDir.dx, this.smoothedMoveDir.dy);
      if (smoothMag > 0.25) {
        const prevNorm = {
          dx: this.smoothedMoveDir.dx / smoothMag,
          dy: this.smoothedMoveDir.dy / smoothMag
        };
        const dot = norm.dx * prevNorm.dx + norm.dy * prevNorm.dy;
        // Giro brusco (> ~78 grados)
        if (dot < 0.20 && this.reversalCooldown <= 0) {
          const sharpness = Math.min(1.0, (0.20 - dot) / 1.20);
          this.reversalScore = Math.min(22.0, this.reversalScore + 6.5 + sharpness * 5.5);
          this.reversalCooldown = 0.20;
        }
      }
      const blend = Math.min(1.0, dt * 6.5);
      this.smoothedMoveDir = {
        dx: this.smoothedMoveDir.dx + (norm.dx - this.smoothedMoveDir.dx) * blend,
        dy: this.smoothedMoveDir.dy + (norm.dy - this.smoothedMoveDir.dy) * blend
      };
    } else {
      const decay = Math.max(0.0, 1.0 - dt * 3.0);
      this.smoothedMoveDir = {
        dx: this.smoothedMoveDir.dx * decay,
        dy: this.smoothedMoveDir.dy * decay
      };
    }
    this.reversalScore *= Math.exp(-dt * 0.95);

    // 2. Trauma reciente por daño recibido
    if (input.justTookDamage) {
      this.traumaScore = Math.min(28.0, this.traumaScore + 22.0);
    }
    this.traumaScore *= Math.exp(-dt * 0.55);

    // 3. Presión espacial por cercanía de criaturas
    const clampedDist = Math.max(0.0, Math.min(180.0, input.nearestEnemyDistance));
    const proximityTerm = (1.0 - clampedDist / 180.0) * 22.0;
    const dangerRingTerm = Math.min(18.0, input.enemiesInsideDangerRing * 3.6);
    const panicRingTerm = Math.min(20.0, input.enemiesInsidePanicRing * 8.5);
    const proximityScore = Math.min(44.0, proximityTerm + dangerRingTerm + panicRingTerm);

    // 4. Vulnerabilidad por vida restante
    const missingHP = Math.max(0.0, Math.min(1.0, 1.0 - input.playerHPNormalized));
    const lowHPScore = Math.pow(missingHP, 1.35) * 36.0;

    const targetStress = Math.min(
      100.0,
      Math.max(6.0, proximityScore + lowHPScore + this.reversalScore + this.traumaScore)
    );

    // Suavizado asimétrico: sube ágil ante peligro, baja con naturalidad al despejar
    const rate = targetStress > this.currentStress ? 4.8 : 2.1;
    this.currentStress += (targetStress - this.currentStress) * Math.min(1.0, dt * rate);
    this.currentStress = Math.min(100.0, Math.max(0.0, this.currentStress));
    this.peakStress = Math.max(this.peakStress, this.currentStress);

    this.stressIntegral += this.currentStress * dt;
    this.elapsedSampleTime += dt;

    return this.currentStress;
  }
}

// MARK: - Motor 1985: Reglas Fijas Rígidas (Ciego al jugador, escalado continuo)

export class Classic1985Engine {
  constructor() {
    this.reset();
  }

  reset() {
    this.nextScheduledMedkitTime = 9.0;
    this.medkitMsgTimer = 0.0;
    this.lastMedkitSecond = 9;
  }

  evaluate(input) {
    const dt = Math.min(Math.max(input.dt, 0.0), 0.1);
    const t = input.elapsedTime;
    const progress = Math.min(1.0, Math.max(0.0, t / 60.0));
    this.medkitMsgTimer = Math.max(0.0, this.medkitMsgTimer - dt);

    // Curas fijas cada 9s (9s, 18s, 27s, 36s, 45s, 54s) sin leer vida ni estrés
    let shouldDropFixedMedkit = false;
    if (t >= this.nextScheduledMedkitTime && this.nextScheduledMedkitTime <= 55.0) {
      const scheduledSec = Math.round(this.nextScheduledMedkitTime);
      this.nextScheduledMedkitTime += 9.0;
      if (input.activeMedkitCount < 3) {
        shouldDropFixedMedkit = true;
        this.lastMedkitSecond = scheduledSec;
        this.medkitMsgTimer = 1.35;
      }
    }

    // Progresión matemática estrictamente creciente con el tiempo (0.60s -> 0.133s, 24 -> 74 enemigos, 1.08x -> 1.68x)
    const interval = 0.60 / (1.0 + 3.5 * progress);
    const maxEnemies = 24 + Math.trunc(50.0 * progress);
    const speedMultiplier = 1.08 + 0.60 * progress;

    const swarmW = Math.max(0.38, 0.74 - 0.36 * progress);
    const tankW = 0.20 + 0.11 * progress;
    const stalkerW = 0.06 + 0.25 * progress;

    let msg;
    if (this.medkitMsgTimer > 0) {
      msg = `Regla fija [${this.lastMedkitSecond}s] → Botiquín programado`;
    } else if (t < 15.0) {
      msg = 'Regla fija [0-15s] → Escalamiento continuo';
    } else if (t < 30.0) {
      msg = 'Regla fija [15-30s] → Mártires acelerando';
    } else if (t < 45.0) {
      msg = 'Regla fija [30-45s] → Asedio en aumento';
    } else {
      msg = 'Regla fija [45-60s] → Enjambre implacable';
    }

    return {
      spawnInterval: interval,
      maxActiveEnemies: maxEnemies,
      enemySpeedMultiplier: speedMultiplier,
      swarmWeight: swarmW,
      tankWeight: tankW,
      stalkerWeight: stalkerW,
      safeEscapeCenterAngle: null,
      safeEscapeHalfConeRadians: 0,
      suppressSimultaneousLunges: false,
      spawnEmergencyMedkit: shouldDropFixedMedkit,
      medkitBiasAhead: false,
      microMessage: msg,
      isInterventionActive: false
    };
  }
}

// MARK: - Motor 2026: IA Directora Adaptativa (Presión Monotónica + Táctica de Estrés)

const Regime = {
  LOW_STRESS_PUSH: 'lowStressPush',
  OPTIMAL_FLOW: 'optimalFlow',
  HIGH_STRESS_RELIEF: 'highStressRelief',
  EMERGENCY_RESCUE: 'emergencyRescue'
};

export class Adaptive2026Director {
  constructor() {
    this.reset();
  }

  reset() {
    this.timeSinceLastMedkit = 2.0;
    this.messageHoldTimer = 0.0;
    this.currentMessage = 'IA activa → Calibrando presión';
    this.currentState = Regime.OPTIMAL_FLOW;
    this.hardestSpawnInterval = 0.41;
    this.highestMaxEnemies = 38;
    this.highestSpeedMultiplier = 1.12;
  }

  evaluate(input) {
    const dt = Math.min(Math.max(input.dt, 0.0), 0.1);
    this.timeSinceLastMedkit += dt;
    this.messageHoldTimer = Math.max(0.0, this.messageHoldTimer - dt);

    const stress = input.stressIndex;
    const hp = input.playerHPNormalized;
    const t = input.elapsedTime;
    const progress = Math.min(1.0, Math.max(0.0, t / 60.0));

    const moveMag = Math.hypot(input.playerVelocity.dx, input.playerVelocity.dy);
    const escapeAngle = moveMag > 12.0
      ? Math.atan2(input.playerVelocity.dy, input.playerVelocity.dx)
      : null;

    // Histéresis para evitar cambios nerviosos de estado
    let targetRegime;
    if (stress >= 88.0 || hp <= 0.28) {
      targetRegime = Regime.EMERGENCY_RESCUE;
    } else if (stress >= 68.0 || (this.currentState === Regime.EMERGENCY_RESCUE && stress >= 62.0)) {
      targetRegime = Regime.HIGH_STRESS_RELIEF;
    } else if (stress < 38.0 || (this.currentState === Regime.LOW_STRESS_PUSH && stress < 45.0)) {
      targetRegime = Regime.LOW_STRESS_PUSH;
    } else {
      targetRegime = Regime.OPTIMAL_FLOW;
    }

    const regimeChanged = targetRegime !== this.currentState;
    this.currentState = targetRegime;

    // Decisión táctica frecuente de Gotas de Gracia (sin frenar la presión enemiga)
    let dropMedkit = false;
    const needsCriticalSave = hp <= 0.44;
    const needsTacticalHeal = (hp <= 0.74 && stress >= 45.0) || hp <= 0.60;
    const needsFlowSustain = t >= 9.0 && hp <= 0.88;

    const emergencyReady = needsCriticalSave && this.timeSinceLastMedkit >= 3.4;
    const tacticalReady = needsTacticalHeal && this.timeSinceLastMedkit >= 4.8;
    const sustainReady = needsFlowSustain && this.timeSinceLastMedkit >= 6.4;

    if (input.activeMedkitCount < 3 && (emergencyReady || tacticalReady || sustainReady)) {
      dropMedkit = true;
      this.timeSinceLastMedkit = 0.0;
    }

    // Suelo progresivo con el tiempo
    const timeBaseInterval = 0.41 / (1.0 + 1.56 * progress);
    const timeBaseMaxEnemies = 38 + Math.round(30.0 * progress);
    const timeBaseSpeed = 1.12 + 0.46 * progress;

    let candidateInterval;
    let candidateMaxEnemies;
    let candidateSpeed;
    let swarmW;
    let tankW;
    let stalkerW;
    let safeAngle = null;
    let safeHalfCone = 0;
    let suppressLunges = false;
    let interventionActive = false;

    switch (this.currentState) {
      case Regime.EMERGENCY_RESCUE: {
        candidateInterval = timeBaseInterval;
        candidateMaxEnemies = timeBaseMaxEnemies;
        candidateSpeed = timeBaseSpeed;
        swarmW = Math.max(0.46, 0.70 - 0.24 * progress);
        tankW = 0.18 + 0.08 * progress;
        stalkerW = 0.12 + 0.16 * progress;
        safeAngle = escapeAngle;
        safeHalfCone = Math.PI * 0.25;
        suppressLunges = true;
        interventionActive = true;
        const msg = dropMedkit
          ? 'Jugador al límite → Cura de emergencia'
          : 'Presión crítica → Corredor de escape';
        this.#updateMessage(msg, dropMedkit || regimeChanged);
        break;
      }

      case Regime.HIGH_STRESS_RELIEF: {
        candidateInterval = timeBaseInterval;
        candidateMaxEnemies = timeBaseMaxEnemies;
        candidateSpeed = timeBaseSpeed;
        swarmW = Math.max(0.42, 0.62 - 0.20 * progress);
        tankW = 0.22 + 0.08 * progress;
        stalkerW = 0.16 + 0.12 * progress;
        safeAngle = escapeAngle;
        safeHalfCone = Math.PI * 0.20;
        suppressLunges = true;
        interventionActive = true;
        let msg;
        if (dropMedkit) {
          msg = 'Estrés alto → Botiquín en ruta';
        } else if (escapeAngle !== null) {
          msg = 'Estrés alto → Brecha táctica activa';
        } else {
          msg = 'Estrés alto → Presión sostenida';
        }
        this.#updateMessage(msg, dropMedkit || regimeChanged);
        break;
      }

      case Regime.LOW_STRESS_PUSH: {
        candidateInterval = Math.max(0.12, Math.min(0.26 * (1.0 - 0.35 * progress), timeBaseInterval * 0.74));
        candidateMaxEnemies = Math.max(46 + Math.round(16.0 * progress), timeBaseMaxEnemies + 7);
        candidateSpeed = Math.max(1.28 + 0.32 * progress, timeBaseSpeed + 0.13);
        swarmW = 0.40;
        tankW = 0.30;
        stalkerW = t > 4.0 ? 0.30 : 0.14;
        safeAngle = null;
        safeHalfCone = 0;
        suppressLunges = false;
        interventionActive = true;
        let msg;
        if (dropMedkit) {
          msg = 'Desgaste detectado → Gota de Gracia';
        } else if (t > 8.0) {
          msg = 'Estrés bajo → Escalamiento letal';
        } else {
          msg = 'Ritmo cómodo → Acelerando amenaza';
        }
        this.#updateMessage(msg, dropMedkit || regimeChanged);
        break;
      }

      case Regime.OPTIMAL_FLOW:
      default: {
        const isClimax = t >= 42.0;
        candidateInterval = timeBaseInterval * (isClimax ? 0.90 : 1.0);
        candidateMaxEnemies = timeBaseMaxEnemies + (isClimax ? 4 : 0);
        candidateSpeed = timeBaseSpeed + (isClimax ? 0.05 : 0.0);
        swarmW = Math.max(0.38, 0.52 - 0.14 * progress);
        tankW = 0.26 + 0.06 * progress;
        stalkerW = t > 5.0 ? (0.22 + 0.08 * progress) : 0.12;
        safeAngle = null;
        safeHalfCone = 0;
        suppressLunges = false;
        interventionActive = isClimax || dropMedkit;
        let msg;
        if (dropMedkit) {
          msg = 'Ritmo intenso → Gota de Gracia';
        } else if (isClimax) {
          msg = 'Clímax final → Presión máxima';
        } else {
          msg = 'Tensión óptima → Escalando oleada';
        }
        this.#updateMessage(msg, dropMedkit || regimeChanged);
        break;
      }
    }

    // Trinquete monotónico: nunca retrocede
    this.hardestSpawnInterval = Math.min(this.hardestSpawnInterval, candidateInterval);
    this.highestMaxEnemies = Math.max(this.highestMaxEnemies, candidateMaxEnemies);
    this.highestSpeedMultiplier = Math.max(this.highestSpeedMultiplier, candidateSpeed);

    return {
      spawnInterval: this.hardestSpawnInterval,
      maxActiveEnemies: this.highestMaxEnemies,
      enemySpeedMultiplier: this.highestSpeedMultiplier,
      swarmWeight: swarmW,
      tankWeight: tankW,
      stalkerWeight: stalkerW,
      safeEscapeCenterAngle: safeAngle,
      safeEscapeHalfConeRadians: safeHalfCone,
      suppressSimultaneousLunges: suppressLunges,
      spawnEmergencyMedkit: dropMedkit,
      medkitBiasAhead: true,
      microMessage: this.currentMessage,
      isInterventionActive: interventionActive
    };
  }

  #updateMessage(next, force) {
    if (force || this.messageHoldTimer <= 0) {
      this.currentMessage = next;
      this.messageHoldTimer = 1.55;
    }
  }
}

// MARK: - Motor Híbrido (1985 × 2026): Reloj Rígido + IA Directora Monotónica

export class HybridMixDirector {
  constructor() {
    this.fixed1985 = new Classic1985Engine();
    this.adaptive2026 = new Adaptive2026Director();
    this.reset();
  }

  reset() {
    this.fixed1985.reset();
    this.adaptive2026.reset();
    this.messageHoldTimer = 0.0;
    this.currentMessage = 'Mix 85×26 → Reloj fijo + IA';
    this.wasInClockSurge = false;
    this.hybridMedkitGapTimer = 2.0;
    this.hardestSpawnInterval = 0.41;
    this.highestMaxEnemies = 38;
    this.highestSpeedMultiplier = 1.15;
  }

  evaluate(input) {
    const dt = Math.min(Math.max(input.dt, 0.0), 0.1);
    this.messageHoldTimer = Math.max(0.0, this.messageHoldTimer - dt);
    this.hybridMedkitGapTimer += dt;

    const baseFixed = this.fixed1985.evaluate(input);
    const adaptive = this.adaptive2026.evaluate(input);
    const t = input.elapsedTime;
    const progress = Math.min(1.0, Math.max(0.0, t / 60.0));
    const stress = input.stressIndex;

    // Pulsos fijos del reloj 1985 cada 15s (15s, 30s, 45s) durante 3.2s
    const inClockSurge =
      (t >= 14.5 && t <= 17.7) ||
      (t >= 29.5 && t <= 32.7) ||
      (t >= 44.5 && t <= 47.7);
    const prevInSurge = this.wasInClockSurge;
    const surgeChanged = inClockSurge !== prevInSurge;
    const surgeJustEnded = prevInSurge && !inClockSurge;
    this.wasInClockSurge = inClockSurge;

    const timeFloorInterval = 0.41 / (1.0 + 2.42 * progress);
    const timeFloorEnemies = 38 + Math.round(36.0 * progress);
    const timeFloorSpeed = 1.15 + 0.55 * progress;

    let rawInterval;
    if (inClockSurge) {
      rawInterval = Math.min(timeFloorInterval, Math.min(baseFixed.spawnInterval, adaptive.spawnInterval)) * 0.72;
    } else if (stress < 42.0) {
      rawInterval = Math.min(timeFloorInterval, Math.min(baseFixed.spawnInterval, adaptive.spawnInterval)) * 0.90;
    } else {
      rawInterval = Math.min(timeFloorInterval, baseFixed.spawnInterval * 0.45 + adaptive.spawnInterval * 0.55);
    }
    const candidateInterval = Math.max(0.11, rawInterval);

    const candidateMaxEnemies =
      Math.max(timeFloorEnemies, Math.max(baseFixed.maxActiveEnemies, adaptive.maxActiveEnemies)) +
      (inClockSurge ? 6 : 2);

    const speedBase = Math.max(
      timeFloorSpeed,
      baseFixed.enemySpeedMultiplier * 0.48 + adaptive.enemySpeedMultiplier * 0.52
    );
    const candidateSpeed = speedBase + (inClockSurge ? 0.10 : 0.03);

    this.hardestSpawnInterval = Math.min(this.hardestSpawnInterval, candidateInterval);
    this.highestMaxEnemies = Math.max(this.highestMaxEnemies, candidateMaxEnemies);
    this.highestSpeedMultiplier = Math.max(this.highestSpeedMultiplier, candidateSpeed);

    const partialEscapeAngle =
      !inClockSurge && (stress >= 72.0 || input.playerHPNormalized <= 0.30)
        ? adaptive.safeEscapeCenterAngle
        : null;
    const partialHalfCone = partialEscapeAngle !== null ? Math.PI * 0.17 : 0.0;
    const suppressLunges = !inClockSurge && adaptive.suppressSimultaneousLunges;

    const fixedTrigger = baseFixed.spawnEmergencyMedkit && input.playerHPNormalized <= 0.94;
    const postSurgeTrigger = surgeJustEnded && input.playerHPNormalized <= 0.88;
    const wantsMedkit = adaptive.spawnEmergencyMedkit || fixedTrigger || postSurgeTrigger;
    const minGap = input.playerHPNormalized <= 0.42 ? 1.5 : 2.3;
    const dropMedkit = wantsMedkit && input.activeMedkitCount < 3 && this.hybridMedkitGapTimer >= minGap;
    if (dropMedkit) {
      this.hybridMedkitGapTimer = 0.0;
    }

    let nextMsg;
    let forceMsg = surgeChanged || dropMedkit;
    if (dropMedkit) {
      nextMsg = 'Mix 85×26 → Cura táctica en oleada';
    } else if (inClockSurge) {
      nextMsg = 'Mix 85×26 → ¡RÁFAGA FIJA 1985!';
      forceMsg = true;
    } else if (stress < 38.0) {
      nextMsg = 'Mix 85×26 → Doble presión (+horda)';
    } else if (partialEscapeAngle !== null) {
      nextMsg = 'Mix 85×26 → Brecha parcial 2026';
    } else {
      nextMsg = 'Mix 85×26 → Presión creciente';
    }

    if (forceMsg || this.messageHoldTimer <= 0) {
      this.currentMessage = nextMsg;
      this.messageHoldTimer = 1.35;
    }

    const swarmW = baseFixed.swarmWeight * 0.5 + adaptive.swarmWeight * 0.5;
    const tankW = baseFixed.tankWeight * 0.5 + adaptive.tankWeight * 0.5 + (inClockSurge ? 0.05 : 0.0);
    const stalkerW = baseFixed.stalkerWeight * 0.5 + adaptive.stalkerWeight * 0.5 + (inClockSurge ? 0.05 : 0.0);

    return {
      spawnInterval: this.hardestSpawnInterval,
      maxActiveEnemies: this.highestMaxEnemies,
      enemySpeedMultiplier: this.highestSpeedMultiplier,
      swarmWeight: swarmW,
      tankWeight: tankW,
      stalkerWeight: stalkerW,
      safeEscapeCenterAngle: partialEscapeAngle,
      safeEscapeHalfConeRadians: partialHalfCone,
      suppressSimultaneousLunges: suppressLunges,
      spawnEmergencyMedkit: dropMedkit,
      medkitBiasAhead: adaptive.spawnEmergencyMedkit || input.playerHPNormalized < 0.78,
      microMessage: this.currentMessage,
      isInterventionActive: inClockSurge || dropMedkit || adaptive.isInterventionActive
    };
  }
}

export function createWaveDirector(modeId) {
  switch (modeId) {
    case 'classic1985':
      return new Classic1985Engine();
    case 'hybrid1985x2026':
      return new HybridMixDirector();
    case 'director2026':
    default:
      return new Adaptive2026Director();
  }
}
