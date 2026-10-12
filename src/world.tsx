import React, { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Grid, Stars, Text } from '@react-three/drei';
import * as THREE from 'three';
import { simulate } from './simulation.js';
export type Obj = {
  id: string;
  kind: 'home' | 'workshop' | 'solar' | 'resident';
  position: number[];
  rotation: number;
  scale: number;
  connected: boolean;
};
export type Parcel = {
  id: string;
  owner: string;
  ownerName?: string;
  objects: Obj[];
  revision: number;
  published: boolean;
  policy: string;
  slot: number;
};
export const offset = (slot: number): [number, number] =>
  slot < 0 ? [-44, 44] : [(slot % 4) * 44, Math.floor(slot / 4) * 44];
const districts = [
  ['ACROPOLIS', 0, -48],
  ['AGORA', -43, -15],
  ['FOUNDRY', 44, -15],
  ['ACADEMY', -50, -55],
  ['MERIDIAN', 50, -55],
  ['FRONTIER', 90, 35],
  ['COMMONS', 0, 25],
] as const;
export function terrainHeight(x: number, z: number) {
  return z > 165 ? Math.sin(x * 0.04) * Math.sin((z - 165) * 0.03) * 2 : 0;
}
type Building = {
  x: number;
  z: number;
  y: number;
  width: number;
  height: number;
  scale: number;
  rotation: number;
  gold: boolean;
  id?: string;
  solar?: boolean;
};
function BuildingBatch({
  buildings,
  select,
}: {
  buildings: Building[];
  select: (id: string) => void;
}) {
  const solid = useRef<THREE.InstancedMesh>(null),
    wire = useRef<THREE.InstancedMesh>(null),
    floors = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const m = new THREE.Object3D();
    buildings.forEach((b, i) => {
      m.position.set(b.x, b.y + (b.height * b.scale) / 2, b.z);
      m.rotation.set(0, b.rotation, 0);
      m.scale.set(b.width * b.scale, b.height * b.scale, b.width * b.scale);
      m.updateMatrix();
      solid.current?.setMatrixAt(i, m.matrix);
      wire.current?.setMatrixAt(i, m.matrix);
      const color = new THREE.Color(b.gold ? '#d7bc83' : '#8fe8f5');
      solid.current?.setColorAt(i, color);
      wire.current?.setColorAt(i, new THREE.Color(b.gold ? '#d7bc83' : '#7499ad'));
      for (let j = 0; j < 3; j++) {
        m.position.y = b.y + (b.height * b.scale * (j + 1)) / 4;
        m.scale.set((b.width + 0.2) * b.scale, 0.08 * b.scale, (b.width + 0.2) * b.scale);
        m.updateMatrix();
        floors.current?.setMatrixAt(i * 3 + j, m.matrix);
        floors.current?.setColorAt(
          i * 3 + j,
          new THREE.Color(b.solar && j === 2 ? '#8fe8f5' : '#a8b4c2'),
        );
      }
    });
    for (const ref of [solid, wire, floors])
      if (ref.current) {
        ref.current.instanceMatrix.needsUpdate = true;
        if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
        ref.current.computeBoundingSphere();
      }
  }, [buildings]);
  function click(e: any) {
    const index = e.instanceId;
    if (index !== undefined && buildings[index]?.id) {
      e.stopPropagation();
      select(buildings[index].id!);
    }
  }
  return (
    <group>
      <instancedMesh ref={solid} args={[undefined, undefined, buildings.length]} onClick={click}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial transparent opacity={0.14} roughness={0.3} />
      </instancedMesh>
      <instancedMesh ref={wire} args={[undefined, undefined, buildings.length]} onClick={click}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial wireframe transparent opacity={0.55} />
      </instancedMesh>
      <instancedMesh
        ref={floors}
        args={[undefined, undefined, buildings.length * 3]}
        onClick={(e) => {
          if (e.instanceId !== undefined) {
            const b = buildings[Math.floor(e.instanceId / 3)];
            if (b?.id) {
              e.stopPropagation();
              select(b.id);
            }
          }
        }}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial />
      </instancedMesh>
    </group>
  );
}
function Resident({
  position,
  powered,
  scale = 1,
  rotation = 0,
}: {
  position: number[];
  powered: boolean;
  scale?: number;
  rotation?: number;
}) {
  const ref = useRef<THREE.Group>(null);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  useFrame(({ clock }) => {
    if (ref.current && powered && !reduce)
      ref.current.position.x = position[0] + Math.sin(clock.elapsedTime * 0.6) * 1.5;
  });
  return (
    <group
      ref={ref}
      position={[position[0], 1, position[1]]}
      scale={scale}
      rotation={[0, rotation, 0]}
    >
      <mesh>
        <capsuleGeometry args={[0.3, 0.8, 4, 8]} />
        <meshStandardMaterial color={powered ? '#8fe8f5' : '#d7bc83'} />
      </mesh>
    </group>
  );
}
function ObjectView({
  o,
  structural,
  onSelect,
}: {
  o: any;
  selected: boolean;
  structural: boolean;
  onSelect: () => void;
}) {
  return (
    <group
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
    >
      {o.kind === 'resident' && (
        <Resident
          position={o.position}
          powered={o.status === 'operational'}
          scale={o.scale}
          rotation={o.rotation}
        />
      )}{' '}
      {structural && (
        <>
          <Text
            font="/fonts/DejaVuSans.ttf"
            position={[o.position[0], 8, o.position[1]]}
            fontSize={0.6}
            color={o.status === 'constrained' ? '#d7bc83' : '#8fe8f5'}
          >
            {o.status.toUpperCase()}
          </Text>
        </>
      )}
    </group>
  );
}

function DependencyLines({ objects }: { objects: Obj[] }) {
  const points = useMemo(
    () =>
      new Float32Array(
        objects
          .filter((o) => o.connected)
          .flatMap((o) => [o.position[0], 1, o.position[1], 0, 1, 0]),
      ),
    [objects],
  );
  return (
    <lineSegments>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[points, 3]} />
      </bufferGeometry>
      <lineBasicMaterial color="#8fe8f5" />
    </lineSegments>
  );
}
function Walker({
  onMove,
  enabled,
  obstacles,
}: {
  onMove: (p: number[]) => void;
  enabled: boolean;
  obstacles: { x: number; z: number; radius: number }[];
}) {
  const ref = useRef<THREE.Group>(null),
    keys = useRef(new Set<string>()),
    pos = useRef([0, 24]),
    last = useRef(0);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).matches('input,select,textarea') || !enabled) return;
      if (
        ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(
          e.key.toLowerCase(),
        )
      )
        e.preventDefault();
      keys.current.add(e.key.toLowerCase());
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    const blur = () => keys.current.clear();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, [enabled]);
  useFrame((s, dt) => {
    (window as any).__ATHENS_PLAYER_POSITION__ = [...pos.current];
    if (!enabled) return;
    const k = keys.current;
    let dx = Number(k.has('d') || k.has('arrowright')) - Number(k.has('a') || k.has('arrowleft')),
      dz = Number(k.has('s') || k.has('arrowdown')) - Number(k.has('w') || k.has('arrowup'));
    const norm = Math.hypot(dx, dz);
    if (norm) {
      dx = (dx / norm) * Math.min(dt, 0.05) * 10;
      dz = (dz / norm) * Math.min(dt, 0.05) * 10;
      const next = [
        THREE.MathUtils.clamp(pos.current[0] + dx, -140, 185),
        THREE.MathUtils.clamp(pos.current[1] + dz, -120, 185),
      ];
      if (
        obstacles.some(
          (o) =>
            Math.abs(next[0] - o.x) < o.radius + 0.5 && Math.abs(next[1] - o.z) < o.radius + 0.5,
        )
      )
        return;
      const dy = terrainHeight(next[0], next[1]) - terrainHeight(pos.current[0], pos.current[1]);
      pos.current = next;
      ref.current?.position.set(next[0], terrainHeight(...(next as [number, number])) + 1, next[1]);
      if (ref.current) ref.current.rotation.y = Math.atan2(dx, dz);
      s.camera.position.add(new THREE.Vector3(dx, dy, dz));
      const controls = s.controls as any;
      controls?.target.add(new THREE.Vector3(dx, dy, dz));
      controls?.update();
    }
    if (s.clock.elapsedTime - last.current > 0.15) {
      last.current = s.clock.elapsedTime;
      onMove(pos.current);
    }
  });
  return (
    <group ref={ref} position={[0, 1, 24]}>
      <mesh>
        <capsuleGeometry args={[0.4, 1, 4, 8]} />
        <meshStandardMaterial color="#d7bc83" emissive="#6e5a2c" />
      </mesh>
      <mesh position={[0, 1, 0]}>
        <sphereGeometry args={[0.3, 12, 12]} />
        <meshStandardMaterial color="#f4f6f8" />
      </mesh>
    </group>
  );
}
function Camera({ build, top, origin }: { build: boolean; top: boolean; origin: number[] }) {
  const { camera, controls } = useThree(),
    destination = useRef<THREE.Vector3 | null>(null),
    target = useRef(new THREE.Vector3());
  useEffect(() => {
    destination.current = new THREE.Vector3(
      build ? origin[0] + 24 : 30,
      top ? 70 : build ? 30 : 18,
      build ? origin[1] + 35 : 60,
    );
    target.current.set(build ? origin[0] : 0, 0, build ? origin[1] : 24);
  }, [build, top, origin[0], origin[1]]);
  useFrame((_, dt) => {
    if (!destination.current) return;
    const c = controls as any;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      camera.position.copy(destination.current);
      c?.target.copy(target.current);
      destination.current = null;
    } else {
      camera.position.lerp(destination.current, 1 - Math.exp(-dt * 6));
      c?.target.lerp(target.current, 1 - Math.exp(-dt * 6));
      if (camera.position.distanceTo(destination.current) < 0.05) destination.current = null;
    }
    c?.update();
  });
  return null;
}
function PerformanceMonitor({ quality }: { quality: string }) {
  const samples = useRef<number[]>([]),
    windowSamples = useRef<number[]>([]);
  const { setDpr } = useThree();
  const current = useRef(quality === 'low' ? 1 : Math.min(devicePixelRatio, 1.5));
  useEffect(() => {
    current.current = quality === 'low' ? 1 : Math.min(devicePixelRatio, 1.5);
    setDpr(current.current);
    windowSamples.current = [];
  }, [quality, setDpr]);
  useFrame(({ gl }, dt) => {
    if (dt < 1) {
      samples.current.push(dt * 1000);
      windowSamples.current.push(dt * 1000);
      if (samples.current.length > 7200) samples.current.shift();
    }
    if (windowSamples.current.length >= 30) {
      const mean = windowSamples.current.reduce((a, b) => a + b, 0) / windowSamples.current.length;
      if (mean > 35 && current.current > 0.5) {
        current.current = Math.max(0.5, current.current - 0.1);
        setDpr(current.current);
      }
      windowSamples.current = [];
    }
    (window as any).__ATHENS_METRICS__ = {
      frameMs: samples.current,
      drawCalls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
      geometries: gl.info.memory.geometries,
      pixelRatio: current.current,
    };
  });
  return null;
}

function Terrain() {
  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(400, 400, 64, 64);
    g.rotateX(-Math.PI / 2);
    const a = g.attributes.position;
    for (let i = 0; i < a.count; i++) a.setY(i, terrainHeight(a.getX(i), a.getZ(i)) - 0.2);
    g.computeVertexNormals();
    return g;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color="#111e29" roughness={1} />
    </mesh>
  );
}
export function World({
  objects,
  select,
  selected,
  structural,
  place,
  tool,
  build,
  peers,
  move,
  top,
  quality,
  factor,
  policy,
  parcels,
  activeSlot = 0,
  enabled = true,
}: {
  objects: Obj[];
  select: (id: string) => void;
  selected: string | null;
  structural: boolean;
  place: (x: number, z: number) => void;
  tool: string | null;
  build: boolean;
  peers: any[];
  move: (p: number[]) => void;
  top: boolean;
  quality: string;
  factor: number;
  policy: string;
  parcels: Parcel[];
  activeSlot?: number;
  enabled?: boolean;
}) {
  const result = simulate(objects, factor, policy),
    origin = offset(activeSlot),
    remote = parcels.filter((p) => p.slot !== activeSlot);
  const buildings = useMemo(() => {
    const list: Building[] = districts.flatMap(([, x, z], i) =>
      i < 5
        ? Array.from({ length: i === 0 ? 9 : 7 }, (_, j) => ({
            x: x + ((j % 3) - 1) * 9,
            z: z + Math.floor(j / 3) * 8,
            y: i === 0 ? 3 : 0,
            width: i === 0 ? 4 : 5,
            height: i === 0 ? 12 : 8 + ((j * 7 + i * 3) % 22),
            scale: 1,
            rotation: 0,
            gold: i === 0,
          }))
        : [],
    );
    function add(os: any[], off: number[], editable: boolean) {
      for (const o of os)
        if (o.kind !== 'resident')
          list.push({
            x: o.position[0] + off[0],
            z: o.position[1] + off[1],
            y: 0,
            width: o.kind === 'solar' ? 5 : 3,
            height: o.kind === 'solar' ? 2 : o.kind === 'home' ? 4 : 6,
            scale: o.scale,
            rotation: o.rotation,
            gold: editable && (o.id === selected || (structural && o.status === 'constrained')),
            solar: o.kind === 'solar',
            ...(editable ? { id: o.id } : {}),
          });
    }
    add(result.objects, origin, true);
    for (const p of remote) add(p.objects, offset(p.slot), false);
    return list;
  }, [objects, parcels, selected, activeSlot, structural, factor, policy]);
  const obstacles = useMemo(
    () => [
      ...districts.flatMap(([, x, z], i) =>
        i < 5
          ? Array.from({ length: i === 0 ? 9 : 7 }, (_, j) => ({
              x: x + ((j % 3) - 1) * 9,
              z: z + Math.floor(j / 3) * 8,
              radius: i === 0 ? 2 : 2.5,
            }))
          : [],
      ),
      { x: 0, z: -40, radius: 17 },
      ...objects
        .filter((o) => o.kind !== 'resident')
        .map((o) => ({
          x: o.position[0] + origin[0],
          z: o.position[1] + origin[1],
          radius: (o.kind === 'solar' ? 3 : 2) * o.scale,
        })),
      ...remote.flatMap((p) => {
        const off = offset(p.slot);
        return p.objects
          .filter((o) => o.kind !== 'resident')
          .map((o) => ({
            x: o.position[0] + off[0],
            z: o.position[1] + off[1],
            radius: (o.kind === 'solar' ? 3 : 2) * o.scale,
          }));
      }),
    ],
    [objects, parcels, activeSlot],
  );
  return (
    <Canvas
      camera={{ position: [65, 43, 85], fov: 48 }}
      dpr={quality === 'low' ? 1 : Math.min(devicePixelRatio, 1.5)}
      gl={{ antialias: quality !== 'low' }}
    >
      <color attach="background" args={['#080e18']} />
      <fog attach="fog" args={['#102030', 85, 250]} />
      <ambientLight intensity={0.8} />
      <directionalLight position={[30, 60, 20]} intensity={2} color="#b2dcec" />
      <Stars
        radius={200}
        depth={30}
        count={quality === 'low' ? 250 : 1000}
        factor={2}
        fade
        speed={matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1}
      />
      <OrbitControls
        makeDefault
        maxPolarAngle={Math.PI / 2 - 0.05}
        minDistance={8}
        maxDistance={180}
      />
      <Camera build={build} top={top} origin={origin} />
      <Terrain />
      <BuildingBatch buildings={buildings} select={select} />
      <PerformanceMonitor quality={quality} />
      <group position={[origin[0], 0, origin[1]]}>
        <Grid
          position={[0, 0.02, 0]}
          args={[40, 40]}
          cellSize={2}
          sectionSize={10}
          cellColor="#284454"
          sectionColor="#6895a0"
          fadeDistance={120}
        />
        <mesh
          position={[0, -0.03, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          onClick={(e) => {
            if (build && tool) {
              e.stopPropagation();
              place(
                Math.round((e.point.x - origin[0]) / 2) * 2,
                Math.round((e.point.z - origin[1]) / 2) * 2,
              );
            }
          }}
        >
          <planeGeometry args={[38, 38]} />
          <meshBasicMaterial color="#244958" transparent opacity={0.4} />
        </mesh>
        {structural && (
          <>
            <mesh position={[0, 0.4, 0]}>
              <sphereGeometry args={[0.5, 12, 12]} />
              <meshBasicMaterial color="#8fe8f5" />
            </mesh>
            <Text font="/fonts/DejaVuSans.ttf" position={[0, 2, 0]} fontSize={0.5}>
              ENERGY BUS
            </Text>
          </>
        )}
        {structural && <DependencyLines objects={objects} />}
        {result.objects.map((o: any, index: number) => (
          <ObjectView
            key={o.id}
            o={o}
            selected={o.id === selected}
            structural={structural && (o.id === selected || index < (quality === 'low' ? 3 : 6))}
            onSelect={() => select(o.id)}
          />
        ))}
      </group>
      {remote.map((p) => {
        const off = offset(p.slot),
          sim = simulate(p.objects, 1, p.policy);
        return (
          <group key={p.id} position={[off[0], 0, off[1]]}>
            <Grid
              args={[38, 38]}
              cellSize={2}
              sectionSize={38}
              cellColor="#20323c"
              sectionColor="#d7bc83"
              fadeDistance={200}
            />
            <Text font="/fonts/DejaVuSans.ttf" position={[0, 1, 20]} fontSize={1} color="#d7bc83">
              {p.ownerName}'s settlement · READ ONLY
            </Text>
            {structural && <DependencyLines objects={p.objects} />}
            {sim.objects.map((o: any, index: number) => (
              <ObjectView
                key={o.id}
                o={o}
                selected={false}
                structural={structural && index < 2}
                onSelect={() => {}}
              />
            ))}
          </group>
        );
      })}
      {districts.map(([name, x, z], i) => (
        <group key={name}>
          <Text
            font="/fonts/DejaVuSans.ttf"
            position={[x, 1, z + 12]}
            rotation={[-Math.PI / 2, 0, 0]}
            fontSize={1.1}
            color={i === 0 ? '#d7bc83' : '#71919f'}
          >
            {name}
          </Text>
        </group>
      ))}
      <mesh position={[0, 1.5, -40]}>
        <boxGeometry args={[34, 3, 34]} />
        <meshStandardMaterial color="#293540" />
      </mesh>
      {[-1, 1].map((sign) => (
        <mesh key={sign} position={[sign * 32, 3, -15]}>
          <boxGeometry args={[1, 0.3, 100]} />
          <meshStandardMaterial color="#8fe8f5" emissive="#367384" emissiveIntensity={0.7} />
        </mesh>
      ))}
      <Walker enabled={enabled && !build && !top} onMove={move} obstacles={obstacles} />
      {peers.map((p) => (
        <group
          key={p.id}
          position={[p.position[0], terrainHeight(p.position[0], p.position[1]) + 1, p.position[1]]}
        >
          <mesh>
            <capsuleGeometry args={[0.4, 1, 4, 8]} />
            <meshStandardMaterial color="#8fe8f5" />
          </mesh>
          <Text font="/fonts/DejaVuSans.ttf" position={[0, 2, 0]} fontSize={0.5}>
            {p.name}
          </Text>
        </group>
      ))}
    </Canvas>
  );
}
