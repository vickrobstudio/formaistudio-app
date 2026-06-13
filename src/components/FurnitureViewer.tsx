import { Canvas } from "@react-three/fiber";
import { ContactShadows, Environment, OrbitControls, RoundedBox } from "@react-three/drei";

function Sofa({ color }: { color: string }) {
  return (
    <group rotation={[0, -0.35, 0]} position={[0, -0.15, 0]}>
      <RoundedBox args={[4.4, 0.58, 1.55]} radius={0.28} smoothness={6} position={[0, 0.35, 0]}>
        <meshStandardMaterial color={color} roughness={0.78} />
      </RoundedBox>
      <RoundedBox args={[4.15, 0.75, 0.42]} radius={0.22} smoothness={6} position={[0, 1.05, 0.58]} rotation={[-0.13, 0, 0]}>
        <meshStandardMaterial color={color} roughness={0.8} />
      </RoundedBox>
      {[-1.78, 1.78].map((x) => (
        <RoundedBox key={x} args={[0.55, 0.78, 1.45]} radius={0.25} smoothness={6} position={[x, 0.72, 0]}>
          <meshStandardMaterial color={color} roughness={0.8} />
        </RoundedBox>
      ))}
      {[-1.05, 0, 1.05].map((x) => (
        <RoundedBox key={x} args={[0.92, 0.2, 1.13]} radius={0.1} smoothness={5} position={[x, 0.71, -0.06]}>
          <meshStandardMaterial color={color} roughness={0.86} />
        </RoundedBox>
      ))}
    </group>
  );
}

export function FurnitureViewer({ color = "#5f7cff", autoRotate = false }: { color?: string; autoRotate?: boolean }) {
  return (
    <Canvas camera={{ position: [5.8, 3.4, 6.4], fov: 38 }} dpr={[1, 1.5]}>
      <color attach="background" args={["#15171c"]} />
      <ambientLight intensity={1.5} />
      <directionalLight position={[5, 8, 5]} intensity={2.6} castShadow />
      <Sofa color={color} />
      <ContactShadows position={[0, -0.48, 0]} opacity={0.4} scale={10} blur={2.5} far={4} />
      <Environment preset="apartment" />
      <OrbitControls makeDefault autoRotate={autoRotate} autoRotateSpeed={1.2} enablePan={false} minDistance={5} maxDistance={10} minPolarAngle={0.75} maxPolarAngle={1.55} />
    </Canvas>
  );
}