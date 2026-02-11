"use client";

import React from "react";
import Link from "next/link";
import { ArrowLeft, BookOpen } from "lucide-react";
import { findSimulationById } from "@/data/halliday-chapters";

// Simulation components
import ProjectileMotion from "@/components/simulations/ProjectileMotion";
import SimpleHarmonicMotion from "@/components/simulations/SimpleHarmonicMotion";
import WaveInterference from "@/components/simulations/WaveInterference";
import ElectricField from "@/components/simulations/ElectricField";
import PendulumSim from "@/components/simulations/PendulumSim";
import OrbitalMotion from "@/components/simulations/OrbitalMotion";
import DoubleSlit from "@/components/simulations/DoubleSlit";
import GasMolecules from "@/components/simulations/GasMolecules";
import ConstantAcceleration from "@/components/simulations/ConstantAcceleration";
import CircularMotion from "@/components/simulations/CircularMotion";
import InclinedPlane from "@/components/simulations/InclinedPlane";
import EnergyConservation from "@/components/simulations/EnergyConservation";
import Collisions from "@/components/simulations/Collisions";
import ChargedParticleMagnetic from "@/components/simulations/ChargedParticleMagnetic";
import LensOptics from "@/components/simulations/LensOptics";
import QuantumTunneling from "@/components/simulations/QuantumTunneling";
import VectorAddition from "@/components/simulations/VectorAddition";
import DragTerminalVelocity from "@/components/simulations/DragTerminalVelocity";
import TorqueRotation from "@/components/simulations/TorqueRotation";
import Buoyancy from "@/components/simulations/Buoyancy";
import DopplerEffect from "@/components/simulations/DopplerEffect";
import RCCircuit from "@/components/simulations/RCCircuit";
import FaradayLaw from "@/components/simulations/FaradayLaw";
import EMWave from "@/components/simulations/EMWave";
import DiffractionGrating from "@/components/simulations/DiffractionGrating";
import SpecialRelativity from "@/components/simulations/SpecialRelativity";
import ParticleInBox from "@/components/simulations/ParticleInBox";
import RadioactiveDecay from "@/components/simulations/RadioactiveDecay";
import WorkEnergy from "@/components/simulations/WorkEnergy";
import AngularMomentum from "@/components/simulations/AngularMomentum";
import SpinningTop from "@/components/simulations/SpinningTop";
import ThermalEquilibrium from "@/components/simulations/ThermalEquilibrium";
import HeatEngine from "@/components/simulations/HeatEngine";
import Equipotential from "@/components/simulations/Equipotential";
import Capacitor from "@/components/simulations/Capacitor";
import OhmsLaw from "@/components/simulations/OhmsLaw";
import BiotSavart from "@/components/simulations/BiotSavart";
import LCOscillations from "@/components/simulations/LCOscillations";
import HydrogenAtom from "@/components/simulations/HydrogenAtom";
import NuclearFission from "@/components/simulations/NuclearFission";
import StandardModel from "@/components/simulations/StandardModel";

const simulationComponents: Record<string, React.ComponentType> = {
  "constant-acceleration": ConstantAcceleration,
  "projectile-motion": ProjectileMotion,
  "vector-addition": VectorAddition,
  "circular-motion": CircularMotion,
  "inclined-plane": InclinedPlane,
  "drag-terminal-velocity": DragTerminalVelocity,
  "energy-conservation": EnergyConservation,
  "collisions": Collisions,
  "torque-rotation": TorqueRotation,
  "simple-harmonic-motion": SimpleHarmonicMotion,
  "pendulum": PendulumSim,
  "wave-interference": WaveInterference,
  "orbital-motion": OrbitalMotion,
  "buoyancy": Buoyancy,
  "doppler-effect": DopplerEffect,
  "gas-molecules": GasMolecules,
  "electric-field": ElectricField,
  "charged-particle-magnetic": ChargedParticleMagnetic,
  "rc-circuit": RCCircuit,
  "faraday-law": FaradayLaw,
  "em-wave": EMWave,
  "lens-optics": LensOptics,
  "double-slit": DoubleSlit,
  "diffraction-grating": DiffractionGrating,
  "quantum-tunneling": QuantumTunneling,
  "special-relativity": SpecialRelativity,
  "particle-in-box": ParticleInBox,
  "radioactive-decay": RadioactiveDecay,
  "work-energy": WorkEnergy,
  "angular-momentum": AngularMomentum,
  "spinning-top": SpinningTop,
  "thermal-equilibrium": ThermalEquilibrium,
  "heat-engine": HeatEngine,
  "equipotential": Equipotential,
  "capacitor": Capacitor,
  "ohms-law": OhmsLaw,
  "biot-savart": BiotSavart,
  "lc-oscillations": LCOscillations,
  "hydrogen-atom": HydrogenAtom,
  "nuclear-fission": NuclearFission,
  "standard-model": StandardModel,
};

export default function SimulationViewClient({
  simulationId,
}: {
  simulationId: string;
}) {
  const data = findSimulationById(simulationId);
  const SimComponent = simulationComponents[simulationId];

  if (!data || !SimComponent) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100 dark:bg-gray-800">
          <BookOpen className="h-8 w-8 text-gray-400" />
        </div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
          Simulation Not Found
        </h2>
        <p className="text-gray-500 dark:text-gray-400 text-center max-w-md">
          This simulation is either coming soon or the URL is incorrect.
        </p>
        <Link
          href="/simulations"
          className="mt-2 flex items-center gap-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Simulations
        </Link>
      </div>
    );
  }

  const { simulation, chapter, section, part } = data;

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-6 py-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-3 mb-2">
            <Link
              href="/simulations"
              className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Simulations
            </Link>
            <span className="text-gray-300 dark:text-gray-600">/</span>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {part.title}
            </span>
            <span className="text-gray-300 dark:text-gray-600">/</span>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              Ch. {chapter.number}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {simulation.title}
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {section.number} — {section.title}
              </p>
            </div>
            <div
              className={`hidden sm:flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${part.color}`}
            >
              <BookOpen className="h-5 w-5 text-white" />
            </div>
          </div>
        </div>
      </div>

      {/* Simulation */}
      <div className="px-4 sm:px-6 py-6 max-w-7xl mx-auto">
        <SimComponent />
      </div>
    </div>
  );
}
