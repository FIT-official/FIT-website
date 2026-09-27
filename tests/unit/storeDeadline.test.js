import { afterEach, expect, it, vi } from 'vitest';
import { storeDeadline } from '@/lib/storeDeadline';
afterEach(() => vi.useRealTimers());

it('bounds a stalled Clerk read and allows a later request to recover', async () => {
    vi.useFakeTimers();
    const result = storeDeadline(new Promise(() => {}), 100).catch(error => error);
    await vi.advanceTimersByTimeAsync(101);
    expect((await result).message).toBe('Store service timed out');
    expect(await storeDeadline(Promise.resolve({ userId: 'buyer' }))).toEqual({ userId: 'buyer' });
    expect(vi.getTimerCount()).toBe(0);
});
