import React, { useEffect, useMemo, useCallback, startTransition, useRef } from 'react'
import { useRouter } from 'next/navigation'
import saveAs from 'file-saver'
import { Leva, useControls, button, levaStore } from 'leva'
import useStore from '@/utils/store'
import Viewer from './viewer'
import QuotePanel from './QuotePanel'
import { mapGenericToPrintSettings, DEFAULT_PRINT_COLOURS, QUALITY_MAP, STRENGTH_MAP } from '@/lib/quoting/genericPresets'
import { modifiedSettings } from '@/lib/editor/modifiedSettings'
import { useToast } from '@/components/General/ToastProvider'
import { useState } from 'react'
import posthog from 'posthog-js'

const whiteTheme = {
  colors: {
    elevation1: '#fcfcfc',
    elevation2: '#e6e6e6',
    elevation3: '#eeeeee',
    // Leva text emphasis (light theme). highlight3 is the value text typed
    // inside number/string fields — keep it near-black so it's clearly legible
    // (was too light at #666). highlight1 is subtle text (units/placeholders).
    highlight1: '#888888',
    highlight2: '#333333',
    highlight3: '#1f1f1f',
    accent1: '#ffffff',
    accent2: '#aaaaaa',
    accent3: '#666666',
    folder: '#666666',
    toolTip: '#000000',
  },
  fonts: { mono: 'Montserrat' },
}

// Default settings (module-scope so they're stable references for reset logic).
const defaultPrintability = {
  layerHeight: 0.2, initialLayerHeight: 0.2, wallLoops: 2,
  internalSolidInfillPattern: 'Rectilinear', sparseInfillDensity: 20,
  sparseInfillPattern: 'Rectilinear', nozzleDiameter: 0.4,
  enableSupport: false, supportType: 'Normal', printPlate: 'Textured',
}
const defaultVisual = {
  background: '#e3e3e3', wireframe: false, materialType: 'plastic',
}
const defaultLighting = {
  autoRotate: true, lightIntensity: 1, preset: 'rembrandt', environment: 'city',
}
const defaultGeneric = { strength: 'Normal', quality: 'Medium', colour: 'White' }

const Result = () => {
  const { fileName, scene, buffers, generateScene, orderId, productId, variantId, geometryMetrics, returnTo,
    productPrintConfig, productColours, colourVariantName } = useStore()
  const { showToast } = useToast()
  const router = useRouter()
  // Product-print mode: a productType:"print" item bought via "Order Print".
  // Settings are vendor-fixed and the colour picker is limited to the product's
  // offered colours. See openspec `migrate-print-delivery-to-custom-requests`.
  const isProductPrint = !!productPrintConfig
  // Colour/material catalogue (admin-curated via AppSettings.printColours), with
  // the built-in defaults as fallback.
  const [colourCatalogue, setColourCatalogue] = useState(DEFAULT_PRINT_COLOURS)
  // Customer's quote options/expedite, shared with QuotePanel so they persist at submit.
  const [quoteOptions, setQuoteOptions] = useState({
    postProcessing: false, specialRequest: false, priority: false, expedite: false,
  })
  const [meshNames, setMeshNames] = useState([])
  const [submittingConfig, setSubmittingConfig] = useState(false)
  const [configLoaded, setConfigLoaded] = useState(false)
  const [advancedMode, setAdvancedMode] = useState(false)
  // Generic (plain-language) configuration: Strength × Quality × Colour.
  const [generic, setGeneric] = useState(defaultGeneric)
  const [genericMaterial, setGenericMaterial] = useState('plastic')

  // Load the admin-curated colour catalogue (falls back to defaults on failure).
  useEffect(() => {
    let active = true
    fetch('/api/quote/config')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (active && d?.printColours?.length) setColourCatalogue(d.printColours) })
      .catch(() => {})
    return () => { active = false }
  }, [])

  // The colours the customer may pick. For product prints this is the product's
  // offered colours only (hex resolved from the admin catalogue by name when an
  // option was saved without one); otherwise the full admin catalogue.
  const effectiveColours = useMemo(() => {
    if (isProductPrint && productColours?.length) {
      return productColours.map((c) => ({
        name: c.name,
        hex: c.hex || colourCatalogue.find((x) => x.name === c.name)?.hex || '#cccccc',
      }))
    }
    return colourCatalogue
  }, [isProductPrint, productColours, colourCatalogue])

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

  // Load the previously saved configuration when re-editing a request, and
  // apply it to the editor state (generic selection, leva print settings, mesh
  // colours). Waits for the scene so the per-mesh leva controls exist before
  // their colours are set.
  useEffect(() => {
    if (!productId) {
      setConfigLoaded(true)
      return
    }

    if (configLoaded || !scene) return

    // Product prints: no saved request to load — apply the vendor's fixed
    // settings and default to the first offered colour. Settings are locked.
    if (isProductPrint) {
      applyGeneric({ ...defaultGeneric, colour: effectiveColours[0]?.name || defaultGeneric.colour })
      setConfigLoaded(true)
      return
    }

    const loadConfigFromDB = async () => {
      try {
        const requestId = variantId // variantId is the requestId for custom prints
        const response = await fetch(`/api/custom-print?requestId=${requestId}`)

        if (response.ok) {
          const data = await response.json()
          const cfg = data?.request?.printConfiguration
          if (cfg?.isConfigured) {
            const ps = cfg.printSettings || {}
            const levaValues = {}
            const setIf = (key, value) => {
              if (value !== undefined && value !== null) levaValues[key] = value
            }
            setIf('printability.layerHeight', ps.layerHeight)
            setIf('printability.initialLayerHeight', ps.initialLayerHeight)
            setIf('printability.wallLoops', ps.wallLoops)
            setIf('printability.internalSolidInfillPattern', ps.internalSolidInfillPattern)
            setIf('printability.sparseInfillDensity', ps.sparseInfillDensity)
            setIf('printability.sparseInfillPattern', ps.sparseInfillPattern)
            setIf('printability.nozzleDiameter', ps.nozzleDiameter)
            setIf('printability.enableSupport', ps.enableSupport)
            setIf('printability.supportType', ps.supportType)
            setIf('printability.printPlate', ps.printPlate)
            setIf('visual.materialType', ps.materialType)
            for (const [meshName, hex] of Object.entries(cfg.meshColors || {})) {
              setIf(`visual.${meshName}`, hex)
            }
            levaStore.set(levaValues, false)

            const g = cfg.generic
            if (g?.strength || g?.quality || g?.colour) {
              setGeneric({
                strength: g.strength || defaultGeneric.strength,
                quality: g.quality || defaultGeneric.quality,
                colour: g.colour || defaultGeneric.colour,
              })
              setGenericMaterial(g.material || 'plastic')
            } else if (data?.request?.quoteMode === 'manual') {
              // Saved through the advanced flow — reopen it that way.
              setAdvancedMode(true)
            }
          }
        }
      } catch (e) {
        console.error('Failed to load configuration from MongoDB:', e)
      } finally {
        setConfigLoaded(true)
      }
    }

    loadConfigFromDB()
    // applyGeneric intentionally omitted (defined below; stable enough here).
  }, [productId, variantId, configLoaded, scene, isProductPrint, effectiveColours])

  // Leva controls for visual config, including mesh colors. Mesh colours are a
  // dropdown of the admin-curated catalogue (AppSettings.printColours) — not a
  // free hex picker — so customers can only choose colours the farm stocks.
  // The control value is the colour's hex; the dropdown label is its name.
  const [visualConfig, setVisualConfig] = useControls('visual', () => {
    const controls = {
      background: '#e3e3e3',
      wireframe: false,
      materialType: {
        value: 'plastic',
        options: ['plastic', 'resin', 'metal', 'sandstone'],
      },
    }

    // Map { colourName: hex } for the leva select; de-dupe hexes so leva can
    // resolve a value back to a single option.
    const colourOptions = {}
    colourCatalogue.forEach((c) => {
      if (c?.name && c?.hex && !Object.values(colourOptions).includes(c.hex)) {
        colourOptions[c.name] = c.hex
      }
    })
    const defaultHex = colourOptions['White'] || Object.values(colourOptions)[0] || '#ffffff'

    meshNames.forEach((name) => {
      controls[name] = { value: defaultHex, options: colourOptions, label: `${name}` }
    })

    return controls
  }, { collapsed: true }, [meshNames, colourCatalogue])


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

  // Map the editor's print controls to the Instant Quoting Engine's settings shape.
  // In generic mode the colour can imply a denser material (wood/marble/etc.),
  // so the quote uses the generic material; advanced mode uses the leva value.
  const quoteSettings = useMemo(() => ({
    materialType: advancedMode ? visualConfig.materialType : genericMaterial,
    infillPercent: printability.sparseInfillDensity,
    wallLoops: printability.wallLoops,
    nozzleMm: printability.nozzleDiameter,
    layerHeightMm: printability.layerHeight,
    enableSupport: printability.enableSupport,
  }), [
    advancedMode,
    genericMaterial,
    visualConfig.materialType,
    printability.sparseInfillDensity,
    printability.wallLoops,
    printability.nozzleDiameter,
    printability.layerHeight,
    printability.enableSupport,
  ])

  // Apply a generic (Strength/Quality/Colour) selection to the underlying leva
  // print settings + mesh colours, so generic mode is a friendly front-end over
  // the same printSettings advanced mode edits.
  const applyGeneric = useCallback((next) => {
    setGeneric(next)
    // Product prints: settings are vendor-fixed; only the colour changes.
    if (isProductPrint && productPrintConfig) {
      const colour = effectiveColours.find((c) => c.name === next.colour)
      levaStore.set({
        'printability.layerHeight': productPrintConfig.layerHeight,
        'printability.wallLoops': productPrintConfig.wallLoops,
        'printability.sparseInfillDensity': productPrintConfig.sparseInfillDensity,
        'printability.nozzleDiameter': productPrintConfig.nozzleDiameter,
        'printability.enableSupport': productPrintConfig.enableSupport,
        ...(colour?.hex ? Object.fromEntries(meshNames.map((n) => [`visual.${n}`, colour.hex])) : {}),
      }, false)
      setGenericMaterial(productPrintConfig.materialType || 'plastic')
      return
    }
    const m = mapGenericToPrintSettings(next, colourCatalogue)
    setGenericMaterial(m.materialType)
    levaStore.set({
      'printability.layerHeight': m.layerHeight,
      'printability.initialLayerHeight': m.initialLayerHeight,
      'printability.wallLoops': m.wallLoops,
      'printability.sparseInfillDensity': m.sparseInfillDensity,
      ...(m.colourHex
        ? Object.fromEntries(meshNames.map((n) => [`visual.${n}`, m.colourHex]))
        : {}),
    }, false)
  }, [meshNames, colourCatalogue, isProductPrint, productPrintConfig, effectiveColours])

  // Reset every setting (visual/lighting/printability + mesh colours) and the
  // generic selection back to defaults. Shared by the leva control and the
  // generic-mode button so "default" is single-sourced.
  // Stable mesh-colour map so the viewer's scene-styler only re-runs when a
  // colour actually changes (not on every unrelated re-render).
  const meshColors = useMemo(
    () =>
      Object.fromEntries(
        meshNames
          .map((name) => [name, visualConfig[name]])
          .filter(([, color]) => color),
      ),
    [meshNames, visualConfig],
  )

  const resetAllToDefaults = useCallback(() => {
    levaStore.set({
      'visual.background': defaultVisual.background,
      'visual.wireframe': defaultVisual.wireframe,
      'visual.materialType': defaultVisual.materialType,
      'lighting.autoRotate': defaultLighting.autoRotate,
      'lighting.lightIntensity': defaultLighting.lightIntensity,
      'lighting.preset': defaultLighting.preset,
      'lighting.environment': defaultLighting.environment,
      ...Object.fromEntries(
        Object.entries(defaultPrintability).map(([k, v]) => [`printability.${k}`, v])
      ),
      ...Object.fromEntries(meshNames.map((name) => [`visual.${name}`, '#ffffff'])),
    }, false)
    setGeneric(defaultGeneric)
    setGenericMaterial('plastic')
  }, [meshNames])

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

  // Submit configuration for print order or save to MongoDB.
  // `mode` decides the flow: 'instant' (simple) auto-quotes via /api/quote and
  // makes the request immediately payable; 'manual' (advanced) saves config and
  // waits for admin review (the API sends an admin notification email).
  const submitConfiguration = useCallback(async (mode = 'manual') => {
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
        // Simple-mode selection — sent only for instant quotes so the cart can
        // show the friendly Strength/Quality/Colour view.
        generic: mode === 'instant'
          ? { strength: generic.strength, quality: generic.quality, colour: generic.colour, material: genericMaterial }
          : undefined,
        mode,
      }

      if (productId) {
        // Save custom print configuration to MongoDB
        const cpRequestId = variantId // variantId is the requestId for custom prints
        const response = await fetch('/api/custom-print/config', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            requestId: cpRequestId,
            ...configurationData,
          }),
        })

        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.error || 'Failed to save configuration')
        }

        // Instant mode: persist a server-authoritative quote so the request is
        // immediately payable. Surface failures (the previous best-effort silent
        // path left customers stuck on "Preparing your quote").
        if (mode === 'instant') {
          if (!(geometryMetrics?.volumeCm3 > 0)) {
            throw new Error('Geometry not measured yet — please reload the model and try again.')
          }
          const quoteRes = await fetch('/api/quote', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              requestId: cpRequestId,
              mode: 'instant',
              volumeCm3: geometryMetrics.volumeCm3,
              dimensionsCm: {
                length: geometryMetrics.dimensionsCm?.length || 0,
                width: geometryMetrics.dimensionsCm?.width || 0,
                height: geometryMetrics.dimensionsCm?.height || 0,
              },
              confidence: geometryMetrics.confidence || 'high',
              settings: quoteSettings,
              options: quoteOptions,
            }),
          })
          if (!quoteRes.ok) {
            const errBody = await quoteRes.json().catch(() => ({}))
            throw new Error(errBody.error || 'Failed to generate instant quote')
          }
          showToast('Instant quote ready, checkout when you’re ready!', 'success')
        } else {
          showToast(
            'Configuration sent for review — we’ll follow up with a quote shortly.',
            'success',
          )
        }
        posthog.capture('print_config_saved', {
          mode,
          volume_cm3: geometryMetrics?.volumeCm3 || 0,
          confidence: geometryMetrics?.confidence || 'unknown',
          used_generic_mode: mode === 'instant',
        })
        router.push(returnTo || '/cart')
      }
    } catch (error) {
      console.error('Error submitting configuration:', error)
      showToast(error?.message || 'Failed to save configuration. Please try again.', 'error')
    } finally {
      setSubmittingConfig(false)
    }
  }, [
    meshNames, orderId, productId, variantId, showToast, router,
    geometryMetrics, quoteSettings, quoteOptions, returnTo,
    generic, genericMaterial,
  ])

  // Product-print "Add to Cart": settings are vendor-fixed, so we only record
  // the chosen colour (as the colour variant) on the cart item. The webhook
  // computes the fixed quote + creates the CustomPrintRequest on payment.
  const addProductPrintToCart = useCallback(async () => {
    setSubmittingConfig(true)
    try {
      const cartItem = {
        productId,
        quantity: 1,
        chosenDeliveryType: 'printDelivery',
        selectedVariants: colourVariantName ? { [colourVariantName]: generic.colour } : {},
      }
      const res = await fetch('/api/user/cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cartItem }),
      })
      if (!res.ok) throw new Error('Failed to add to cart')
      posthog.capture('product_added_to_cart', {
        product_id: productId,
        source: 'editor_product_print',
        colour: generic.colour,
      })
      showToast('Added to cart!', 'success')
      router.push(returnTo || '/cart')
    } catch (error) {
      console.error('Add product print to cart failed:', error)
      showToast(error?.message || 'Failed to add to cart. Please try again.', 'error')
    } finally {
      setSubmittingConfig(false)
    }
  }, [productId, colourVariantName, generic.colour, showToast, router, returnTo])

  // Add save configuration button in export controls
  const saveConfigControls = useMemo(() => {
    const controls = {
      'Reset All Settings': button(() => resetAllToDefaults()),
      'Download image': button(() => downloadImage()),
    }

    // Always show save button if we have a scene (for custom prints or orders).
    // Leva lives in Advanced Mode → this button is the *manual* quote path
    // (admin reviews the detailed settings before quoting).
    if (orderId || productId || variantId) {
      const buttonText = orderId ? 'Submit Print Configuration' : 'Save Print Config — Manual Quote'
      controls[buttonText] = button(() => submitConfiguration('manual'), { disabled: submittingConfig })
    }

    return controls
  }, [orderId, productId, variantId, submittingConfig, downloadImage, submitConfiguration, resetAllToDefaults])

  useControls('export', saveConfigControls, { collapsed: false })

  // Update refs whenever control values change
  useEffect(() => {
    currentPrintabilityRef.current = printability
  }, [printability])

  useEffect(() => {
    if (!buffers || !fileName) return
    startTransition(() => {
      Promise.resolve(
        generateScene({
          ...visualConfig,
          ...lighting,
          ...printability,
        })
      ).catch((e) => {
        console.error('Failed to generate scene:', e)
        showToast(e?.message ? `Failed to load model: ${e.message}` : 'Failed to load model', 'error')
      })
    })
    // Only regenerate when the underlying model changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buffers, fileName, productId, variantId])

  return (
    <div className="relative h-full w-full overflow-hidden">
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
                meshColors={meshColors}
              />
            )}
          </section>
        </div>
      )}
      <Leva theme={whiteTheme} hidden={!advancedMode} />
      {scene && (
        <QuotePanel
          metrics={geometryMetrics}
          settings={quoteSettings}
          options={quoteOptions}
          onOptionsChange={setQuoteOptions}
          // variantId is the requestId for custom prints; with it the panel can
          // show the authoritative (stored-model) quote rather than an estimate.
          // Product prints have no per-customer request until checkout.
          requestId={isProductPrint ? null : variantId}
        />
      )}
      {/* Simple/Advanced mode toggle — anchored to the canvas, bottom-right */}
      <div className="absolute bottom-4 right-4 z-40 flex flex-col gap-2 items-end">
        {!isProductPrint && (
          <button
            onClick={() => setAdvancedMode(!advancedMode)}
            className="px-3 py-1.5 text-xs font-medium bg-white border border-gray-300 rounded shadow-sm hover:bg-gray-50"
          >
            {advancedMode ? 'Simple Mode' : 'Advanced Mode'}
          </button>
        )}
        {advancedMode && (() => {
          // Per-field reset: list every print setting that differs from its
          // default with its own reset control (leva has no inline affordance).
          const changed = modifiedSettings(printability, defaultPrintability, 'printability')
          if (changed.length === 0) return null
          return (
            <div className="flex flex-col gap-1 bg-baseColor border border-borderColor rounded-md shadow-sm p-3 w-64 max-h-60 overflow-y-auto">
              <span className="text-[10px] font-semibold uppercase text-light px-0.5 mb-0.5">
                Modified settings
              </span>
              {changed.map((m) => (
                <div key={m.key} className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="text-textColor truncate" title={m.label}>{m.label}</span>
                  <span className="flex items-center gap-1.5 whitespace-nowrap">
                    <span className="text-light">{String(m.value)}</span>
                    <button
                      onClick={() => levaStore.set({ [m.path]: m.defaultValue }, false)}
                      title={`Reset to ${String(m.defaultValue)}`}
                      className="rounded-full border border-borderColor px-1.5 py-0.5 text-[10px] text-light hover:text-textColor hover:bg-borderColor/20"
                    >
                      ↺ {String(m.defaultValue)}
                    </button>
                  </span>
                </div>
              ))}
            </div>
          )
        })()}
        {!advancedMode && (
          <div className="flex flex-col gap-3 bg-baseColor border border-borderColor rounded-md shadow-sm p-3 w-56">
            {isProductPrint && (
              <p className="text-[10px] text-light px-0.5">
                Print settings are fixed for this product — choose a colour.
              </p>
            )}
            {!isProductPrint && (
              <>
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-semibold uppercase text-light px-0.5">Strength</span>
                  <div className="grid grid-cols-3 gap-1">
                    {Object.keys(STRENGTH_MAP).map((s) => (
                      <button
                        key={s}
                        onClick={() => applyGeneric({ ...generic, strength: s })}
                        className={`text-[11px] px-2 py-1.5 rounded border transition-colors ${
                          generic.strength === s
                            ? 'bg-textColor text-background border-textColor'
                            : 'bg-background text-textColor border-borderColor hover:bg-borderColor/20'
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-semibold uppercase text-light px-0.5">Quality</span>
                  <div className="grid grid-cols-3 gap-1">
                    {Object.keys(QUALITY_MAP).map((q) => (
                      <button
                        key={q}
                        onClick={() => applyGeneric({ ...generic, quality: q })}
                        className={`text-[11px] px-2 py-1.5 rounded border transition-colors ${
                          generic.quality === q
                            ? 'bg-textColor text-background border-textColor'
                            : 'bg-background text-textColor border-borderColor hover:bg-borderColor/20'
                        }`}
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {meshNames.length > 0 && (
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold uppercase text-light px-0.5">Colour</span>
                <select
                  value={generic.colour}
                  onChange={(e) => applyGeneric({ ...generic, colour: e.target.value })}
                  className="formInput text-xs"
                >
                  {effectiveColours.map((c) => (
                    <option key={c.name} value={c.name}>{c.name}</option>
                  ))}
                </select>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {effectiveColours.map((c) => (
                    <button
                      key={c.name}
                      title={c.name}
                      onClick={() => applyGeneric({ ...generic, colour: c.name })}
                      className={`w-5 h-5 rounded-full border transition-transform hover:scale-110 ${
                        generic.colour === c.name ? 'border-textColor ring-1 ring-textColor' : 'border-borderColor'
                      }`}
                      style={{ backgroundColor: c.hex }}
                    />
                  ))}
                </div>
                {!isProductPrint && (
                  <p className="text-[10px] text-light mt-1">
                    One colour applies to the whole model. For different colours per part,
                    use Advanced Mode (per-part colour pickers).
                  </p>
                )}
              </div>
            )}

            <label className="flex items-center gap-2 text-[11px] text-light cursor-pointer mt-1">
              <input
                type="checkbox"
                checked={lighting.autoRotate}
                onChange={(e) => levaStore.set({ 'lighting.autoRotate': e.target.checked }, false)}
              />
              Auto-rotate model
            </label>

            <button
              onClick={resetAllToDefaults}
              className="text-[11px] text-light hover:text-textColor underline underline-offset-2 self-start mt-1"
            >
              Reset to defaults
            </button>

            {isProductPrint ? (
              <button
                onClick={addProductPrintToCart}
                disabled={submittingConfig}
                className="mt-2 w-full rounded-full bg-linear-to-r from-amber-300 to-red-400 px-3 py-2 text-xs font-semibold text-textColor shadow-sm hover:opacity-95 active:scale-[0.99] transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submittingConfig ? 'Adding…' : 'Add to Cart'}
              </button>
            ) : (orderId || productId || variantId) && (
              <button
                onClick={() => submitConfiguration('instant')}
                disabled={submittingConfig}
                className="mt-2 w-full rounded-full bg-linear-to-r from-amber-300 to-red-400 px-3 py-2 text-xs font-semibold text-textColor shadow-sm hover:opacity-95 active:scale-[0.99] transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submittingConfig ? 'Saving…' : 'Save & Get Instant Quote'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default Result
