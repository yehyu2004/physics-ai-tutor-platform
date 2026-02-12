"use client";

import React, { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  Environment,
  ContactShadows,
  Text,
  RoundedBox,
  OrbitControls,
} from "@react-three/drei";
import * as THREE from "three";
import { playSFX, playScore } from "@/lib/simulation/sound";
import {
  createChallengeState,
  updateChallengeState,
  type ChallengeState,
} from "@/lib/simulation/scoring";
import { SimMath } from "@/components/simulations/SimMath";

type PrecisionLevel = "ruler" | "fine" | "caliper";
type GameMode = "practice" | "challenge";

interface MeasurableObject {
  id: number;
  shape: "rect" | "circle";
  trueLengthCm: number;
  widthPx: number;
  heightPx: number;
  color: string;
  label: string;
}

interface MeasurementResult {
  objectId: number;
  trueValue: number;
  userValue: number;
  error: number;
  relativeError: number;
  sigFigsCorrect: boolean;
  userSigFigs: number;
  expectedSigFigs: number;
  points: number;
}

const OBJECT_COLORS = [
  "#3b82f6", "#22c55e", "#a855f7", "#ec4899",
  "#f97316", "#06b6d4", "#f43f5e", "#84cc16",
];

const OBJECT_LABELS = [
  "Block A", "Cylinder B", "Disk C", "Bar D",
  "Rod E", "Plate F", "Tube G", "Ring H",
];

const PRECISION_INFO: Record<
  PrecisionLevel,
  { label: string; resolution: number; unit: string; sigFigs: number; decimalPlaces: number }
> = {
  ruler: { label: "Basic Ruler (1 cm)", resolution: 1, unit: "cm", sigFigs: 2, decimalPlaces: 1 },
  fine: { label: "Fine Ruler (1 mm)", resolution: 0.1, unit: "cm", sigFigs: 3, decimalPlaces: 2 },
  caliper: { label: "Caliper (0.1 mm)", resolution: 0.01, unit: "cm", sigFigs: 4, decimalPlaces: 3 },
};

const CHALLENGE_ROUNDS = 5;

function countSigFigs(str: string): number {
  const s = str.trim();
  if (s === "" || s === "." || s === "0") return 1;
  let cleaned = s.replace(/^[+-]/, "");
  if (cleaned.includes(".")) {
    const parts = cleaned.split(".");
    const intPart = parts[0];
    const decPart = parts[1] || "";
    if (intPart === "0" || intPart === "") {
      let firstNonZero = -1;
      for (let i = 0; i < decPart.length; i++) {
        if (decPart[i] !== "0") { firstNonZero = i; break; }
      }
      if (firstNonZero === -1) return 1;
      return decPart.length - firstNonZero;
    } else {
      return intPart.replace(/^0+/, "").length + decPart.length;
    }
  } else {
    cleaned = cleaned.replace(/^0+/, "");
    if (cleaned === "") return 1;
    const withoutTrailing = cleaned.replace(/0+$/, "");
    return withoutTrailing.length || 1;
  }
}

function countDecimalPlaces(str: string): number {
  const s = str.trim();
  const dotIdx = s.indexOf(".");
  if (dotIdx === -1) return 0;
  return s.length - dotIdx - 1;
}

function generateObject(
  id: number, precision: PrecisionLevel, difficulty: number,
): MeasurableObject {
  const shape = Math.random() > 0.5 ? "rect" : "circle";
  const info = PRECISION_INFO[precision];
  let minCm: number, maxCm: number;
  switch (precision) {
    case "ruler": minCm = 2 + difficulty * 0.3; maxCm = 6 - difficulty * 0.2; break;
    case "fine": minCm = 1.5 + difficulty * 0.2; maxCm = 5 - difficulty * 0.1; break;
    case "caliper": minCm = 0.5 + difficulty * 0.1; maxCm = 3 - difficulty * 0.05; break;
  }
  const rawCm = minCm + Math.random() * (maxCm - minCm);
  const trueLengthCm = Math.round(rawCm / (info.resolution * 0.1)) * (info.resolution * 0.1);
  const pxPerCm = precision === "caliper" ? 80 : precision === "fine" ? 50 : 40;
  const widthPx = trueLengthCm * pxPerCm;
  const heightPx = shape === "circle" ? widthPx : 30 + Math.random() * 40;
  const color = OBJECT_COLORS[id % OBJECT_COLORS.length];
  const label = OBJECT_LABELS[id % OBJECT_LABELS.length];
  return { id, shape, trueLengthCm, widthPx, heightPx, color, label };
}

function LabBench() {
  return (
    <group>
      <mesh position={[0, -0.26, 0]} receiveShadow>
        <boxGeometry args={[14, 0.5, 8]} />
        <meshStandardMaterial color="#5c4033" roughness={0.85} metalness={0.05} />
      </mesh>
      <mesh position={[0, -0.009, 0]} receiveShadow>
        <boxGeometry args={[13, 0.02, 7]} />
        <meshStandardMaterial color="#8fbc8f" roughness={0.4} metalness={0.02} />
      </mesh>
      {[-6.2, 6.2].map((xPos) =>
        [-3.2, 3.2].map((zPos) => (
          <mesh key={`leg-${xPos}-${zPos}`} position={[xPos, -2.5, zPos]}>
            <boxGeometry args={[0.4, 4.5, 0.4]} />
            <meshStandardMaterial color="#4a3520" roughness={0.9} />
          </mesh>
        ))
      )}
    </group>
  );
}

function MeasurableObject3D({
  obj, showTrueLength, precision,
}: {
  obj: MeasurableObject;
  showTrueLength: boolean;
  precision: PrecisionLevel;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const width3D = obj.trueLengthCm;
  const height3D = obj.shape === "circle" ? width3D : (obj.heightPx / 40);
  const depth = obj.shape === "circle" ? width3D : 0.8;

  useFrame((state) => {
    if (meshRef.current) {
      const t = state.clock.elapsedTime;
      const ei = 0.05 + Math.sin(t * 2) * 0.02;
      const mat = meshRef.current.material as THREE.MeshStandardMaterial;
      if (mat.emissiveIntensity !== undefined) mat.emissiveIntensity = ei;
    }
  });

  return (
    <group position={[-width3D / 2, 0, 0]}>
      {obj.shape === "circle" ? (
        <mesh ref={meshRef} castShadow position={[width3D / 2, width3D / 2 + 0.01, 0]}>
          <cylinderGeometry args={[width3D / 2, width3D / 2, 0.6, 48]} />
          <meshStandardMaterial color={obj.color} roughness={0.3} metalness={0.4} emissive={obj.color} emissiveIntensity={0.05} />
        </mesh>
      ) : (
        <mesh ref={meshRef} castShadow position={[width3D / 2, height3D / 2 + 0.01, 0]}>
          <boxGeometry args={[width3D, height3D, depth]} />
          <meshStandardMaterial color={obj.color} roughness={0.25} metalness={0.5} emissive={obj.color} emissiveIntensity={0.05} />
        </mesh>
      )}
      <Text
        position={[width3D / 2, obj.shape === "circle" ? width3D + 0.8 : height3D + 0.6, 0]}
        fontSize={0.35} color="white" anchorX="center" anchorY="bottom"
        outlineWidth={0.02} outlineColor="black"
      >
        {obj.label}
      </Text>
      {showTrueLength && (
        <group position={[0, -0.3, depth / 2 + 0.3]}>
          <mesh position={[width3D / 2, 0, 0]}>
            <boxGeometry args={[width3D, 0.02, 0.02]} />
            <meshStandardMaterial color="#f59e0b" emissive="#f59e0b" emissiveIntensity={0.5} />
          </mesh>
          {[0, width3D].map((xOff) => (
            <mesh key={xOff} position={[xOff, 0, 0]}>
              <boxGeometry args={[0.02, 0.3, 0.02]} />
              <meshStandardMaterial color="#f59e0b" emissive="#f59e0b" emissiveIntensity={0.5} />
            </mesh>
          ))}
          <Text position={[width3D / 2, -0.35, 0]} fontSize={0.28} color="#f59e0b" anchorX="center" anchorY="top">
            {`${obj.trueLengthCm.toFixed(PRECISION_INFO[precision].decimalPlaces)} cm`}
          </Text>
        </group>
      )}
    </group>
  );
}

function useRulerTexture(precision: PrecisionLevel, maxCm: number, pxPerCm: number) {
  return useMemo(() => {
    const cw = maxCm * pxPerCm + 40;
    const ch = 120;
    const canvas = document.createElement("canvas");
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext("2d")!;
    if (precision === "caliper") {
      ctx.fillStyle = "#c8c8d0";
      ctx.fillRect(0, 0, cw, ch);
      ctx.fillStyle = "#e8e8f0";
      ctx.fillRect(10, 20, cw - 20, 50);
    } else {
      const grad = ctx.createLinearGradient(0, 0, 0, ch);
      grad.addColorStop(0, "#f5d78e");
      grad.addColorStop(0.5, "#e8c060");
      grad.addColorStop(1, "#d4a840");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, cw, ch);
    }
    ctx.strokeStyle = "#1e293b";
    ctx.fillStyle = "#1e293b";
    ctx.font = `bold ${precision === "caliper" ? 14 : 16}px monospace`;
    ctx.textAlign = "center";
    for (let cm = 0; cm <= maxCm; cm++) {
      const mx = 20 + cm * pxPerCm;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(mx, 0); ctx.lineTo(mx, ch * 0.55); ctx.stroke();
      ctx.fillText(`${cm}`, mx, ch - 10);
      if ((precision === "fine" || precision === "caliper") && cm < maxCm) {
        for (let mm = 1; mm < 10; mm++) {
          const mmx = mx + mm * (pxPerCm / 10);
          const markH = mm === 5 ? ch * 0.4 : ch * 0.25;
          ctx.lineWidth = mm === 5 ? 1.5 : 0.8;
          ctx.beginPath(); ctx.moveTo(mmx, 0); ctx.lineTo(mmx, markH); ctx.stroke();
        }
      }
    }
    if (precision === "caliper") {
      ctx.fillStyle = "rgba(80,80,100,0.5)";
      ctx.font = "bold 10px monospace"; ctx.textAlign = "right";
      ctx.fillText("VERNIER CALIPER", cw - 10, ch - 5);
    } else {
      ctx.fillStyle = "rgba(40,30,10,0.3)";
      ctx.font = "bold 10px monospace"; ctx.textAlign = "right";
      ctx.fillText("cm", cw - 10, ch - 5);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }, [precision, maxCm, pxPerCm]);
}

function Ruler3D({ precision, rulerX, onDrag }: {
  precision: PrecisionLevel; rulerX: number; onDrag: (newX: number) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const isDragging = useRef(false);
  const dragOffset = useRef(0);
  const { camera, gl } = useThree();
  const maxCm = precision === "caliper" ? 5 : precision === "fine" ? 10 : 12;
  const pxPerCm = precision === "caliper" ? 80 : precision === "fine" ? 50 : 40;
  const rulerLen = maxCm * 1.0;
  const rulerH = precision === "caliper" ? 0.5 : 0.25;
  const rulerD = precision === "caliper" ? 1.2 : 0.8;
  const rulerTexture = useRulerTexture(precision, maxCm, pxPerCm);

  const getWorldX = useCallback((clientX: number, clientY: number) => {
    const rect = gl.domElement.getBoundingClientRect();
    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;
    const rc = new THREE.Raycaster();
    rc.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const target = new THREE.Vector3();
    rc.ray.intersectPlane(plane, target);
    return target ? target.x : 0;
  }, [camera, gl]);

  useEffect(() => {
    const el = gl.domElement;
    const onDown = (e: PointerEvent) => {
      if (!groupRef.current) return;
      const wx = getWorldX(e.clientX, e.clientY);
      if (wx >= rulerX - 0.5 && wx <= rulerX + rulerLen + 0.5) {
        isDragging.current = true;
        dragOffset.current = wx - rulerX;
        el.style.cursor = "grabbing";
        playSFX("click");
      }
    };
    const onMove = (e: PointerEvent) => {
      if (!isDragging.current) return;
      const wx = getWorldX(e.clientX, e.clientY);
      onDrag(Math.max(-7, Math.min(7 - rulerLen, wx - dragOffset.current)));
    };
    const onUp = () => {
      if (isDragging.current) { isDragging.current = false; el.style.cursor = "grab"; }
    };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointerleave", onUp);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointerleave", onUp);
    };
  }, [gl, getWorldX, rulerX, rulerLen, onDrag]);

  useFrame(() => { if (groupRef.current) groupRef.current.position.x = rulerX; });

  return (
    <group ref={groupRef} position={[rulerX, 0.01, 1.5]}>
      <RoundedBox args={[rulerLen, rulerH, rulerD]} radius={0.03} smoothness={4} position={[rulerLen / 2, rulerH / 2, 0]} castShadow>
        <meshStandardMaterial
          map={rulerTexture}
          roughness={precision === "caliper" ? 0.3 : 0.6}
          metalness={precision === "caliper" ? 0.6 : 0.1}
          color={precision === "caliper" ? "#b8b8c8" : "#e8c060"}
        />
      </RoundedBox>
      {precision === "caliper" && (
        <>
          <mesh position={[0, rulerH / 2, 0]} castShadow>
            <boxGeometry args={[0.15, 1.0, rulerD + 0.3]} />
            <meshStandardMaterial color="#909098" roughness={0.3} metalness={0.7} />
          </mesh>
          <mesh position={[0, -0.2, 0]}>
            <boxGeometry args={[0.1, 0.4, rulerD + 0.2]} />
            <meshStandardMaterial color="#808088" roughness={0.3} metalness={0.7} />
          </mesh>
        </>
      )}
      <Text position={[rulerLen / 2, rulerH + 0.35, 0]} fontSize={0.22} color="#60a5fa" anchorX="center" anchorY="bottom" outlineWidth={0.01} outlineColor="black">
        {"\u2194 DRAG RULER"}
      </Text>
    </group>
  );
}

function ScorePopup3D({ text, points }: { text: string; points: number }) {
  const groupRef = useRef<THREE.Group>(null);
  const startTime = useRef(performance.now());
  const color = points >= 3 ? "#22c55e" : points >= 2 ? "#3b82f6" : points >= 1 ? "#f59e0b" : "#ef4444";
  useFrame(() => {
    if (!groupRef.current) return;
    const elapsed = (performance.now() - startTime.current) / 1000;
    groupRef.current.position.y = 3 + elapsed * 1.5;
    groupRef.current.scale.setScalar(1 + Math.sin(elapsed * Math.PI) * 0.3);
  });
  return (
    <group ref={groupRef} position={[0, 3, 0]}>
      <Text fontSize={0.6} color={color} anchorX="center" anchorY="middle" outlineWidth={0.03} outlineColor="black">{text}</Text>
      {points > 0 && (
        <Text position={[0, -0.5, 0]} fontSize={0.4} color={color} anchorX="center" anchorY="middle" outlineWidth={0.02} outlineColor="black">{`+${points}`}</Text>
      )}
    </group>
  );
}

function ConfettiParticles({ active }: { active: boolean }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const count = 60;
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const colors = useMemo(() => ["#ef4444", "#22c55e", "#3b82f6", "#f59e0b", "#a855f7", "#ec4899"], []);
  const particles = useRef(
    Array.from({ length: count }, () => ({
      pos: new THREE.Vector3(), vel: new THREE.Vector3(), rot: new THREE.Vector3(),
      col: new THREE.Color(), life: 0, maxLife: 0,
    }))
  );
  const startTimeRef = useRef(0);

  useEffect(() => {
    if (active) {
      startTimeRef.current = performance.now();
      particles.current.forEach((p, i) => {
        p.pos.set(0, 2.5, 0);
        const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.8;
        const speed = 3 + Math.random() * 4;
        p.vel.set(Math.cos(angle) * speed * (Math.random() - 0.5) * 2, Math.sin(angle) * speed + 2, (Math.random() - 0.5) * speed);
        p.rot.set(Math.random() * 10, Math.random() * 10, Math.random() * 10);
        p.col.set(colors[i % colors.length]);
        p.life = 2.5; p.maxLife = 2.5;
      });
    }
  }, [active, colors]);

  useFrame((_, delta) => {
    if (!meshRef.current || !active) return;
    if ((performance.now() - startTimeRef.current) / 1000 > 3) return;
    particles.current.forEach((p, i) => {
      if (p.life <= 0) return;
      p.life -= delta;
      p.vel.y -= 8 * delta;
      p.pos.addScaledVector(p.vel, delta);
      p.rot.x += delta * 5; p.rot.y += delta * 3;
      dummy.position.copy(p.pos);
      dummy.rotation.set(p.rot.x, p.rot.y, p.rot.z);
      dummy.scale.setScalar(Math.max(0, p.life / p.maxLife) * 0.12);
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);
      meshRef.current!.setColorAt(i, p.col);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
  });

  if (!active) return null;
  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial roughness={0.5} metalness={0.3} />
    </instancedMesh>
  );
}

function SceneLighting() {
  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 8, 5]} intensity={1.2} castShadow
        shadow-mapSize-width={2048} shadow-mapSize-height={2048}
        shadow-camera-far={30} shadow-camera-left={-10} shadow-camera-right={10}
        shadow-camera-top={10} shadow-camera-bottom={-10}
      />
      <directionalLight position={[-3, 5, -3]} intensity={0.3} color="#b4d4ff" />
      <pointLight position={[0, 4, 0]} intensity={0.5} color="#ffe4b5" />
    </>
  );
}

function InfoPanel({ precision, obj }: { precision: PrecisionLevel; obj: MeasurableObject | null }) {
  const info = PRECISION_INFO[precision];
  return (
    <group position={[5.5, 3.5, -3]}>
      <mesh>
        <planeGeometry args={[3.2, 2.2]} />
        <meshBasicMaterial color="#0f172a" transparent opacity={0.85} />
      </mesh>
      <Text position={[0, 0.7, 0.01]} fontSize={0.16} color="#94a3b8" anchorX="center" anchorY="middle">MEASUREMENT DATA</Text>
      <Text position={[0, 0.35, 0.01]} fontSize={0.14} color="#e2e8f0" anchorX="center" anchorY="middle">{`Tool:  ${info.label}`}</Text>
      <Text position={[0, 0.1, 0.01]} fontSize={0.14} color="#e2e8f0" anchorX="center" anchorY="middle">{`Resolution:  ${info.resolution} ${info.unit}`}</Text>
      <Text position={[0, -0.15, 0.01]} fontSize={0.14} color="#e2e8f0" anchorX="center" anchorY="middle">{`Decimal Places:  ${info.decimalPlaces}`}</Text>
      {obj && <Text position={[0, -0.4, 0.01]} fontSize={0.14} color="#f59e0b" anchorX="center" anchorY="middle">{`Object:  ${obj.label} (${obj.shape === "circle" ? "diameter" : "width"})`}</Text>}
    </group>
  );
}

function Scene({ obj, precision, showTrueLength, scorePopup, confettiActive, rulerX, onRulerDrag }: {
  obj: MeasurableObject | null; precision: PrecisionLevel; showTrueLength: boolean;
  scorePopup: { text: string; points: number } | null; confettiActive: boolean;
  rulerX: number; onRulerDrag: (newX: number) => void;
}) {
  return (
    <>
      <SceneLighting />
      <Environment preset="studio" />
      <ContactShadows position={[0, -0.0, 0]} opacity={0.4} scale={20} blur={2} far={10} />
      <LabBench />
      {obj && <MeasurableObject3D obj={obj} showTrueLength={showTrueLength} precision={precision} />}
      <Ruler3D precision={precision} rulerX={rulerX} onDrag={onRulerDrag} />
      <InfoPanel precision={precision} obj={obj} />
      {scorePopup && <ScorePopup3D text={scorePopup.text} points={scorePopup.points} />}
      <ConfettiParticles active={confettiActive} />
      <Text position={[0, -0.45, 3.8]} fontSize={0.18} color="rgba(255,255,255,0.4)" anchorX="center" anchorY="middle">
        Drag the ruler to measure the object. Enter your reading below.
      </Text>
      <OrbitControls enablePan={false} enableZoom={true} minPolarAngle={Math.PI / 6} maxPolarAngle={Math.PI / 2.5} minDistance={5} maxDistance={18} target={[0, 0.5, 0]} />
    </>
  );
}

export default function MeasurementLab() {
  const [precision, setPrecision] = useState<PrecisionLevel>("ruler");
  const [mode, setMode] = useState<GameMode>("practice");
  const [userInput, setUserInput] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [lastResult, setLastResult] = useState<MeasurementResult | null>(null);
  const [challengeRound, setChallengeRound] = useState(0);
  const [results, setResults] = useState<MeasurementResult[]>([]);
  const [showTrueLength, setShowTrueLength] = useState(false);
  const [currentObj, setCurrentObj] = useState<MeasurableObject | null>(null);
  const [scorePopup, setScorePopup] = useState<{ text: string; points: number } | null>(null);
  const [confettiActive, setConfettiActive] = useState(false);
  const [rulerX, setRulerX] = useState(-3);
  const challengeRef = useRef<ChallengeState>(createChallengeState());
  const confettiKey = useRef(0);

  const generateNewObject = useCallback(() => {
    const difficulty = mode === "challenge" ? challengeRound : 0;
    const obj = generateObject(Date.now() % 1000, precision, difficulty);
    setCurrentObj(obj);
    setRulerX(-obj.trueLengthCm / 2 - 1);
    setSubmitted(false);
    setLastResult(null);
    setUserInput("");
    setShowTrueLength(false);
    setScorePopup(null);
    setConfettiActive(false);
  }, [precision, mode, challengeRound]);

  useEffect(() => {
    generateNewObject();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [precision]);

  const handleRulerDrag = useCallback((newX: number) => { setRulerX(newX); }, []);

  const handleSubmit = useCallback(() => {
    const obj = currentObj;
    if (!obj || !userInput.trim()) return;
    const userValue = parseFloat(userInput);
    if (isNaN(userValue)) { playSFX("incorrect"); return; }
    const trueValue = obj.trueLengthCm;
    const info = PRECISION_INFO[precision];
    const dp = info.decimalPlaces;
    const roundedTrue = parseFloat(trueValue.toFixed(dp));
    const roundedUser = parseFloat(userValue.toFixed(dp));
    const error = Math.abs(roundedUser - roundedTrue);
    const relativeError = roundedTrue !== 0 ? error / roundedTrue : 0;
    const userDP = countDecimalPlaces(userInput);
    const userSigFigs = countSigFigs(userInput);
    const expectedSigFigs = countSigFigs(roundedTrue.toFixed(dp));
    const sigFigsCorrect = userDP === dp;
    let points = 0;
    let label = "Try Again";
    if (relativeError < 0.01) { points += 2; label = "Excellent!"; }
    else if (relativeError < 0.03) { points += 2; label = "Great!"; }
    else if (relativeError < 0.08) { points += 1; label = "Good"; }
    else if (relativeError < 0.15) { points += 1; label = "Close"; }
    if (sigFigsCorrect) { points += 1; if (points >= 3) label = "Perfect!"; }
    const result: MeasurementResult = { objectId: obj.id, trueValue, userValue, error, relativeError, sigFigsCorrect, userSigFigs, expectedSigFigs, points };
    setLastResult(result);
    setSubmitted(true);
    setShowTrueLength(true);
    setResults((prev) => [...prev, result]);
    setScorePopup({ text: label, points });
    if (points >= 3) { confettiKey.current += 1; setConfettiActive(false); requestAnimationFrame(() => setConfettiActive(true)); playSFX("success"); }
    else if (points >= 2) { playSFX("correct"); }
    else if (points >= 1) { playSFX("pop"); }
    else { playSFX("fail"); }
    if (points > 0) playScore(points);
    if (mode === "challenge") {
      const scoreResult = { points, tier: (points >= 3 ? "perfect" : points >= 2 ? "great" : points >= 1 ? "close" : "miss") as "perfect" | "great" | "close" | "miss", label };
      challengeRef.current = updateChallengeState(challengeRef.current, scoreResult);
    }
  }, [userInput, precision, mode, currentObj]);

  const handleNext = useCallback(() => {
    if (mode === "challenge") { if (challengeRound + 1 >= CHALLENGE_ROUNDS) { playSFX("success"); return; } setChallengeRound((r) => r + 1); }
    generateNewObject();
  }, [mode, challengeRound, generateNewObject]);

  const handlePrecisionChange = (p: PrecisionLevel) => {
    setPrecision(p); setSubmitted(false); setLastResult(null); setUserInput(""); setShowTrueLength(false); setScorePopup(null);
  };

  const switchMode = (newMode: GameMode) => {
    setMode(newMode); setChallengeRound(0); setResults([]); setSubmitted(false); setLastResult(null);
    setUserInput(""); setShowTrueLength(false); challengeRef.current = createChallengeState(); setScorePopup(null); setConfettiActive(false);
  };

  const challengeComplete = mode === "challenge" && challengeRound + 1 >= CHALLENGE_ROUNDS && submitted;
  const totalChallengeScore = results.reduce((sum, r) => sum + r.points, 0);
  const maxPossible = CHALLENGE_ROUNDS * 3;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-950" style={{ height: "500px" }}>
        <Canvas shadows camera={{ position: [0, 7, 10], fov: 45 }} gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.0 }} style={{ cursor: "grab" }}>
          <Scene obj={currentObj} precision={precision} showTrueLength={showTrueLength} scorePopup={scorePopup} confettiActive={confettiActive} rulerX={rulerX} onRulerDrag={handleRulerDrag} />
        </Canvas>
      </div>

      {mode === "challenge" && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-3">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-3">
              <span className="text-amber-400 font-bold">CHALLENGE MODE</span>
              <span className="text-gray-400">Round {Math.min(challengeRound + 1, CHALLENGE_ROUNDS)} / {CHALLENGE_ROUNDS}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-gray-400">Score:</span>
              <span className="text-white font-bold font-mono text-lg">{challengeRef.current.score}</span>
              {challengeRef.current.streak > 0 && <span className="text-amber-400 text-xs">Streak: {challengeRef.current.streak}</span>}
            </div>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 block">Mode</label>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => switchMode("practice")} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${mode === "practice" ? "bg-blue-600 text-white" : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"}`}>Practice</button>
          <button onClick={() => switchMode("challenge")} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${mode === "challenge" ? "bg-amber-600 text-white" : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"}`}>Challenge (5 Rounds)</button>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 block">Measurement Tool</label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {(["ruler", "fine", "caliper"] as PrecisionLevel[]).map((p) => {
            const info = PRECISION_INFO[p];
            return (
              <button key={p} onClick={() => handlePrecisionChange(p)} className={`px-4 py-3 rounded-lg text-sm font-medium transition-colors text-left ${precision === p ? "bg-indigo-600 text-white" : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"}`}>
                <div className="font-semibold">{info.label}</div>
                <div className={`text-xs mt-1 ${precision === p ? "text-indigo-200" : "text-gray-500 dark:text-gray-400"}`}>Resolution: {info.resolution} {info.unit} | {info.decimalPlaces} d.p.</div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 block">Your Measurement (cm)</label>
          <div className="flex gap-2">
            <input type="text" value={userInput} onChange={(e) => setUserInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !submitted) handleSubmit(); }} disabled={submitted} placeholder={`e.g. ${precision === "caliper" ? "2.45" : precision === "fine" ? "3.4" : "5"}`} className="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50" />
            <button onClick={handleSubmit} disabled={submitted || !userInput.trim()} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white font-medium text-sm transition-colors">Submit</button>
          </div>
          {!submitted && <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Record your answer with {PRECISION_INFO[precision].decimalPlaces} decimal place{PRECISION_INFO[precision].decimalPlaces > 1 ? "s" : ""} (instrument precision of {PRECISION_INFO[precision].label.toLowerCase()}).</p>}
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 block">Result</label>
          {lastResult ? (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">True Length:</span><span className="font-mono font-bold text-gray-900 dark:text-gray-100">{lastResult.trueValue.toFixed(PRECISION_INFO[precision].decimalPlaces)} cm</span></div>
              <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Your Answer:</span><span className="font-mono font-bold text-gray-900 dark:text-gray-100">{lastResult.userValue} cm</span></div>
              <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Abs Error:</span><span className={`font-mono font-bold ${lastResult.relativeError < 0.03 ? "text-green-500" : lastResult.relativeError < 0.1 ? "text-amber-500" : "text-red-500"}`}>{lastResult.error.toFixed(PRECISION_INFO[precision].decimalPlaces)} cm ({(lastResult.relativeError * 100).toFixed(1)}%)</span></div>
              <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Precision:</span><span className={`font-mono font-bold ${lastResult.sigFigsCorrect ? "text-green-500" : "text-red-500"}`}>{lastResult.userSigFigs} sig figs{lastResult.sigFigsCorrect ? " [correct d.p.]" : ` [need ${PRECISION_INFO[precision].decimalPlaces} d.p.]`}</span></div>
              <div className="flex justify-between items-center"><span className="text-gray-500 dark:text-gray-400">Score:</span><span className="font-mono font-bold text-lg text-indigo-500">{lastResult.points} / 3</span></div>
              <div className="flex gap-2 mt-2">
                {mode === "practice" && <button onClick={generateNewObject} className="flex-1 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors">New Object</button>}
                {mode === "challenge" && !challengeComplete && <button onClick={handleNext} className="flex-1 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium transition-colors">Next Round</button>}
              </div>
            </div>
          ) : <p className="text-sm text-gray-500 dark:text-gray-400">Position the ruler over the object, read the measurement, and submit your answer.</p>}
        </div>
      </div>

      {challengeComplete && (
        <div className="rounded-xl border-2 border-amber-500 bg-amber-50 dark:bg-amber-950/30 p-4">
          <h3 className="text-lg font-bold text-amber-700 dark:text-amber-400 mb-2">Challenge Complete!</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div><p className="text-gray-500 dark:text-gray-400">Total Score</p><p className="text-2xl font-bold font-mono text-gray-900 dark:text-gray-100">{totalChallengeScore} / {maxPossible}</p></div>
            <div><p className="text-gray-500 dark:text-gray-400">Accuracy</p><p className="text-2xl font-bold font-mono text-gray-900 dark:text-gray-100">{maxPossible > 0 ? Math.round((totalChallengeScore / maxPossible) * 100) : 0}%</p></div>
            <div><p className="text-gray-500 dark:text-gray-400">Sig Figs Correct</p><p className="text-2xl font-bold font-mono text-gray-900 dark:text-gray-100">{results.filter((r) => r.sigFigsCorrect).length} / {results.length}</p></div>
            <div><p className="text-gray-500 dark:text-gray-400">Avg Error</p><p className="text-2xl font-bold font-mono text-gray-900 dark:text-gray-100">{results.length > 0 ? ((results.reduce((s, r) => s + r.relativeError, 0) / results.length) * 100).toFixed(1) : 0}%</p></div>
          </div>
          <button onClick={() => switchMode("challenge")} className="mt-3 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium transition-colors">Try Again</button>
        </div>
      )}

      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Key Equations</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Relative Error</div>
            <SimMath math="\delta = \frac{|x_{\text{meas}} - x_{\text{true}}|}{x_{\text{true}}} \times 100\%" />
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Absolute Error</div>
            <SimMath math="\Delta x = |x_{\text{meas}} - x_{\text{true}}|" />
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Instrument Uncertainty</div>
            <SimMath math="\sigma_{\text{inst}} = \frac{\text{smallest division}}{2}" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-gray-600 dark:text-gray-400 font-mono mt-3">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Significant Figures Rules</div>
            <SimMath math="\text{Sig figs} = \text{certain digits} + 1\;\text{estimated digit}" />
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Propagation of Error (addition)</div>
            <SimMath math="\sigma_f = \sqrt{\sigma_a^2 + \sigma_b^2}" />
          </div>
        </div>
      </div>
    </div>
  );
}
