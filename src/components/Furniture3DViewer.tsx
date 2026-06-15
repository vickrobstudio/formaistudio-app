import { Suspense, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Center, Environment, OrbitControls, useGLTF } from "@react-three/drei";
import { USDZExporter } from "three/examples/jsm/exporters/USDZExporter.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { Box, LoaderCircle, Rotate3D } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

function FurnitureModel({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  return <Center><primitive object={scene} /></Center>;
}

export function Furniture3DViewer({ modelUrl, onUsdExported }: { modelUrl: string; onUsdExported: (path: string) => void }) {
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");

  async function exportUsd() {
    setExporting(true);
    setError("");
    try {
      const gltf = await new GLTFLoader().loadAsync(modelUrl);
      const bytes = await new USDZExporter().parseAsync(gltf.scene);
      const blob = new Blob([bytes], { type: "model/vnd.usdz+zip" });
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("Sign in to export USDZ.");
      const path = `${userId}/furniture/${crypto.randomUUID()}.usdz`;
      const { error: uploadError } = await supabase.storage.from("user-outputs").upload(path, blob, { contentType: "model/vnd.usdz+zip" });
      if (uploadError) throw uploadError;
      onUsdExported(path);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "formai-furniture.usdz";
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "USDZ export failed.");
    } finally {
      setExporting(false);
    }
  }

  return <div className="space-y-3">
    <div className="relative aspect-square overflow-hidden rounded-2xl border border-border bg-secondary">
      <Canvas camera={{ position: [2.8, 2, 3.6], fov: 38 }} dpr={[1, 2]}>
        <ambientLight intensity={1.2} />
        <directionalLight position={[4, 6, 4]} intensity={2.2} />
        <Suspense fallback={null}><FurnitureModel url={modelUrl} /><Environment preset="studio" /></Suspense>
        <OrbitControls makeDefault enablePan={false} minDistance={1.5} maxDistance={8} autoRotate autoRotateSpeed={0.65} />
      </Canvas>
      <p className="pointer-events-none absolute inset-x-0 bottom-3 flex items-center justify-center gap-2 text-xs text-muted-foreground"><Rotate3D className="size-4" />Drag to rotate · pinch to zoom</p>
    </div>
    <Button type="button" variant="outline" className="w-full" disabled={exporting} onClick={() => void exportUsd()}>{exporting ? <LoaderCircle className="animate-spin" /> : <Box />}{exporting ? "Exporting USDZ…" : "Export & download USDZ"}</Button>
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
  </div>;
}