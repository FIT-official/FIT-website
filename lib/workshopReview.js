import { createHash } from 'node:crypto'
import content from '../content/designThinkingWorkshop.json'
import reading from '../content/workshopStudentReadingDraft.json'
export const PROJECT_VERSION = createHash('sha256').update(JSON.stringify({ content, reading })).digest('hex').slice(0, 16)
export function assignedTarget(group, round = 1) { const number = Number(group?.slice(1)); return /^g(?:[1-9]|10)$/.test(group || '') && Number.isInteger(round) && round >= 1 && round <= 9 ? 'g' + ((number - 1 + round) % 10 + 1) : null }
export const assignedReview = (state, group) => ({ round: state.reviewRound || 1, target: assignedTarget(group, state.reviewRound || 1), projectVersion: state.projectVersion || PROJECT_VERSION })
