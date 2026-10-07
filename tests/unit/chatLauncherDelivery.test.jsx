import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
const m = vi.hoisted(() => ({ send: vi.fn(), channel: null }));
vi.mock('@clerk/nextjs', () => ({ useUser: () => ({ user: { id: 'buyer' }, isLoaded: true }) }));
vi.mock('stream-chat', () => ({ StreamChat: { getInstance: () => ({
    connectUser: async () => {}, disconnectUser: async () => {}, channel: () => m.channel,
}) } }));
import ChatLauncher from '@/components/Chat/ChatLauncher';
beforeEach(() => {
    m.send.mockReset().mockResolvedValue({});
    m.channel = { watch: async () => {}, state: { messages: [] }, off: vi.fn(), on: vi.fn(), sendMessage: m.send };
    vi.stubGlobal('fetch', vi.fn(async url => ({ ok: true, json: async () =>
        url === '/api/chat/token' ? { token: 'mock', apiKey: 'mock', userId: 'buyer' } :
        url === '/api/chat/channel' ? { channelId: 'support_one' } : { channels: [] },
    })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('connects a new buyer to a real support destination before enabling Send', async () => {
    render(<ChatLauncher />);
    fireEvent.click(screen.getByRole('button', { name: 'Chat with us' }));
    const input = await screen.findByPlaceholderText(/Type your message/);
    await waitFor(() => expect(input).not.toBeDisabled());
    expect(fetch.mock.calls.find(([url]) => url === '/api/chat/channel')[1].body).toBe('{"kind":"support"}');
    fireEvent.change(input, { target: { value: 'Hello FIT' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(m.send).toHaveBeenCalledWith({ text: 'Hello FIT' }));
    await waitFor(() => expect(input).toHaveValue(''));
});
it('keeps a failed message for review and retry without a fake local echo', async () => {
    m.send.mockRejectedValue(new Error('Offline'));
    render(<ChatLauncher />);
    fireEvent.click(screen.getByRole('button', { name: 'Chat with us' }));
    const input = await screen.findByPlaceholderText(/Type your message/);
    await waitFor(() => expect(input).not.toBeDisabled());
    fireEvent.change(input, { target: { value: 'Please check my order' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText(/could not be confirmed as sent/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByPlaceholderText(/Type your message/)).toHaveValue('Please check my order');
    expect(screen.queryByText('Please check my order')).toBeNull();
});
