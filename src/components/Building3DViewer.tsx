import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { ContactShadows, Environment, OrbitControls, OrthographicCamera, TransformControls } from "@react-three/drei";
import * as THREE from "three";
import { ChevronRight, ChevronDown, Eye, EyeOff, Lock, Unlock, Download, Move3D, RotateCw, MousePointer2, Rotate3D, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Building3DViewer — interactive ortho 3D editor for the multi-floor model.
 *
 * Loads every per-part .dae the server emits, parses the COLLADA XML so the
 * layer / group hierarchy is preserved 1:1 with the file, and lets the user:
 *   • orbit / pan / zoom in true parallel (orthographic) projection
 *   • click any group in the tree (or in the scene) to select it
 *   • lock / unlock individual elements so they can't be edited by accident
 *   • translate (gizmo) up/down/left/right/forward/back
 *   • rotate around any axis with a rotation gizmo
 *   • assign a custom colour per group (recursive for branches)
 *   • toggle visibility per group
 *   • download the modified .dae per part — colour, visibility, position and
 *     rotation edits are baked into the file so SketchUp opens with the same
 *     colour-coded, repositioned layers as separate editable groups.
 */

type RawPart = {
  index: number;
  label: string;
  daeDataUrl: string;
  objDataUrl: string;
  mtlDataUrl?: string;
  fbxDataUrl: string;
};

type GeoEntry = { gid: string; positions: Float32Array; indices: Uint32Array };
type EffectEntry = { color: [number, number, number]; alpha: number };
type TreeNode = {
  key: string;        // unique within a part — used for selection / overrides
  xmlId: string;      // exact id="…" attribute from the source DAE
  name: string;
  children: TreeNode[];
  leafGid?: string;   // present on leaves binding a <geometry>
};

type LoadedPart = {
  index: number;
  label: string;
  daeText: string;
  root: TreeNode;
  group: THREE.Group;
  meshes: Map<string, THREE.Mesh>;                       // gid -> mesh
  baseColors: Map<string, [number, number, number]>;     // gid -> base rgb
  objects: Map<string, THREE.Object3D>;                  // key -> object (branch or leaf)
  xmlIds: Map<string, string>;                           // key -> xml id
};

type Override = {
  color?: [number, number, number];          // 0..1 rgb
  hidden?: boolean;
  locked?: boolean;
  position?: [number, number, number];       // local translation in three space
  rotation?: [number, number, number];       // euler XYZ radians
};
type GizmoMode = "select" | "translate" | "rotate";

// ── helpers ──────────────────────────────────────────────────────────────
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
  return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
}

// ── DAE parser (project-specific shape) ─────────────────────────────────
function parseDae(daeText: string) {
  if (!daeText.trim()) return null;
  const doc = new DOMParser().parseFromString(daeText, "application/xml");
  if (doc.querySelector("parsererror")) return null;

  // geometries by gid
  const geometries = new Map<string, GeoEntry>();
  doc.querySelectorAll("library_geometries > geometry").forEach((geo) => {
    const id = geo.getAttribute("id") ?? "";
    if (!id.endsWith("_geom")) return;
    const gid = id.slice(0, -"_geom".length);
    const posArr = geo.querySelector("mesh > source > float_array");
    const pEl = geo.querySelector("mesh > triangles > p");
    if (!posArr || !pEl) return;
    const positions = Float32Array.from((posArr.textContent ?? "").trim().split(/\s+/).map(Number));
    const indices = Uint32Array.from((pEl.textContent ?? "").trim().split(/\s+/).map(Number));
    if (!positions.length || !indices.length) return;
    geometries.set(gid, { gid, positions, indices });
  });

  // diffuse effects by gid
  const effects = new Map<string, EffectEntry>();
  doc.querySelectorAll("library_effects > effect").forEach((fx) => {
    const id = fx.getAttribute("id") ?? "";
    if (!id.endsWith("_mat_fx")) return;
    const gid = id.slice(0, -"_mat_fx".length);
    const colorEl = fx.querySelector("profile_COMMON technique lambert diffuse color");
    if (!colorEl) return;
    const v = (colorEl.textContent ?? "").trim().split(/\s+/).map(Number);
    effects.set(gid, { color: [v[0] ?? 0.8, v[1] ?? 0.8, v[2] ?? 0.8], alpha: v[3] ?? 1 });
  });

  const sceneRoot = doc.querySelector("library_visual_scenes > visual_scene");
  if (!sceneRoot) return null;

  const meshes = new Map<string, THREE.Mesh>();
  const baseColors = new Map<string, [number, number, number]>();
  const objects = new Map<string, THREE.Object3D>();
  const xmlIds = new Map<string, string>();

  const group = new THREE.Group();
  group.name = "BuildingPartRoot";
  // Source DAE is Z_UP; orient for three's Y-up scene
  group.rotation.x = -Math.PI / 2;

  let counter = 0;
  const walk = (el: Element, parentObj: THREE.Object3D, pathPrefix: string): TreeNode | null => {
    const name = el.getAttribute("name") ?? el.getAttribute("id") ?? "Node";
    const xmlId = el.getAttribute("id") ?? "";
    const key = `${pathPrefix}/${name}#${counter++}`;
    const instGeo = el.querySelector(":scope > instance_geometry");
    if (instGeo && xmlId.endsWith("_node")) {
      const gid = xmlId.slice(0, -"_node".length);
      const geo = geometries.get(gid);
      if (!geo) return null;
      const bg = new THREE.BufferGeometry();
      bg.setAttribute("position", new THREE.BufferAttribute(geo.positions, 3));
      bg.setIndex(new THREE.BufferAttribute(geo.indices, 1));
      bg.computeVertexNormals();
      bg.computeBoundingBox();
      const fx = effects.get(gid) ?? { color: [0.78, 0.78, 0.78] as [number, number, number], alpha: 1 };
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(fx.color[0], fx.color[1], fx.color[2]),
        roughness: 0.85, metalness: 0.05,
        transparent: fx.alpha < 1, opacity: fx.alpha,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(bg, mat);
      mesh.name = name;
      mesh.userData.gid = gid;
      mesh.userData.key = key;
      mesh.castShadow = true; mesh.receiveShadow = true;
      parentObj.add(mesh);
      meshes.set(gid, mesh);
      baseColors.set(gid, fx.color);
      objects.set(key, mesh);
      xmlIds.set(key, xmlId);
      return { key, xmlId, name, children: [], leafGid: gid };
    }
    const branch = new THREE.Group();
    branch.name = name;
    branch.userData.key = key;
    parentObj.add(branch);
    const node: TreeNode = { key, xmlId, name, children: [] };
    objects.set(key, branch);
    xmlIds.set(key, xmlId);
    el.querySelectorAll(":scope > node").forEach((c) => {
      const cn = walk(c, branch, key);
      if (cn) node.children.push(cn);
    });
    return node;
  };

  const root: TreeNode = { key: "root", xmlId: "", name: "Scene", children: [] };
  sceneRoot.querySelectorAll(":scope > node").forEach((c) => {
    const n = walk(c, group, "root");
    if (n) root.children.push(n);
  });
  return { root, meshes, baseColors, group, objects, xmlIds };
}

// Bake colour / visibility / transform edits back into the DAE for download.
function rewriteDae(part: LoadedPart, overrides: Map<string, Override>): string {
  let out = part.daeText;
  const prefix = `${part.index}:`;
  const partOv = new Map<string, Override>();
  for (const [k, v] of overrides) if (k.startsWith(prefix)) partOv.set(k.slice(prefix.length), v);
  if (partOv.size === 0) return out;

  // 1) Recolour effects whose key has a colour override (only leaves bind gid)
  for (const node of part.objects) {
    const [key, obj] = node;
    const ov = partOv.get(key);
    if (!ov?.color) continue;
    const gid = (obj as THREE.Mesh).userData?.gid as string | undefined;
    if (!gid) continue;
    const [r, g, b] = ov.color;
    const re = new RegExp(`(<effect[^>]*id="${gid}_mat_fx"[^>]*>)`);
    const m = re.exec(out);
    if (!m) continue;
    const start = m.index;
    const end = out.indexOf("</effect>", start);
    if (end < 0) continue;
    const block = out.slice(start, end);
    const newBlock = block.replace(
      /(<diffuse>\s*<color[^>]*>)[^<]*(<\/color>\s*<\/diffuse>)/,
      (_f, o: string, c: string) => `${o}${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} 1.000${c}`,
    );
    out = out.slice(0, start) + newBlock + out.slice(end);
  }

  // 2) Bake transforms as a <matrix sid="transform"> inside each affected
  //    <node id="XMLID"> (works for both branches and leaves).
  for (const [key, ov] of partOv) {
    const moved = ov.position || ov.rotation;
    if (!moved) continue;
    const xmlId = part.xmlIds.get(key);
    if (!xmlId) continue;
    const pos = ov.position ?? [0, 0, 0];
    const rot = ov.rotation ?? [0, 0, 0];
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(pos[0], pos[1], pos[2]),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2], "XYZ")),
      new THREE.Vector3(1, 1, 1),
    );
    // three Matrix4.elements is column-major; COLLADA expects row-major (16 floats)
    const e = m.elements;
    const rowMajor = [
      e[0], e[4], e[8], e[12],
      e[1], e[5], e[9], e[13],
      e[2], e[6], e[10], e[14],
      e[3], e[7], e[11], e[15],
    ].map((n) => n.toFixed(6)).join(" ");
    const matrixTag = `<matrix sid="transform">${rowMajor}</matrix>`;
    const re = new RegExp(`(<node[^>]*id="${xmlId}"[^>]*>)`);
    const mm = re.exec(out);
    if (!mm) continue;
    const insertAt = mm.index + mm[0].length;
    // Don't double-insert if an existing matrix is somehow there
    if (out.slice(insertAt, insertAt + 200).includes('<matrix sid="transform">')) continue;
    out = out.slice(0, insertAt) + "\n      " + matrixTag + out.slice(insertAt);
  }

  // 3) Strip hidden leaf nodes so they don't appear in SketchUp at all.
  for (const [key, ov] of partOv) {
    if (!ov.hidden) continue;
    const xmlId = part.xmlIds.get(key);
    if (!xmlId || !xmlId.endsWith("_node")) continue;
    const re = new RegExp(`<node[^>]*id="${xmlId}"[^>]*>`);
    const m = re.exec(out);
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
    const dist = maxDim * 2.4;
    camera.position.set(center.x + dist, center.y + dist * 0.9, center.z + dist);
    camera.lookAt(center.x, center.y, center.z);
    if ((camera as THREE.OrthographicCamera).isOrthographicCamera) {
      const ortho = camera as THREE.OrthographicCamera;
      ortho.zoom = Math.min(window.innerWidth, 900) / (maxDim * 1.6);
      ortho.near = -maxDim * 10;
      ortho.far = maxDim * 20;
      ortho.updateProjectionMatrix();
    }
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
  onToggleHidden: (key: string) => void;
  onToggleLocked: (key: string) => void;
  onChangeColor: (key: string, gid: string | undefined, hex: string) => void;
  onChangeBranch: (node: TreeNode, hex: string) => void;
  collapsed: Set<string>;
  toggleCollapsed: (key: string) => void;
};
function TreeRow(p: TreeRowProps) {
  const { node, depth, selectedKey, overrides, baseColors, partKey, onSelect, onToggleHidden, onToggleLocked, onChangeColor, onChangeBranch, collapsed, toggleCollapsed } = p;
  const ovKey = `${partKey}:${node.key}`;
  const ov = overrides.get(ovKey);
  const isLeaf = !!node.leafGid;
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
          <button type="button" className="flex size-4 items-center justify-center text-muted-foreground" onClick={(e) => { e.stopPropagation(); toggleCollapsed(node.key); }}>
            {isCollapsed ? <ChevronRight className="size-3" /> : <ChevronDown className="size-3" />}
          </button>
        ) : <span className="size-4" />}
        <input
          type="color"
          value={hex}
          aria-label="Group colour"
          className="size-4 cursor-pointer rounded-sm border border-border bg-transparent p-0"
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => { if (isLeaf) onChangeColor(node.key, node.leafGid, e.target.value); else onChangeBranch(node, e.target.value); }}
        />
        <span className="flex-1 truncate" title={node.name}>{node.name}</span>
        <button type="button" className="text-muted-foreground hover:text-foreground" onClick={(e) => { e.stopPropagation(); onToggleLocked(node.key); }} aria-label={ov?.locked ? "Unlock" : "Lock"}>
          {ov?.locked ? <Lock className="size-3.5" /> : <Unlock className="size-3.5 opacity-50" />}
        </button>
        <button type="button" className="text-muted-foreground hover:text-foreground" onClick={(e) => { e.stopPropagation(); onToggleHidden(node.key); }} aria-label={ov?.hidden ? "Show" : "Hide"}>
          {ov?.hidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
        </button>
      </div>
      {!isCollapsed && node.children.map((child) => (
        <TreeRow key={child.key} {...p} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}

// TransformControls bridge: attach to the selected Object3D and report changes.
function Gizmo({ object, mode, locked, onObjectChange, onDraggingChange }: {
  object: THREE.Object3D | null;
  mode: GizmoMode;
  locked: boolean;
  onObjectChange: () => void;
  onDraggingChange: (dragging: boolean) => void;
}) {
  if (!object || locked || mode === "select") return null;
  return (
    <TransformControls
      object={object}
      mode={mode === "translate" ? "translate" : "rotate"}
      size={0.9}
      onObjectChange={onObjectChange}
      onMouseUp={() => onDraggingChange(false)}
      onMouseDown={() => onDraggingChange(true)}
    />
  );
}

export function Building3DViewer({ parts, outputUnits }: { parts: RawPart[]; outputUnits: "meters" | "feet" }) {
  const [loaded, setLoaded] = useState<LoadedPart[]>([]);
  const [overrides, setOverrides] = useState<Map<string, Override>>(new Map());
  const [selectedPart, setSelectedPart] = useState<number | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [gizmoMode, setGizmoMode] = useState<GizmoMode>("select");
  const [orbitEnabled, setOrbitEnabled] = useState(true);
  const [downloadFormat, setDownloadFormat] = useState<"dae" | "obj" | "fbx">("dae");
  const [loadError, setLoadError] = useState("");
  const orbitRef = useRef<unknown>(null);

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
          next.push({ index: p.index, label: p.label, daeText: text, ...parsed });
        } catch (err) { console.warn("[Building3DViewer] parse failed", p.label, err); }
      }
      if (cancelled) return;
      if (next.length === 0) setLoadError("Could not preview these parts — download the .dae and open in SketchUp instead.");
      setLoaded(next);
    })();
    return () => { cancelled = true; };
  }, [parts]);

  // Apply overrides whenever they (or the loaded scene) change
  useEffect(() => {
    for (const part of loaded) {
      part.meshes.forEach((mesh, gid) => {
        const ov = overrides.get(`${part.index}:${mesh.userData.key}`);
        const base = part.baseColors.get(gid) ?? [0.78, 0.78, 0.78];
        const [r, g, b] = ov?.color ?? base;
        (mesh.material as THREE.MeshStandardMaterial).color.setRGB(r, g, b);
      });
      part.objects.forEach((obj, key) => {
        const ov = overrides.get(`${part.index}:${key}`);
        obj.visible = !ov?.hidden;
        if (ov?.position) obj.position.set(ov.position[0], ov.position[1], ov.position[2]);
        if (ov?.rotation) obj.rotation.set(ov.rotation[0], ov.rotation[1], ov.rotation[2]);
      });
    }
  }, [overrides, loaded]);

  const setOv = (partIndex: number, key: string, patch: Override) => {
    setOverrides((prev) => {
      const next = new Map(prev);
      const k = `${partIndex}:${key}`;
      next.set(k, { ...(next.get(k) ?? {}), ...patch });
      return next;
    });
  };
  const cascadeBranchColor = (partIndex: number, node: TreeNode, hex: string) => {
    const rgb = hexToRgb(hex);
    setOverrides((prev) => {
      const next = new Map(prev);
      const walk = (n: TreeNode) => {
        const k = `${partIndex}:${n.key}`;
        if (n.leafGid) next.set(k, { ...(next.get(k) ?? {}), color: rgb });
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
  const maxDim = Math.max(sceneSize.x, sceneSize.y, sceneSize.z, 1);

  // Resolve currently selected object across parts
  const selectedObject = useMemo(() => {
    if (selectedKey == null || selectedPart == null) return null;
    const part = loaded.find((p) => p.index === selectedPart);
    return part?.objects.get(selectedKey) ?? null;
  }, [selectedKey, selectedPart, loaded]);
  const selectedOv = (selectedKey && selectedPart != null) ? overrides.get(`${selectedPart}:${selectedKey}`) : undefined;

  const handleObjectChange = () => {
    if (!selectedObject || selectedKey == null || selectedPart == null) return;
    const p = selectedObject.position;
    const r = selectedObject.rotation;
    setOv(selectedPart, selectedKey, {
      position: [p.x, p.y, p.z],
      rotation: [r.x, r.y, r.z],
    });
  };

  const downloadPart = (part: LoadedPart, raw: RawPart, materialsOnly = false) => {
    const slug = part.label?.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "part";
    let prefix: string;
    if (part.index === -1) prefix = "00_site";
    else if (part.index === 9999) prefix = "99_roof";
    else prefix = `${String(part.index + 1).padStart(2, "0")}_floor`;
    const baseName = `${prefix}_${slug}`;
    const filename = `${baseName}.${materialsOnly ? "mtl" : downloadFormat}`;
    let href: string;
    if (materialsOnly) {
      href = raw.mtlDataUrl ?? "";
    } else if (downloadFormat === "dae") {
      const text = rewriteDae(part, overrides);
      href = URL.createObjectURL(new Blob([text], { type: "model/vnd.collada+xml" }));
    } else if (downloadFormat === "obj") {
      const text = dataUrlToText(raw.objDataUrl).replace(/^mtllib .*$/m, `mtllib ${baseName}.mtl`);
      href = URL.createObjectURL(new Blob([text], { type: "model/obj" }));
    } else {
      href = raw.fbxDataUrl;
    }
    if (!href) return;
    const a = document.createElement("a");
    a.href = href; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    if (href.startsWith("blob:")) setTimeout(() => URL.revokeObjectURL(href), 1000);
  };

  const toggleCollapsed = (key: string) => setCollapsed((prev) => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });

  return (
    <div className="space-y-3">
      {/* Top toolbar */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-background p-2">
        <span className="px-2 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Parallel view editor</span>
        <div className="ml-auto flex items-center gap-1">
          <Button type="button" size="sm" variant={gizmoMode === "select" ? "default" : "ghost"} onClick={() => setGizmoMode("select")} className="h-8 gap-1 px-2 text-xs">
            <MousePointer2 className="size-3.5" /> Select
          </Button>
          <Button type="button" size="sm" variant={gizmoMode === "translate" ? "default" : "ghost"} onClick={() => setGizmoMode("translate")} className="h-8 gap-1 px-2 text-xs">
            <Move3D className="size-3.5" /> Move
          </Button>
          <Button type="button" size="sm" variant={gizmoMode === "rotate" ? "default" : "ghost"} onClick={() => setGizmoMode("rotate")} className="h-8 gap-1 px-2 text-xs">
            <RotateCw className="size-3.5" /> Rotate
          </Button>
          {selectedObject && selectedKey && selectedPart != null && (
            <>
              <Button type="button" size="sm" variant="ghost" onClick={() => setOv(selectedPart, selectedKey, { locked: !selectedOv?.locked })} className="h-8 gap-1 px-2 text-xs">
                {selectedOv?.locked ? <Lock className="size-3.5" /> : <Unlock className="size-3.5" />}
                {selectedOv?.locked ? "Locked" : "Unlocked"}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => {
                setOverrides((prev) => {
                  const next = new Map(prev);
                  const k = `${selectedPart}:${selectedKey}`;
                  const cur = next.get(k);
                  if (cur) { delete cur.position; delete cur.rotation; next.set(k, { ...cur }); }
                  return next;
                });
                if (selectedObject) { selectedObject.position.set(0, 0, 0); selectedObject.rotation.set(0, 0, 0); }
              }} className="h-8 px-2 text-xs">Reset position</Button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_320px]">
        <div className="relative h-[520px] min-h-[360px] w-full overflow-hidden rounded-2xl border border-border bg-secondary lg:h-[680px]">
          <Canvas shadows dpr={[1, 2]}>
            <OrthographicCamera makeDefault position={[maxDim * 2, maxDim * 1.8, maxDim * 2]} zoom={50} near={-maxDim * 10} far={maxDim * 20} />
            <FitCamera size={sceneSize} center={sceneCenter} />
            <ambientLight intensity={0.6} />
            <directionalLight position={[maxDim, maxDim * 2, maxDim]} intensity={1.2} castShadow shadow-mapSize={[1024, 1024]} />
            <group>
              {loaded.map((p) => (
                <primitive
                  key={p.index}
                  object={p.group}
                  onClick={(e: { stopPropagation: () => void; object: THREE.Object3D }) => {
                    e.stopPropagation();
                    const obj = e.object;
                    const k = (obj.userData?.key as string) ?? null;
                    if (k) { setSelectedPart(p.index); setSelectedKey(k); }
                  }}
                />
              ))}
            </group>
            <Gizmo
              object={selectedObject}
              mode={gizmoMode}
              locked={!!selectedOv?.locked}
              onObjectChange={handleObjectChange}
              onDraggingChange={(d) => setOrbitEnabled(!d)}
            />
            <ContactShadows position={[0, 0, 0]} opacity={0.35} scale={maxDim * 4} blur={2} far={maxDim} />
            <Suspense fallback={null}>
              <Environment preset="city" />
            </Suspense>
            <OrbitControls
              ref={orbitRef as React.Ref<never>}
              makeDefault
              enablePan
              enableRotate={orbitEnabled}
              enableZoom={orbitEnabled}
              target={[sceneCenter.x, sceneCenter.y, sceneCenter.z]}
            />
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
            <Rotate3D className="size-4" /> Parallel view · drag to orbit · scroll to zoom · right-drag to pan
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-background p-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em]">Layers & Groups</p>
          <p className="mt-1 text-[10px] text-muted-foreground">Click a row to select. Swatch recolours · eye hides · lock prevents moves. Edits round-trip into the downloaded .dae for SketchUp.</p>
          <div className="mt-3 max-h-[520px] overflow-y-auto pr-1">
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
                    selectedKey={selectedPart === part.index ? selectedKey : null}
                    overrides={overrides}
                    baseColors={part.baseColors}
                    onSelect={(k) => { setSelectedPart(part.index); setSelectedKey(k); }}
                    onToggleHidden={(k) => setOv(part.index, k, { hidden: !overrides.get(`${part.index}:${k}`)?.hidden })}
                    onToggleLocked={(k) => setOv(part.index, k, { locked: !overrides.get(`${part.index}:${k}`)?.locked })}
                    onChangeColor={(k, _gid, hex) => setOv(part.index, k, { color: hexToRgb(hex) })}
                    onChangeBranch={(n, hex) => cascadeBranchColor(part.index, n, hex)}
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
          <p className="mt-1 text-[10px] text-muted-foreground">{outputUnits} · DAE preserves colour, visibility, position and rotation edits · OBJ / FBX export original geometry.</p>
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
                <div key={part.index} className="space-y-2"><Button variant="default" className="h-11 w-full justify-between" onClick={() => downloadPart(part, raw)}>
                  <span>{title}</span>
                  <Download />
                </Button>
                {downloadFormat === "obj" && raw.mtlDataUrl && <Button variant="outline" className="w-full" onClick={() => downloadPart(part, raw, true)}>Download materials (.mtl) — {title}</Button>}
                {downloadFormat === "obj" && <p className="text-xs text-muted-foreground">Keep the OBJ and MTL files together in the same folder before importing.</p>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}