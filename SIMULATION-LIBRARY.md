# FIT simulation library

This addition starts from production `5789481df0ecfe506a30aed7b13bcb56cbda115e`. It does not import the held Classes platform or protected-copy candidate `dbc9e1d`, or change class seats, submissions, rosters, classroom APIs, middleware, credentials or site-wide headers. The coordinated desktop/mobile Classes link points directly to the public library.

## Routes and interaction

- `/classes/simulations`: searchable subject/difficulty library.
- `/classes/simulations/sampling`: Signal Sampling Detective.
- `/classes/simulations/feedback`: Feedback Control Lab.
- `/classes/simulations/base-rates`: Evidence & Base Rates.
- `/classes/simulations/heat-path`: Heat Path Designer.
- `/simulations/<activity>`: standalone, no-account activity document, behind the existing page gate.
- `/simulations/<activity>?embed=1`: compact same-origin player.

Each activity includes accessible native controls, reset, numeric/text equivalents, equations, units, assumptions, an investigation and teacher guidance. Thermal and heat activities have run/pause, fixed numerical stepping and a bounded 300-second experiment. Playback pauses when the workbench leaves the viewport or the document is hidden. Sampling starts with the source hidden; inspection has deterministic expected and seeded sample modes. Heat has roving keyboard cell focus and material brushes.

Player code is independently authored and uses no external runtime or learner-submission API. It imports only local scripts/styles, sends no learner measurements or responses, and reads no class identity or private data. The normal FIT shell retains its existing host/auth/consent behavior. Entry documents use uncached extensionless GET routes so the unchanged middleware applies the same maintenance and onboarding rules as the library. The former static HTML copies are removed; there is no alternate public HTML entry that skips the maintenance gate. Hosting may retain access logs; this is not a claim that hosting collects no technical data. Learner answers are discussion prompts, not submitted or stored responses.

## Embedding boundary

FIT currently enforces `frame-ancestors 'self' https://pay.google.com`. Same-origin iframes work under that policy. The copy action explicitly labels its snippet as a same-origin FIT player. Arbitrary external embedding is not claimed or enabled. A separate route-scoped framing proposal is prepared in the task handoff; the exact approved LMS origins and release decision are pending. External users can follow the standalone link.

No global security policy is changed. The copy snippet derives its origin from the actual running page, includes a title, responsive width, lazy loading, no-referrer and fullscreen support. It carries no student identifiers. Production/static embed headers and cross-origin LMS behavior still require deployed browser verification.

## Numerical models and reference checks

| Activity | Model | Checked reference |
| --- | --- | --- |
| Sampling | `A sin(2πft+φ)`, signed folded frequency | 7 Hz sampled at 10 Hz folds to −3 Hz; arbitrary-phase sample residual <1e−10; strict Nyquist, zero amplitude and DC |
| Feedback | Lumped heat balance, Manual/P/PI, saturation, delayed history and anti-windup; Euler 0.1 s | Constant-duty exponential, P steady error, feasible PI target, unreachable target, input = stored energy + heat loss, timestep convergence |
| Base rates | Natural-frequency Bayes model plus seeded Bernoulli batches | 95 true flags / 495 false flags = 16.1017%; population conservation; uninformative detector; undefined denominator; reproducible seed |
| Heat paths | Symmetric harmonic-mean tile conductance, equal capacity 1 J/K, Euler 0.2 s | Uniform state, equal/opposite transfers, insulated energy conservation, zero-conductance barrier, stable bounds, linear fixed-boundary steady state and timestep refinement |

Suggested ages/durations are assumptions to adapt to FIT's curriculum. No global novelty, PhET-equivalent educational effectiveness or measured learning-gain claim is made. Teacher/student pilot and actual assistive-technology testing remain open.

## Comparison and rights

Official-source research was supplied on 14 October 2026. These sites are optional attributed links; no third-party code, images, worksheets or branded simulators are bundled.

| Resource | Useful strengths | Integration consideration |
| --- | --- | --- |
| [PhET](https://phet.colorado.edu/en/about) | Conceptual inquiry, linked representations | Current [licensing](https://phet.colorado.edu/en/licensing) restricts commercial advantage under CC BY-NC; commercial agreement may be required |
| [Desmos](https://www.desmos.com/api/v1.12/docs/index.html?lang=en) | Expression-driven graphs, tables and sliders | [Commercial API plans](https://www.desmos.com/my-api) and feature scope require confirmation; Classroom is separately [Amplify Classroom](https://help.desmos.com/hc/en-us/articles/23421565218573-Amplify-Classroom-formerly-Desmos-Classroom-now-a-part-of-Amplify) |
| [GeoGebra](https://geogebra.github.io/docs/reference/en/Material_Embedding_%28Iframe%29/) | Geometry, algebra and 3D | [Complete-product/material licensing](https://www.geogebra.org/license) differs from source licensing |
| [Falstad](https://www.falstad.com/mathphysics.html) | Circuits and advanced mathematical models | [CircuitJS1](https://github.com/sharpie7/circuitjs1) has GPL obligations; applets have different terms |
| [myPhysicsLab](https://www.myphysicslab.com/develop/docs/index.html) | Mechanics, graphing, derivations and solver controls | Apache-licensed code is an optional future engine; no code reused here |
| [Concord](https://concord.org/licensing/) | Molecular/environmental computational models | Software and finished educational resource licenses differ |

The selected instructional tasks concern signed alias detection and sampling budgets; thermal controller tuning under delay/power constraints; contextual base-rate inspection; and spatial heat-path design. Similar underlying topics already exist elsewhere. The gaps are qualified task-level opportunities, not claims that an entire subject is absent from PhET or peers.

## Verification and integration

Focused checks: `node node_modules/vitest/vitest.mjs run tests/classroomSimulationModels.test.js tests/classroomSimulationLibrary.test.jsx tests/classroomSimulationPlayer.test.js`.

Whole checks follow existing coverage, lint and production-build scripts. The isolated Windows QA runner strips inherited app credentials, blocks outbound network, uses mocked build fonts and synthetic keys only. Those fixtures are outside tracked source and must not be deployed. The generated playground-worker prebuild is absent from this production base and was not imported from the held candidate.

The production Classes parent route does not yet exist; the held Classes platform owns it. Its owner approved only Classes links in Navbar/MobileMenu to this library. No parent redirect, private hub or audience route is imported. The held schema permits a literal class ID `simulations`, which would conflict with the new static prefix when that private hub is later combined; an authorized roster/ID check is required before the combined release. This isolated production-based release contains no private class route. Only these reviewed commits should enter the production release checkout, and production SHA must still match the recorded base or be explicitly reconciled with a fresh source review.
