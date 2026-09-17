import { FrontSide, Mesh, type Object3D, type Material } from "three";

/** Prepare an independent export copy; never mutate the interactive preview. */
export function cloneForUSDZ(source: Object3D): Object3D {
  const copy = source.clone(true);
  copy.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.geometry = object.geometry.clone();
    if (!object.geometry.getAttribute("normal")) object.geometry.computeVertexNormals();
    const prepareMaterial = (material: Material) => {
      const cloned = material.clone();
      cloned.side = FrontSide;
      if ("wireframe" in cloned) cloned.wireframe = false;
      return cloned;
    };
    object.material = Array.isArray(object.material)
      ? object.material.map(prepareMaterial)
      : prepareMaterial(object.material);
  });
  return copy;
}

export function disposeUSDZCopy(copy: Object3D): void {
  copy.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.geometry.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => material.dispose());
  });
}
