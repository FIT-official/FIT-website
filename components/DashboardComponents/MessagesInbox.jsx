'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { StreamChat } from 'stream-chat';
import Image from 'next/image';
import useEntitlements from '@/utils/useEntitlements';

export default function MessagesInbox() {
    const { user, isLoaded } = useUser();
    const { loading: entitlementsLoading, canUseMessaging } = useEntitlements();
    const [loading, setLoading] = useState(true);
    const [channels, setChannels] = useState([]);
    const [activeChannelId, setActiveChannelId] = useState(null);
    const [client, setClient] = useState(null);
    const [channel, setChannel] = useState(null);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [connectingChannel, setConnectingChannel] = useState(false);
    const [error, setError] = useState(null);
    const [autoReplyMessage, setAutoReplyMessage] = useState('');
    const [autoReplySaving, setAutoReplySaving] = useState(false);
    const [unreadTotal, setUnreadTotal] = useState(0);

    useEffect(() => {
        const loadInbox = async () => {
            if (!isLoaded || !user || entitlementsLoading || !canUseMessaging) return;
            setLoading(true);
            try {
                const res = await fetch('/api/chat/inbox');
                if (!res.ok) throw new Error('Failed to load inbox');
                const data = await res.json();
                const list = data.channels || [];
                setChannels(list);
                const totalUnread = list.reduce((sum, ch) => sum + (ch.unreadCount || 0), 0);
                setUnreadTotal(totalUnread);
                if (list.length > 0) {
                    setActiveChannelId(list[0].channelId);
                }
            } catch (e) {
                console.error('Failed to load inbox', e);
                setError('Unable to load messages right now');
            } finally {
                setLoading(false);
            }
        };
        loadInbox();
    }, [isLoaded, user, entitlementsLoading, canUseMessaging]);

    // Listen for channel read events from other surfaces (e.g. ChatLauncher)
    useEffect(() => {
        if (typeof window === 'undefined') return;

        const handleChannelRead = (event) => {
            const channelId = event?.detail?.channelId;
            if (!channelId) return;
            setChannels(prev => {
                if (!prev || prev.length === 0) return prev;
                const updated = prev.map(ch =>
                    ch.channelId === channelId ? { ...ch, unreadCount: 0 } : ch
                );
                const totalUnread = updated.reduce((sum, ch) => sum + (ch.unreadCount || 0), 0);
                setUnreadTotal(totalUnread);
                return updated;
            });
        };

        window.addEventListener('chat:channel-read', handleChannelRead);

        return () => {
            window.removeEventListener('chat:channel-read', handleChannelRead);
        };
    }, []);

    useEffect(() => {
        const loadSettings = async () => {
            if (!isLoaded || !user) return;
            try {
                const res = await fetch('/api/chat/settings');
                if (!res.ok) return;
                const data = await res.json();
                setAutoReplyMessage(data.autoReplyMessage || '');
            } catch (e) {
                console.error('Failed to load chat settings', e);
            }
        };
        loadSettings();
    }, [isLoaded, user]);

    const saveAutoReply = async () => {
        try {
            setAutoReplySaving(true);
            await fetch('/api/chat/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ autoReplyMessage }),
            });
        } catch (e) {
            console.error('Failed to save auto-reply', e);
        } finally {
            setAutoReplySaving(false);
        }
    };

    // Broadcast unread total changes for navbar / launcher badges after render commits
    useEffect(() => {
        if (typeof window === 'undefined') return;
        window.dispatchEvent(
            new CustomEvent('chat:unread-updated', { detail: { total: unreadTotal } })
        );
    }, [unreadTotal]);

    useEffect(() => {
        if (!activeChannelId || !user) return;

        let active = true;

        const connectChannel = async () => {
            setConnectingChannel(true);
            try {
                const tokenRes = await fetch('/api/chat/token');
                if (!tokenRes.ok) throw new Error('Failed to get chat token');
                const tokenData = await tokenRes.json();
                if (!tokenData.token || !tokenData.apiKey) throw new Error('Stream Chat not configured');

                const streamClient = StreamChat.getInstance(tokenData.apiKey);
                await streamClient.connectUser({ id: tokenData.userId }, tokenData.token);

                const streamChannel = streamClient.channel('messaging', activeChannelId);
                await streamChannel.watch();

                if (!active) return;

                setMessages(
                    (streamChannel.state.messages || []).map(m => ({
                        id: m.id,
                        from: m.user?.id === tokenData.userId ? 'me' : 'other',
                        text: m.text,
                        createdAt: m.created_at,
                    })),
                );

                streamChannel.on('message.new', (event) => {
                    const m = event.message;
                    if (!m || !m.id) return;
                    setMessages(prev => ([
                        ...prev,
                        {
                            id: m.id,
                            from: m.user?.id === tokenData.userId ? 'me' : 'other',
                            text: m.text,
                            createdAt: m.created_at,
                        },
                    ]));
                });

                setClient(streamClient);
                setChannel(streamChannel);

                // Mark this channel as read for unread badge purposes
                try {
                    await fetch('/api/chat/read', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ channelId: activeChannelId }),
                    });

                    // Locally clear unread count for this channel and broadcast new total
                    setChannels(prev => {
                        const updated = prev.map(ch =>
                            ch.channelId === activeChannelId ? { ...ch, unreadCount: 0 } : ch
                        );
                        const totalUnread = updated.reduce((sum, ch) => sum + (ch.unreadCount || 0), 0);
                        setUnreadTotal(totalUnread);
                        return updated;
                    });

                    if (typeof window !== 'undefined') {
                        window.dispatchEvent(
                            new CustomEvent('chat:channel-read', {
                                detail: { channelId: activeChannelId },
                            })
                        );
                    }
                } catch {
                    // Non-fatal if this fails
                }
            } catch (e) {
                console.error('Failed to connect channel', e);
                setError('Unable to open this conversation right now');
            } finally {
                setConnectingChannel(false);
            }
        };

        connectChannel();

        return () => {
            active = false;
            if (client) {
                client.disconnectUser().catch(() => { });
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeChannelId, user?.id]);

    const handleSend = async (e) => {
        e.preventDefault();
        if (!input.trim() || !channel) return;
        const text = input.trim();
        setInput('');
        try {
            await channel.sendMessage({ text });
        } catch (e) {
            console.error('Failed to send message', e);
        }
    };

    if (!isLoaded || entitlementsLoading) {
        return (
            <div className="flex min-h-[92vh] w-full items-center justify-center border-b border-borderColor">
                <div className="loader" />
            </div>
        );
    }

    if (!canUseMessaging) {
        return (
            <div className="flex min-h-[92vh] w-full items-center justify-center border-b border-borderColor">
                <div className="text-center px-6 text-sm text-lightColor max-w-md">
                    Messaging is only available to creators with an active subscription.
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col min-h-[92vh] w-full border-b border-borderColor bg-background/50 pt-10">
            <div className="flex flex-col items-start justify-end w-full mb-6 gap-2 px-6 lg:px-12">
                <h3 className="text-xs font-semibold tracking-[0.2em] uppercase text-lightColor/80">Inbox</h3>
                <h1 className="mb-1 text-2xl font-semibold text-textColor">Direct messages from customers</h1>
                <p className="text-sm text-lightColor max-w-2xl">
                    View and reply to conversations started by customers. This inbox is private to you as a creator.
                </p>
            </div>

            <div className="flex flex-1 flex-col lg:flex-row gap-4 px-4 lg:px-8 pb-8">
                <div className="lg:w-1/3 w-full border border-borderColor rounded-2xl bg-background overflow-hidden flex flex-col shadow-sm">
                    <div className="px-4 py-3 border-b border-borderColor bg-gradient-to-r from-borderColor/20 to-background flex items-center justify-between">
                        <div className="flex flex-col gap-0.5">
                            <span className="text-xs font-semibold uppercase tracking-wide text-lightColor">Conversations</span>
                            <span className="text-[11px] text-lightColor/80">
                                {unreadTotal > 0
                                    ? `${unreadTotal} unread message${unreadTotal === 1 ? '' : 's'}`
                                    : 'All caught up'}
                            </span>
                        </div>
                    </div>

                    <div className="px-4 py-3 border-b border-borderColor/80 bg-background flex flex-col gap-2 text-[11px] text-lightColor">
                        <div className="flex items-center justify-between gap-2">
                            <div className="flex flex-col gap-0.5">
                                <span className="font-medium text-textColor text-xs">Automatic welcome message</span>
                                <span className="text-[10px] text-lightColor/80">
                                    Sent automatically when a customer first messages you.
                                </span>
                            </div>
                            <button
                                type="button"
                                onClick={saveAutoReply}
                                disabled={autoReplySaving}
                                className="px-2 py-1 rounded-full bg-textColor text-background text-[10px] font-medium disabled:opacity-60"
                            >
                                {autoReplySaving ? 'Saving…' : 'Save'}
                            </button>
                        </div>
                        <textarea
                            value={autoReplyMessage}
                            onChange={(e) => setAutoReplyMessage(e.target.value)}
                            rows={3}
                            placeholder="e.g. Thanks for your message! I'll get back to you as soon as I can."
                            className="w-full rounded-xl bg-background border border-borderColor px-3 py-2 text-[11px] text-textColor placeholder-lightColor focus:outline-none focus:ring-1 focus:ring-textColor/40 resize-none"
                        />
                    </div>
                    {loading ? (
                        <div className="flex-1 flex items-center justify-center text-xs text-lightColor">
                            Loading conversations…
                        </div>
                    ) : channels.length === 0 ? (
                        <div className="flex-1 flex items-center justify-center text-xs text-lightColor">
                            No conversations yet.
                        </div>
                    ) : (
                        <div className="flex-1 overflow-y-auto divide-y divide-borderColor/60">
                            {channels.map((ch) => {
                                const p = (ch.participants && ch.participants[0]) || null;
                                return (
                                    <button
                                        key={ch.channelId}
                                        type="button"
                                        onClick={() => setActiveChannelId(ch.channelId)}
                                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-borderColor/20 text-xs transition-colors ${
                                            ch.channelId === activeChannelId ? 'bg-borderColor/10' : 'bg-background'
                                        }`}
                                    >
                                        <div className="relative flex-shrink-0">
                                            <div className="w-8 h-8 rounded-full overflow-hidden bg-borderColor flex items-center justify-center">
                                                {p?.imageUrl ? (
                                                    <Image
                                                        src={p.imageUrl}
                                                        alt={p.name || p.id}
                                                        width={32}
                                                        height={32}
                                                        className="object-cover w-full h-full"
                                                    />
                                                ) : (
                                                    <span className="text-[10px] text-lightColor">{p?.name?.[0] || '?'}</span>
                                                )}
                                            </div>
                                            {ch.unreadCount > 0 && (
                                                <span className="absolute -bottom-1 -right-1 bg-red-600 text-white rounded-full text-[9px] px-1.5 py-0.5">
                                                    {ch.unreadCount > 9 ? '9+' : ch.unreadCount}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex flex-col min-w-0">
                                            <span className="text-xs font-medium text-textColor truncate">{p?.name || p?.id || 'Customer'}</span>
                                            <span className="text-[10px] text-lightColor truncate">{p?.id}</span>
                                            {ch.lastMessage?.text && (
                                                <span className="mt-0.5 text-[10px] text-lightColor/80 truncate">
                                                    {ch.lastMessage.text}
                                                </span>
                                            )}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                <div className="lg:flex-1 w-full border border-borderColor rounded-md bg-background flex flex-col min-h-[260px]">
                    <div className="px-3 py-2 border-b border-borderColor bg-borderColor/20 text-xs font-medium uppercase tracking-wide text-lightColor flex items-center justify-between">
                        <span>Conversation</span>
                        {connectingChannel && <span className="text-[10px] text-lightColor/80">Connecting…</span>}
                    </div>
                    {error ? (
                        <div className="flex-1 flex items-center justify-center text-xs text-red-500 px-4 text-center">
                            {error}
                        </div>
                    ) : !activeChannelId ? (
                        <div className="flex-1 flex items-center justify-center text-xs text-lightColor px-4 text-center">
                            Select a conversation on the left to start replying.
                        </div>
                    ) : (
                        <>
                            <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-1 text-xs">
                                {messages.map((m) => (
                                    <div
                                        key={m.id}
                                        className={`px-2 py-1 rounded max-w-[80%] ${
                                            m.from === 'me'
                                                ? 'self-end bg-black text-white'
                                                : 'self-start bg-borderColor/40 text-textColor'
                                        }`}
                                    >
                                        {m.text}
                                    </div>
                                ))}
                                {messages.length === 0 && (
                                    <div className="text-[11px] text-lightColor/80 mt-2">
                                        No messages in this conversation yet.
                                    </div>
                                )}
                            </div>
                            <form onSubmit={handleSend} className="border-t border-borderColor px-2 py-2 flex items-center gap-2 bg-borderColor/10">
                                <input
                                    type="text"
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    placeholder="Type a reply…"
                                    className="flex-1 text-sm px-2 py-1 border border-borderColor rounded focus:outline-none"
                                    disabled={connectingChannel}
                                />
                                <button
                                    type="submit"
                                    disabled={!input.trim() || connectingChannel}
                                    className="text-sm px-3 py-1 rounded bg-black text-white disabled:opacity-50"
                                >
                                    Send
                                </button>
                            </form>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
