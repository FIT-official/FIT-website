import 'server-only'
import { tex, mcq, short, derive, reflect, item, column } from './builders.js'

// Project 10, adapted from the independent content owner's supplied guide (22 October 2026).
// Numerical examples are SYNTHETIC. The teacher key, candidate scores and result plot are role-gated
// elsewhere and never appear in this student-facing object. Not an EIT scanner and not OpenEIT material.

const project = {
  slug: 'resistor-network-tomography',
  simId: 'tomography',
  title: 'Locate a hidden electrical change',
  shortTitle: 'Resistor-network tomography',
  field: 'Electricity, inverse problems and statistics',
  level: 'Advanced Secondary 4 or JC; a scaffolded Secondary 3 version compares candidate fingerprints without matrix algebra',
  pacing: 'No-kit lesson: 60 minutes. Hardware route: about 3 to 5 supervised sessions (a planning estimate, not a promise).',
  summary: 'Infer which resistor in a 3 by 3 network changed from boundary measurements, then test how noise and fewer measurement patterns affect confidence. A discrete resistor-network exercise, not a scanner.',
  readiness: 'The 60-minute lesson is a data investigation with a network diagram, candidate predictions and SYNTHETIC boundary readings. No hardware, body measurements, kit or software account is needed. The hardware route is an isolated low-voltage resistor network on a breadboard with one component hidden or changed by the teacher.',
  tile: { assetId: 'tomography-build-diagram', alt: 'Original diagram: nine numbered nodes in a three by three grid joined by twelve resistors; measurements use boundary nodes and node 8 as the 0 volt reference.' },
  researchQuestion: tex`How reliably can a hidden resistor change be located from measurements at a network’s boundary, and how do noise and fewer measurement patterns affect confidence?`,
  published: {
    label: 'Published build (what the sources describe)',
    text: 'OpenEIT publishes hardware-related resources and a dashboard for electrical impedance tomography, and the Mindseye first-party site describes non-biological tank phantoms as well as research instrumentation. These establish a real research precedent, not the performance of the classroom network. OpenEIT’s repository licence is CC BY-NC-SA 4.0, so none of its code, figures or hardware design is copied into this lesson. FIT has not built an EIT instrument.',
    sourceIds: ['openeit', 'openeitLicence', 'mindseye', 'openstaxKirchhoff'],
  },
  proposed: {
    label: 'Proposed student investigation (not a claim that FIT built this)',
    text: 'Scope boundary: this is discrete resistor-network inverse localisation, inspired by electrical tomography. It is not a complete EIT scanner, does not reconstruct tissue and is never connected to a person or an animal. The student-owned contribution is an independent forward circuit model, an explicit inverse hypothesis test, a noise study and honest confidence limits. Real EIT commonly uses AC, electrodes, contact impedance and spatial conductivity models, which are outside the basic build.',
  },
  prerequisites: [
    'Required: resistance, voltage, current, series and parallel reasoning, simultaneous equations and graphs.',
    'Helpful: spreadsheets and sums of squares. Extension: matrices, network Laplacians, Jacobians, conditioning and regularisation.',
    'For scaffolding give each group three candidates first, then expand to all twelve.',
    'Learning goals: tell a forward problem from an inverse problem; apply Ohm’s and Kirchhoff’s laws; compare candidate models with residuals; test the effect of noise; explain why a best-fitting answer is not automatically unique or correct.',
  ],
  concepts: [
    {
      id: 'ohm',
      title: 'Ohm’s law and conductance',
      body: tex`Voltage $V$ is in volts, current $I$ in amperes and resistance $R$ in ohms. Conductance $g$ is in siemens.`,
      equations: [{ tex: String.raw`V=IR,\qquad g=\frac{1}{R}`, caption: 'Ohm’s law and conductance.' }],
      sourceIds: ['openstaxKirchhoff'],
    },
    {
      id: 'kcl',
      title: 'Kirchhoff’s current law at each node',
      body: tex`At an internal node $i$, injected current is positive and withdrawn current negative; every term is in amperes. The total injected current must equal the total withdrawn current. For the whole network the equations collect into a matrix form, where the diagonal of $L$ is the sum of the conductances at a node and each off-diagonal entry is $-g_{ij}$. Adding a constant to every node voltage changes no voltage difference, so one reference must be fixed: here $V_8=0$ V.`,
      equations: [
        { tex: String.raw`\sum_j g_{ij}\,(V_i-V_j)=I_i`, caption: 'Current balance at node i.' },
        { tex: String.raw`L\,V=I,\qquad V_8=0\ \text{V}`, caption: 'Network equations with a fixed reference node.' },
      ],
      sourceIds: ['openstaxKirchhoff'],
    },
    {
      id: 'transfer',
      title: 'Transfer resistance and the change from baseline',
      body: tex`The measured transfer resistance $T$, in ohms, lets readings taken at different measured source currents be compared in a linear resistor network. It is not the resistance of one edge. The change is the difference from the baseline network, in ohms.`,
      equations: [
        { tex: String.raw`T=\frac{V_{\text{node}}-V_{\text{reference}}}{I_{\text{source}}}`, caption: 'Transfer resistance in ohms.' },
        { tex: String.raw`\Delta T=T_{\text{changed}}-T_{\text{baseline}}`, caption: 'Change in transfer resistance.' },
      ],
      sourceIds: [],
    },
    {
      id: 'sse',
      title: 'Ranking candidates by residual',
      body: tex`For a candidate $h$ compute the predicted change $\Delta T(h)$ and the sum of squared errors over all readings $k$. The smallest value is the best candidate within the stated hypothesis set, not proof that the set contains reality. If channel uncertainties $\sigma_k$ differ, use the weighted version, which is dimensionless. Independence and correctly estimated $\sigma_k$ are assumptions, and shared-current errors can correlate channels.`,
      equations: [
        { tex: String.raw`\mathrm{SSE}(h)=\sum_k\left[\Delta T_{\text{obs},k}-\Delta T(h)_k\right]^{2}\ \ (\Omega^{2})`, caption: 'Sum of squared errors for candidate h.' },
        { tex: String.raw`\chi^{2}(h)=\sum_k\left[\frac{\Delta T_{\text{obs},k}-\Delta T(h)_k}{\sigma_k}\right]^{2}`, caption: 'Weighted residual with channel uncertainties.' },
      ],
      sourceIds: [],
    },
    {
      id: 'regularisation',
      title: 'Extension: a small-change estimate with regularisation',
      body: tex`For small fractional resistor changes $x$ (dimensionless), the change in transfer resistance is approximately linear with a sensitivity matrix $J$ in ohms. A regularised estimate minimises the expression below; in this unnormalised form $\alpha$ has units of $\Omega^2$. Regularisation trades variance against bias. It does not create missing information.`,
      equations: [
        { tex: String.raw`\Delta T\approx Jx`, caption: 'Linearised response to small fractional changes.' },
        { tex: String.raw`\min_x\ \lVert Jx-\Delta T\rVert^{2}+\alpha\lVert x\rVert^{2}`, caption: 'Regularised least squares.' },
      ],
      sourceIds: [],
    },
  ],
  diagrams: [
    { id: 'tomography-build-diagram', title: 'Numbered 3 by 3 resistor network', alt: 'Nine nodes numbered 0 to 8 form a three by three square grid joined by twelve resistors labelled R0 to R11 along horizontal and vertical edges only. Node 8 is the voltage reference at 0 volts, current is injected between the pairs 3 to 5, 1 to 7, 0 to 8 and 2 to 6, and all twelve baseline resistors are 1000 ohms. The five-step method is listed beside the grid.', caption: 'Original diagram supplied with the curriculum; it is not an OpenEIT schematic. The grid has no diagonal wires.' },
  ],
  buildSteps: [
    { id: 'labels', title: 'Reproduce the labels exactly', body: 'The grid has horizontal and vertical connections only, no diagonals. Use the network edge list as the authoritative connection list.', diagramId: 'tomography-build-diagram', sourceIds: [] },
    { id: 'baseline', title: 'Measure and check the baseline', body: 'With power disconnected, measure each resistor value and inspect for accidental shorts. Your teacher verifies the topology and the series protection resistor.', sourceIds: [] },
    { id: 'source', title: 'Measure the source current safely', body: 'Apply the isolated battery through its series protection resistor across the chosen source pair. Infer the source current from the voltage across the known protection resistor, $I=V_{\\text{guard}}/R_{\\text{guard}}$. Node 8 is a voltage-measurement reference, not an instruction to short the battery to it.', sourceIds: [] },
    { id: 'voltages', title: 'Measure boundary voltages', body: 'Measure the boundary-node voltages relative to node 8. The boundary nodes are 0, 1, 2, 3, 5, 6, 7 and 8; node 4 is interior and is not measured for the inverse test. Repeat for source pairs 3 to 5, 1 to 7, 0 to 8 and 2 to 6, recording signed current and voltage consistently, and measure the baseline repeatedly to estimate noise and drift.', sourceIds: [] },
    { id: 'blind', title: 'Run a blinded change', body: 'Disconnect the battery. A teacher changes one resistor and hides which one. Reconnect only after a wiring check, take the same measurements and normalise by the measured source current.', sourceIds: [] },
    { id: 'rank', title: 'Predict, compare and rank', body: 'Predict each candidate using the measured baseline component values and rank the residuals. Use the nominal synthetic model only for its own dataset, not as a substitute for real component tolerances.', sourceIds: [] },
    { id: 'challenge', title: 'Challenge the conclusion', body: 'Challenge it with withheld measurements, repeated trials, a deliberately wrong candidate set or a two-change test. Report where the one-change assumption fails.', sourceIds: [] },
  ],
  equipment: [
    item('e-nokit', 'No-kit lesson: the network diagram, the SYNTHETIC boundary readings and candidate fingerprints, a calculator or spreadsheet and the question sheet'),
    item('e-breadboard', 'Build: a breadboard, twelve nominal 1 kΩ resistors, at least one nominal 1.5 kΩ replacement and insulated leads'),
    item('e-battery', 'A two-AA-cell holder (nominal 3 V) and a series protection resistor of at least 1 kΩ'),
    item('e-meter', 'A high-input-impedance digital multimeter (a second meter is useful, not necessary), with resistor values measured before modelling'),
    item('e-teacher', 'Teacher-supervised assembly. No mains supply is required.'),
  ],
  safety: {
    intro: 'Use only the specified isolated low-voltage battery supply with a series protection resistor and teacher wiring checks. Prices and stock are unknown, and nothing needs to be bought for the 60-minute lesson. Never build or buy a body-connected EIT instrument for this activity.',
    items: [
      item('s-battery', 'Only the isolated battery supply with its series protection resistor is used, and the teacher has checked the wiring.'),
      item('s-power', 'Power is disconnected before any component is changed. Drinks and water are kept away, resistors are not heated and batteries are not shorted.'),
      item('s-no-body', 'There are no electrodes on skin, no body or animal connections and no medical claims. A low voltage by itself does not authorise a human-connected experiment.'),
      item('s-no-mains', 'No mains or high voltage is used.'),
      item('s-mentor', 'If safe hardware or mentoring is unavailable I stop at the network model.'),
    ],
  },
  milestones: [
    { id: 'm-1', title: 'Milestone 1 (60-minute lesson)', evidence: 'A correctly matched candidate comparison and explicit assumptions.' },
    { id: 'm-2', title: 'Milestone 2', evidence: 'A verified network topology and baseline voltages.' },
    { id: 'm-3', title: 'Milestone 3', evidence: 'A blinded one-change test with measured current and repeated readings.' },
    { id: 'm-4', title: 'Milestone 4', evidence: 'A noise and information study plus at least one deliberately failing model test.' },
  ],
  tasks: [
    { id: 't-sim-blind', kind: 'simulation', title: 'Blinded partner test', body: 'One partner chooses a hidden edge and a noise seed in the simulation without telling the other, who reads only the ranked residuals. Only then reveal the hidden edge.' },
    { id: 't-sim-patterns', kind: 'simulation', title: 'Fewer patterns, more noise', body: 'Repeat with one, two and four source patterns and with noise of 0.5, 5 and 20 Ω. When does the winner stop being stable, and how does the margin ratio change?' },
    { id: 't-exp-localise', kind: 'experiment', title: 'Experiment A: localisation', body: 'Vary which edge is changed and record identification accuracy over blinded trials, the best residual and the margin to the next candidate. Use several hidden edges, not repeated fitting to one known answer.' },
    { id: 't-exp-information', kind: 'experiment', title: 'Experiment B: information', body: 'Use one, two or four source patterns and compare errors and ambiguity across the same hidden cases. The number of readings alone does not guarantee independent information.' },
    { id: 't-exp-mismatch', kind: 'experiment', title: 'Experiment C: noise and model mismatch', body: 'Add explicitly simulated noise, or compare nominal and measured resistor values. Keep simulated perturbations separate from measured readings, and test whether a two-resistor change is wrongly forced into a one-resistor explanation.' },
  ],
  dataset: {
    intro: 'Simulation rows are SYNTHETIC. Store the actual component values, the battery and guard-resistor details and any calibration separately. There are no human measurements in this project, so never record personal physiological data.',
    columns: [
      column('patternsUsed', 'Source patterns used', '', 'input'),
      column('noiseOhm', 'Noise on each reading', 'Ω', 'input', true),
      column('changedOhm', 'Changed resistance', 'Ω', 'input', true),
      column('bestEdge', 'Best-fitting candidate edge', 'edge id', 'output'),
      column('bestSse', 'SSE of the best candidate', 'Ω²', 'output', true),
      column('marginRatio', 'Second-best SSE ÷ best SSE', '', 'output'),
      column('identified', 'Best equals hidden (1 yes, 0 no)', '', 'output'),
    ],
  },
  downloads: [
    { id: 'tomography-network-edges-csv', label: 'Network edge list (the authoritative connections)', filename: 'network_edges.csv' },
    { id: 'tomography-synthetic-boundary-readings-csv', label: 'SYNTHETIC observed boundary readings (change in transfer resistance)', filename: 'synthetic_boundary_readings.csv' },
    { id: 'tomography-synthetic-candidate-fingerprints-csv', label: 'SYNTHETIC predicted fingerprints for all twelve candidate edges', filename: 'synthetic_candidate_fingerprints.csv' },
    { id: 'tomography-measurement-template-csv', label: 'Blank measurement template (a schema, not data)', filename: 'measurement_template.csv' },
  ],
  lesson60: {
    title: 'A 60-minute lesson with no kit',
    intro: 'Use the network diagram, the SYNTHETIC observed readings and the candidate fingerprints. Do not look at any teacher result before your group commits to a hypothesis. Completing this lesson is not completing the hardware investigation.',
    steps: [
      { id: 'a', minutes: '0 to 8', title: 'Hide one edge', body: 'Cover one interior edge on the network drawing. Ask whether boundary readings could reveal what changed without probing it directly.' },
      { id: 'b', minutes: '8 to 18', title: 'Forward and inverse', body: 'Work a two-resistor divider by hand. The forward direction is components to voltages. Reverse it conceptually: voltages to possible component changes.' },
      { id: 'c', minutes: '18 to 35', title: 'Score twelve candidates', body: 'Load the observed-change file and the candidate fingerprints. Match rows by pattern ID and voltage node, not by spreadsheet order. Compute the SSE for each of the twelve candidates.' },
      { id: 'd', minutes: '35 to 45', title: 'Rank and state assumptions', body: 'Rank the candidates and state the hypothesis: exactly one resistor changed from 1000 Ω to 1500 Ω, a known topology and an otherwise unchanged network. Only after stating it do you ask your teacher to reveal the answer.' },
      { id: 'e', minutes: '45 to 53', title: 'Fewer patterns, more noise', body: 'Repeat the calculation with fewer patterns or with rounded or noisier readings. Explain how confidence changes and whether the winner is stable.' },
      { id: 'f', minutes: '53 to 60', title: 'Exit ticket', body: 'Distinguish “best of these twelve” from “proved true”, and propose one extra measurement that could challenge your conclusion.' },
    ],
  },
  questions: [
    mcq('p10-q01', 'Which is the inverse problem?', ['inferring a changed resistor from voltages', 'calculating voltages from known resistors', 'measuring the battery voltage only', 'counting wires'], 1, 1),
    mcq('p10-q02', tex`Fixing $V_8=0$ V is needed because:`, ['only voltage differences matter', 'current disappears there', 'every resistor becomes 0 Ω', 'it changes the physical circuit'], 1, 2),
    mcq('p10-q03', 'The smallest residual among twelve one-change candidates shows that:', ['the winner is the best candidate within that model set', 'there was exactly one change', 'noise is absent', 'the network is a medical scanner'], 1, 0),
    mcq('p10-q04', 'If the source current changes between trials, compare:', ['voltage divided by current, keeping signs and uncertainty', 'raw voltages regardless of current', 'resistor colours only', 'file sizes'], 1, 3),
    short('p10-q05', 'A boundary voltage is 0.240 V when the measured source current is 0.800 mA. Calculate the transfer resistance. A later reading is 0.270 V at 0.900 mA. Did the normalised value change?', 2),
    short('p10-q06', 'A candidate fits the training patterns but fails a withheld pattern. Give two plausible explanations and the next check you would make.', 2),
    short('p10-q07', 'Why is changing one resistor in a known network not equivalent to making a clinical image of a person?', 2),
    derive('p10-q08', tex`Node 1 is connected to fixed nodes at 1.00 V and 0 V by resistors of 1000 Ω and 2000 Ω respectively. With no external current at node 1, derive its node equation and calculate its voltage. Check both branch currents.`, 4),
    derive('p10-q09', tex`For the extension model, derive the stationarity equation for minimising $F(x)=\lVert Jx-d\rVert^{2}+\alpha\lVert x\rVert^{2}$ with $d=\Delta T$. State the units of $J$, $x$, $d$ and $\alpha$ in the unnormalised formulation, and explain one consequence of increasing $\alpha$.`, 4),
    reflect('p10-q10', 'Reflection (not scored). Which assumptions made localisation possible, and which were measured rather than merely believed? Could two candidates look similar under one source pattern but differ under another? How would you detect an unmodelled change instead of always naming a winner?', 0),
  ],
  rubricFocus: {
    question: 'Names the hidden-edge identification task, the number of patterns and the noise as the bounded variables.',
    model: 'States the one-change, known-topology, ideal-resistor assumptions and where they could fail.',
    data: 'Keeps SYNTHETIC rows apart from measured rows and records source current and actual component values.',
    uncertainty: 'Reports noise, repeats and the margin between the best and second-best candidate, not only a winner.',
    improvement: 'Predicts the effect of an extra source pattern or a wider candidate set before testing it, including one deliberately failing test.',
    safety: 'Applies the isolated low-voltage supply, power-off and no-body-connection rules to the actual set-up.',
  },
  caveats: [
    'This is not a complete EIT scanner and reconstructs no tissue. A discrete localisation exercise establishes no clinical capability and must not inherit body-measurement or safety claims.',
    'The synthetic data come from a teaching model (seed 10102026, twelve 1000 Ω baseline resistors, four ideal 1 mA patterns, seven boundary voltages per pattern, one edge changed to 1500 Ω, Gaussian noise of 0.5 Ω on the differences). It is not an OpenEIT dataset or instrument performance.',
    'A margin between the best and second-best candidate in this toy example does not establish general uniqueness.',
  ],
  sourceIds: ['openeit', 'openeitLicence', 'mindseye', 'openstaxKirchhoff'],
}

export default project
