import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { ContactShadows, Environment, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { ChevronRight, ChevronDown, Eye, EyeOff, Download, Rotate3D, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Building3DViewer — interactive 3D viewer for the multi-floor building model.
 *
 * Loads every per-part .dae the server emits (Site / Floor 01 / Floor 02 / …
 * / Roof), parses the COLLADA XML directly so the layer / group hierarchy is
 * preserved 1:1 with the file, and lets the user:
 *   • orbit / pan / zoom the assembled model
 *   • click any group or layer to select it
 *   • toggle visibility per group / layer
 *   • assign a custom colour per group / layer (round-trips into the .dae so
 *     SketchUp opens with the same colours)
 *   • download the modified .dae per part (colour + visibility changes
 *     preserved); .obj / .fbx download the original (geometry only).
 *
 * The parser only understands the COLLADA shape this project emits
 * (one mesh per group, triangles only, lambert/diffuse material). It is not
 * a generic ColladaLoader.
 */

type RawPart = {
  index: number;
  label: string;
  daeDataUrl: string;
  objDataUrl: string;
  fbxDataUrl: string;
};

type GeoEntry = { gid: string; positions: Float32Array; indices: Uint32Array };
type EffectEntry = { color: [number, number, number]; alpha: number };
type TreeNode = {
  key: string; // unique within a part
  name: string;
  children: TreeNode[];
  leafGid?: string; // present on leaf nodes that bind a geometry
};

type LoadedPart = {
  index: number;
  label: string;
  daeText: string;
  root: TreeNode;
  meshes: Map<string, THREE.Mesh>; // gid -> mesh
  baseColors: Map<string, [number, number, number]>; // gid -> rgb
  group: THREE.Group;
};

type Override = {
  color?: [number, number, number]; // 0..1
  hidden?: boolean;
};

// ── tiny helpers ─────────────────────────────────────────────────────────

function dataUrlToText(url: string): string {
  if (!url.startsWith("data:")) return "";
  const comma = url.indexOf(",");
  const meta = url.slice(0, comma);
  const payload = url.slice(comma + 1);
  if (!meta.includes(";base64")) return decodeURIComponent(payload);
  const bin = atob(payload);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder("utf-8").decode(bytes);
}

function rgbToHex([r, g, b]: [number, number, number]) {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return [r, g, b];
}

// ── COLLADA parser (project-specific shape) ─────────────────────────────

function parseDae(daeText: string): { root: TreeNode; meshes: Map<string, THREE.Mesh>; baseColors: Map<string, [number, number, number]>; group: THREE.Group } | null {
  if (!daeText.trim()) return null;
  const doc = new DOMParser().parseFromString(daeText, "application/xml");
  const err = doc.querySelector("parsererror");
  if (err) return null;

  // 1. geometries by id
  const geometries = new Map<string, GeoEntry>();
  doc.querySelectorAll("library_geometries > geometry").forEach((geo) => {
    const id = geo.getAttribute("id") ?? "";
    if (!id.endsWith("_geom")) return;
    const gid = id.slice(0, -"_geom".length);
    const posArr = geo.querySelector("mesh > source > float_array");
    const triEl = geo.querySelector("mesh > triangles");
    const pEl = triEl?.querySelector("p");
    if (!posArr || !pEl) return;
    const positions = Float32Array.from((posArr.textContent ?? "").trim().split(/\s+/).map(Number));
    const indices = Uint32Array.from((pEl.textContent ?? "").trim().split(/\s+/).map(Number));
    if (positions.length === 0 || indices.length === 0) return;
    geometries.set(gid, { gid, positions, indices });
  });

  // 2. effects by gid (id format = GID_mat_fx, diffuse color is "r g b a")
  const effects = new Map<string, EffectEntry>();
  doc.querySelectorAll("library_effects > effect").forEach((fx) => {
    const id = fx.getAttribute("id") ?? "";
    if (!id.endsWith("_mat_fx")) return;
    const gid = id.slice(0, -"_mat_fx".length);
    const colorEl = fx.querySelector("profile_COMMON technique lambert diffuse color");
    if (!colorEl) return;
    const parts = (colorEl.textContent ?? "").trim().split(/\s+/).map(Number);
    const [r, g, b, a] = [parts[0] ?? 0.8, parts[1] ?? 0.8, parts[2] ?? 0.8, parts[3] ?? 1];
    effects.set(gid, { color: [r, g, b], alpha: a });
  });

  // 3. walk visual_scene tree
  const sceneRoot = doc.querySelector("library_visual_scenes > visual_scene");
  if (!sceneRoot) return null;

  const meshes = new Map<string, THREE.Mesh>();
  const baseColors = new Map<string, [number, number, number]>();
  const group = new THREE.Group();
  group.name = "BuildingPartRoot";
  // .dae is Z-up; rotate root so three's Y-up scene shows it upright.
  group.rotation.x = -Math.PI / 2;

  let keyCounter = 0;
  const walk = (el: Element, parentObj: THREE.Object3D, pathPrefix: string): TreeNode | null => {
    const name = el.getAttribute("name") ?? el.getAttribute("id") ?? "Node";
    const id = el.getAttribute("id") ?? "";
    const key = `${pathPrefix}/${name}#${keyCounter++}`;

    // Is this a leaf binding a geometry?
    const instGeo = el.querySelector(":scope > instance_geometry");
    if (instGeo && id.endsWith("_node")) {
      const gid = id.slice(0, -"_node".length);
      const geo = geometries.get(gid);
      if (geo) {
        const bufferGeom = new THREE.BufferGeometry();
        bufferGeom.setAttribute("position", new THREE.BufferAttribute(geo.positions, 3));
        bufferGeom.setIndex(new THREE.BufferAttribute(geo.indices, 1));
        bufferGeom.computeVertexNormals();
        bufferGeom.computeBoundingBox();
        const fx = effects.get(gid) ?? { color: [0.78, 0.78, 0.78] as [number, number, number], alpha: 1 };
        const mat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(fx.color[0], fx.color[1], fx.color[2]),
          roughness: 0.85,
          metalness: 0.05,
          transparent: fx.alpha < 1,
          opacity: fx.alpha,
          side: THREE.DoubleSide,
        });
        const mesh = new THREE.Mesh(bufferGeom, mat);
        mesh.name = name;
        mesh.userData.gid = gid;
        mesh.userData.key = key;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        parentObj.add(mesh);
        meshes.set(gid, mesh);
        baseColors.set(gid, fx.color);
      }
      return { key, name, children: [], leafGid: gid };
    }

    // Branch: build a child THREE.Group so visibility cascades
    const branchObj = new THREE.Group();
    branchObj.name = name;
    parentObj.add(branchObj);
    const node: TreeNode = { key, name, children: [] };
    el.querySelectorAll(":scope > node").forEach((child) => {
      const childNode = walk(child, branchObj, key);
      if (childNode) node.children.push(childNode);
    });
    return node;
  };

  const root: TreeNode = { key: "root", name: "Scene", children: [] };
  sceneRoot.querySelectorAll(":scope > node").forEach((child) => {
    const node = walk(child, group, "root");
    if (node) root.children.push(node);
  });

  return { root, meshes, baseColors, group };
}

// Rewrite a part's DAE text so the requested color overrides + visibility
// hiding round-trip into the downloaded file (so SketchUp opens with the
// same colour-coded layers the user sees in the viewer).
function rewriteDae(daeText: string, partKey: number, overrides: Map<string, Override>): string {
  let out = daeText;
  // Group overrides by gid for THIS part.
  const prefix = `${partKey}:`;
  const byGid = new Map<string, Override>();
  for (const [k, v] of overrides) {
    if (!k.startsWith(prefix)) continue;
    const gid = k.slice(prefix.length);
    byGid.set(gid, v);
  }
  if (byGid.size === 0) return out;

  // 1. Color rewrite: find `<effect id="GID_mat_fx">…<diffuse><color>…</color></diffuse>`
  for (const [gid, ov] of byGid) {
    if (!ov.color) continue;
    const [r, g, b] = ov.color;
    const effectOpenRe = new RegExp(`(<effect[^>]*id="${gid}_mat_fx"[^>]*>)`);
    const m = effectOpenRe.exec(out);
    if (!m) continue;
    const start = m.index;
    const end = out.indexOf("</effect>", start);
    if (end < 0) continue;
    const block = out.slice(start, end);
    const newBlock = block.replace(
      /(<diffuse>\s*<color[^>]*>)[^<]*(<\/color>\s*<\/diffuse>)/,
      (_full, open: string, close: string) => `${open}${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} 1.000${close}`,
    );
    out = out.slice(0, start) + newBlock + out.slice(end);
  }

  // 2. Hidden groups: strip their leaf <node id="GID_node">…</node> blocks.
  for (const [gid, ov] of byGid) {
    if (!ov.hidden) continue;
    const nodeOpenRe = new RegExp(`<node[^>]*id="${gid}_node"[^>]*>`);
    const m = nodeOpenRe.exec(out);
    if (!m) continue;
    const start = m.index;
    const end = out.indexOf("</node>", start);
    if (end < 0) continue;
    out = out.slice(0, start) + out.slice(end + "</node>".length);
  }
  return out;
}

// ── react component ──────────────────────────────────────────────────────

function FitCamera({ size, center }: { size: THREE.Vector3; center: THREE.Vector3 }) {
  const { camera } = useThree();
  useEffect(() => {
    const maxDim = Math.max(size.x, size.y, size.z, 1);
    const dist = maxDim * 1.9;
    const pc = camera as THREE.PerspectiveCamera;
    pc.position.set(center.x + dist, center.y + dist * 0.85, center.z + dist);
    pc.near = Math.max(dist / 1000, 0.01);
    pc.far = Math.max(dist * 12, 200);
    pc.lookAt(center.x, center.y, center.z);
    pc.updateProjectionMatrix();
  }, [camera, size.x, size.y, size.z, center.x, center.y, center.z]);
  return null;
}

type TreeRowProps = {
  node: TreeNode;
  partKey: number;
  depth: number;
  selectedKey: string | null;
  overrides: Map<string, Override>;
  baseColors: Map<string, [number, number, number]>;
  onSelect: (key: string) => void;
  onToggleHidden: (gid: string) => void;
  onChangeColor: (gid: string, hex: string) => void;
  onChangeBranch: (node: TreeNode, hex: string) => void;
  collapsed: Set<string>;
  toggleCollapsed: (key: string) => void;
};
function TreeRow(p: TreeRowProps) {
  const { node, depth, selectedKey, overrides, baseColors, partKey, onSelect, onToggleHidden, onChangeColor, onChangeBranch, collapsed, toggleCollapsed } = p;
  const isLeaf = !!node.leafGid;
  const ovKey = node.leafGid ? `${partKey}:${node.leafGid}` : "";
  const ov = ovKey ? overrides.get(ovKey) : undefined;
  const base = node.leafGid ? baseColors.get(node.leafGid) : undefined;
  const color = ov?.color ?? base ?? [0.78, 0.78, 0.78];
  const hex = rgbToHex(color);
  const isCollapsed = collapsed.has(node.key);
  const isSelected = selectedKey === node.key;

  return (
    <div>
      <div
        className={`flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs ${isSelected ? "bg-foreground/10" : "hover:bg-foreground/5"} cursor-pointer`}
        style={{ paddingLeft: 4 + depth * 12 }}
        onClick={() => onSelect(node.key)}
      >
        {node.children.length > 0 ? (
          <button
            type="button"
            className="flex size-4 items-center justify-center text-muted-foreground"
            onClick={(e) => { e.stopPropagation(); toggleCollapsed(node.key); }}
          >
            {isCollapsed ? <ChevronRight className="size-3" /> : <ChevronDown className="size-3" />}
          </button>
        ) : (
          <span className="size-4" />
        )}
        <input
          type="color"
          value={hex}
          aria-label="Group colour"
          className="size-4 cursor-pointer rounded-sm border border-border bg-transparent p-0"
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => {
            if (node.leafGid) onChangeColor(node.leafGid, e.target.value);
            else onChangeBranch(node, e.target.value);
          }}
        />
        <span className="flex-1 truncate" title={node.name}>{node.name}</span>
        {isLeaf && (
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground"
            onClick={(e) => { e.stopPropagation(); if (node.leafGid) onToggleHidden(node.leafGid); }}
            aria-label={ov?.hidden ? "Show" : "Hide"}
          >
            {ov?.hidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          </button>
        )}
      </div>
      {!isCollapsed && node.children.map((child) => (
        <TreeRow key={child.key} {...p} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}

export function Building3DViewer({ parts, outputUnits }: { parts: RawPart[]; outputUnits: "meters" | "feet" }) {
  const [loaded, setLoaded] = useState<LoadedPart[]>([]);
  const [overrides, setOverrides] = useState<Map<string, Override>>(new Map());
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [downloadFormat, setDownloadFormat] = useState<"dae" | "obj" | "fbx">("dae");
  const [loadError, setLoadError] = useState<string>("");
  const sceneRef = useRef<THREE.Group>(null);

  // (Re)load whenever the parts array changes (new floors arrive while
  // server keeps streaming results in).
  useEffect(() => {
    let cancelled = false;
    setLoadError("");
    (async () => {
      const next: LoadedPart[] = [];
      for (const p of parts) {
        if (!p.daeDataUrl) continue;
        try {
          const text = dataUrlToText(p.daeDataUrl);
          const parsed = parseDae(text);
          if (!parsed) continue;
          next.push({ index: p.index, label: p.label, daeText: text, root: parsed.root, meshes: parsed.meshes, baseColors: parsed.baseColors, group: parsed.group });
        } catch (err) {
          console.warn("[Building3DViewer] failed to parse part", p.label, err);
        }
      }
      if (!cancelled) {
        if (next.length === 0) setLoadError("Could not preview these parts — open the file in SketchUp instead.");
        setLoaded(next);
      }
    })();
    return () => { cancelled = true; };
  }, [parts]);

  // Re-apply overrides whenever they change (covers re-loaded parts).
  useEffect(() => {
    for (const part of loaded) {
      part.meshes.forEach((mesh, gid) => {
        const ov = overrides.get(`${part.index}:${gid}`);
        const base = part.baseColors.get(gid) ?? [0.78, 0.78, 0.78];
        const [r, g, b] = ov?.color ?? base;
        const mat = mesh.material as THREE.MeshStandardMaterial;
        mat.color.setRGB(r, g, b);
        mesh.visible = !ov?.hidden;
      });
    }
  }, [overrides, loaded]);

  const setOv = (gid: string, partIndex: number, patch: Override) => {
    setOverrides((prev) => {
      const next = new Map(prev);
      const key = `${partIndex}:${gid}`;
      next.set(key, { ...(next.get(key) ?? {}), ...patch });
      return next;
    });
  };

  const cascadeBranchColor = (part: LoadedPart, node: TreeNode, hex: string) => {
    const rgb = hexToRgb(hex);
    setOverrides((prev) => {
      const next = new Map(prev);
      const walk = (n: TreeNode) => {
        if (n.leafGid) {
          const key = `${part.index}:${n.leafGid}`;
          next.set(key, { ...(next.get(key) ?? {}), color: rgb });
        }
        n.children.forEach(walk);
      };
      walk(node);
      return next;
    });
  };

  const { sceneSize, sceneCenter } = useMemo(() => {
    if (loaded.length === 0) return { sceneSize: new THREE.Vector3(2, 2, 2), sceneCenter: new THREE.Vector3() };
    const box = new THREE.Box3();
    loaded.forEach((p) => box.expandByObject(p.group));
    if (!isFinite(box.min.x)) return { sceneSize: new THREE.Vector3(2, 2, 2), sceneCenter: new THREE.Vector3() };
    const size = new THREE.Vector3(); box.getSize(size);
    const center = new THREE.Vector3(); box.getCenter(center);
    return { sceneSize: size, sceneCenter: center };
  }, [loaded]);

  const downloadPart = (part: LoadedPart, raw: RawPart) => {
    const slug = part.label?.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "part";
    let prefix: string;
    if (part.index === -1) prefix = "00_site";
    else if (part.index === 9999) prefix = "99_roof";
    else prefix = `${String(part.index + 1).padStart(2, "0")}_floor`;
    const filename = `${prefix}_${slug}.${downloadFormat}`;

    let href: string;
    if (downloadFormat === "dae") {
      const text = rewriteDae(part.daeText, part.index, overrides);
      href = URL.createObjectURL(new Blob([text], { type: "model/vnd.collada+xml" }));
    } else if (downloadFormat === "obj") {
      href = raw.objDataUrl;
    } else {
      href = raw.fbxDataUrl;
    }
    if (!href) return;
    const a = document.createElement("a");
    a.href = href; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    if (downloadFormat === "dae") setTimeout(() => URL.revokeObjectURL(href), 1000);
  };

  const toggleCollapsed = (key: string) => setCollapsed((prev) => {
    const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next;
  });

  const maxDim = Math.max(sceneSize.x, sceneSize.y, sceneSize.z, 1);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_320px]">
        <div className="relative h-[480px] min-h-[360px] w-full overflow-hidden rounded-2xl border border-border bg-secondary lg:h-[640px]">
          <Canvas shadows dpr={[1, 2]} camera={{ position: [maxDim * 2, maxDim * 1.6, maxDim * 2], fov: 35 }}>
            <FitCamera size={sceneSize} center={sceneCenter} />
            <ambientLight intensity={0.55} />
            <directionalLight position={[maxDim, maxDim * 2, maxDim]} intensity={1.3} castShadow shadow-mapSize={[1024, 1024]} />
            <group ref={sceneRef}>
              {loaded.map((p) => (
                <primitive key={p.index} object={p.group} />
              ))}
            </group>
            <ContactShadows position={[0, 0, 0]} opacity={0.4} scale={maxDim * 4} blur={2} far={maxDim} />
            <Suspense fallback={null}>
              <Environment preset="city" />
            </Suspense>
            <OrbitControls makeDefault enablePan target={[sceneCenter.x, sceneCenter.y, sceneCenter.z]} />
          </Canvas>
          {loaded.length === 0 && !loadError && (
            <div className="absolute inset-0 flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading 3D parts…
            </div>
          )}
          {loadError && (
            <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-xs text-destructive">{loadError}</div>
          )}
          <p className="pointer-events-none absolute inset-x-0 bottom-3 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Rotate3D className="size-4" /> Drag to rotate · scroll to zoom · right-drag to pan
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-background p-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em]">Layers & Groups</p>
          <p className="mt-1 text-[10px] text-muted-foreground">Click a swatch to recolour. Eye toggles visibility. Colours round-trip into the downloaded .dae for SketchUp.</p>
          <div className="mt-3 max-h-[460px] overflow-y-auto pr-1">
            {loaded.length === 0 ? (
              <p className="px-2 py-6 text-center text-xs text-muted-foreground">No parts ready yet.</p>
            ) : loaded.map((part) => (
              <div key={part.index} className="mb-2">
                <p className="px-1 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                  {part.index === -1 ? "Site" : part.index === 9999 ? "Roof" : `Floor ${String(part.index + 1).padStart(2, "0")} — ${part.label}`}
                </p>
                {part.root.children.map((node) => (
                  <TreeRow
                    key={node.key}
                    node={node}
                    partKey={part.index}
                    depth={0}
                    selectedKey={selectedKey}
                    overrides={overrides}
                    baseColors={part.baseColors}
                    onSelect={setSelectedKey}
                    onToggleHidden={(gid) => setOv(gid, part.index, { hidden: !overrides.get(`${part.index}:${gid}`)?.hidden })}
                    onChangeColor={(gid, hex) => setOv(gid, part.index, { color: hexToRgb(hex) })}
                    onChangeBranch={(n, hex) => cascadeBranchColor(part, n, hex)}
                    collapsed={collapsed}
                    toggleCollapsed={toggleCollapsed}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {loaded.length > 0 && (
        <div className="rounded-2xl border border-border p-4">
          <p className="text-xs font-bold uppercase tracking-[0.14em]">Download by part</p>
          <p className="mt-1 text-[10px] text-muted-foreground">{outputUnits} · DAE preserves your colour & visibility edits · OBJ / FBX export original geometry.</p>
          <div className="mt-3 flex rounded-xl border border-foreground p-1">
            <Button type="button" size="sm" variant={downloadFormat === "dae" ? "default" : "ghost"} className="flex-1" onClick={() => setDownloadFormat("dae")}>.dae</Button>
            <Button type="button" size="sm" variant={downloadFormat === "obj" ? "default" : "ghost"} className="flex-1" onClick={() => setDownloadFormat("obj")}>.obj</Button>
            <Button type="button" size="sm" variant={downloadFormat === "fbx" ? "default" : "ghost"} className="flex-1" onClick={() => setDownloadFormat("fbx")}>.fbx</Button>
          </div>
          <div className="mt-3 space-y-2">
            {loaded.map((part) => {
              const raw = parts.find((p) => p.index === part.index);
              if (!raw) return null;
              let title: string;
              if (part.index === -1) title = "Site";
              else if (part.index === 9999) title = "Roof";
              else title = `Floor ${String(part.index + 1).padStart(2, "0")} — ${part.label}`;
              return (
                <Button key={part.index} variant="default" className="h-11 w-full justify-between" onClick={() => downloadPart(part, raw)}>
                  <span>{title}</span>
                  <Download />
                </Button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}