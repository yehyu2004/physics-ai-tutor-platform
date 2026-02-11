export interface SimulationInfo {
  id: string;
  title: string;
  description: string;
}

export interface Section {
  number: string;
  title: string;
  simulation?: SimulationInfo;
}

export interface Chapter {
  number: number;
  title: string;
  sections: Section[];
}

export interface Part {
  number: number;
  title: string;
  color: string; // tailwind gradient class
  bgClass: string;
  iconColor: string;
  chapters: Chapter[];
}

export const textbookParts: Part[] = [
  {
    number: 1,
    title: "Mechanics",
    color: "from-blue-500 to-indigo-600",
    bgClass: "bg-blue-500/10 dark:bg-blue-500/20",
    iconColor: "text-blue-500",
    chapters: [
      {
        number: 1,
        title: "Measurement",
        sections: [
          { number: "1-1", title: "Measuring Things, Including Lengths" },
          { number: "1-2", title: "Time" },
          { number: "1-3", title: "Mass" },
        ],
      },
      {
        number: 2,
        title: "Motion Along a Straight Line",
        sections: [
          { number: "2-1", title: "Position, Displacement, and Average Velocity" },
          { number: "2-2", title: "Instantaneous Velocity and Speed" },
          { number: "2-3", title: "Acceleration" },
          {
            number: "2-4",
            title: "Constant Acceleration",
            simulation: {
              id: "constant-acceleration",
              title: "Constant Acceleration",
              description: "Visualize position, velocity, and acceleration graphs for uniform acceleration",
            },
          },
          { number: "2-5", title: "Free-Fall Acceleration" },
        ],
      },
      {
        number: 3,
        title: "Vectors",
        sections: [
          {
            number: "3-1",
            title: "Vectors and Their Components",
            simulation: {
              id: "vector-addition",
              title: "Vector Addition Lab",
              description: "Drag vectors to add them graphically. See components, resultant, and dot/cross products.",
            },
          },
          { number: "3-2", title: "Unit Vectors, Adding Vectors by Components" },
          {
            number: "3-3",
            title: "Multiplying Vectors",
          },
        ],
      },
      {
        number: 4,
        title: "Motion in Two and Three Dimensions",
        sections: [
          { number: "4-1", title: "Position and Displacement" },
          { number: "4-2", title: "Average Velocity and Instantaneous Velocity" },
          { number: "4-3", title: "Average Acceleration and Instantaneous Acceleration" },
          {
            number: "4-4",
            title: "Projectile Motion",
            simulation: {
              id: "projectile-motion",
              title: "Projectile Motion",
              description: "Launch projectiles with adjustable angle, speed, and gravity. Watch trajectories in real time.",
            },
          },
          {
            number: "4-5",
            title: "Uniform Circular Motion",
            simulation: {
              id: "circular-motion",
              title: "Uniform Circular Motion",
              description: "Explore centripetal acceleration, velocity vectors, and period of circular orbits.",
            },
          },
        ],
      },
      {
        number: 5,
        title: "Force and Motion — I",
        sections: [
          { number: "5-1", title: "Newton's First and Second Laws" },
          {
            number: "5-2",
            title: "Some Particular Forces",
            simulation: {
              id: "inclined-plane",
              title: "Forces on an Inclined Plane",
              description: "Explore normal force, gravity components, and friction on a tilting ramp.",
            },
          },
          { number: "5-3", title: "Applying Newton's Laws" },
        ],
      },
      {
        number: 6,
        title: "Force and Motion — II",
        sections: [
          { number: "6-1", title: "Friction" },
          {
            number: "6-2",
            title: "The Drag Force and Terminal Speed",
            simulation: {
              id: "drag-terminal-velocity",
              title: "Drag & Terminal Velocity",
              description: "Drop objects through air and watch them reach terminal speed. Adjust mass, drag coefficient, and air density.",
            },
          },
          { number: "6-3", title: "Uniform Circular Motion" },
        ],
      },
      {
        number: 7,
        title: "Kinetic Energy and Work",
        sections: [
          { number: "7-1", title: "Kinetic Energy" },
          {
            number: "7-2",
            title: "Work and Kinetic Energy",
            simulation: {
              id: "work-energy",
              title: "Work-Energy Theorem",
              description: "Push a box with adjustable force and see work done equal the change in kinetic energy.",
            },
          },
          { number: "7-3", title: "Work Done by the Gravitational Force" },
          { number: "7-4", title: "Work Done by a Spring Force" },
          { number: "7-5", title: "Work Done by a General Variable Force" },
          { number: "7-6", title: "Power" },
        ],
      },
      {
        number: 8,
        title: "Potential Energy and Conservation of Energy",
        sections: [
          { number: "8-1", title: "Potential Energy" },
          {
            number: "8-2",
            title: "Conservation of Mechanical Energy",
            simulation: {
              id: "energy-conservation",
              title: "Energy Conservation",
              description: "Track kinetic, potential, and total energy of a ball on a roller coaster track.",
            },
          },
          { number: "8-3", title: "Reading a Potential Energy Curve" },
          { number: "8-4", title: "Work Done on a System by an External Force" },
        ],
      },
      {
        number: 9,
        title: "Center of Mass and Linear Momentum",
        sections: [
          { number: "9-1", title: "Center of Mass" },
          { number: "9-2", title: "Newton's Second Law for a System of Particles" },
          {
            number: "9-3",
            title: "Linear Momentum",
          },
          {
            number: "9-4",
            title: "Collision and Impulse",
            simulation: {
              id: "collisions",
              title: "1D & 2D Collisions",
              description: "Simulate elastic and inelastic collisions, observing momentum and energy conservation.",
            },
          },
          { number: "9-5", title: "Conservation of Linear Momentum" },
          { number: "9-6", title: "Momentum and Kinetic Energy in Collisions" },
          { number: "9-7", title: "Elastic Collisions in One Dimension" },
          { number: "9-8", title: "Collisions in Two Dimensions" },
        ],
      },
      {
        number: 10,
        title: "Rotation",
        sections: [
          { number: "10-1", title: "Rotational Variables" },
          { number: "10-2", title: "Rotation with Constant Angular Acceleration" },
          { number: "10-3", title: "Relating the Linear and Angular Variables" },
          { number: "10-4", title: "Kinetic Energy of Rotation" },
          { number: "10-5", title: "Calculating the Rotational Inertia" },
          {
            number: "10-6",
            title: "Torque",
            simulation: {
              id: "torque-rotation",
              title: "Torque & Rotation",
              description: "Apply forces to a rotating disc. Explore torque, angular acceleration, and moment of inertia.",
            },
          },
          { number: "10-7", title: "Newton's Second Law for Rotation" },
          { number: "10-8", title: "Work and Rotational Kinetic Energy" },
        ],
      },
      {
        number: 11,
        title: "Rolling, Torque, and Angular Momentum",
        sections: [
          { number: "11-1", title: "Rolling as Translation and Rotation Combined" },
          { number: "11-2", title: "Forces and Kinetic Energy of Rolling" },
          { number: "11-3", title: "The Yo-Yo" },
          { number: "11-4", title: "Torque Revisited" },
          { number: "11-5", title: "Angular Momentum" },
          { number: "11-6", title: "Newton's Second Law in Angular Form" },
          { number: "11-7", title: "Angular Momentum of a Rigid Body" },
          {
            number: "11-8",
            title: "Conservation of Angular Momentum",
            simulation: {
              id: "angular-momentum",
              title: "Angular Momentum Conservation",
              description: "Watch a spinning figure skater pull arms in to spin faster. Explore I, omega, and L = Iomega.",
            },
          },
          {
            number: "11-9",
            title: "Gyroscopes and Precession",
            simulation: {
              id: "spinning-top",
              title: "Spinning Top Precession",
              description: "Explore gyroscopic precession of a tilted spinning top. Tune spin rate, tilt, and damping to see how Omega = tau/L changes.",
            },
          },
        ],
      },
      {
        number: 12,
        title: "Equilibrium and Elasticity",
        sections: [
          { number: "12-1", title: "Equilibrium" },
          { number: "12-2", title: "Some Examples of Static Equilibrium" },
          { number: "12-3", title: "Elasticity" },
        ],
      },
    ],
  },
  {
    number: 2,
    title: "Waves & Acoustics",
    color: "from-purple-500 to-pink-600",
    bgClass: "bg-purple-500/10 dark:bg-purple-500/20",
    iconColor: "text-purple-500",
    chapters: [
      {
        number: 13,
        title: "Gravitation",
        sections: [
          { number: "13-1", title: "Newton's Law of Gravitation" },
          { number: "13-2", title: "Gravitation and the Principle of Superposition" },
          { number: "13-3", title: "Gravitation Near Earth's Surface" },
          { number: "13-4", title: "Gravitation Inside Earth" },
          { number: "13-5", title: "Gravitational Potential Energy" },
          {
            number: "13-6",
            title: "Planets and Satellites: Kepler's Laws",
            simulation: {
              id: "orbital-motion",
              title: "Orbital Motion",
              description: "Simulate planetary orbits, adjust mass and velocity, and observe Kepler's laws in action.",
            },
          },
          { number: "13-7", title: "Satellites: Orbits and Energy" },
          { number: "13-8", title: "Einstein and Gravitation" },
        ],
      },
      {
        number: 14,
        title: "Fluids",
        sections: [
          { number: "14-1", title: "Fluids, Density, and Pressure" },
          { number: "14-2", title: "Fluids at Rest" },
          { number: "14-3", title: "Measuring Pressure" },
          { number: "14-4", title: "Pascal's Principle" },
          {
            number: "14-5",
            title: "Archimedes' Principle",
            simulation: {
              id: "buoyancy",
              title: "Buoyancy & Fluids",
              description: "Submerge objects of different densities. See buoyant force, displaced volume, and floating/sinking.",
            },
          },
          { number: "14-6", title: "The Equation of Continuity" },
          { number: "14-7", title: "Bernoulli's Equation" },
        ],
      },
      {
        number: 15,
        title: "Oscillations",
        sections: [
          {
            number: "15-1",
            title: "Simple Harmonic Motion",
            simulation: {
              id: "simple-harmonic-motion",
              title: "Simple Harmonic Motion",
              description: "Visualize a mass-spring system with real-time position, velocity, and energy graphs.",
            },
          },
          { number: "15-2", title: "The Force Law for Simple Harmonic Motion" },
          { number: "15-3", title: "Energy in Simple Harmonic Motion" },
          { number: "15-4", title: "An Angular Simple Harmonic Oscillator" },
          {
            number: "15-5",
            title: "Pendulums",
            simulation: {
              id: "pendulum",
              title: "Pendulum Lab",
              description: "Experiment with pendulum length, mass, and amplitude. Observe period and energy exchange.",
            },
          },
          { number: "15-6", title: "Damped Simple Harmonic Motion" },
          { number: "15-7", title: "Forced Oscillations and Resonance" },
        ],
      },
      {
        number: 16,
        title: "Waves — I",
        sections: [
          { number: "16-1", title: "Transverse Waves" },
          { number: "16-2", title: "Wave Speed on a Stretched String" },
          { number: "16-3", title: "Energy and Power of a Wave Traveling Along a String" },
          { number: "16-4", title: "The Wave Equation" },
          {
            number: "16-5",
            title: "Interference of Waves",
            simulation: {
              id: "wave-interference",
              title: "Wave Superposition",
              description: "Combine two waves and explore constructive/destructive interference in real time.",
            },
          },
          { number: "16-6", title: "Phasors" },
          { number: "16-7", title: "Standing Waves and Resonance" },
        ],
      },
      {
        number: 17,
        title: "Waves — II",
        sections: [
          { number: "17-1", title: "Speed of Sound" },
          { number: "17-2", title: "Traveling Sound Waves" },
          { number: "17-3", title: "Interference" },
          { number: "17-4", title: "Intensity and Sound Level" },
          { number: "17-5", title: "Sources of Musical Sound" },
          { number: "17-6", title: "Beats" },
          {
            number: "17-7",
            title: "The Doppler Effect",
            simulation: {
              id: "doppler-effect",
              title: "Doppler Effect",
              description: "Watch wavefronts compress and stretch as a source moves. Adjust speed and see frequency shifts.",
            },
          },
        ],
      },
    ],
  },
  {
    number: 3,
    title: "Thermodynamics",
    color: "from-orange-500 to-red-600",
    bgClass: "bg-orange-500/10 dark:bg-orange-500/20",
    iconColor: "text-orange-500",
    chapters: [
      {
        number: 18,
        title: "Temperature, Heat, and the First Law of Thermodynamics",
        sections: [
          { number: "18-1", title: "Temperature" },
          { number: "18-2", title: "The Celsius and Fahrenheit Scales" },
          { number: "18-3", title: "Thermal Expansion" },
          {
            number: "18-4",
            title: "Absorption of Heat",
            simulation: {
              id: "thermal-equilibrium",
              title: "Thermal Equilibrium",
              description: "Place two objects at different temperatures in contact and watch them exchange heat until equilibrium.",
            },
          },
          { number: "18-5", title: "The First Law of Thermodynamics" },
          { number: "18-6", title: "Heat Transfer Mechanisms" },
        ],
      },
      {
        number: 19,
        title: "The Kinetic Theory of Gases",
        sections: [
          { number: "19-1", title: "Avogadro's Number" },
          { number: "19-2", title: "Ideal Gases" },
          { number: "19-3", title: "Pressure, Temperature, and RMS Speed" },
          { number: "19-4", title: "Translational Kinetic Energy" },
          { number: "19-5", title: "Mean Free Path" },
          {
            number: "19-6",
            title: "The Distribution of Molecular Speeds",
            simulation: {
              id: "gas-molecules",
              title: "Ideal Gas Simulation",
              description: "Watch gas molecules bounce around a container. Adjust temperature and observe the Maxwell-Boltzmann distribution.",
            },
          },
        ],
      },
      {
        number: 20,
        title: "Entropy and the Second Law of Thermodynamics",
        sections: [
          { number: "20-1", title: "Entropy" },
          {
            number: "20-2",
            title: "Entropy in the Real World: Engines",
            simulation: {
              id: "heat-engine",
              title: "Heat Engine & Carnot Cycle",
              description: "Visualize a Carnot cycle on a PV diagram with animated state changes and efficiency calculation.",
            },
          },
          { number: "20-3", title: "Refrigerators and Real Engines" },
          { number: "20-4", title: "A Statistical View of Entropy" },
        ],
      },
    ],
  },
  {
    number: 4,
    title: "Electromagnetism",
    color: "from-emerald-500 to-teal-600",
    bgClass: "bg-emerald-500/10 dark:bg-emerald-500/20",
    iconColor: "text-emerald-500",
    chapters: [
      {
        number: 21,
        title: "Coulomb's Law",
        sections: [
          { number: "21-1", title: "Coulomb's Law" },
          { number: "21-2", title: "Charge Is Quantized" },
          { number: "21-3", title: "Charge Is Conserved" },
        ],
      },
      {
        number: 22,
        title: "Electric Fields",
        sections: [
          { number: "22-1", title: "The Electric Field" },
          {
            number: "22-2",
            title: "The Electric Field Due to a Charged Particle",
            simulation: {
              id: "electric-field",
              title: "Electric Field Visualizer",
              description: "Place positive and negative charges and watch electric field lines emerge in real time.",
            },
          },
          { number: "22-3", title: "The Electric Field Due to a Dipole" },
          { number: "22-4", title: "The Electric Field Due to a Line of Charge" },
          { number: "22-5", title: "The Electric Field Due to a Charged Disk" },
          { number: "22-6", title: "A Point Charge in an Electric Field" },
          { number: "22-7", title: "A Dipole in an Electric Field" },
        ],
      },
      {
        number: 23,
        title: "Gauss' Law",
        sections: [
          { number: "23-1", title: "Electric Flux" },
          { number: "23-2", title: "Gauss' Law" },
          { number: "23-3", title: "A Charged Isolated Conductor" },
          { number: "23-4", title: "Applying Gauss' Law: Cylindrical Symmetry" },
          { number: "23-5", title: "Applying Gauss' Law: Planar Symmetry" },
          { number: "23-6", title: "Applying Gauss' Law: Spherical Symmetry" },
        ],
      },
      {
        number: 24,
        title: "Electric Potential",
        sections: [
          { number: "24-1", title: "Electric Potential" },
          {
            number: "24-2",
            title: "Equipotential Surfaces",
            simulation: {
              id: "equipotential",
              title: "Equipotential Lines",
              description: "Place point charges and see equipotential contours and electric field vectors in real time.",
            },
          },
          { number: "24-3", title: "Calculating the Potential from the Field" },
          { number: "24-4", title: "Potential Due to a Charged Particle" },
          { number: "24-5", title: "Potential Due to a Group of Charged Particles" },
          { number: "24-6", title: "Potential Due to a Continuous Charge Distribution" },
          { number: "24-7", title: "Calculating the Field from the Potential" },
          { number: "24-8", title: "Electric Potential Energy of a System of Charged Particles" },
          { number: "24-9", title: "Potential of a Charged Isolated Conductor" },
        ],
      },
      {
        number: 25,
        title: "Capacitance",
        sections: [
          {
            number: "25-1",
            title: "Capacitance",
            simulation: {
              id: "capacitor",
              title: "Parallel Plate Capacitor",
              description: "Adjust plate separation, area, and charge to see the electric field and capacitance change.",
            },
          },
          { number: "25-2", title: "Calculating the Capacitance" },
          { number: "25-3", title: "Capacitors in Parallel and in Series" },
          { number: "25-4", title: "Energy Stored in an Electric Field" },
          { number: "25-5", title: "Capacitor with a Dielectric" },
        ],
      },
      {
        number: 26,
        title: "Current and Resistance",
        sections: [
          { number: "26-1", title: "Electric Current" },
          { number: "26-2", title: "Current Density" },
          { number: "26-3", title: "Resistance and Resistivity" },
          {
            number: "26-4",
            title: "Ohm's Law",
            simulation: {
              id: "ohms-law",
              title: "Ohm's Law Circuit",
              description: "Build a simple circuit with adjustable voltage and resistance. See V = IR and power dissipation.",
            },
          },
          { number: "26-5", title: "Power, Semiconductors, Superconductors" },
        ],
      },
      {
        number: 27,
        title: "Circuits",
        sections: [
          { number: "27-1", title: "Single-Loop Circuits" },
          { number: "27-2", title: "Multiloop Circuits" },
          { number: "27-3", title: "The Ammeter and the Voltmeter" },
          {
            number: "27-4",
            title: "RC Circuits",
            simulation: {
              id: "rc-circuit",
              title: "RC Circuit",
              description: "Watch a capacitor charge and discharge through a resistor. See voltage and current curves in real time.",
            },
          },
        ],
      },
      {
        number: 28,
        title: "Magnetic Fields",
        sections: [
          { number: "28-1", title: "Magnetic Fields and the Definition of B" },
          { number: "28-2", title: "Crossed Fields: Discovery of the Electron" },
          { number: "28-3", title: "Crossed Fields: The Hall Effect" },
          {
            number: "28-4",
            title: "A Circulating Charged Particle",
            simulation: {
              id: "charged-particle-magnetic",
              title: "Charge in a Magnetic Field",
              description: "Watch a charged particle spiral through a magnetic field. Adjust charge, mass, and field strength.",
            },
          },
          { number: "28-5", title: "Cyclotrons and Synchrotrons" },
          { number: "28-6", title: "Magnetic Force on a Current-Carrying Wire" },
          { number: "28-7", title: "Torque on a Current Loop" },
          { number: "28-8", title: "The Magnetic Dipole Moment" },
        ],
      },
      {
        number: 29,
        title: "Magnetic Fields Due to Currents",
        sections: [
          {
            number: "29-1",
            title: "Magnetic Field Due to a Current",
            simulation: {
              id: "biot-savart",
              title: "Magnetic Field from a Wire",
              description: "See circular B-field lines around a current-carrying wire. Adjust current and measure field strength.",
            },
          },
          { number: "29-2", title: "Force Between Two Parallel Currents" },
          { number: "29-3", title: "Ampere's Law" },
          { number: "29-4", title: "Solenoids and Toroids" },
          { number: "29-5", title: "A Current-Carrying Coil as a Magnetic Dipole" },
        ],
      },
      {
        number: 30,
        title: "Induction and Inductance",
        sections: [
          {
            number: "30-1",
            title: "Faraday's Law and Lenz's Law",
            simulation: {
              id: "faraday-law",
              title: "Faraday's Law",
              description: "Move a magnet through a coil and watch EMF and current respond. Explore Lenz's law.",
            },
          },
          { number: "30-2", title: "Induction and Energy Transfers" },
          { number: "30-3", title: "Induced Electric Fields" },
          { number: "30-4", title: "Inductors and Inductance" },
          { number: "30-5", title: "Self-Induction" },
          { number: "30-6", title: "RL Circuits" },
          { number: "30-7", title: "Energy Stored in a Magnetic Field" },
          { number: "30-8", title: "Energy Density of a Magnetic Field" },
          { number: "30-9", title: "Mutual Induction" },
        ],
      },
      {
        number: 31,
        title: "Electromagnetic Oscillations and Alternating Current",
        sections: [
          {
            number: "31-1",
            title: "LC Oscillations",
            simulation: {
              id: "lc-oscillations",
              title: "LC Oscillations",
              description: "Watch charge and current oscillate in an LC circuit. See energy transfer between capacitor and inductor.",
            },
          },
          { number: "31-2", title: "Damped Oscillations in an RLC Circuit" },
          { number: "31-3", title: "Forced Oscillations of Three Simple Circuits" },
          { number: "31-4", title: "The Series RLC Circuit" },
          { number: "31-5", title: "Power in Alternating-Current Circuits" },
          { number: "31-6", title: "Transformers" },
        ],
      },
      {
        number: 32,
        title: "Maxwell's Equations; Magnetism of Matter",
        sections: [
          { number: "32-1", title: "Gauss' Law for Magnetic Fields" },
          { number: "32-2", title: "Induced Magnetic Fields" },
          { number: "32-3", title: "Displacement Current" },
          { number: "32-4", title: "Maxwell's Equations" },
          { number: "32-5", title: "Magnets" },
          { number: "32-6", title: "Magnetism and Electrons" },
          { number: "32-7", title: "Diamagnetism" },
          { number: "32-8", title: "Paramagnetism" },
          { number: "32-9", title: "Ferromagnetism" },
        ],
      },
    ],
  },
  {
    number: 5,
    title: "Optics",
    color: "from-cyan-500 to-blue-600",
    bgClass: "bg-cyan-500/10 dark:bg-cyan-500/20",
    iconColor: "text-cyan-500",
    chapters: [
      {
        number: 33,
        title: "Electromagnetic Waves",
        sections: [
          {
            number: "33-1",
            title: "Electromagnetic Waves",
            simulation: {
              id: "em-wave",
              title: "Electromagnetic Wave",
              description: "Visualize oscillating E and B fields propagating through space as a 3D wave.",
            },
          },
          { number: "33-2", title: "Energy Transport and the Poynting Vector" },
          { number: "33-3", title: "Radiation Pressure" },
          { number: "33-4", title: "Polarization" },
          { number: "33-5", title: "Reflection and Refraction" },
          { number: "33-6", title: "Total Internal Reflection" },
        ],
      },
      {
        number: 34,
        title: "Images",
        sections: [
          { number: "34-1", title: "Images and Plane Mirrors" },
          { number: "34-2", title: "Spherical Mirrors" },
          {
            number: "34-3",
            title: "Spherical Refracting Surfaces",
          },
          {
            number: "34-4",
            title: "Thin Lenses",
            simulation: {
              id: "lens-optics",
              title: "Thin Lens Ray Tracing",
              description: "Drag objects and lenses to explore image formation, focal points, and magnification.",
            },
          },
          { number: "34-5", title: "Optical Instruments" },
        ],
      },
      {
        number: 35,
        title: "Interference",
        sections: [
          { number: "35-1", title: "Light as a Wave" },
          {
            number: "35-2",
            title: "Young's Interference Experiment",
            simulation: {
              id: "double-slit",
              title: "Double-Slit Experiment",
              description: "Observe the iconic interference pattern. Adjust slit separation, width, and wavelength.",
            },
          },
          { number: "35-3", title: "Interference and Double-Slit Intensity" },
          { number: "35-4", title: "Interference from Thin Films" },
          { number: "35-5", title: "Michelson's Interferometer" },
        ],
      },
      {
        number: 36,
        title: "Diffraction",
        sections: [
          { number: "36-1", title: "Single-Slit Diffraction" },
          { number: "36-2", title: "Intensity in Single-Slit Diffraction" },
          { number: "36-3", title: "Diffraction by a Circular Aperture" },
          { number: "36-4", title: "Diffraction by a Double Slit" },
          {
            number: "36-5",
            title: "Diffraction Gratings",
            simulation: {
              id: "diffraction-grating",
              title: "Diffraction Grating",
              description: "Shine light through a grating and see sharp spectral lines form. Adjust number of slits and spacing.",
            },
          },
          { number: "36-6", title: "X-Ray Diffraction" },
        ],
      },
    ],
  },
  {
    number: 6,
    title: "Modern Physics",
    color: "from-rose-500 to-red-600",
    bgClass: "bg-rose-500/10 dark:bg-rose-500/20",
    iconColor: "text-rose-500",
    chapters: [
      {
        number: 37,
        title: "Relativity",
        sections: [
          {
            number: "37-1",
            title: "Simultaneity and Time Dilation",
            simulation: {
              id: "special-relativity",
              title: "Special Relativity",
              description: "Watch clocks slow down and objects contract as speed approaches c. Visualize Lorentz transformations.",
            },
          },
          { number: "37-2", title: "The Relativity of Length" },
          { number: "37-3", title: "The Lorentz Transformation" },
          { number: "37-4", title: "The Relativity of Velocities" },
          { number: "37-5", title: "Doppler Effect for Light" },
          { number: "37-6", title: "Momentum and Energy" },
        ],
      },
      {
        number: 38,
        title: "Photons and Matter Waves",
        sections: [
          { number: "38-1", title: "The Photon, the Quantum of Light" },
          { number: "38-2", title: "The Photoelectric Effect" },
          { number: "38-3", title: "Photons, Momentum, Compton Scattering" },
          { number: "38-4", title: "Light as a Probability Wave" },
          { number: "38-5", title: "Electrons and Matter Waves" },
          { number: "38-6", title: "Schrödinger's Equation" },
          { number: "38-7", title: "Heisenberg's Uncertainty Principle" },
          { number: "38-8", title: "Reflection from a Potential Step" },
          {
            number: "38-9",
            title: "Tunneling Through a Potential Barrier",
            simulation: {
              id: "quantum-tunneling",
              title: "Quantum Tunneling",
              description: "Watch a wave packet encounter a potential barrier and observe transmission and reflection.",
            },
          },
        ],
      },
      {
        number: 39,
        title: "More About Matter Waves",
        sections: [
          { number: "39-1", title: "Energies of a Trapped Electron" },
          {
            number: "39-2",
            title: "Wave Functions of a Trapped Electron",
            simulation: {
              id: "particle-in-box",
              title: "Particle in a Box",
              description: "See quantized energy levels and standing wave functions for an electron confined in a potential well.",
            },
          },
          { number: "39-3", title: "An Electron in a Finite Well" },
          { number: "39-4", title: "Two- and Three-Dimensional Electron Traps" },
          { number: "39-5", title: "The Hydrogen Atom" },
        ],
      },
      {
        number: 40,
        title: "All About Atoms",
        sections: [
          {
            number: "40-1",
            title: "Properties of Atoms",
            simulation: {
              id: "hydrogen-atom",
              title: "Hydrogen Atom",
              description: "Explore energy levels, orbital shapes, and electron probability clouds for the hydrogen atom.",
            },
          },
          { number: "40-2", title: "The Stern-Gerlach Experiment" },
          { number: "40-3", title: "Magnetic Resonance" },
          { number: "40-4", title: "Exclusion Principle and Multiple Electrons in a Trap" },
          { number: "40-5", title: "Building the Periodic Table" },
          { number: "40-6", title: "X Rays and the Ordering of the Elements" },
          { number: "40-7", title: "Lasers" },
        ],
      },
      {
        number: 41,
        title: "Conduction of Electricity in Solids",
        sections: [
          { number: "41-1", title: "The Electrical Properties of Metals" },
          { number: "41-2", title: "Semiconductors and Doping" },
          { number: "41-3", title: "The p-n Junction and the Transistor" },
        ],
      },
      {
        number: 42,
        title: "Nuclear Physics",
        sections: [
          { number: "42-1", title: "Discovering the Nucleus" },
          { number: "42-2", title: "Some Nuclear Properties" },
          {
            number: "42-3",
            title: "Radioactive Decay",
            simulation: {
              id: "radioactive-decay",
              title: "Radioactive Decay",
              description: "Watch atoms randomly decay over time. See half-life, activity curves, and decay statistics.",
            },
          },
          { number: "42-4", title: "Alpha Decay" },
          { number: "42-5", title: "Beta Decay" },
          { number: "42-6", title: "Radioactive Dating" },
          { number: "42-7", title: "Measuring Radiation Dosage" },
          { number: "42-8", title: "Nuclear Models" },
        ],
      },
      {
        number: 43,
        title: "Energy from the Nucleus",
        sections: [
          {
            number: "43-1",
            title: "Nuclear Fission",
            simulation: {
              id: "nuclear-fission",
              title: "Nuclear Fission Chain Reaction",
              description: "Watch neutrons split uranium nuclei in a chain reaction. Adjust control rod absorption.",
            },
          },
          { number: "43-2", title: "The Nuclear Reactor" },
          { number: "43-3", title: "A Natural Nuclear Reactor" },
          { number: "43-4", title: "Thermonuclear Fusion: The Basic Process" },
          { number: "43-5", title: "Thermonuclear Fusion in the Sun and Other Stars" },
          { number: "43-6", title: "Controlled Thermonuclear Fusion" },
        ],
      },
      {
        number: 44,
        title: "Quarks, Leptons, and the Big Bang",
        sections: [
          { number: "44-1", title: "General Properties of Elementary Particles" },
          { number: "44-2", title: "Leptons, Hadrons, and Strangeness" },
          { number: "44-3", title: "Quarks and Messenger Particles" },
          {
            number: "44-4",
            title: "The Standard Model",
            simulation: {
              id: "standard-model",
              title: "Standard Model Explorer",
              description: "Interactive chart of quarks, leptons, and bosons. Click particles to see properties and interactions.",
            },
          },
          { number: "44-5", title: "The Big Bang" },
        ],
      },
    ],
  },
];

// Helper to get all simulations
export function getAllSimulations(): (SimulationInfo & { chapter: number; section: string; part: string })[] {
  const sims: (SimulationInfo & { chapter: number; section: string; part: string })[] = [];
  for (const part of textbookParts) {
    for (const chapter of part.chapters) {
      for (const section of chapter.sections) {
        if (section.simulation) {
          sims.push({
            ...section.simulation,
            chapter: chapter.number,
            section: section.number,
            part: part.title,
          });
        }
      }
    }
  }
  return sims;
}

// Helper to find a simulation by ID
export function findSimulationById(id: string) {
  for (const part of textbookParts) {
    for (const chapter of part.chapters) {
      for (const section of chapter.sections) {
        if (section.simulation?.id === id) {
          return {
            simulation: section.simulation,
            chapter,
            section,
            part,
          };
        }
      }
    }
  }
  return null;
}
