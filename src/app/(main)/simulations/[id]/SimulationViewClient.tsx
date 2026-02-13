"use client";

import React, { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowLeft, BookOpen } from "lucide-react";
import { useTrackTime } from "@/lib/use-track-time";
import { useEffectiveSession } from "@/lib/effective-session-context";
import { findSimulationById } from "@/data/halliday-chapters";

// Loading placeholder for simulation components
const SimulationLoading = () => (
  <div className="flex items-center justify-center min-h-[400px]">
    <p className="text-gray-500 dark:text-gray-400">Loading simulation...</p>
  </div>
);

// All simulation components are dynamically imported to keep the initial bundle small.
// Only the simulation the user navigates to will be loaded.
const dynamicOpts = { ssr: false, loading: SimulationLoading };

const ConstantAcceleration = dynamic(() => import("@/components/simulations/ConstantAcceleration"), dynamicOpts);
const ProjectileMotion = dynamic(() => import("@/components/simulations/ProjectileMotion"), dynamicOpts);
const VectorAddition = dynamic(() => import("@/components/simulations/VectorAddition"), dynamicOpts);
const CircularMotion = dynamic(() => import("@/components/simulations/CircularMotion"), dynamicOpts);
const InclinedPlane = dynamic(() => import("@/components/simulations/InclinedPlane"), dynamicOpts);
const DragTerminalVelocity = dynamic(() => import("@/components/simulations/DragTerminalVelocity"), dynamicOpts);
const EnergyConservation = dynamic(() => import("@/components/simulations/EnergyConservation"), dynamicOpts);
const Collisions = dynamic(() => import("@/components/simulations/Collisions"), dynamicOpts);
const TorqueRotation = dynamic(() => import("@/components/simulations/TorqueRotation"), dynamicOpts);
const SimpleHarmonicMotion = dynamic(() => import("@/components/simulations/SimpleHarmonicMotion"), dynamicOpts);
const PendulumSim = dynamic(() => import("@/components/simulations/PendulumSim"), dynamicOpts);
const WaveInterference = dynamic(() => import("@/components/simulations/WaveInterference"), dynamicOpts);
const OrbitalMotion = dynamic(() => import("@/components/simulations/OrbitalMotion"), dynamicOpts);
const Buoyancy = dynamic(() => import("@/components/simulations/Buoyancy"), dynamicOpts);
const DopplerEffect = dynamic(() => import("@/components/simulations/DopplerEffect"), dynamicOpts);
const GasMolecules = dynamic(() => import("@/components/simulations/GasMolecules"), dynamicOpts);
const ElectricField = dynamic(() => import("@/components/simulations/ElectricField"), dynamicOpts);
const ChargedParticleMagnetic = dynamic(() => import("@/components/simulations/ChargedParticleMagnetic"), dynamicOpts);
const RCCircuit = dynamic(() => import("@/components/simulations/RCCircuit"), dynamicOpts);
const FaradayLaw = dynamic(() => import("@/components/simulations/FaradayLaw"), dynamicOpts);
const EMWave = dynamic(() => import("@/components/simulations/EMWave"), dynamicOpts);
const LensOptics = dynamic(() => import("@/components/simulations/LensOptics"), dynamicOpts);
const DoubleSlit = dynamic(() => import("@/components/simulations/DoubleSlit"), dynamicOpts);
const DiffractionGrating = dynamic(() => import("@/components/simulations/DiffractionGrating"), dynamicOpts);
const QuantumTunneling = dynamic(() => import("@/components/simulations/QuantumTunneling"), dynamicOpts);
const SpecialRelativity = dynamic(() => import("@/components/simulations/SpecialRelativity"), dynamicOpts);
const ParticleInBox = dynamic(() => import("@/components/simulations/ParticleInBox"), dynamicOpts);
const RadioactiveDecay = dynamic(() => import("@/components/simulations/RadioactiveDecay"), dynamicOpts);
const WorkEnergy = dynamic(() => import("@/components/simulations/WorkEnergy"), dynamicOpts);
const AngularMomentum = dynamic(() => import("@/components/simulations/AngularMomentum"), dynamicOpts);
const SpinningTop = dynamic(() => import("@/components/simulations/SpinningTop"), dynamicOpts);
const ThermalEquilibrium = dynamic(() => import("@/components/simulations/ThermalEquilibrium"), dynamicOpts);
const HeatEngine = dynamic(() => import("@/components/simulations/HeatEngine"), dynamicOpts);
const Equipotential = dynamic(() => import("@/components/simulations/Equipotential"), dynamicOpts);
const Capacitor = dynamic(() => import("@/components/simulations/Capacitor"), dynamicOpts);
const OhmsLaw = dynamic(() => import("@/components/simulations/OhmsLaw"), dynamicOpts);
const BiotSavart = dynamic(() => import("@/components/simulations/BiotSavart"), dynamicOpts);
const LCOscillations = dynamic(() => import("@/components/simulations/LCOscillations"), dynamicOpts);
const HydrogenAtom = dynamic(() => import("@/components/simulations/HydrogenAtom"), dynamicOpts);
const NuclearFission = dynamic(() => import("@/components/simulations/NuclearFission"), dynamicOpts);
const StandardModel = dynamic(() => import("@/components/simulations/StandardModel"), dynamicOpts);
const ProjectileChallenge = dynamic(() => import("@/components/simulations/ProjectileChallenge"), dynamicOpts);
const CollisionLab = dynamic(() => import("@/components/simulations/CollisionLab"), dynamicOpts);
const EscapeVelocity = dynamic(() => import("@/components/simulations/EscapeVelocity"), dynamicOpts);
const RollerCoasterDesigner = dynamic(() => import("@/components/simulations/RollerCoasterDesigner"), dynamicOpts);
const CircuitBuilder = dynamic(() => import("@/components/simulations/CircuitBuilder"), dynamicOpts);
const RippleTank = dynamic(() => import("@/components/simulations/RippleTank"), dynamicOpts);
const PhotoelectricEffect = dynamic(() => import("@/components/simulations/PhotoelectricEffect"), dynamicOpts);
const GravitySandbox = dynamic(() => import("@/components/simulations/GravitySandbox"), dynamicOpts);
const MagneticField3D = dynamic(() => import("@/components/simulations/MagneticField3D"), dynamicOpts);
const DecayChain = dynamic(() => import("@/components/simulations/DecayChain"), dynamicOpts);
const MeasurementLab = dynamic(() => import("@/components/simulations/MeasurementLab"), dynamicOpts);
const BeamBalance = dynamic(() => import("@/components/simulations/BeamBalance"), dynamicOpts);
const CoulombLaw = dynamic(() => import("@/components/simulations/CoulombLaw"), dynamicOpts);
const GaussLaw = dynamic(() => import("@/components/simulations/GaussLaw"), dynamicOpts);
const MaxwellEquations = dynamic(() => import("@/components/simulations/MaxwellEquations"), dynamicOpts);
const BandStructure = dynamic(() => import("@/components/simulations/BandStructure"), dynamicOpts);

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
  "projectile-challenge": ProjectileChallenge,
  "collision-lab": CollisionLab,
  "escape-velocity": EscapeVelocity,
  "roller-coaster-designer": RollerCoasterDesigner,
  "circuit-builder": CircuitBuilder,
  "ripple-tank": RippleTank,
  "photoelectric-effect": PhotoelectricEffect,
  "gravity-sandbox": GravitySandbox,
  "magnetic-field-3d": MagneticField3D,
  "decay-chain": DecayChain,
  "measurement-lab": MeasurementLab,
  "beam-balance": BeamBalance,
  "coulomb-law": CoulombLaw,
  "gauss-law": GaussLaw,
  "maxwell-equations": MaxwellEquations,
  "band-structure": BandStructure,
};

export default function SimulationViewClient({
  simulationId,
}: {
  simulationId: string;
}) {
  useTrackTime("SIMULATION");
  const session = useEffectiveSession();
  const [examBlocked, setExamBlocked] = useState(false);
  const data = findSimulationById(simulationId);
  const SimComponent = simulationComponents[simulationId];

  useEffect(() => {
    if (session?.role === "STUDENT") {
      fetch("/api/exam-mode")
        .then((res) => res.ok ? res.json() : null)
        .then((d) => { if (d?.isActive) setExamBlocked(true); })
        .catch((err) => console.error("[exam-mode] Failed to check exam mode:", err));
    }
  }, [session?.role]);

  if (examBlocked) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-4">
        <div className="h-16 w-16 rounded-2xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
          <BookOpen className="h-8 w-8 text-red-500" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Simulation Unavailable</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md">
          Simulations are disabled during exam mode. They will be available again once exam mode is turned off.
        </p>
        <Link href="/dashboard" className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline">
          Return to Dashboard
        </Link>
      </div>
    );
  }

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
