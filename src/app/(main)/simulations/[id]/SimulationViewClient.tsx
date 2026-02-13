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
// Note: next/dynamic requires options to be inline object literals.
const ConstantAcceleration = dynamic(() => import("@/components/simulations/ConstantAcceleration"), { ssr: false, loading: SimulationLoading });
const ProjectileMotion = dynamic(() => import("@/components/simulations/ProjectileMotion"), { ssr: false, loading: SimulationLoading });
const VectorAddition = dynamic(() => import("@/components/simulations/VectorAddition"), { ssr: false, loading: SimulationLoading });
const CircularMotion = dynamic(() => import("@/components/simulations/CircularMotion"), { ssr: false, loading: SimulationLoading });
const InclinedPlane = dynamic(() => import("@/components/simulations/InclinedPlane"), { ssr: false, loading: SimulationLoading });
const DragTerminalVelocity = dynamic(() => import("@/components/simulations/DragTerminalVelocity"), { ssr: false, loading: SimulationLoading });
const EnergyConservation = dynamic(() => import("@/components/simulations/EnergyConservation"), { ssr: false, loading: SimulationLoading });
const Collisions = dynamic(() => import("@/components/simulations/Collisions"), { ssr: false, loading: SimulationLoading });
const TorqueRotation = dynamic(() => import("@/components/simulations/TorqueRotation"), { ssr: false, loading: SimulationLoading });
const SimpleHarmonicMotion = dynamic(() => import("@/components/simulations/SimpleHarmonicMotion"), { ssr: false, loading: SimulationLoading });
const PendulumSim = dynamic(() => import("@/components/simulations/PendulumSim"), { ssr: false, loading: SimulationLoading });
const WaveInterference = dynamic(() => import("@/components/simulations/WaveInterference"), { ssr: false, loading: SimulationLoading });
const OrbitalMotion = dynamic(() => import("@/components/simulations/OrbitalMotion"), { ssr: false, loading: SimulationLoading });
const Buoyancy = dynamic(() => import("@/components/simulations/Buoyancy"), { ssr: false, loading: SimulationLoading });
const DopplerEffect = dynamic(() => import("@/components/simulations/DopplerEffect"), { ssr: false, loading: SimulationLoading });
const GasMolecules = dynamic(() => import("@/components/simulations/GasMolecules"), { ssr: false, loading: SimulationLoading });
const ElectricField = dynamic(() => import("@/components/simulations/ElectricField"), { ssr: false, loading: SimulationLoading });
const ChargedParticleMagnetic = dynamic(() => import("@/components/simulations/ChargedParticleMagnetic"), { ssr: false, loading: SimulationLoading });
const RCCircuit = dynamic(() => import("@/components/simulations/RCCircuit"), { ssr: false, loading: SimulationLoading });
const FaradayLaw = dynamic(() => import("@/components/simulations/FaradayLaw"), { ssr: false, loading: SimulationLoading });
const EMWave = dynamic(() => import("@/components/simulations/EMWave"), { ssr: false, loading: SimulationLoading });
const LensOptics = dynamic(() => import("@/components/simulations/LensOptics"), { ssr: false, loading: SimulationLoading });
const DoubleSlit = dynamic(() => import("@/components/simulations/DoubleSlit"), { ssr: false, loading: SimulationLoading });
const DiffractionGrating = dynamic(() => import("@/components/simulations/DiffractionGrating"), { ssr: false, loading: SimulationLoading });
const QuantumTunneling = dynamic(() => import("@/components/simulations/QuantumTunneling"), { ssr: false, loading: SimulationLoading });
const SpecialRelativity = dynamic(() => import("@/components/simulations/SpecialRelativity"), { ssr: false, loading: SimulationLoading });
const ParticleInBox = dynamic(() => import("@/components/simulations/ParticleInBox"), { ssr: false, loading: SimulationLoading });
const RadioactiveDecay = dynamic(() => import("@/components/simulations/RadioactiveDecay"), { ssr: false, loading: SimulationLoading });
const WorkEnergy = dynamic(() => import("@/components/simulations/WorkEnergy"), { ssr: false, loading: SimulationLoading });
const AngularMomentum = dynamic(() => import("@/components/simulations/AngularMomentum"), { ssr: false, loading: SimulationLoading });
const SpinningTop = dynamic(() => import("@/components/simulations/SpinningTop"), { ssr: false, loading: SimulationLoading });
const ThermalEquilibrium = dynamic(() => import("@/components/simulations/ThermalEquilibrium"), { ssr: false, loading: SimulationLoading });
const HeatEngine = dynamic(() => import("@/components/simulations/HeatEngine"), { ssr: false, loading: SimulationLoading });
const Equipotential = dynamic(() => import("@/components/simulations/Equipotential"), { ssr: false, loading: SimulationLoading });
const Capacitor = dynamic(() => import("@/components/simulations/Capacitor"), { ssr: false, loading: SimulationLoading });
const OhmsLaw = dynamic(() => import("@/components/simulations/OhmsLaw"), { ssr: false, loading: SimulationLoading });
const BiotSavart = dynamic(() => import("@/components/simulations/BiotSavart"), { ssr: false, loading: SimulationLoading });
const LCOscillations = dynamic(() => import("@/components/simulations/LCOscillations"), { ssr: false, loading: SimulationLoading });
const HydrogenAtom = dynamic(() => import("@/components/simulations/HydrogenAtom"), { ssr: false, loading: SimulationLoading });
const NuclearFission = dynamic(() => import("@/components/simulations/NuclearFission"), { ssr: false, loading: SimulationLoading });
const StandardModel = dynamic(() => import("@/components/simulations/StandardModel"), { ssr: false, loading: SimulationLoading });
const ProjectileChallenge = dynamic(() => import("@/components/simulations/ProjectileChallenge"), { ssr: false, loading: SimulationLoading });
const CollisionLab = dynamic(() => import("@/components/simulations/CollisionLab"), { ssr: false, loading: SimulationLoading });
const EscapeVelocity = dynamic(() => import("@/components/simulations/EscapeVelocity"), { ssr: false, loading: SimulationLoading });
const RollerCoasterDesigner = dynamic(() => import("@/components/simulations/RollerCoasterDesigner"), { ssr: false, loading: SimulationLoading });
const CircuitBuilder = dynamic(() => import("@/components/simulations/CircuitBuilder"), { ssr: false, loading: SimulationLoading });
const RippleTank = dynamic(() => import("@/components/simulations/RippleTank"), { ssr: false, loading: SimulationLoading });
const PhotoelectricEffect = dynamic(() => import("@/components/simulations/PhotoelectricEffect"), { ssr: false, loading: SimulationLoading });
const GravitySandbox = dynamic(() => import("@/components/simulations/GravitySandbox"), { ssr: false, loading: SimulationLoading });
const MagneticField3D = dynamic(() => import("@/components/simulations/MagneticField3D"), { ssr: false, loading: SimulationLoading });
const DecayChain = dynamic(() => import("@/components/simulations/DecayChain"), { ssr: false, loading: SimulationLoading });
const MeasurementLab = dynamic(() => import("@/components/simulations/MeasurementLab"), { ssr: false, loading: SimulationLoading });
const BeamBalance = dynamic(() => import("@/components/simulations/BeamBalance"), { ssr: false, loading: SimulationLoading });
const CoulombLaw = dynamic(() => import("@/components/simulations/CoulombLaw"), { ssr: false, loading: SimulationLoading });
const GaussLaw = dynamic(() => import("@/components/simulations/GaussLaw"), { ssr: false, loading: SimulationLoading });
const MaxwellEquations = dynamic(() => import("@/components/simulations/MaxwellEquations"), { ssr: false, loading: SimulationLoading });
const BandStructure = dynamic(() => import("@/components/simulations/BandStructure"), { ssr: false, loading: SimulationLoading });

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
