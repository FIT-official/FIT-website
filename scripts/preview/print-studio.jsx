import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import * as THREE from 'three';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import PrintStudio from '@/components/3D/PrintStudio';
import '@/app/globals.css';

function makeBracket() {
    const shape = new THREE.Shape();
    shape.moveTo(-24, 0); shape.lineTo(24, 0); shape.lineTo(24, 8); shape.lineTo(18, 8);
    shape.lineTo(18, 28); shape.absarc(0, 28, 18, 0, Math.PI, false);
    shape.lineTo(-18, 8); shape.lineTo(-24, 8); shape.closePath();
    const opening = new THREE.Path(); opening.absarc(0, 28, 11, 0, Math.PI * 2, true); shape.holes.push(opening);
    for (const x of [-19.5, 19.5]) {
        const hole = new THREE.Path(); hole.absarc(x, 4, 1.7, 0, Math.PI * 2, true); shape.holes.push(hole);
    }
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: 14, bevelEnabled: true, bevelThickness: 0.45, bevelSize: 0.45, bevelSegments: 3, curveSegments: 64 });
    geometry.rotateX(Math.PI / 2);
    const source = new THREE.Mesh(geometry);
    const data = new STLExporter().parse(source, { binary: true });
    // Exercise the real STL parser, then the production PrintStudio component.
    const mesh = new THREE.Mesh(new STLLoader().parse(data.buffer), new THREE.MeshStandardMaterial({ color: '#eae5dc' }));
    mesh.name = 'Body';
    const scene = new THREE.Group(); scene.add(mesh);
    return scene;
}

function Preview() {
    const scene = useMemo(makeBracket, []);
    const [colour, setColour] = useState('#27828b');
    const [layer, setLayer] = useState(0.2);
    return <main style={{ minHeight: '100vh', padding: '32px', background: '#faf9f6', color: '#27313c' }}>
        <header style={{ maxWidth: '1280px', margin: '0 auto 24px', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '18px' }}>
            <div><p style={{ fontSize: '11px', letterSpacing: '.16em', marginBottom: '8px', color: '#78816f', fontWeight: 700 }}>PRINT STUDIO</p>
                <h1 style={{ fontSize: '30px', marginBottom: '8px' }}>Cable bracket</h1>
                <p style={{ fontSize: '13px', color: '#73808a' }}>STL geometry · millimetres · Z-up source · matte filament</p></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {[['Ocean', '#27828b'], ['Warm white', '#eae5dc'], ['Graphite', '#4c5055']].map(([name, hex]) => <button type="button" key={name} onClick={() => setColour(hex)}
                    style={{ padding: '10px 12px', borderRadius: '20px', border: colour === hex ? '1px solid #1c575e' : '1px solid #dadeda', background: colour === hex ? '#e4eff0' : '#fff', fontSize: '12px' }}>{name}</button>)}
                <label style={{ fontSize: '12px' }}>Layer height <select aria-label="Layer height" value={layer} onChange={event => setLayer(Number(event.target.value))}
                    style={{ padding: '9px', borderRadius: '8px', background: 'white', marginLeft: '8px', border: '1px solid #dadeda' }}>
                    <option value="0.12">0.12 mm</option><option value="0.2">0.20 mm</option><option value="0.32">0.32 mm</option>
                </select></label>
            </div>
        </header>
        <div style={{ maxWidth: '1280px', height: 'calc(100vh - 190px)', minHeight: '440px', margin: 'auto', border: '1px solid #e5e4dc', borderRadius: '18px', overflow: 'hidden' }}>
            <PrintStudio scene={scene} fileName="cable-bracket.stl" meshColors={{ Body: colour }} layerHeight={layer} />
        </div>
        <p style={{ maxWidth: '1280px', margin: '14px auto 0', fontSize: '12px', color: '#81867f' }}>Surface texture approximates printed layers. Dimensions come from the loaded mesh; no slicing or toolpath simulation is performed.</p>
    </main>;
}

createRoot(document.getElementById('root')).render(<Preview />);
