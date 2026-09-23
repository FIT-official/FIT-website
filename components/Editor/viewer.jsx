'use client';
import React from 'react';
import useStore from '@/utils/store';
import PrintStudio from '@/components/3D/PrintStudio';

export default function Viewer({ scene: suppliedScene, fileName: suppliedFileName, ...props }) {
    const scene = useStore(state => state.scene);
    const fileName = useStore(state => state.fileName);
    const loading = useStore(state => state.loading);
    const error = useStore(state => state.loadError);
    return <PrintStudio {...props} scene={suppliedScene ?? scene} fileName={suppliedFileName ?? fileName}
        loading={props.loading ?? loading} error={props.error ?? error} />;
}
