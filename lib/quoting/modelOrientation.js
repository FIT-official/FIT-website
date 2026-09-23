/**
 * The geometry engine and layer estimator use Z as print height. glTF uses
 * Y-up; OBJ has no declared up-axis, so the app assumes Y-up to match its viewer.
 * STL and 3MF retain their Z-up convention. This rotation never changes units.
 */
export function sourceUpAxis(fileName = '') {
  const extension = String(fileName).split(/[?#]/)[0].split('.').pop().toLowerCase()
  return ['obj', 'gltf', 'glb'].includes(extension) ? 'y' : 'z'
}

export function positionsInPrintAxes(positions, fileName) {
  if (sourceUpAxis(fileName) !== 'y') return positions
  const rotated = positions.slice()
  // +90 degrees around X: (x,y,z) -> (x,-z,y), a proper rotation (determinant +1).
  // Unlike swapping Y and Z alone, this preserves winding as well as volume.
  for (let i = 0; i < rotated.length; i += 3) {
    rotated[i + 1] = -positions[i + 2]
    rotated[i + 2] = positions[i + 1]
  }
  return rotated
}
