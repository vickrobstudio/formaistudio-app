import { Suspense, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { ContactShadows, Environment, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { Rotate3D } from "lucide-react";
import {
  MATERIAL_PALETTE,
  type FurniturePart,
  type FurniturePlan,
  type MaterialSpec,
  materialFor,
} from "@/lib/floor-3d-shared";

function buildGeometry(part: FurniturePart): THREE.BufferGeometry {
  switch (part.shape) {
    case "custom_extrusion": {
      const outline = part.outline?.length ? part.outline : [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
      const shape = new THREE.Shape();
      outline.forEach(([x, y], index) => {
        const sx = x * part.width;
        const sy = y * part.depth;
        if (index === 0) shape.moveTo(sx, sy);
        else shape.lineTo(sx, sy);
      });
      shape.closePath();
      const geo = new THREE.ExtrudeGeometry(shape, { depth: part.height, bevelEnabled: Boolean(part.edgeRadius), bevelSize: part.edgeRadius ?? 0, bevelThickness: part.edgeRadius ?? 0, bevelSegments: 5 });
      geo.translate(0, 0, -part.height / 2);
      return geo;
    }
    case "cylinder": {
      const r = part.width / 2;
      return new THREE.CylinderGeometry(r, r, part.height, 64);
    }
    case "ellipse_cylinder": {
      const geo = new THREE.CylinderGeometry(part.width / 2, part.width / 2, part.height, 64);
      const scaleMatrix = new THREE.Matrix4().makeScale(1, 1, part.depth / part.width);
      geo.applyMatrix4(scaleMatrix);
      return geo;
    }
    case "tapered_cylinder": {
      const top = (part.topDiameter ?? part.width * 0.6) / 2;
      const bottom = part.width / 2;
      return new THREE.CylinderGeometry(top, bottom, part.height, 64);
    }
    case "torus": {
      const tube = (part.tubeDiameter ?? Math.min(part.height, 0.015)) / 2;
      const ringR = Math.max(part.width / 2 - tube, tube);
      const geo = new THREE.TorusGeometry(ringR, tube, 16, 64);
      // Torus in three is in XY plane; rotate so it lies flat in plan view.
      geo.rotateX(Math.PI / 2);
      // Ellipse stretch along depth axis.
      const scaleY = part.depth / part.width;
      if (Math.abs(scaleY - 1) > 0.01) {
        geo.applyMatrix4(new THREE.Matrix4().makeScale(1, scaleY, 1));
      }
      return geo;
    }
    case "rounded_box": {
      const r = Math.max(0, Math.min(part.edgeRadius ?? 0.01, part.width / 2, part.depth / 2));
      const shape = new THREE.Shape();
      const hw = part.width / 2, hd = part.depth / 2;
      shape.moveTo(-hw + r, -hd);
      shape.lineTo(hw - r, -hd);
      shape.absarc(hw - r, -hd + r, r, -Math.PI / 2, 0, false);
      shape.lineTo(hw, hd - r);
      shape.absarc(hw - r, hd - r, r, 0, Math.PI / 2, false);
      shape.lineTo(-hw + r, hd);
      shape.absarc(-hw + r, hd - r, r, Math.PI / 2, Math.PI, false);
      shape.lineTo(-hw, -hd + r);
      shape.absarc(-hw + r, -hd + r, r, Math.PI, (3 * Math.PI) / 2, false);
      const geo = new THREE.ExtrudeGeometry(shape, { depth: part.height, bevelEnabled: false });
      // ExtrudeGeometry extrudes along +Z; centre vertically.
      geo.translate(0, 0, -part.height / 2);
      return geo;
    }
    case "box":
    default:
      return new THREE.BoxGeometry(part.width, part.depth, part.height);
  }
}

function makeMaterial(spec: MaterialSpec): THREE.Material {
  const color = new THREE.Color(spec.color[0], spec.color[1], spec.color[2]);
  if (spec.transmission && spec.transmission > 0) {
    return new THREE.MeshPhysicalMaterial({
      color,
      roughness: spec.roughness,
      metalness: spec.metalness,
      transmission: spec.transmission,
      ior: spec.ior ?? 1.5,
      transparent: true,
      thickness: 0.01,
    });
  }
  return new THREE.MeshStandardMaterial({
    color,
    roughness: spec.roughness,
    metalness: spec.metalness,
  });
}

function PartMesh({ part }: { part: FurniturePart }) {
  const geometry = useMemo(() => buildGeometry(part), [part]);
  const spec = materialFor(part.material);
  const material = useMemo(() => makeMaterial(spec), [spec]);
  // Plan coordinates: cx/cy = plan, cz = height. Our scene up axis is Y, so map
  // (X, Y_plan, Z_height) → (X, Z_height, -Y_plan) for a familiar orientation.
  const isVerticalPrimitive =
    part.shape === "cylinder" ||
    part.shape === "ellipse_cylinder" ||
    part.shape === "tapered_cylinder";
  return (
    <mesh
      castShadow
      receiveShadow
      geometry={geometry}
      material={material}
      position={[part.cx, part.cz, -part.cy]}
      rotation={[
        isVerticalPrimitive || part.shape === "torus" ? Math.PI / 2 : 0,
        (-part.rotationDegZ * Math.PI) / 180,
        0,
      ]}
    />
  );
}

export function Furniture3DPreview({ plan }: { plan: FurniturePlan }) {
  // Centre the model. Bounds origin is bottom-front-left corner.
  const centerX = plan.bounds.width / 2;
  const centerY = plan.bounds.depth / 2;
  const cameraDist = Math.max(plan.bounds.width, plan.bounds.depth, plan.bounds.height) * 2.4;

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
            <group position={[-centerX, 0, centerY]}>
              {plan.parts.map((part, i) => (
                <PartMesh key={`${part.material}_${i}_${part.shape}_${part.cx}_${part.cy}_${part.cz}`} part={part} />
              ))}
            </group>
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
            target={[0, plan.bounds.height / 2, 0]}
            minDistance={cameraDist * 0.4}
            maxDistance={cameraDist * 3}
          />
        </Canvas>
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