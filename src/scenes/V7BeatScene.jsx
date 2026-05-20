/**
 * src/scenes/V7BeatScene.jsx — V7 parameterized beat scene
 *
 * Extracted from the iter9 architecture that scored 74/100 + would_fit_cleo:true
 * on the aesthetic QA gate. Takes props to drive composition per beat so we
 * don't need 14 unique scene files.
 *
 * Props:
 *   backdropFile  — staticFile path of the FLUX backdrop (e.g. 'v7-backdrops/A1-pakistan-iran-hook.jpg')
 *   heroText      — main word for the title bar (e.g. 'PAKISTAN', 'SAUDI')
 *   subtitleText  — line below hero (e.g. 'JUST PICKED IRAN', 'BOMBED IRAQ')
 *   accentColor   — yellow/red/cyan accent rule (default warm gold)
 *   beatId        — 'hook' | 'establishing' | 'setup' | 'escalation' | 'climax' | 'resolution' | 'loop_cliffhanger'
 *   showFlash     — boolean, default true for hook; bass-drop white flash frame 0
 *   accent2D      — array of {x,y,w,h,color,opacity} 2D overlay elements (placeholder for future per-beat decoration)
 *
 * Used by V7OrganicComposition (composes all beats into one 32s short).
 */

import React, { Suspense } from 'react';
import { ThreeCanvas } from '@remotion/three';
import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import { Text3D, Center, Environment } from '@react-three/drei';
import { EffectComposer, DepthOfField, Bloom, Vignette, ChromaticAberration, Noise } from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const PALETTE = {
  primary: '#F4F4F0',
  warm_money: '#FFD200',
  warm_amber: '#FF9A30',
  cool_fill: '#1E90FF',
  alarm_red: '#FF3344',
  bg_low: '#04060C',
};

// ── Layer 1: Photographic backdrop with Ken Burns motion ──
function BackdropLayer({ src }) {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const scale = interpolate(frame, [0, durationInFrames], [1.04, 1.12], { extrapolateRight: 'clamp' });
  const panX = interpolate(frame, [0, durationInFrames], [0, -18], { extrapolateRight: 'clamp' });
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
          filter: 'brightness(0.62) contrast(1.06) saturate(1.06)',
        }}
      />
      {/* Lower-third dark gradient seats the title bar + drives focus to top 3/4 */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: '32%',
        background: 'linear-gradient(to top, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.22) 70%, rgba(0,0,0,0) 100%)',
        pointerEvents: 'none',
      }} />
    </AbsoluteFill>
  );
}

// ── Hero text (extruded Text3D) ──
function HookText3D({ word, scale, accentEmissive, beatId }) {
  // Sizing varies slightly per beatId so hook stays big, body beats smaller
  const sizeByBeat = {
    hook: 0.155,
    establishing: 0.135,
    setup: 0.135,
    escalation: 0.145,
    climax: 0.145,
    resolution: 0.135,
    loop_cliffhanger: 0.16,
    loop: 0.16,
  };
  const size = sizeByBeat[beatId] || 0.135;
  return (
    <Center top position={[0, -0.95, 0]} scale={scale} rotation={[-0.02, 0.02, 0]}>
      <Text3D
        font={staticFile('v7-fonts/helvetiker_bold.typeface.json')}
        size={size}
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
        {word}
        <meshPhysicalMaterial
          color="#FFF0D8"
          metalness={0.32}
          roughness={0.30}
          clearcoat={0.7}
          clearcoatRoughness={0.22}
          emissive={accentEmissive || '#FF8A30'}
          emissiveIntensity={0.28}
          envMapIntensity={1.6}
          sheen={0.5}
          sheenColor="#FFD2A0"
        />
      </Text3D>
    </Center>
  );
}

// ── Subtitle (also Text3D) ──
function HookSubtitle3D({ text, accentColor }) {
  const frame = useCurrentFrame();
  const opacity = frame < 36 ? Math.min(1, frame / 18) : 1; // fades in once, stays
  const yShift = (1 - opacity) * 0.18;
  if (opacity <= 0.02 || !text) return null;
  return (
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
        {text}
        <meshPhysicalMaterial
          color={accentColor || PALETTE.warm_money}
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

// ── Yellow accent rule (Cleo/Vox title-card signature) ──
function AccentRule({ color }) {
  return (
    <mesh position={[-0.4, -0.72, 0]}>
      <planeGeometry args={[0.5, 0.022]} />
      <meshBasicMaterial color={color || PALETTE.warm_money} toneMapped={false} />
    </mesh>
  );
}

// ── Soft warm halo behind title-bar ──
function TypeHalo({ color }) {
  return (
    <mesh position={[0, -0.95, -0.3]}>
      <planeGeometry args={[2.6, 0.7]} />
      <meshBasicMaterial
        color={color || '#FF8A30'}
        transparent
        opacity={0.28}
        depthWrite={false}
        toneMapped={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

// ── Camera rig — slight parallax dolly per beat ──
function CameraRig({ from, to, durationFrames }) {
  const frame = useCurrentFrame();
  const t = Math.min(1, frame / Math.max(1, durationFrames));
  const eased = 1 - Math.pow(1 - t, 3);
  useFrame(({ camera }) => {
    camera.position.x = from[0] + (to[0] - from[0]) * eased;
    camera.position.y = from[1] + (to[1] - from[1]) * eased;
    camera.position.z = from[2] + (to[2] - from[2]) * eased;
    camera.lookAt(0, 0.1, 0);
    camera.updateProjectionMatrix();
  });
  return null;
}

// ── Bass-drop white flash (hook & loop only) ──
function BassDropFlash({ show }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (!show) return null;
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

// ── Three.js overlay scene ──
function OverlayScene({ heroText, subtitleText, accentColor, beatId, showFlash, camera }) {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const scaleProgress = Math.min(1, frame / 21);
  const eased = 1 - Math.pow(1 - scaleProgress, 3);
  const titleScale = 0.92 + 0.10 * eased;

  // HDRI preset per beat mood
  const presetByBeat = {
    hook: 'sunset', establishing: 'dawn', setup: 'sunset', escalation: 'night',
    climax: 'sunset', resolution: 'dawn', loop_cliffhanger: 'sunset', loop: 'sunset',
  };
  const hdriPreset = presetByBeat[beatId] || 'sunset';

  return (
    <>
      <Environment preset={hdriPreset} environmentIntensity={1.1} background={false} />
      <directionalLight position={[4, 5, 3]} color="#FFB060" intensity={2.4} castShadow shadow-mapSize={[1024, 1024]} />
      <pointLight position={[-3, -1, 2]} color="#3060A0" intensity={8} decay={1.5} distance={14} />
      <ambientLight intensity={0.22} color="#2A1A14" />
      <Suspense fallback={null}>
        <TypeHalo color={accentColor === PALETTE.alarm_red ? '#FF3344' : '#FF8A30'} />
        <AccentRule color={accentColor} />
        <HookText3D word={heroText} scale={titleScale} accentEmissive={accentColor === PALETTE.alarm_red ? '#FF3344' : '#FF8A30'} beatId={beatId} />
        <HookSubtitle3D text={subtitleText} accentColor={accentColor} />
      </Suspense>
      <BassDropFlash show={showFlash} />
      <CameraRig from={camera.from} to={camera.to} durationFrames={durationInFrames} />
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

export const V7BeatScene = ({
  backdropFile,
  heroText = 'NEWS',
  subtitleText = '',
  accentColor = '#FFD200',
  beatId = 'hook',
  showFlash = true,
  camera = { from: [0.25, 0.25, 4.6], to: [-0.05, 0.1, 4.2] },
}) => {
  return (
    <AbsoluteFill style={{ backgroundColor: PALETTE.bg_low }}>
      <BackdropLayer src={staticFile(backdropFile)} />
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
        camera={{ position: camera.from, fov: 32, near: 0.1, far: 100 }}
        shadows
      >
        <OverlayScene
          heroText={heroText}
          subtitleText={subtitleText}
          accentColor={accentColor}
          beatId={beatId}
          showFlash={showFlash}
          camera={camera}
        />
      </ThreeCanvas>
    </AbsoluteFill>
  );
};
