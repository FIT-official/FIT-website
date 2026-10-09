import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { useInventoryRefresh } from '@/utils/useInventoryRefresh'
function Harness({refresh,enabled=true}){useInventoryRefresh(refresh,enabled);return null}
afterEach(()=>{cleanup();vi.useRealTimers();vi.restoreAllMocks()})
it('refreshes visible pages on return and each minute, coalesces focus events and cleans up',async()=>{
  vi.useFakeTimers();const refresh=vi.fn();const view=render(<Harness refresh={refresh}/>);
  fireEvent.focus(window);fireEvent(document,new Event('visibilitychange'));expect(refresh).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(60000);expect(refresh).toHaveBeenCalledTimes(2)
  vi.spyOn(document,'visibilityState','get').mockReturnValue('hidden');await vi.advanceTimersByTimeAsync(60000);expect(refresh).toHaveBeenCalledTimes(2)
  view.unmount();fireEvent.focus(window);expect(refresh).toHaveBeenCalledTimes(2)
})
it('does not refresh a locked pending request',()=>{const refresh=vi.fn();render(<Harness refresh={refresh} enabled={false}/>);fireEvent.focus(window);expect(refresh).not.toHaveBeenCalled()})
