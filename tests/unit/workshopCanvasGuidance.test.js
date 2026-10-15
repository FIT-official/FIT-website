import { describe, expect, it } from 'vitest'
import { canvasGuidanceSource, canvasGuidancePrompts } from '@/lib/workshopCanvasGuidance'
describe('reviewable local drawing and Tinkercad prompts',()=>{
    it('uses the own current idea and visible idea-specific feedback without identity/account fields',()=>{
        const lesson={group:'g1',seat:'OWN-SEAT',studentName:'PRIVATE NAME',ownClassDetails:{studentLogin:'PRIVATE LOGIN'},showFeedback:true,feedback:[{presentingGroup:'g1',idea:'1',whatWorks:'Actual useful base',question:'Actual hinge question',improvement:'Actual fit check',seat:'PRIVATE REVIEWER',studentName:'PRIVATE NAME'},{presentingGroup:'g2',idea:'1',improvement:'OTHER GROUP DATA'},{presentingGroup:'g1',idea:'2',improvement:'OTHER IDEA DATA'}],refinements:[{group:'g1',seat:'OTHER-SEAT',ideas:[{idea:'1',solutionDescription:'OTHER STUDENT WORK'}]},{group:'g1',seat:'OWN-SEAT',ideas:[{idea:'1',problemStatement:'Our saved problem',solutionDescription:'Our saved solution'}]}]}
        const source=canvasGuidanceSource(lesson,'1'),prompts=canvasGuidancePrompts({...source,dimensions:'120 x 60 x 3 mm, measured',constraints:'Use the measured classroom parts'})
        expect(source.problem).toBe('Our saved problem');expect(source.design).toBe('Our saved solution');for(const prompt of Object.values(prompts)){expect(prompt).toContain('Actual hinge question');expect(prompt).toContain('120 x 60 x 3 mm, measured');expect(prompt).not.toMatch(/PRIVATE|OWN-SEAT|OTHER GROUP|OTHER IDEA|OTHER STUDENT/)}
        expect(prompts.drawing).toContain('PROPOSED');expect(prompts.tinkercad).toContain('preserve the original project');expect(prompts.tinkercad).toContain('do not claim you control or directly edit Tinkercad')
    })
    it('leaves missing dimensions unknown, respects hidden feedback and never creates an execution instruction',()=>{
        const source=canvasGuidanceSource({group:'g2',seat:'SYNTHETIC',showFeedback:false,feedback:[{presentingGroup:'g2',idea:'1',improvement:'HIDDEN FEEDBACK'}],refinements:[]},'1'),prompts=canvasGuidancePrompts(source)
        expect(source.problem.length).toBeGreaterThan(0);expect(source.feedback).toBe('');expect(prompts.drawing).toContain('UNKNOWN');expect(prompts.drawing).not.toContain('HIDDEN FEEDBACK');expect(prompts.tinkercad).toContain('Give written guidance only')
    })
})
