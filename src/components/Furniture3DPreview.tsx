import { Suspense, useEffect, useMemo, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
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
function readDaeText(daeDataUrl: string) {
  if (!daeDataUrl.startsWith("data:")) return fetch(daeDataUrl).then((res) => res.text());
  const comma = daeDataUrl.indexOf(",");
  const meta = daeDataUrl.slice(0, comma);
  const payload = daeDataUrl.slice(comma + 1);
  if (!meta.includes(";base64")) return Promise.resolve(decodeURIComponent(payload));
  const binary = atob(payload);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return Promise.resolve(new TextDecoder("utf-8").decode(bytes));
}

function PreviewCamera({ maxDim, height }: { maxDim: number; height: number }) {
  const { camera } = useThree();

  useEffect(() => {
    const dist = Math.max(maxDim * 2.8, 3);
    const perspective = camera as THREE.PerspectiveCamera;
    perspective.position.set(dist, Math.max(dist * 0.72, height + 1), dist);
    perspective.near = Math.max(dist / 1000, 0.01);
    perspective.far = Math.max(dist * 12, maxDim * 12, 100);
    perspective.lookAt(0, height / 2, 0);
    perspective.updateProjectionMatrix();
  }, [camera, height, maxDim]);

  return null;
}

function useDaeScene(daeDataUrl: string) {
  const [scene, setScene] = useState<THREE.Group | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    const loader = new ColladaLoader();
    const run = async () => {
      try {
        setScene(null);
        setError("");
        const text = await readDaeText(daeDataUrl);
        if (cancelled) return;
        const collada = loader.parse(text, "");
        if (cancelled || !collada?.scene) return;
        const root = collada.scene as unknown as THREE.Group;
        // .dae authored Z-up; rotate the whole group so three's Y-up scene
        // shows it standing on the ground plane.
        root.rotation.x = -Math.PI / 2;
        // Upgrade Lambert materials to PBR-ish look using the colour the
        // exporter already wrote, so glass / metal read correctly.
        let meshCount = 0;
        root.traverse((obj) => {
          const mesh = obj as THREE.Mesh;
          if (!mesh.isMesh) return;
          meshCount += 1;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          if (mesh.geometry) {
            mesh.geometry.computeVertexNormals();
            mesh.geometry.computeBoundingBox();
            mesh.geometry.computeBoundingSphere();
          }
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material].filter(Boolean);
          mesh.material = mats.map((m) => {
            const src = m as THREE.MeshBasicMaterial & { color?: THREE.Color; opacity?: number; transparent?: boolean };
            const color = src.color ? src.color.clone() : new THREE.Color(0xcccccc);
            return new THREE.MeshStandardMaterial({
              color,
              roughness: 0.55,
              metalness: 0.0,
              side: THREE.DoubleSide,
              transparent: Boolean(src.transparent) || (src.opacity ?? 1) < 1,
              opacity: src.opacity ?? 1,
            });
          }) as unknown as THREE.Material;
          if (Array.isArray(mesh.material) && mesh.material.length === 1) mesh.material = mesh.material[0];
          if (Array.isArray(mesh.material) && mesh.material.length === 0) mesh.material = new THREE.MeshStandardMaterial({ color: 0xcccccc, side: THREE.DoubleSide });
        });
        if (meshCount === 0) throw new Error("The downloaded .dae did not contain visible mesh geometry.");
        setScene(root);
      } catch (err) {
        console.error("ColladaLoader failed", err);
        if (!cancelled) setError(err instanceof Error ? err.message : "The .dae preview could not be loaded.");
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [daeDataUrl]);
  return { scene, error };
}

export function Furniture3DPreview({ plan, daeDataUrl }: { plan?: FurniturePlan; daeDataUrl: string }) {
  const { scene, error } = useDaeScene(daeDataUrl);

  // Centre the loaded scene on the ground plane (Y up after our rotation) and
  // derive bounds straight from the geometry so the preview works for any .dae
  // (furniture OR building), not just when a furniture plan is available.
  const [centerOffset, sceneSize] = useMemo(() => {
    if (!scene) return [new THREE.Vector3(), new THREE.Vector3(1, 1, 1)] as const;
    const box = new THREE.Box3().setFromObject(scene);
    const size = new THREE.Vector3(); box.getSize(size);
    const center = new THREE.Vector3(); box.getCenter(center);
    return [new THREE.Vector3(-center.x, -box.min.y, -center.z), size] as const;
  }, [scene]);

  const maxDim = Math.max(sceneSize.x, sceneSize.y, sceneSize.z, 1);
  const cameraDist = maxDim * 2.4;
  const height = sceneSize.y;

  const usedMaterials = useMemo(() => {
    if (!plan) return [];
    const set = new Set(plan.parts.map((p) => p.material));
    return Array.from(set).map((id) => MATERIAL_PALETTE[id]);
  }, [plan]);

  return (
    <div className="space-y-3">
      <div className="relative h-[420px] min-h-[320px] w-full overflow-hidden rounded-2xl border border-border bg-secondary sm:h-[560px]">
        <Canvas
          shadows
          dpr={[1, 2]}
          camera={{ position: [cameraDist, cameraDist * 0.8, cameraDist], fov: 35 }}
        >
          <PreviewCamera maxDim={maxDim} height={height} />
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
              scale={Math.max(sceneSize.x, sceneSize.z, 1) * 3}
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
        {!scene && !error && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading .dae geometry…
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-xs text-destructive">
            {error}
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