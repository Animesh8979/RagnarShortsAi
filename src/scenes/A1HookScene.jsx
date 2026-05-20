/**
 * src/scenes/A1HookScene.jsx — V7 iter5 (composite architecture)
 *
 * Diagnosis verdict (iter4 aesthetic QA, 25/100): pilot was 100% primitive
 * Three.js (drei SDF text + torus knot + point lights) — that's not how
 * Cleo / Vox / TLDR / Nat-Geo render shorts. Real cinema = composite of:
 *
 *   1. Photographic backdrop layer (real footage or AI-generated still)
 *   2. 3D dimensional overlay (extruded geometry with HDRI lighting)
 *   3. Post-FX pass over the composite
 *
 * iter5 implements all three layers:
 *
 *   - LAYER 1: Remotion <Img> of a Pollinations FLUX cinematic still
 *     (Pakistan-Iran border at dusk, military trucks queuing, golden-hour
 *     rim light, photorealistic) with a Ken Burns pan+zoom over the beat
 *     duration. This gives a real photographic backdrop with motion.
 *
 *   - LAYER 2: Three.js transparent canvas with EXTRUDED Text3D using the
 *     Helvetiker Bold typeface JSON font — real geometry with bevels,
 *     metalness, clearcoat. drei <Environment preset="night" /> provides
 *     HDRI environment lighting (proper reflections + motivated lighting,
 *     not generic point lights). Camera dolly+pan creates parallax.
 *
 *   - LAYER 3: @react-three/postprocessing — DoF, Bloom, Vignette,
 *     ChromaticAberration, Noise — applies to the Three.js canvas but
 *     also softens the backdrop visually through compositing.
 *
 *   - Subtle dark gradient overlay on lower 25% to seat the caption layer.
 */

import React, { Suspense } from 'react';
import { ThreeCanvas } from '@remotion/three';
import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import { Text3D, Center, Environment, Float } from '@react-three/drei';
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
};

// ── Layer 1: Photographic backdrop with Ken Burns motion ──
function BackdropLayer({ src }) {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  // Subtle Ken Burns: scale 1.05 → 1.12 and slight horizontal pan
  const scale = interpolate(frame, [0, durationInFrames], [1.05, 1.12], { extrapolateRight: 'clamp' });
  const panX = interpolate(frame, [0, durationInFrames], [0, -20], { extrapolateRight: 'clamp' });
  const panY = interpolate(frame, [0, durationInFrames], [0, -10], { extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <Img
        src={src}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transform: `translate(${panX}px, ${panY}px) scale(${scale})`,
          transformOrigin: 'center center',
          filter: 'brightness(0.65) contrast(1.05) saturate(1.05)',
        }}
      />
      {/* Lower-third dark gradient — seats the caption layer + drives focus to top 3/4 */}
      <div
        style={{
          position: 'absolute',
          bottom: 0, left: 0, right: 0,
          height: '32%',
          background: 'linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.2) 70%, rgba(0,0,0,0) 100%)',
          pointerEvents: 'none',
        }}
      />
    </AbsoluteFill>
  );
}

// ── Layer 2 helpers ──

// Animated 3D extruded hero text with snap-zoom.
function HookText3D({ word, fps }) {
  const frame = useCurrentFrame();
  const scaleProgress = Math.min(1, frame / 21);
  const eased = 1 - Math.pow(1 - scaleProgress, 3);
  const scale = 0.9 + 0.18 * eased;
  return (
    // Cleo-style lower-left positioning: text becomes a "title card" identifier,
    // the photographic backdrop dominates the frame. Anchor at the LEFT of the
    // bounding box so it lands at ~10% inset from left edge of frame.
    <Center top position={[0.0, -0.95, 0]} scale={scale} rotation={[-0.02, 0.02, 0]}>
      <Text3D
        font={staticFile('v7-fonts/helvetiker_bold.typeface.json')}
        size={0.155}
        height={0.085}
        curveSegments={14}
        bevelEnabled
        bevelThickness={0.012}
        bevelSize={0.007}
        bevelOffset={0}
        bevelSegments={8}
        letterSpacing={-0.012}
        castShadow
        receiveShadow
      >
        PAKISTAN
        <meshPhysicalMaterial
          color="#FFF0D8"
          metalness={0.32}
          roughness={0.30}
          clearcoat={0.7}
          clearcoatRoughness={0.22}
          emissive="#FF8A30"
          emissiveIntensity={0.28}
          envMapIntensity={1.6}
          sheen={0.5}
          sheenColor="#FFD2A0"
        />
      </Text3D>
    </Center>
  );
}

// Yellow accent rule above the type — Cleo / Vox title-card signature
function AccentRule() {
  return (
    <mesh position={[-0.4, -0.72, 0]}>
      <planeGeometry args={[0.5, 0.022]} />
      <meshBasicMaterial
        color="#FFD200"
        toneMapped={false}
      />
    </mesh>
  );
}

// Soft warm halo behind the title bar so the type integrates with the scene
function TypeHalo() {
  return (
    <mesh position={[0, -0.95, -0.3]}>
      <planeGeometry args={[2.6, 0.7]} />
      <meshBasicMaterial
        color="#FF8A30"
        transparent
        opacity={0.28}
        depthWrite={false}
        toneMapped={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

// Sub-line fades in at frame 36
function HookSubtitle3D({ frame }) {
  const opacity = frame < 36 ? 0 : Math.min(1, (frame - 36) / 18);
  const yShift = (1 - opacity) * 0.22;
  if (opacity <= 0.02) return null;
  return (
    // Subtitle sits just below hero text in the lower-left title-bar zone
    <Center top position={[0, -1.13 - yShift, 0.05]}>
      <Text3D
        font={staticFile('v7-fonts/helvetiker_bold.typeface.json')}
        size={0.062}
        height={0.014}
        curveSegments={10}
        bevelEnabled
        bevelThickness={0.003}
        bevelSize={0.002}
        bevelSegments={4}
        letterSpacing={0.04}
      >
        JUST PICKED IRAN
        <meshPhysicalMaterial
          color={PALETTE.warm_money}
          metalness={0.40}
          roughness={0.32}
          clearcoat={0.5}
          emissive={PALETTE.warm_amber}
          emissiveIntensity={0.35}
          envMapIntensity={1.0}
          transparent
          opacity={opacity}
        />
      </Text3D>
    </Center>
  );
}

// Camera rig — dolly + slight pan for parallax against backdrop
function CameraRig({ from, to, durationFrames }) {
  const frame = useCurrentFrame();
  const t = Math.min(1, frame / durationFrames);
  const eased = 1 - Math.pow(1 - t, 3);
  useFrame(({ camera }) => {
    camera.position.x = from.position[0] + (to.position[0] - from.position[0]) * eased;
    camera.position.y = from.position[1] + (to.position[1] - from.position[1]) * eased;
    camera.position.z = from.position[2] + (to.position[2] - from.position[2]) * eased;
    camera.lookAt(0, 0.3, 0);
    camera.updateProjectionMatrix();
  });
  return null;
}

// White flash on frame 0 (bass-drop visual cue) — in front of camera
function BassDropFlash({ frame, fps }) {
  const t = frame / fps;
  const opacity = t < 0.13 ? 0.42 * (1 - t / 0.13) : 0;
  if (opacity <= 0) return null;
  return (
    <mesh position={[0, 0, 1.5]}>
      <planeGeometry args={[20, 30]} />
      <meshBasicMaterial color="white" transparent opacity={opacity} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

// ── Layer 2: Three.js overlay ──
function OverlayScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <>
      {/* HDRI environment for motivated lighting — 'sunset' matches the dusk
          backdrop so the text catches warm reflections that read as "lit by
          the sun in the backdrop" */}
      <Environment preset="sunset" environmentIntensity={1.1} background={false} />
      {/* Warm key from the upper-right — matches sun position in backdrop */}
      <directionalLight position={[4, 5, 3]} color="#FFB060" intensity={2.4} castShadow shadow-mapSize={[1024, 1024]} />
      {/* Cool fill from below-left — picks up shadow detail */}
      <pointLight position={[-3, -1, 2]} color="#3060A0" intensity={8} decay={1.5} distance={14} />
      <ambientLight intensity={0.22} color="#2A1A14" />
      <Suspense fallback={null}>
        <TypeHalo />
        <AccentRule />
        <HookText3D word="PAKISTAN" fps={fps} />
        <HookSubtitle3D frame={frame} />
      </Suspense>
      <BassDropFlash frame={frame} fps={fps} />
      <CameraRig
        from={{ position: [0.25, 0.25, 4.6] }}
        to={{ position: [-0.05, 0.1, 4.2] }}
        durationFrames={75}
      />
      <EffectComposer multisampling={4}>
        <DepthOfField focusDistance={0.018} focalLength={0.06} bokehScale={7.0} />
        <Bloom intensity={0.95} luminanceThreshold={0.45} luminanceSmoothing={0.55} mipmapBlur />
        <Vignette offset={0.28} darkness={0.62} blendFunction={BlendFunction.NORMAL} />
        <ChromaticAberration offset={[0.0014, 0.0014]} blendFunction={BlendFunction.NORMAL} />
        <Noise opacity={0.07} blendFunction={BlendFunction.OVERLAY} />
      </EffectComposer>
    </>
  );
}

// ── Public composition ──
export const A1HookScene = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: PALETTE.bg_low }}>
      <BackdropLayer src={staticFile('v7-backdrops/A1-hook-backdrop.jpg')} />
      <ThreeCanvas
        width={1080}
        height={1920}
        gl={{
          antialias: true,
          alpha: true,
          premultipliedAlpha: false,
          powerPreference: 'high-performance',
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.05,
        }}
        camera={{ position: [0.25, 0.25, 4.6], fov: 32, near: 0.1, far: 100 }}
        shadows
      >
        <OverlayScene />
      </ThreeCanvas>
    </AbsoluteFill>
  );
};
