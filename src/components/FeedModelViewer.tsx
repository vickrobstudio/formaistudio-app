import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { Center, Environment, OrbitControls, useGLTF } from "@react-three/drei";
import { Rotate3D } from "lucide-react";

function Model({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  return <Center><primitive object={scene} /></Center>;
}

export function FeedModelViewer({ url }: { url: string }) {
  return (
    <div className="relative aspect-[4/5] w-full overflow-hidden bg-secondary">
      <Canvas camera={{ position: [4.5, 3.5, 5.5], fov: 38 }} dpr={[1, 2]}>
        <ambientLight intensity={1.1} />
        <directionalLight position={[5, 8, 4]} intensity={2.1} />
        <Suspense fallback={null}>
          <Model url={url} />
          <Environment preset="city" />
        </Suspense>
        <OrbitControls makeDefault enablePan={false} minDistance={2} maxDistance={20} autoRotate autoRotateSpeed={0.55} />
      </Canvas>
      <p className="pointer-events-none absolute inset-x-0 bottom-3 flex items-center justify-center gap-2 text-[11px] text-muted-foreground">
        <Rotate3D className="size-3.5" />Drag to orbit · pinch to zoom
      </p>
    </div>
  );
}