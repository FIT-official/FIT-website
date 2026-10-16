# FIT simulation library

FIT's library contains four original activities, a shared practice shell and teacher assignment to the existing workshop classroom. The public library uses `/classes/simulations`; the separate, held Classes platform is not imported. Simulation models and controls in `public/simulations/` retain their existing behaviour.

## Routes and interaction

- `/classes/simulations`: search and learning-level, subject and topic filters.
- `/classes/simulations/sampling`: Signal Sampling Detective.
- `/classes/simulations/feedback`: Feedback Control Lab.
- `/classes/simulations/base-rates`: Evidence & Base Rates.
- `/classes/simulations/heat-path`: Heat Path Designer.
- `/simulations/<activity>`: standalone, no-account activity document, behind the existing page gate.
- `/simulations/<activity>?embed=1`: compact same-origin player.
- `/embed/sims/<id>`: minimal same-origin activity document, without site chrome.
- `/workshop/classroom`: the existing classroom, including teacher-assigned simulations and activity prompts.

`content/sims/registry.js` owns discovery metadata. Only `live` entries appear in the library, detail pages, player documents, snippets and class content. Curriculum levels are editorial lesson-planning assumptions; `syllabusRef` stays empty until a teacher reviews a specific syllabus. No accreditation is implied.

## Practice and progress

`components/sims/GameShell` provides three conceptual checkpoints (Notice, Explain, Apply), one star per completed checkpoint and optional elapsed time. Correct first, second and later attempts earn 100, 75 and 50 points. The timer never affects the score. Checkpoint answers are independent of the simulator's state: points are practice feedback, not experiment measurements, assessed grades or evidence of learning gains.

Versioned progress stays in this browser's localStorage. Storage failures leave the experiment usable. Sound begins off and uses short WebAudio tones after a user action. The activity stage and decorative canvas load dynamically when visible; celebration respects reduced-motion preferences. The unchanged player still supplies equations, assumptions, text/numeric equivalents and keyboard/touch controls.

## Classroom assignment

The branch has one workshop lesson, shared by ten groups, rather than a multi-class picker. A signed-in workshop teacher can add an activity with one click from a library card or activity page. `POST /api/admin/workshop/guest/sims` uses existing teacher authentication and the lesson store's optimistic concurrency and audit trail. Assignments are a bounded `simIds` list on the existing `workshopGuestLessons` document; there is no new collection. Teachers can remove activities in the existing classroom panel. Learners see each assigned live simulation and its activity prompt.

Simulation assignment does not store learner progress on the server. Local verification uses synthetic API responses and mocked stores; it does not write to a database. Expanding beyond the single workshop requires a future class-identity/data-model decision.

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
| [myPhysicsLab](https://www.myphysicslab.com/develop/docs/index.html) | Mechanics, graphing, derivations and solver controls | Referenced for context only; no code reused here |
| [Concord](https://concord.org/licensing/) | Molecular/environmental computational models | Software and finished educational resource licenses differ |

The selected instructional tasks concern signed alias detection and sampling budgets; thermal controller tuning under delay/power constraints; contextual base-rate inspection; and spatial heat-path design. Similar underlying topics already exist elsewhere. The gaps are qualified task-level opportunities, not claims that an entire subject is absent from PhET or peers.

## Verification and integration

Focused checks: `node node_modules/vitest/vitest.mjs run tests/classroomSimulation tests/sims tests/unit/sims --maxWorkers=2 --minWorkers=1`. These cover model references, scoring and level order, local progress, sound, visibility, registry filtering, embed escaping, route gates and class assignment through mocked storage.

Whole checks follow existing coverage, lint and production-build scripts. The isolated Windows QA runner strips inherited app credentials, blocks outbound network, uses mocked build fonts and synthetic keys only. Those fixtures are outside tracked source and must not be deployed. The generated playground-worker prebuild is absent from this production base and was not imported from the held candidate.

The `/classes` parent route remains reserved for the separate Classes platform. No parent redirect or class-ID route is introduced here. Before combining that platform with the library, review any existing class ID named `simulations`, because it would overlap the library's static route. The workshop integration uses the established `/workshop/classroom` and `/admin/workshop` surfaces.
