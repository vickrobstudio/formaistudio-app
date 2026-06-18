import { Suspense, useEffect, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { ContactShadows, Environment, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { ColladaLoader } from "three/examples/jsm/loaders/ColladaLoader.js";
import { Rotate3D, Loader2 } from "lucide-react";
import {
  MATERIAL_PALETTE,
  type FurniturePlan,
} from "@/lib/floor-3d-shared";

/**
 * Loads the EXACT same Collada (.dae) file the user will download and renders
 * it in the live preview — so the rotatable view is guaranteed to match the
 * downloaded geometry 1:1. No separate primitive build path lives in the
 * browser anymore.
 */
function useDaeScene(daeDataUrl: string) {
  const [scene, setScene] = useState<THREE.Group | null>(null);
  useEffect(() => {
    let cancelled = false;
    const loader = new ColladaLoader();
    loader.load(
      daeDataUrl,
      (collada) => {
        if (cancelled || !collada?.scene) return;
        const root = collada.scene as unknown as THREE.Group;
        // .dae authored Z-up; rotate the whole group so three's Y-up scene
        // shows it standing on the ground plane.
        root.rotation.x = -Math.PI / 2;
        // Upgrade Lambert materials to PBR-ish look using the colour the
        // exporter already wrote, so glass / metal read correctly.
        root.traverse((obj) => {
          const mesh = obj as THREE.Mesh;
          if (!mesh.isMesh) return;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          mesh.material = mats.map((m) => {
            const src = m as THREE.MeshBasicMaterial & { color?: THREE.Color };
            const color = src.color ? src.color.clone() : new THREE.Color(0xcccccc);
            return new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.0 });
          }) as unknown as THREE.Material;
          if (Array.isArray(mesh.material) && mesh.material.length === 1) {
            mesh.material = mesh.material[0];
          }
        });
        setScene(root);
      },
      undefined,
      (err) => console.error("ColladaLoader failed", err),
    );
    return () => { cancelled = true; };
  }, [daeDataUrl]);
  return scene;
}

export function Furniture3DPreview({ plan, daeDataUrl }: { plan: FurniturePlan; daeDataUrl: string }) {
  const scene = useDaeScene(daeDataUrl);
  const cameraDist = Math.max(plan.bounds.width, plan.bounds.depth, plan.bounds.height) * 2.4;

  // Centre the loaded scene on the ground plane (Y up after our rotation).
  const [centerOffset, height] = useMemo(() => {
    if (!scene) return [new THREE.Vector3(), plan.bounds.height] as const;
    const box = new THREE.Box3().setFromObject(scene);
    const size = new THREE.Vector3(); box.getSize(size);
    const center = new THREE.Vector3(); box.getCenter(center);
    // Move so model is centred on X/Z and sitting on Y=0.
    return [new THREE.Vector3(-center.x, -box.min.y, -center.z), size.y] as const;
  }, [scene, plan.bounds.height]);

  const usedMaterials = useMemo(() => {
    const set = new Set(plan.parts.map((p) => p.material));
    return Array.from(set).map((id) => MATERIAL_PALETTE[id]);
  }, [plan]);

  return (
    <div className="space-y-3">
      <div className="relative aspect-square overflow-hidden rounded-2xl border border-border bg-secondary">
        <Canvas
          shadows
          dpr={[1, 2]}
          camera={{ position: [cameraDist, cameraDist * 0.8, cameraDist], fov: 35 }}
        >
          <ambientLight intensity={0.55} />
          <directionalLight
            position={[3, 6, 4]}
            intensity={1.4}
            castShadow
            shadow-mapSize={[1024, 1024]}
          />
          <Suspense fallback={null}>
            {scene && (
              <primitive object={scene} position={centerOffset.toArray()} />
            )}
            <ContactShadows
              position={[0, 0, 0]}
              opacity={0.45}
              scale={Math.max(plan.bounds.width, plan.bounds.depth) * 3}
              blur={2}
              far={4}
            />
            <Environment preset="studio" />
          </Suspense>
          <OrbitControls
            makeDefault
            enablePan
            target={[0, height / 2, 0]}
            minDistance={cameraDist * 0.4}
            maxDistance={cameraDist * 3}
          />
        </Canvas>
        {!scene && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading .dae geometry…
          </div>
        )}
        <p className="pointer-events-none absolute inset-x-0 bottom-3 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Rotate3D className="size-4" /> Drag to rotate · scroll to zoom · right-drag to pan
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {usedMaterials.map((spec) => (
          <span
            key={spec.id}
            className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em]"
          >
            <span
              aria-hidden
              className="size-3 rounded-full border border-foreground/20"
              style={{
                backgroundColor: `rgb(${Math.round(spec.color[0] * 255)},${Math.round(spec.color[1] * 255)},${Math.round(spec.color[2] * 255)})`,
              }}
            />
            {spec.label}
          </span>
        ))}
      </div>
    </div>
  );
}