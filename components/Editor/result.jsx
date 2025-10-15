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
        console.log('Found mesh:', obj.name) // Debug log
      }
    })
    console.log('All mesh names:', names) // Debug log
    setMeshNames(names)
  }, [scene])

  // Load existing configuration when productId is available
  useEffect(() => {
    if (!productId) {
      setConfigLoaded(true)
      return
    }

    if (configLoaded) return

    const configKey = `printConfig_${productId}_${variantId || 'default'}`
    const savedConfig = localStorage.getItem(configKey)

    console.log('=== CONFIGURATION LOADING ===')
    console.log('Config key:', configKey)
    console.log('Found saved config:', !!savedConfig)

    if (savedConfig) {
      try {
        const config = JSON.parse(savedConfig)
        console.log('Successfully parsed saved configuration:', config)
        console.log('Print settings found:', !!config.printSettings)
        console.log('Mesh colors found:', !!config.meshColors)
        console.log('Editor settings found:', !!config.editorSettings)

        // Small delay to ensure all components are ready
        setTimeout(() => {
          setConfigLoaded(true)
        }, 100)
      } catch (e) {
        console.error('Failed to parse saved configuration:', e)
        setConfigLoaded(true)
      }
    } else {
      console.log('No saved configuration found, using defaults')
      setConfigLoaded(true)
    }
  }, [productId, variantId, configLoaded])

  // Leva controls for visual config, including mesh colors
  const [visualConfig, setVisualConfig] = useControls('visual', () => {
    // Load saved configuration if available
    let savedVisualConfig = null
    let savedMeshColors = null

    if (productId && configLoaded) {
      const configKey = `printConfig_${productId}_${variantId || 'default'}`
      const savedConfigStr = localStorage.getItem(configKey)
      if (savedConfigStr) {
        try {
          const parsed = JSON.parse(savedConfigStr)
          savedVisualConfig = parsed.editorSettings?.visual
          savedMeshColors = parsed.meshColors // Mesh colors are at root level
          console.log('Loading visual config:', savedVisualConfig)
          console.log('Loading mesh colors:', savedMeshColors)
        } catch (e) {
          console.error('Failed to parse saved visual config:', e)
        }
      }
    }

    const controls = {
      background: savedVisualConfig?.background || '#e3e3e3',
      wireframe: savedVisualConfig?.wireframe || false,
      materialType: {
        value: savedVisualConfig?.materialType || 'plastic',
        options: ['plastic', 'resin', 'metal', 'sandstone'],
      },
    }

    meshNames.forEach((name, i) => {
      // Use saved mesh color from meshColors object or default to white
      const savedColor = savedMeshColors?.[name] || '#ffffff'
      controls[name] = { value: savedColor, label: `${name}` }
      console.log(`Setting mesh color for ${name}: ${savedColor}`)
    })

    return controls
  }, { collapsed: true }, [meshNames, configLoaded])


  const [lighting, setLighting] = useControls('lighting', () => {
    // Load saved lighting configuration if available
    let savedLighting = null
    if (productId && configLoaded) {
      const configKey = `printConfig_${productId}_${variantId || 'default'}`
      const savedConfigStr = localStorage.getItem(configKey)
      if (savedConfigStr) {
        try {
          const parsed = JSON.parse(savedConfigStr)
          savedLighting = parsed.editorSettings?.lighting
        } catch (e) {
          console.error('Failed to parse saved lighting config:', e)
        }
      }
    }

    return {
      autoRotate: savedLighting?.autoRotate ?? true,
      lightIntensity: {
        value: savedLighting?.lightIntensity ?? 1,
        min: 0,
        max: 2,
        step: 0.1
      },
      preset: {
        value: savedLighting?.preset || 'rembrandt',
        options: ['rembrandt', 'portrait', 'upfront', 'soft'],
      },
      environment: {
        value: savedLighting?.environment || 'city',
        options: [
          'sunset', 'dawn', 'night', 'warehouse', 'forest',
          'apartment', 'studio', 'city', 'park', 'lobby',
        ],
      },
    }
  }, { collapsed: true }, [configLoaded])

  const [printability, setPrintability] = useControls('printability', () => {
    // Load saved printability configuration if available
    let savedPrintSettings = null
    if (productId && configLoaded) {
      const configKey = `printConfig_${productId}_${variantId || 'default'}`
      const savedConfigStr = localStorage.getItem(configKey)
      if (savedConfigStr) {
        try {
          const parsed = JSON.parse(savedConfigStr)
          savedPrintSettings = parsed.printSettings
          console.log('Loading print settings:', savedPrintSettings)
          if (savedPrintSettings) {
            console.log('Saved layer height:', savedPrintSettings.layerHeight)
            console.log('Saved infill density:', savedPrintSettings.sparseInfillDensity)
            console.log('Saved wall loops:', savedPrintSettings.wallLoops)
          }
        } catch (e) {
          console.error('Failed to parse saved print settings:', e)
        }
      }
    }

    return {
      // Layer Height
      layerHeight: {
        value: savedPrintSettings?.layerHeight ?? 0.2,
        min: 0.1,
        max: 0.4,
        step: 0.01,
        label: 'Layer height (mm)'
      },
      initialLayerHeight: {
        value: savedPrintSettings?.initialLayerHeight ?? 0.2,
        min: 0.1,
        max: 0.4,
        step: 0.01,
        label: 'Initial layer height (mm)'
      },
      // Walls
      wallLoops: {
        value: savedPrintSettings?.wallLoops ?? 2,
        min: 1,
        max: 4,
        step: 1,
        label: 'Wall loops'
      },
      internalSolidInfillPattern: {
        value: savedPrintSettings?.internalSolidInfillPattern || 'Rectilinear',
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
        value: savedPrintSettings?.sparseInfillDensity ?? 20,
        min: 5,
        max: 40,
        step: 1,
        label: 'Sparse infill density (%)'
      },
      sparseInfillPattern: {
        value: savedPrintSettings?.sparseInfillPattern || 'Rectilinear',
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
        value: savedPrintSettings?.nozzleDiameter ?? 0.4,
        options: [0.2, 0.4, 0.6, 0.8],
        label: 'Nozzle diameter (mm)',
      },
      // Support
      enableSupport: {
        value: savedPrintSettings?.enableSupport ?? false,
        label: 'Enable support'
      },
      supportType: {
        value: savedPrintSettings?.supportType || 'Normal',
        options: ['Tree', 'Normal'],
        label: 'Support type',
      },
      // Print plate
      printPlate: {
        value: savedPrintSettings?.printPlate || 'Textured',
        options: ['Textured', 'Smooth'],
        label: 'Print plate',
      },
    }
  }, { collapsed: true }, [configLoaded])

  // Update refs whenever control values change
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

  const exportControls = useMemo(() => ({
    'Download image': button(() => downloadImage()),
  }), [downloadImage])

  useControls('export', exportControls, { collapsed: true })

  // Add submit configuration controls when in order mode or cart item mode
  const submitControls = useMemo(() => {
    if (!orderId && !productId) return {}

    const buttonText = orderId ? 'Submit Print Configuration' : 'Save Print Configuration'

    return {
      [buttonText]: button(() => submitConfiguration(), { disabled: submittingConfig }),
    }
  }, [orderId, productId, submittingConfig])

  if (orderId || productId) {
    const controlsTitle = orderId ? 'Print Order' : 'Print Configuration'
    useControls(controlsTitle, submitControls, { collapsed: false })
  }

  // Submit configuration for print order or save for cart item
  const submitConfiguration = useCallback(async () => {
    setSubmittingConfig(true)
    try {
      // Get current values from refs (most up-to-date)
      const currentPrintability = currentPrintabilityRef.current
      const currentVisual = currentVisualRef.current
      const currentLighting = currentLightingRef.current

      console.log('=== USING CURRENT VALUES FROM REFS ===')
      console.log('Current printability from ref:', currentPrintability)
      console.log('Current visual from ref:', currentVisual)
      console.log('Current lighting from ref:', currentLighting)

      // Extract only mesh colors (not background, wireframe, materialType)
      const meshColors = {}
      meshNames.forEach(name => {
        if (currentVisual[name] && currentVisual[name] !== '#ffffff') {
          meshColors[name] = currentVisual[name]
        }
      })

      console.log('=== SAVING CONFIGURATION ===')
      console.log('Final printability object:', currentPrintability)
      console.log('Full visualConfig object:', currentVisual)
      console.log('Full lighting object:', currentLighting)
      console.log('Mesh names found:', meshNames)
      console.log('Extracted mesh colors:', meshColors)

      console.log('Individual values being saved:')
      console.log('- Layer Height:', currentPrintability.layerHeight)
      console.log('- Initial Layer Height:', currentPrintability.initialLayerHeight)
      console.log('- Wall Loops:', currentPrintability.wallLoops)
      console.log('- Internal Solid Infill Pattern:', currentPrintability.internalSolidInfillPattern)
      console.log('- Sparse Infill Density:', currentPrintability.sparseInfillDensity)
      console.log('- Sparse Infill Pattern:', currentPrintability.sparseInfillPattern)
      console.log('- Nozzle Diameter:', currentPrintability.nozzleDiameter)
      console.log('- Enable Support:', currentPrintability.enableSupport)
      console.log('- Support Type:', currentPrintability.supportType)
      console.log('- Print Plate:', currentPrintability.printPlate)

      const configurationData = {
        // Only save print-related settings, not visual/lighting for display
        printSettings: {
          // Layer Height
          layerHeight: currentPrintability.layerHeight,
          initialLayerHeight: currentPrintability.initialLayerHeight,
          // Walls
          wallLoops: currentPrintability.wallLoops,
          internalSolidInfillPattern: currentPrintability.internalSolidInfillPattern,
          // Infill
          sparseInfillDensity: currentPrintability.sparseInfillDensity,
          sparseInfillPattern: currentPrintability.sparseInfillPattern,
          // Nozzle
          nozzleDiameter: currentPrintability.nozzleDiameter,
          // Support
          enableSupport: currentPrintability.enableSupport,
          supportType: currentPrintability.supportType,
          // Print plate
          printPlate: currentPrintability.printPlate,
        },
        meshColors: meshColors,
        // Save visual/lighting settings for editor restoration only
        editorSettings: {
          visual: currentVisual,
          lighting: currentLighting,
        },
        submittedAt: new Date().toISOString(),
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
          // Redirect to account or orders page
          setTimeout(() => {
            window.location.href = '/account'
          }, 1500)
        } else {
          throw new Error('Failed to submit configuration')
        }
      } else if (productId) {
        // Handle cart item configuration - save to localStorage for now
        const configKey = `printConfig_${productId}_${variantId || 'default'}`
        localStorage.setItem(configKey, JSON.stringify(configurationData))

        console.log('=== CONFIGURATION SAVED ===')
        console.log('Config key:', configKey)
        console.log('Full configuration saved:', configurationData)
        console.log('Print settings saved:', configurationData.printSettings)
        console.log('Mesh colors saved:', configurationData.meshColors)

        // Verify what was actually stored
        const stored = localStorage.getItem(configKey)
        const parsed = JSON.parse(stored)
        console.log('=== VERIFICATION ===')
        console.log('What was actually stored:', parsed)
        console.log('Stored layer height:', parsed.printSettings.layerHeight)
        console.log('Stored infill density:', parsed.printSettings.sparseInfillDensity)

        showToast('Print configuration saved successfully!', 'success')
        // Redirect back to cart
        setTimeout(() => {
          window.location.href = '/cart'
        }, 1500)
      }
    } catch (error) {
      console.error('Error submitting configuration:', error)
      showToast('Failed to save configuration. Please try again.', 'error')
    } finally {
      setSubmittingConfig(false)
    }
  }, [meshNames, orderId, productId, variantId])

  // Debug: Track when printability values change
  useEffect(() => {
    console.log('=== PRINTABILITY VALUES CHANGED ===')
    console.log('Full printability object:', printability)
    console.log('Layer Height:', printability.layerHeight)
    console.log('Initial Layer Height:', printability.initialLayerHeight)
    console.log('Wall Loops:', printability.wallLoops)
    console.log('Internal Solid Infill Pattern:', printability.internalSolidInfillPattern)
    console.log('Sparse Infill Density:', printability.sparseInfillDensity)
    console.log('Sparse Infill Pattern:', printability.sparseInfillPattern)
    console.log('Nozzle Diameter:', printability.nozzleDiameter)
    console.log('Enable Support:', printability.enableSupport)
    console.log('Support Type:', printability.supportType)
    console.log('Print Plate:', printability.printPlate)
    console.log('================================')
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
