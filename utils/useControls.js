import { useControls as useLevaControls, button } from 'leva';
import { downloadImage } from './export';
import {
  VisualConfig,
  LightingConfig,
  DimensionsConfig,
  PrintabilityConfig,
  MaterialType,
  PresetType,
  EnvironmentType,
  AlignmentType
} from '@/components/editorConfigs/types';

/**
 * Hook to manage visual appearance controls
 */
export const useVisualControls = () => {
  const [controls] = useLevaControls('visual', () => ({
    color: '#ffffff',
    background: '#111111',
    wireframe: false,
    materialType: {
      value: 'plastic',
      options: ['plastic', 'resin', 'metal', 'sandstone'],
    },
  }));

  return {
    color: controls.color,
    background: controls.background,
    wireframe: controls.wireframe,
    materialType: controls.materialType,
  };
};

/**
 * Hook to manage lighting controls
 */
export const useLightingControls = () => {
  const [controls] = useLevaControls('lighting', () => ({
    autoRotate: true,
    lightIntensity: { value: 1, min: 0, max: 2, step: 0.1 },
    preset: {
      value: 'rembrandt',
      options: ['rembrandt', 'portrait', 'upfront', 'soft'],
    },
    environment: {
      value: 'city',
      options: [
        'sunset', 'dawn', 'night', 'warehouse', 'forest',
        'apartment', 'studio', 'city', 'park', 'lobby',
      ],
    },
  }));

  return {
    autoRotate: controls.autoRotate,
    lightIntensity: controls.lightIntensity,
    preset: controls.preset,
    environment: controls.environment,
  };
};

/**
 * Hook to manage dimension controls
 */
export const useDimensionControls = () => {
  const [controls] = useLevaControls('dimensions', () => ({
    modelScale: { value: 1, min: 0.01, max: 10, step: 0.01 },
    rotationX: { value: 0, min: 0, max: 360 },
    rotationY: { value: 0, min: 0, max: 360 },
    rotationZ: { value: 0, min: 0, max: 360 },
    alignment: {
      value: 'auto',
      options: ['auto', 'snap to floor', 'center'],
    },
  }));

  return {
    modelScale: controls.modelScale,
    rotationX: controls.rotationX,
    rotationY: controls.rotationY,
    rotationZ: controls.rotationZ,
    alignment: controls.alignment,
  };
};

/**
 * Hook to manage printability controls
 */
export const usePrintabilityControls = () => {
  const [controls] = useLevaControls('printability', () => ({
    wallThickness: { value: 1.0, min: 0.2, max: 10, step: 0.1 },
    overhangSupport: true,
    hollowModel: false,
    slicePreview: false,
  }));

  return {
    wallThickness: controls.wallThickness,
    overhangSupport: controls.overhangSupport,
    hollowModel: controls.hollowModel,
    slicePreview: controls.slicePreview,
  };
};

/**
 * Hook to manage export controls
 */
export const useExportControls = (fileName) => {
  useLevaControls(
    'export',
    {
      'Download image': button(() => downloadImage(fileName)),
    },
    { collapsed: true }
  );
};

/**
 * Combines all controls into a single object for convenient access
 */
export const useAllControls = (fileName) => {
  const visual = useVisualControls();
  const lighting = useLightingControls();
  const dimensions = useDimensionControls();
  const printability = usePrintabilityControls();

  // Set up export controls
  useExportControls(fileName);

  return {
    visual,
    lighting,
    dimensions,
    printability,
    config: {
      ...visual,
      ...lighting,
      ...dimensions,
      ...printability
    }
  };
};