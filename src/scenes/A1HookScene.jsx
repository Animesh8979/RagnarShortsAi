/**
 * src/scenes/A1HookScene.jsx — V7 pilot scene (iteration 2)
 *
 * Iter 1 lesson: drei <Text> + flat scene = still reads as flat. The post-FX
 * stack needs actual 3D geometry to operate on (DoF/bloom need depth + luminance
 * sources). This iteration adds:
 *   - A slowly-rotating torus knot in the mid-ground (subtle, mostly defocused;
 *     gives DoF something to rack from)
 *   - Brighter, larger dust motes (1.5x size, additive blend, with emissive glow)
 *   - Rim-lit hero text at sane scale (fits in frame across the dolly)
 *   - No fog (was eating the starfield + bloom)
 *   - Wider camera so text fits during snap-zoom
 *   - Brighter point lights so geometry actually catches them
 *
 * Aesthetic target: Cleo Abram hook frames. The picture needs to feel 3D —
 * something soft + dimensional + warm catching the eye against deep navy.
 */

import React, { useMemo, useRef } from 'react';
import { ThreeCanvas } from '@remotion/three';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { Stars, Text, Float } from '@react-three/drei';
import { EffectComposer, DepthOfField, Bloom, Vignette, ChromaticAberration, Noise } from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const PALETTE = {
  primary: '#F4F4F0',
  warm_money: '#FFD200',
  warm_amber: '#FF9A30',
  cool_fill: '#1E90FF',
  bg_low: '#04060C',
  bg_mid: '#0A0A1F',
};

// Rotating defocused metal shape in mid-ground.
// Acts as the DoF rack point and gives bloom a luminance source.
function MidgroundSculpture() {
  const ref = useRef();
  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.getElapsedTime();
    ref.current.rotation.y = t * 0.18;
    ref.current.rotation.x = Math.sin(t * 0.25) * 0.1;
  });
  return (
    <Float floatIntensity={0.6} rotationIntensity={0.15} speed={1.0}>
      <mesh ref={ref} position={[1.4, -1.3, -2.8]} scale={0.55} castShadow>
        <torusKnotGeometry args={[0.7, 0.18, 220, 28, 2, 3]} />
        <meshPhysicalMaterial
          color="#3a2a14"
          metalness={0.95}
          roughness={0.18}
          clearcoat={1}
          clearcoatRoughness={0.15}
          emissive={PALETTE.warm_amber}
          emissiveIntensity={0.18}
        />
      </mesh>
    </Float>
  );
}

// Background slab to receive shadow and add a fill base.
function BackdropSlab() {
  return (
    <mesh position={[0, 0, -6]} receiveShadow>
      <planeGeometry args={[26, 18]} />
      <meshStandardMaterial color={PALETTE.bg_mid} roughness={0.95} metalness={0.0} />
    </mesh>
  );
}

// Subtle ground plane catching key light from below-left.
function GroundPlane() {
  return (
    <mesh position={[0, -2.6, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[40, 40]} />
      <meshStandardMaterial color="#0a0e1c" roughness={0.9} metalness={0.1} />
    </mesh>
  );
}

// Bright additive dust motes — 320 motes, varied size, warm tint.
function DustMotes({ count = 320 }) {
  const ref = useRef();
  const seedData = useMemo(() => {
    const arr = [];
    for (let i = 0; i < count; i++) {
      arr.push({
        x: (Math.random() - 0.5) * 18,
        y: (Math.random() - 0.5) * 14 - 4,
        z: (Math.random() - 0.5) * 10 - 1,
        speed: 0.06 + Math.random() * 0.14,
        phase: Math.random() * Math.PI * 2,
        wave: 0.2 + Math.random() * 0.6,
      });
    }
    return arr;
  }, [count]);

  const positions = useMemo(() => {
    const a = new Float32Array(count * 3);
    seedData.forEach((s, i) => {
      a[i * 3] = s.x; a[i * 3 + 1] = s.y; a[i * 3 + 2] = s.z;
    });
    return a;
  }, [count, seedData]);

  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.getElapsedTime();
    const positionAttr = ref.current.geometry.attributes.position;
    const arr = positionAttr.array;
    for (let i = 0; i < count; i++) {
      const s = seedData[i];
      arr[i * 3] = s.x + Math.sin(t * 0.4 + s.phase) * s.wave;
      arr[i * 3 + 1] = s.y + t * s.speed;
      arr[i * 3 + 2] = s.z + Math.cos(t * 0.3 + s.phase) * 0.2;
      if (arr[i * 3 + 1] > 7) s.y = -8 - Math.random() * 2;
    }
    positionAttr.needsUpdate = true;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" array={positions} count={count} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial
        size={0.13}
        sizeAttenuation
        color="#FFE0B0"
        transparent
        opacity={1.0}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </points>
  );
}

// Camera rig — dolly+pan, ease-out-cubic, over 2.5s
function CameraRig({ from, to, durationFrames }) {
  const frame = useCurrentFrame();
  const t = Math.min(1, frame / durationFrames);
  const eased = 1 - Math.pow(1 - t, 3);
  useFrame(({ camera }) => {
    camera.position.x = from.position[0] + (to.position[0] - from.position[0]) * eased;
    camera.position.y = from.position[1] + (to.position[1] - from.position[1]) * eased;
    camera.position.z = from.position[2] + (to.position[2] - from.position[2]) * eased;
    const lx = (from.lookAt?.[0] ?? 0) + ((to.lookAt?.[0] ?? 0) - (from.lookAt?.[0] ?? 0)) * eased;
    const ly = (from.lookAt?.[1] ?? 0) + ((to.lookAt?.[1] ?? 0) - (from.lookAt?.[1] ?? 0)) * eased;
    const lz = (from.lookAt?.[2] ?? 0) + ((to.lookAt?.[2] ?? 0) - (from.lookAt?.[2] ?? 0)) * eased;
    camera.lookAt(lx, ly, lz);
    camera.updateProjectionMatrix();
  });
  return null;
}

// Hero hook text — sized to fit during the dolly, with bloom-catching luminance.
function HookText({ frame }) {
  const subtitleOpacity = frame < 36 ? 0 : Math.min(1, (frame - 36) / 18);
  const subShift = (1 - subtitleOpacity) * 0.25;
  const scaleProgress = Math.min(1, frame / 21);
  const easedScale = 1 - Math.pow(1 - scaleProgress, 3);
  const scale = 1.0 + 0.12 * easedScale;
  return (
    <group position={[0, 0.5, 0]}>
      <Text
        position={[0, 0, 0]}
        fontSize={0.38 * scale}
        color={PALETTE.primary}
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.014}
        outlineColor="#000000"
        outlineBlur={0.006}
        material-toneMapped={false}
        letterSpacing={0.03}
      >
        PAKISTAN
      </Text>
      {/* Sub-line with warm gold — anchored just below the hero word */}
      <group position={[0, -0.5 - subShift, 0.001]}>
        <Text
          fontSize={0.17}
          color={PALETTE.warm_money}
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.006}
          outlineColor="#000000"
          fillOpacity={subtitleOpacity}
          strokeOpacity={subtitleOpacity}
          material-toneMapped={false}
          letterSpacing={0.05}
        >
          JUST PICKED IRAN
        </Text>
      </group>
    </group>
  );
}

// White flash on frame 0
function BassDropFlash({ frame, fps }) {
  const t = frame / fps;
  const opacity = t < 0.13 ? 0.42 * (1 - t / 0.13) : 0;
  if (opacity <= 0) return null;
  return (
    <mesh position={[0, 0, 4]}>
      <planeGeometry args={[40, 40]} />
      <meshBasicMaterial color="white" transparent opacity={opacity} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

function HookSceneInner() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <>
      <color attach="background" args={[PALETTE.bg_low]} />
      {/* Lights — turned up so the sculpture + ground actually catch them */}
      <ambientLight color="#0A0A18" intensity={0.42} />
      <pointLight position={[3.5, 3.5, 3.5]} color={PALETTE.warm_money} intensity={28} decay={1.3} distance={20} castShadow shadow-mapSize={[1024, 1024]} />
      <pointLight position={[-4, 2, 2.5]} color={PALETTE.cool_fill} intensity={12} decay={1.4} distance={18} />
      <pointLight position={[0, 0.5, -4]} color="#FFFFFF" intensity={16} decay={1.2} distance={20} />
      {/* Spot from above to light the type from front-right */}
      <spotLight position={[2.5, 5, 4]} angle={0.7} penumbra={0.6} intensity={45} color="#FFD2A0" decay={1.3} distance={18} castShadow />
      <BackdropSlab />
      <GroundPlane />
      <Stars radius={70} depth={30} count={2800} factor={3.5} saturation={0} fade speed={0.5} />
      <MidgroundSculpture />
      <DustMotes count={320} />
      <HookText frame={frame} />
      <BassDropFlash frame={frame} fps={fps} />
      <CameraRig
        from={{ position: [0.3, 0.5, 8.5], lookAt: [0, 0.4, 0] }}
        to={{ position: [-0.1, 0.1, 7.0], lookAt: [0.1, 0.55, 0] }}
        durationFrames={75}
      />
      <EffectComposer multisampling={2}>
        <DepthOfField focusDistance={0.04} focalLength={0.05} bokehScale={4.5} />
        <Bloom intensity={0.95} luminanceThreshold={0.5} luminanceSmoothing={0.4} mipmapBlur />
        <Vignette offset={0.32} darkness={0.6} blendFunction={BlendFunction.NORMAL} />
        <ChromaticAberration offset={[0.0011, 0.0011]} blendFunction={BlendFunction.NORMAL} />
        <Noise opacity={0.06} blendFunction={BlendFunction.OVERLAY} />
      </EffectComposer>
    </>
  );
}

export const A1HookScene = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: PALETTE.bg_low }}>
      <ThreeCanvas
        width={1080}
        height={1920}
        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance', toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.0 }}
        camera={{ position: [0.3, 0.5, 8.5], fov: 28, near: 0.1, far: 100 }}
        shadows
      >
        <HookSceneInner />
      </ThreeCanvas>
    </AbsoluteFill>
  );
};
