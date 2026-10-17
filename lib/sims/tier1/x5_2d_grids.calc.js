/* FIT-CALC-BEGIN x5_2d_grids */
const FITCalcX5 = (function () {
  'use strict';

  // FIT integration: preserve error schema and lower_snake_case reasons.
  const fail = (error, reason) => ({
    error,
    reason: /^[A-Z][A-Z0-9_]*$/.test(reason)
      ? reason.toLowerCase()
      : reason
  });
  const mathError = reason => fail('MathError', reason);
  const constraint = reason => fail('ConstraintViolation', reason);
  const unsupported = reason => fail('NotSupported', reason);

  function validImage(image) {
    if (!Array.isArray(image) || image.length > 128) return false;
    if (image.length === 0) return true;
    if (!Array.isArray(image[0]) || image[0].length > 128) return false;
    const width = image[0].length;
    return image.every(row => Array.isArray(row) &&
      row.length === width &&
      row.every(v => typeof v === 'number' && Number.isFinite(v)));
  }

  function imageError(image) {
    if (!validImage(image)) {
      return constraint('image_exceeds_128x128');
    }
    return null;
  }

  function finite(value) {
    return typeof value === 'number' && Number.isFinite(value);
  }

  function rectangular(image) {
    return image.length > 0 && image[0].length > 0;
  }

  function cloneGrid(image) {
    return image.map(row => row.slice());
  }

  /**
   * True 2-D convolution.
   * Inputs: image, a rectangular numeric row-major grid; kernel, an odd
   * rectangular numeric grid no larger than 5 x 5; mode, valid,
   * same_zero or same_replicate. Grid values are dimensionless unless
   * the caller defines their physical units.
   * Outputs: {out}, the convolved numeric grid at full precision.
   * Errors: ConstraintViolation/image_exceeds_128x128,
   * ConstraintViolation/kernel_must_be_odd_max_5x5,
   * NotSupported/unsupported_convolution_mode.
   * Hand check: [[1,2,3],[4,5,6],[7,8,9]] convolved with the
   * 1 x 1 kernel [[2]] in valid mode gives [[2,4,6],[8,10,12],[14,16,18]].
   */
  function convolve(input) {
    const image = input && input.image;
    const kernel = input && input.kernel;
    const mode = input && input.mode;
    const ie = imageError(image);
    if (ie) return ie;
    if (!Array.isArray(kernel) || !kernel.length ||
        !kernel.every(row => Array.isArray(row) && row.length === kernel[0].length) ||
        kernel.length > 5 || kernel[0].length > 5 ||
        kernel.length % 2 === 0 || kernel[0].length % 2 === 0 ||
        !kernel.every(row => row.every(finite))) {
      return constraint('kernel_must_be_odd_max_5x5');
    }
    if (!['valid', 'same_zero', 'same_replicate'].includes(mode)) {
      return unsupported('unsupported_convolution_mode');
    }
    if (!rectangular(image)) return { out: [] };
    const h = image.length, w = image[0].length;
    const kh = kernel.length, kw = kernel[0].length;
    const py = Math.floor(kh / 2), px = Math.floor(kw / 2);
    const oh = mode === 'valid' ? Math.max(0, h - kh + 1) : h;
    const ow = mode === 'valid' ? Math.max(0, w - kw + 1) : w;
    const out = [];
    for (let y = 0; y < oh; y++) {
      const row = [];
      for (let x = 0; x < ow; x++) {
        let sum = 0;
        for (let ky = 0; ky < kh; ky++) {
          for (let kx = 0; kx < kw; kx++) {
            let iy = y + ky - (mode === 'valid' ? 0 : py);
            let ix = x + kx - (mode === 'valid' ? 0 : px);
            if (mode === 'same_replicate') {
              iy = Math.max(0, Math.min(h - 1, iy));
              ix = Math.max(0, Math.min(w - 1, ix));
            }
            if (iy >= 0 && iy < h && ix >= 0 && ix < w) {
              sum += image[iy][ix] * kernel[kh - 1 - ky][kw - 1 - kx];
            }
          }
        }
        if (!finite(sum)) return mathError('non_finite_result');
        row.push(sum);
      }
      out.push(row);
    }
    return { out };
  }

  /**
   * Binary thresholding, with equality assigned to the foreground.
   * Inputs: image (numeric grid), T (threshold in the same units as pixels).
   * Outputs: {binary, count_on}; binary values are exact integers 0 or 1.
   * Errors: ConstraintViolation/image_exceeds_128x128,
   * MathError/threshold_not_finite.
   * Hand check: [[0,2],[2,3]], T=2 gives [[0,1],[1,1]], count_on=3.
   */
  function threshold(input) {
    const image = input && input.image, T = input && input.T;
    const ie = imageError(image);
    if (ie) return ie;
    if (!finite(T)) return mathError('threshold_not_finite');
    let count_on = 0;
    const binary = image.map(row => row.map(v => {
      const b = v >= T ? 1 : 0;
      count_on += b;
      return b;
    }));
    return { binary, count_on };
  }

  /**
   * Otsu threshold for an 8-bit grayscale image.
   * Inputs: image, integer pixel levels 0..255.
   * Outputs: {T, between_class_var}; T is the smallest threshold attaining
   * the maximum variance, with class 0 defined as levels <= t.
   * Errors: ConstraintViolation/image_exceeds_128x128,
   * ConstraintViolation/pixel_level_out_of_range,
   * MathError/empty_image.
   * Hand check: [[0,0,255,255]] has a maximum between-class variance
   * of 16256.25; the smallest maximising threshold is 0.
   */
  function otsu(input) {
    const image = input && input.image;
    const ie = imageError(image);
    if (ie) return ie;
    if (!rectangular(image)) return mathError('empty_image');
    const hist = Array(256).fill(0);
    let n = 0, total = 0;
    for (const row of image) for (const v of row) {
      if (!Number.isInteger(v) || v < 0 || v > 255) {
        return constraint('pixel_level_out_of_range');
      }
      hist[v]++; n++; total += v;
    }
    if (hist.filter(Boolean).length === 1) {
      return { T: 0, between_class_var: 0 };
    }
    let leftN = 0, leftSum = 0, best = -1, bestT = 0;
    for (let t = 0; t < 255; t++) {
      leftN += hist[t];
      leftSum += t * hist[t];
      const rightN = n - leftN;
      if (!leftN || !rightN) continue;
      const delta = leftSum / leftN - (total - leftSum) / rightN;
      const variance = (leftN / n) * (rightN / n) * delta * delta;
      if (variance > best) {
        best = variance;
        bestT = t;
      }
    }
    return { T: bestT, between_class_var: Math.max(0, best) };
  }

  /**
   * Connected-component labelling of non-zero pixels.
   * Inputs: image (numeric grid), connectivity (4 or 8 neighbours).
   * Outputs: {components, areas, labels}.
   * components is an integer count of distinct foreground components.
   * areas contains component sizes sorted largest first.
   * labels is a row-major labelled grid with 0 as background and
   * positive integer labels assigned in row-major discovery order.
   * Errors: ConstraintViolation/image_exceeds_128x128,
   * ConstraintViolation/connectivity_must_be_4_or_8,
   * RuntimeError/too_many_states.
   * Hand check: [[1,0],[0,1]] gives components=2 and areas=[1,1]
   * with 4-connectivity; components=1 and areas=[2] with
   * 8-connectivity.
   */
  function segment(input) {
    const image = input && input.image;
    const connectivity = input && input.connectivity;
    const ie = imageError(image);
    if (ie) return ie;
    if (connectivity !== 4 && connectivity !== 8) {
      return constraint('connectivity_must_be_4_or_8');
    }

    const h = image.length;
    const w = h ? image[0].length : 0;
    const labels = Array.from({ length: h }, () => Array(w).fill(0));
    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];

    if (connectivity === 8) {
      dirs.push([-1, -1], [-1, 1], [1, -1], [1, 1]);
    }

    const areas = [];
    let label = 0;
    let visits = 0;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!image[y][x] || labels[y][x]) continue;

        label++;
        let area = 0;
        const queue = [[y, x]];
        labels[y][x] = label;

        for (let q = 0; q < queue.length; q++) {
          if (++visits > 16384) {
            return fail('RuntimeError', 'too_many_states');
          }

          const [cy, cx] = queue[q];
          area++;

          for (const [dy, dx] of dirs) {
            const ny = cy + dy;
            const nx = cx + dx;

            if (ny >= 0 && ny < h &&
                nx >= 0 && nx < w &&
                image[ny][nx] &&
                !labels[ny][nx]) {
              labels[ny][nx] = label;
              queue.push([ny, nx]);
            }
          }
        }

        areas.push(area);
      }
    }

    areas.sort((a, b) => b - a);
    return { components: label, areas, labels };
  }

  /**
   * Mean-pool non-overlapping square blocks.
   * Inputs: image (numeric grid), factor (positive integer), pixel_size_m
   * (positive input pixel width in metres).
   * Outputs: {out, pixel_size_m}; each output value is the block mean.
   * Errors: ConstraintViolation/image_exceeds_128x128,
   * ConstraintViolation/factor_must_be_positive_integer,
   * ConstraintViolation/size_not_divisible_by_factor,
   * ConstraintViolation/pixel_size_must_be_positive.
   * Hand check: [[1,3],[5,7]], factor=2, pixel_size_m=0.5 gives
   * out=[[4]], pixel_size_m=1.
   */
  function downsample(input) {
    const image = input && input.image;
    const factor = input && input.factor;
    const pixel_size_m = input && input.pixel_size_m;
    const ie = imageError(image);
    if (ie) return ie;
    if (!Number.isInteger(factor) || factor < 1) {
      return constraint('factor_must_be_positive_integer');
    }
    if (!finite(pixel_size_m) || pixel_size_m <= 0) {
      return constraint('pixel_size_must_be_positive');
    }
    if (!rectangular(image)) return { out: [], pixel_size_m: pixel_size_m * factor };
    const h = image.length, w = image[0].length;
    if (h % factor || w % factor) return constraint('size_not_divisible_by_factor');
    const out = [];
    for (let y = 0; y < h; y += factor) {
      const row = [];
      for (let x = 0; x < w; x += factor) {
        let sum = 0;
        for (let dy = 0; dy < factor; dy++) {
          for (let dx = 0; dx < factor; dx++) sum += image[y + dy][x + dx];
        }
        const mean = sum / (factor * factor);
        if (!finite(mean)) return mathError('non_finite_result');
        row.push(mean);
      }
      out.push(row);
    }
    return { out, pixel_size_m: pixel_size_m * factor };
  }

  /**
   * Convert one RGB pixel to BT.601 luma.
   * Inputs: mode ('bt601'), rgb [R,G,B], channel levels in the same
   * numeric scale (normally 0..255).
   * Outputs: {Y}, in that same scale.
   * Errors: NotSupported/unsupported_channel_mix_mode,
   * ConstraintViolation/rgb_must_have_three_finite_channels.
   * Hand check: [100,150,200] gives Y=140.75.
   */
  function channel_mix(input) {
    if (!input || input.mode !== 'bt601') {
      return unsupported('unsupported_channel_mix_mode');
    }
    const rgb = input.rgb;
    if (!Array.isArray(rgb) || rgb.length !== 3 || !rgb.every(finite)) {
      return constraint('rgb_must_have_three_finite_channels');
    }
    const Y = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
    return finite(Y) ? { Y } : mathError('non_finite_result');
  }

  /**
   * Solve the exact 2 x 2 linear mixture measured = M * abundance.
   * Inputs: M, a finite 2 x 2 matrix; measured, two finite measurements.
   * Outputs: {abundance:[a1,a2]}; no abundance bounds are imposed.
   * Errors: ConstraintViolation/matrix_must_be_2x2,
   * ConstraintViolation/measured_must_have_two_finite_channels,
   * MathError/singular_mixing_matrix.
   * Hand check: M=[[1,0],[0,1]], measured=[0.25,0.75] gives
   * abundance=[0.25,0.75].
   */
  function unmix(input) {
    const M = input && input.M, measured = input && input.measured;
    if (!Array.isArray(M) || M.length !== 2 ||
        !M.every(row => Array.isArray(row) && row.length === 2 && row.every(finite))) {
      return constraint('matrix_must_be_2x2');
    }
    if (!Array.isArray(measured) || measured.length !== 2 || !measured.every(finite)) {
      return constraint('measured_must_have_two_finite_channels');
    }
    const det = M[0][0] * M[1][1] - M[0][1] * M[1][0];
    if (Math.abs(det) < 1e-12) return mathError('singular_mixing_matrix');
    const a1 = (measured[0] * M[1][1] - M[0][1] * measured[1]) / det;
    const a2 = (M[0][0] * measured[1] - measured[0] * M[1][0]) / det;
    if (!finite(a1) || !finite(a2)) return mathError('non_finite_result');
    return { abundance: [a1, a2] };
  }

  return Object.freeze({
    API_VERSION: 1,
    convolve,
    threshold,
    otsu,
    segment,
    downsample,
    channel_mix,
    unmix
  });
})();
/* FIT-CALC-END x5_2d_grids */
export default FITCalcX5;
