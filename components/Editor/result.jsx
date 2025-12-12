import React, { useEffect, useMemo, useCallback, startTransition, useRef } from 'react'
import saveAs from 'file-saver'
import { Leva, useControls, button, levaStore } from 'leva'
import useStore from '@/utils/store'
import Viewer from './viewer'
import { useToast } from '@/components/General/ToastProvider'
import { useState } from 'react'

const whiteTheme = {
  colors: {
    elevation1: '#fcfcfc',
    elevation2: '#e6e6e6',
    elevation3: '#eeeeee',
    highlight1: '#aaaaaa',
    highlight2: '#333333',
    highlight3: '#666666',
    accent1: '#ffffff',
    accent2: '#aaaaaa',
    accent3: '#666666',
    folder: '#666666',
    toolTip: '#000000',
  },
  fonts: { mono: 'Montserrat' },
}

const Result = () => {
  const { fileName, scene, generateScene, orderId, productId, variantId } = useStore()
  const { showToast } = useToast()
  const [meshNames, setMeshNames] = useState([])
  const [submittingConfig, setSubmittingConfig] = useState(false)
  const [configLoaded, setConfigLoaded] = useState(false)

  // Refs to store current values for submission
  const currentPrintabilityRef = useRef({})
  const currentVisualRef = useRef({})
  const currentLightingRef = useRef({})

  // Reset configLoaded when productId or variantId changes
  useEffect(() => {
    setConfigLoaded(false)
  }, [productId, variantId])

  // Collect mesh names when scene changes
  useEffect(() => {
    if (!scene) return
    const names = []
    scene.traverse((obj) => {
      if (obj.isMesh && obj.name) {
        names.push(obj.name)
      }
    })
    setMeshNames(names)
  }, [scene])

  // Load existing configuration from MongoDB when productId is available
  useEffect(() => {
    if (!productId) {
      setConfigLoaded(true)
      return
    }

    if (configLoaded) return

    const loadConfigFromDB = async () => {
      try {
        const requestId = variantId // variantId is the requestId for custom prints
        const response = await fetch(`/api/custom-print?requestId=${requestId}`)

        if (response.ok) {
          const data = await response.json()
          console.log('Loaded configuration from MongoDB:', data.request?.printConfiguration)
        }
      } catch (e) {
        console.error('Failed to load configuration from MongoDB:', e)
      } finally {
        setConfigLoaded(true)
      }
    }

    loadConfigFromDB()
  }, [productId, variantId, configLoaded])

  // Leva controls for visual config, including mesh colors
  const [visualConfig, setVisualConfig] = useControls('visual', () => {
    const controls = {
      background: '#e3e3e3',
      wireframe: false,
      materialType: {
        value: 'plastic',
        options: ['plastic', 'resin', 'metal', 'sandstone'],
      },
    }

    meshNames.forEach((name) => {
      controls[name] = { value: '#ffffff', label: `${name}` }
    })

    return controls
  }, { collapsed: true }, [meshNames])


  const [lighting] = useControls('lighting', () => ({
    autoRotate: true,
    lightIntensity: {
      value: 1,
      min: 0,
      max: 2,
      step: 0.1
    },
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
  }), { collapsed: true })

  const [printability, setPrintability] = useControls('printability', () => ({
    // Layer Height
    layerHeight: {
      value: 0.2,
      min: 0.1,
      max: 0.4,
      step: 0.01,
      label: 'Layer height (mm)'
    },
    initialLayerHeight: {
      value: 0.2,
      min: 0.1,
      max: 0.4,
      step: 0.01,
      label: 'Initial layer height (mm)'
    },
    // Walls
    wallLoops: {
      value: 2,
      min: 1,
      max: 4,
      step: 1,
      label: 'Wall loops'
    },
    internalSolidInfillPattern: {
      value: 'Rectilinear',
      options: [
        'Rectilinear',
        'Concentric',
        'Monotonic',
        'Monotonic line',
        'Aligned Rectilinear',
      ],
      label: 'Internal solid infill pattern',
    },
    // Sparse Infill
    sparseInfillDensity: {
      value: 20,
      min: 5,
      max: 40,
      step: 1,
      label: 'Sparse infill density (%)'
    },
    sparseInfillPattern: {
      value: 'Rectilinear',
      options: [
        'Rectilinear',
        'Grid',
        'HoneyComb',
        'Triangles',
        'Lightning',
        'Concentric',
        'Aligned Rectilinear',
      ],
      label: 'Sparse infill pattern',
    },
    nozzleDiameter: {
      value: 0.4,
      options: [0.2, 0.4, 0.6, 0.8],
      label: 'Nozzle diameter (mm)',
    },
    // Support
    enableSupport: {
      value: false,
      label: 'Enable support'
    },
    supportType: {
      value: 'Normal',
      options: ['Tree', 'Normal'],
      label: 'Support type',
    },
    // Print plate
    printPlate: {
      value: 'Textured',
      options: ['Textured', 'Smooth'],
      label: 'Print plate',
    },
  }), { collapsed: true })  // Update refs whenever control values change
  useEffect(() => {
    currentPrintabilityRef.current = printability
  }, [printability])

  useEffect(() => {
    currentVisualRef.current = visualConfig
  }, [visualConfig])

  useEffect(() => {
    currentLightingRef.current = lighting
  }, [lighting])

  const downloadImage = useCallback(async () => {
    try {
      showToast('Preparing image...', 'info')
      const canvas = document.querySelector('canvas')
      if (!canvas) throw new Error('No canvas found.')
      const image = canvas
        .toDataURL('image/png')
        .replace('image/png', 'image/octet-stream')
      saveAs(image, `${fileName?.split('.')[0] || 'render'}.png`)
      showToast('Downloaded!', 'success')
    } catch (error) {
      showToast('Failed to download image: ' + error.message, 'error')
    }
  }, [fileName, showToast])

  // Submit configuration for print order or save to MongoDB
  const submitConfiguration = useCallback(async () => {
    setSubmittingConfig(true)
    try {
      // Get current values from refs (most up-to-date)
      const currentPrintability = currentPrintabilityRef.current
      const currentVisual = currentVisualRef.current
      const currentLighting = currentLightingRef.current

      // Extract only mesh colors (not background, wireframe, materialType)
      const meshColors = {}
      meshNames.forEach(name => {
        if (currentVisual[name] && currentVisual[name] !== '#ffffff') {
          meshColors[name] = currentVisual[name]
        }
      })

      const configurationData = {
        printSettings: {
          layerHeight: currentPrintability.layerHeight,
          initialLayerHeight: currentPrintability.initialLayerHeight,
          materialType: currentVisual.materialType,
          wallLoops: currentPrintability.wallLoops,
          internalSolidInfillPattern: currentPrintability.internalSolidInfillPattern,
          sparseInfillDensity: currentPrintability.sparseInfillDensity,
          sparseInfillPattern: currentPrintability.sparseInfillPattern,
          nozzleDiameter: currentPrintability.nozzleDiameter,
          enableSupport: currentPrintability.enableSupport,
          supportType: currentPrintability.supportType,
          printPlate: currentPrintability.printPlate,
        },
        meshColors: meshColors,
      }

      if (orderId) {
        // Handle direct print order submission
        const response = await fetch(`/api/user/print-order/${orderId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            configuration: configurationData,
          }),
        })

        if (response.ok) {
          showToast('Print configuration submitted successfully!', 'success')
          setTimeout(() => {
            window.location.href = '/account'
          }, 1500)
        } else {
          throw new Error('Failed to submit configuration')
        }
      } else if (productId) {
        // Save custom print configuration to MongoDB
        const requestId = variantId // variantId is the requestId for custom prints
        const response = await fetch('/api/custom-print/config', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            requestId,
            ...configurationData,
          }),
        })

        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.error || 'Failed to save configuration')
        }

        showToast('Print configuration saved successfully!', 'success')
      }
    } catch (error) {
      console.error('Error submitting configuration:', error)
      showToast('Failed to save configuration. Please try again.', 'error')
    } finally {
      setSubmittingConfig(false)
    }
  }, [meshNames, orderId, productId, variantId, showToast])

  // Add save configuration button in export controls
  const saveConfigControls = useMemo(() => {
    const controls = {
      'Download image': button(() => downloadImage()),
    }

    // Always show save button if we have a scene (for custom prints or orders)
    if (orderId || productId || variantId) {
      const buttonText = orderId ? 'Submit Print Configuration' : 'Save Print Config'
      controls[buttonText] = button(() => submitConfiguration(), { disabled: submittingConfig })
    }

    return controls
  }, [orderId, productId, variantId, submittingConfig, downloadImage, submitConfiguration])

  useControls('export', saveConfigControls, { collapsed: false })

  // Update refs whenever control values change
  useEffect(() => {
    currentPrintabilityRef.current = printability
  }, [printability])

  useEffect(() => {
    startTransition(() => {
      generateScene({
        ...visualConfig,
        ...lighting,
        ...printability,
      })
    })
  }, [visualConfig, lighting, printability])

  return (
    <div className="h-full w-screen">
      {!scene ? (
        <div className="w-screen h-screen flex justify-center items-center">
          <div className="loader" />
        </div>
      ) : (
        <div className="grid grid-cols-5 h-full">
          <section className="h-full w-full col-span-5">
            {scene && (
              <Viewer
                {...visualConfig}
                {...printability}
                environment={lighting.environment}
                preset={lighting.preset}
                intensity={lighting.lightIntensity}
                autoRotate={lighting.autoRotate}
                materialType={visualConfig.materialType}
                meshColors={Object.fromEntries(meshNames.map(name => [name, visualConfig[name]]).filter(([name, color]) => color))}
              />
            )}
          </section>
        </div>
      )}
      <Leva theme={whiteTheme} />
    </div>
  )
}

export default Result
