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

    // Progresión matemática estrictamente creciente con el tiempo (0.48s -> 0.10s, 32 -> 92 enemigos, 1.15x -> 1.80x)
    const interval = 0.48 / (1.0 + 3.8 * progress);
    const maxEnemies = 32 + Math.trunc(60.0 * progress);
    const speedMultiplier = 1.15 + 0.65 * progress;

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
    this.hardestSpawnInterval = 0.36;
    this.highestMaxEnemies = 46;
    this.highestSpeedMultiplier = 1.18;
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
    if (stress >= 88.0 || hp <= 0.26) {
      targetRegime = Regime.EMERGENCY_RESCUE;
    } else if (stress >= 70.0 || (this.currentState === Regime.EMERGENCY_RESCUE && stress >= 64.0)) {
      targetRegime = Regime.HIGH_STRESS_RELIEF;
    } else if (stress < 46.0 || (this.currentState === Regime.LOW_STRESS_PUSH && stress < 52.0)) {
      targetRegime = Regime.LOW_STRESS_PUSH;
    } else {
      targetRegime = Regime.OPTIMAL_FLOW;
    }

    const regimeChanged = targetRegime !== this.currentState;
    this.currentState = targetRegime;

    // Curas escasas y tácticas (sólo cuando el jugador realmente peligra)
    let dropMedkit = false;
    const needsCriticalSave = hp <= 0.36;
    const needsTacticalHeal = (hp <= 0.56 && stress >= 56.0) || hp <= 0.45;
    const needsFlowSustain = t >= 18.0 && hp <= 0.65;

    const emergencyReady = needsCriticalSave && this.timeSinceLastMedkit >= 3.4;
    const tacticalReady = needsTacticalHeal && this.timeSinceLastMedkit >= 8.2;
    const sustainReady = needsFlowSustain && this.timeSinceLastMedkit >= 12.5;

    if (input.activeMedkitCount < 2 && (emergencyReady || tacticalReady || sustainReady)) {
      dropMedkit = true;
      this.timeSinceLastMedkit = 0.0;
    }

    // Suelo progresivo con el tiempo (más intenso)
    const timeBaseInterval = 0.36 / (1.0 + 1.85 * progress);
    const timeBaseMaxEnemies = 46 + Math.round(44.0 * progress);
    const timeBaseSpeed = 1.18 + 0.52 * progress;

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
        safeHalfCone = Math.PI * 0.22;
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
        safeHalfCone = Math.PI * 0.18;
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
        // Cuanto más bajo el estrés, más rápido y numeroso el enjambre
        const lowFactor = Math.max(0.0, Math.min(1.0, (52.0 - stress) / 44.0));
        candidateInterval = Math.max(0.08, timeBaseInterval * (0.76 - 0.36 * lowFactor));
        candidateMaxEnemies = Math.round(timeBaseMaxEnemies * (1.20 + 0.70 * lowFactor));
        candidateSpeed = timeBaseSpeed + 0.12 + 0.18 * lowFactor;
        swarmW = 0.38;
        tankW = 0.31;
        stalkerW = t > 4.0 ? 0.31 : 0.16;
        safeAngle = null;
        safeHalfCone = 0;
        suppressLunges = false;
        interventionActive = true;
        let msg;
        if (dropMedkit) {
          msg = 'Desgaste detectado → Gota de Gracia';
        } else if (stress < 24.0) {
          msg = 'Estrés mínimo → Enjambre masivo';
        } else {
          msg = 'Estrés bajo → Escalamiento letal';
        }
        this.#updateMessage(msg, dropMedkit || regimeChanged);
        break;
      }

      case Regime.OPTIMAL_FLOW:
      default: {
        const isClimax = t >= 42.0;
        candidateInterval = timeBaseInterval * (isClimax ? 0.86 : 0.96);
        candidateMaxEnemies = timeBaseMaxEnemies + (isClimax ? 8 : 3);
        candidateSpeed = timeBaseSpeed + (isClimax ? 0.08 : 0.02);
        swarmW = Math.max(0.36, 0.50 - 0.14 * progress);
        tankW = 0.27 + 0.06 * progress;
        stalkerW = t > 5.0 ? (0.23 + 0.08 * progress) : 0.14;
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
    this.hardestSpawnInterval = 0.36;
    this.highestMaxEnemies = 46;
    this.highestSpeedMultiplier = 1.20;
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

    const timeFloorInterval = 0.36 / (1.0 + 2.55 * progress);
    const timeFloorEnemies = 46 + Math.round(46.0 * progress);
    const timeFloorSpeed = 1.20 + 0.60 * progress;
    const lowFactor = Math.max(0.0, Math.min(1.0, (48.0 - stress) / 40.0));

    let rawInterval;
    if (inClockSurge) {
      rawInterval = Math.min(timeFloorInterval, Math.min(baseFixed.spawnInterval, adaptive.spawnInterval)) * 0.68;
    } else if (stress < 48.0) {
      rawInterval = Math.min(timeFloorInterval, Math.min(baseFixed.spawnInterval, adaptive.spawnInterval)) * (0.88 - 0.30 * lowFactor);
    } else {
      rawInterval = Math.min(timeFloorInterval, baseFixed.spawnInterval * 0.45 + adaptive.spawnInterval * 0.55);
    }
    const candidateInterval = Math.max(0.08, rawInterval);

    const candidateMaxEnemies =
      Math.max(timeFloorEnemies, Math.max(baseFixed.maxActiveEnemies, adaptive.maxActiveEnemies)) +
      (inClockSurge ? 12 : Math.round(4 + 14 * lowFactor));

    const speedBase = Math.max(
      timeFloorSpeed,
      baseFixed.enemySpeedMultiplier * 0.48 + adaptive.enemySpeedMultiplier * 0.52
    );
    const candidateSpeed = speedBase + (inClockSurge ? 0.12 : 0.04 + 0.08 * lowFactor);

    this.hardestSpawnInterval = Math.min(this.hardestSpawnInterval, candidateInterval);
    this.highestMaxEnemies = Math.max(this.highestMaxEnemies, candidateMaxEnemies);
    this.highestSpeedMultiplier = Math.max(this.highestSpeedMultiplier, candidateSpeed);

    const partialEscapeAngle =
      !inClockSurge && (stress >= 74.0 || input.playerHPNormalized <= 0.28)
        ? adaptive.safeEscapeCenterAngle
        : null;
    const partialHalfCone = partialEscapeAngle !== null ? Math.PI * 0.16 : 0.0;
    const suppressLunges = !inClockSurge && adaptive.suppressSimultaneousLunges;

    const fixedTrigger = baseFixed.spawnEmergencyMedkit && input.playerHPNormalized <= 0.72;
    const postSurgeTrigger = surgeJustEnded && input.playerHPNormalized <= 0.68;
    const wantsMedkit = adaptive.spawnEmergencyMedkit || fixedTrigger || postSurgeTrigger;
    const minGap = input.playerHPNormalized <= 0.35 ? 3.0 : 5.2;
    const dropMedkit = wantsMedkit && input.activeMedkitCount < 2 && this.hybridMedkitGapTimer >= minGap;
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
      medkitBiasAhead: adaptive.spawnEmergencyMedkit || input.playerHPNormalized < 0.72,
      microMessage: this.currentMessage,
      isInterventionActive: inClockSurge || dropMedkit || adaptive.isInterventionActive
    };
  }
}

// MARK: - Motor Unificado por Tramos Temporales (0-40s 1985 -> 40s-1m20s Híbrido -> 1m20s-2m00s IA Directora 2026)

export class UnifiedProgressiveDirector {
  constructor() {
    this.phase1Engine = new Classic1985Engine();
    this.phase2Engine = new HybridMixDirector();
    this.phase3Engine = new Adaptive2026Director();
    this.reset();
  }

  reset() {
    this.phase1Engine.reset();
    this.phase2Engine.reset();
    this.phase3Engine.reset();
    this.hardestSpawnInterval = 0.48;
    this.highestMaxEnemies = 32;
    this.highestSpeedMultiplier = 1.15;
  }

  evaluate(input) {
    const t = Math.max(0.0, Number(input.elapsedTime) || 0.0);
    const globalProgress = Math.min(1.0, t / 120.0);

    let rawDirective;
    let activePhaseId;
    let activePhaseNumber;

    if (t < 40.0) {
      // FASE 1 (0s - 40s): MODO 1985 (Reglas Matemáticas Fijas)
      activePhaseId = 'classic1985';
      activePhaseNumber = 1;
      rawDirective = this.phase1Engine.evaluate({
        ...input,
        elapsedTime: t
      });
    } else if (t < 80.0) {
      // FASE 2 (40s - 1m20s): MODO HÍBRIDO (1985 x 2026)
      activePhaseId = 'hybrid1985x2026';
      activePhaseNumber = 2;
      const localT = t - 40.0;
      // Escalamos el tiempo interno para que continúe la rampa por encima de donde acabó la Fase 1
      rawDirective = this.phase2Engine.evaluate({
        ...input,
        elapsedTime: 15.0 + localT * 1.1
      });
    } else {
      // FASE 3 (1m20s - 2m00s): MODO IA DIRECTORA 2026 (Clímax Adaptativo)
      activePhaseId = 'director2026';
      activePhaseNumber = 3;
      const localT = t - 80.0;
      rawDirective = this.phase3Engine.evaluate({
        ...input,
        elapsedTime: 30.0 + localT * 0.75
      });
    }

    // Rampa global monotónica durante los 120 segundos (cada tramo incrementa la dificultad)
    const floorInterval = 0.48 / (1.0 + 3.9 * globalProgress);
    const floorEnemies = 32 + Math.round(70.0 * globalProgress);
    const floorSpeed = 1.15 + 0.68 * globalProgress;

    const candidateInterval = Math.min(rawDirective.spawnInterval, floorInterval);
    const candidateEnemies = Math.max(rawDirective.maxActiveEnemies, floorEnemies);
    const candidateSpeed = Math.max(rawDirective.enemySpeedMultiplier, floorSpeed);

    this.hardestSpawnInterval = Math.min(this.hardestSpawnInterval, candidateInterval);
    this.highestMaxEnemies = Math.max(this.highestMaxEnemies, candidateEnemies);
    this.highestSpeedMultiplier = Math.max(this.highestSpeedMultiplier, candidateSpeed);

    return {
      ...rawDirective,
      activePhaseId,
      activePhaseNumber,
      phaseId: activePhaseId,
      phaseNumber: activePhaseNumber,
      microMessage: `FASE ${activePhaseNumber}/3 · ${rawDirective.microMessage}`,
      spawnInterval: this.hardestSpawnInterval,
      maxActiveEnemies: this.highestMaxEnemies,
      enemySpeedMultiplier: this.highestSpeedMultiplier
    };
  }
}

export function createWaveDirector(modeId = 'unified') {
  switch (modeId) {
    case 'classic1985':
      return new Classic1985Engine();
    case 'hybrid1985x2026':
      return new HybridMixDirector();
    case 'director2026':
      return new Adaptive2026Director();
    case 'unified':
    default:
      return new UnifiedProgressiveDirector();
  }
}

