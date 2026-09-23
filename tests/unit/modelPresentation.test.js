import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import JSZip from 'jszip';
import { cameraFit, createPrintedMaterial, disposePrintModel, filamentSurface, modelConvention, preparePrintModel, stylePrintModel } from '@/lib/modelPresentation';
import { declared3mfUnit, threeMfMillimetresPerUnit, validate3mfArchive } from '@/lib/modelUnits';
import { computeMetricsFromObject } from '@/lib/quoting/threeGeometryAdapter';
import { normaliseMeshNames } from '@/lib/modelMeshNames';

function sourceModel(dimensions = [20, 30, 40]) {
    const source = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...dimensions), new THREE.MeshStandardMaterial({ color: '#ff0000' }));
    mesh.name = 'Body'; source.add(mesh);
    return { source, mesh };
}

describe('printed model presentation', () => {
    it('uses the file convention without guessing units from model size', () => {
        expect(modelConvention('part.stl')).toEqual({ millimetresPerUnit: 1, upAxis: 'z' });
        expect(modelConvention('part.glb')).toEqual({ millimetresPerUnit: 1000, upAxis: 'y' });
        expect(modelConvention('part.obj')).toEqual({ millimetresPerUnit: 1, upAxis: 'y' });
        expect(modelConvention('part.stl', 'y').upAxis).toBe('y');
    });
    it('grounds a Z-up STL in display space without changing its geometry or pricing metrics', () => {
        const { source, mesh } = sourceModel();
        source.position.set(12, -17, 60);
        const before = computeMetricsFromObject(source, 'part.stl');
        const positions = Array.from(mesh.geometry.attributes.position.array);
        const model = preparePrintModel(source, { fileName: 'part.stl' });
        const bounds = new THREE.Box3().setFromObject(model.root, true);
        expect(bounds.min.y).toBeCloseTo(0);
        expect(model.dimensionsMm.width).toBeCloseTo(20);
        expect(model.dimensionsMm.depth).toBeCloseTo(30);
        expect(model.dimensionsMm.height).toBeCloseTo(40);
        expect(source.position.toArray()).toEqual([12, -17, 60]);
        expect(source.rotation.toArray().slice(0, 3)).toEqual([0, 0, 0]);
        expect(Array.from(mesh.geometry.attributes.position.array)).toEqual(positions);
        expect(computeMetricsFromObject(source, 'part.stl')).toEqual(before);
    });
    it('converts glTF metres to display millimetres exactly once and keeps authored transforms', () => {
        const { source } = sourceModel([0.02, 0.03, 0.04]);
        source.scale.setScalar(2);
        const model = preparePrintModel(source, { fileName: 'part.glb' });
        expect(model.dimensionsMm.width).toBeCloseTo(40);
        expect(model.dimensionsMm.height).toBeCloseTo(60);
        expect(model.dimensionsMm.depth).toBeCloseTo(80);
        expect(source.scale.toArray()).toEqual([2, 2, 2]);
    });
    it('fits tall and wide screens using both horizontal and vertical field of view', () => {
        const landscape = cameraFit(50, 2);
        const portrait = cameraFit(50, 0.5);
        expect(portrait.distance).toBeGreaterThan(landscape.distance);
        expect(landscape.near).toBeLessThan(landscape.distance - 50);
        expect(landscape.far).toBeGreaterThan(landscape.distance + 50);
        expect(cameraFit(0.0001).near).toBeGreaterThan(0);
    });
    it('uses matte nonmetal filament and accepts precise per-mesh colour', () => {
        const { source, mesh } = sourceModel();
        const model = preparePrintModel(source, { fileName: 'part.stl' });
        stylePrintModel(model.root, { meshColors: { Body: '#147d91' }, materialType: 'plastic', layerHeight: 0.16 });
        const displayed = model.root.getObjectByName('Body');
        expect(displayed.material.color.getHexString()).toBe('147d91');
        expect(displayed.material.roughness).toBeGreaterThan(0.65);
        expect(displayed.material.metalness).toBe(0);
        expect(mesh.material.color.getHexString()).toBe('ff0000');
    });
    it('adds anti-aliased layer shading at a millimetre pitch without moving vertices', () => {
        const material = createPrintedMaterial({ layerHeight: 0.16, showLayers: true });
        const shader = { uniforms: {}, vertexShader: '#include <common>\n#include <project_vertex>', fragmentShader: '#include <common>\n#include <normal_fragment_maps>' };
        material.onBeforeCompile(shader);
        expect(shader.uniforms.fitLayerHeight.value).toBe(0.16);
        expect(shader.fragmentShader).toContain('fwidth(fitPhase)');
        expect(shader.vertexShader).not.toContain('transformed +=');
        expect(filamentSurface('resin').metalness).toBe(0);
    });
    it('never disposes shared source geometry when a preview unmounts', () => {
        const { source, mesh } = sourceModel();
        const geometryDispose = vi.spyOn(mesh.geometry, 'dispose');
        const model = preparePrintModel(source);
        disposePrintModel(model.root);
        expect(geometryDispose).not.toHaveBeenCalled();
    });
    it('rejects empty models with a useful error', () => {
        expect(() => preparePrintModel(new THREE.Group())).toThrow('visible 3D geometry');
    });
    it('restores per-part colour keys consistently across repeated model loads', () => {
        function namesAfterLoad() {
            const scene = new THREE.Group();
            for (const name of ['', 'Part 1', 'casing.top', 'casing.top', 'constructor']) {
                const part = new THREE.Mesh(); part.name = name; scene.add(part);
            }
            normaliseMeshNames(scene);
            return scene.children.map(part => part.name);
        }
        const names = namesAfterLoad();
        expect(namesAfterLoad()).toEqual(names);
        expect(new Set(names).size).toBe(5);
        expect(names.every(name => !/[.$]/.test(name) && name !== 'constructor')).toBe(true);
    });
});

describe('3MF declared units', () => {
    it.each([['millimeter', 1], ['inch', 25.4], ['meter', 1000], ['micron', 0.001]])('reads %s', (unit, scale) => {
        expect(declared3mfUnit(`<model unit='${unit}'/>`)).toBe(scale);
    });
    it('rejects an unknown unit including inherited object property names', () => {
        expect(() => declared3mfUnit('<model unit="toString"/>')).toThrow('Unsupported 3MF unit');
    });
    it('reads the packaged unit and rejects mixed units instead of silently mismeasuring', async () => {
        const zip = new JSZip(); zip.file('3D/3dmodel.model', '<model unit="inch"/>');
        expect(await threeMfMillimetresPerUnit(await zip.generateAsync({ type: 'arraybuffer' }))).toBe(25.4);
        zip.file('3D/other.model', '<model unit="meter"/>');
        await expect(threeMfMillimetresPerUnit(await zip.generateAsync({ type: 'arraybuffer' }))).rejects.toThrow('different units');
    });
    it('verifies actual DEFLATE expansion and rejects lying directory sizes', async () => {
        const zip = new JSZip(); zip.file('3D/3dmodel.model', '<model unit="inch">' + ' '.repeat(500_000) + '</model>');
        const buffer = await zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
        expect(await threeMfMillimetresPerUnit(buffer)).toBe(25.4);
        const view = new DataView(buffer);
        for (let index = 0; index < buffer.byteLength - 46; index++) {
            if (view.getUint32(index, true) === 0x02014b50 && view.getUint32(index + 24, true) > 1000) {
                view.setUint32(index + 24, 100, true);
            }
        }
        await expect(threeMfMillimetresPerUnit(buffer)).rejects.toThrow('declared size');
    });
    it('rejects oversized expansion in the ZIP directory before decompression', async () => {
        const zip = new JSZip(); zip.file('3D/3dmodel.model', '<model/>');
        const buffer = await zip.generateAsync({ type: 'arraybuffer' });
        const view = new DataView(buffer);
        for (let index = 0; index < buffer.byteLength - 46; index++) {
            if (view.getUint32(index, true) === 0x02014b50) { view.setUint32(index + 24, 200 * 1024 * 1024, true); break; }
        }
        expect(() => validate3mfArchive(buffer)).toThrow('preview limit');
    });
});
