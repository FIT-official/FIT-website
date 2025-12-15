'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { IoChatbubblesOutline, IoClose } from 'react-icons/io5';
import { StreamChat } from 'stream-chat';

export default function ChatLauncher() {
    const { user, isLoaded } = useUser();
    const [open, setOpen] = useState(false);
    const [initialised, setInitialised] = useState(false);
    const [error, setError] = useState(null);
    const [connecting, setConnecting] = useState(false);
    const [chatInfo, setChatInfo] = useState(null);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [client, setClient] = useState(null);
    const [channel, setChannel] = useState(null);
    const [conversations, setConversations] = useState([]);
    const [activeChannelId, setActiveChannelId] = useState(null);
    const [creatorSearchOpen, setCreatorSearchOpen] = useState(false);
    const [creators, setCreators] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchLoading, setSearchLoading] = useState(false);
    const [unreadTotal, setUnreadTotal] = useState(0);

    const handleToggle = () => {
        setOpen(prev => !prev);
    };

    const isSignedIn = isLoaded && !!user;

    // Load unread counts for the launcher badge even when closed
    useEffect(() => {
        const loadUnread = async () => {
            if (!isSignedIn) return;
            try {
                const res = await fetch('/api/chat/inbox');
                if (!res.ok) return;
                const data = await res.json();
                const channels = data.channels || [];
                const total = channels.reduce((sum, ch) => sum + (ch.unreadCount || 0), 0);
                setUnreadTotal(total);
            } catch (e) {
                console.error('Failed to load unread messages for launcher', e);
            }
        };

        loadUnread();
    }, [isSignedIn]);

    // Broadcast unread total changes globally after commit
    useEffect(() => {
        if (typeof window === 'undefined') return;
        window.dispatchEvent(
            new CustomEvent('chat:unread-updated', { detail: { total: unreadTotal } })
        );
    }, [unreadTotal]);

    // Listen for channel read events from other parts of the app (e.g. dashboard inbox)
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const handleChannelRead = (event) => {
            const channelId = event?.detail?.channelId;
            if (!channelId) return;
            setConversations(prev => {
                if (!prev || prev.length === 0) return prev;
                const updated = prev.map(c =>
                    c.channelId === channelId ? { ...c, unreadCount: 0 } : c
                );
                const total = updated.reduce((sum, ch) => sum + (ch.unreadCount || 0), 0);
                setUnreadTotal(total);
                return updated;
            });
        };

        window.addEventListener('chat:channel-read', handleChannelRead);
        return () => {
            window.removeEventListener('chat:channel-read', handleChannelRead);
        };
    }, []);

    useEffect(() => {
        const bootstrapChat = async () => {
            if (!open || initialised || error || !isSignedIn) return;
            setConnecting(true);
            try {
                const tokenRes = await fetch('/api/chat/token');
                if (!tokenRes.ok) {
                    throw new Error('Failed to get chat token');
                }
                const tokenData = await tokenRes.json();

                if (!tokenData.token || !tokenData.apiKey) {
                    throw new Error('Stream Chat not fully configured');
                }

                const streamClient = StreamChat.getInstance(tokenData.apiKey);
                await streamClient.connectUser({ id: tokenData.userId }, tokenData.token);
                setClient(streamClient);

                try {
                    const inboxRes = await fetch('/api/chat/inbox');
                    if (inboxRes.ok) {
                        const inboxData = await inboxRes.json();
                        const list = inboxData.channels || [];
                        setConversations(list);
                        const total = list.reduce((sum, ch) => sum + (ch.unreadCount || 0), 0);
                        setUnreadTotal(total);
                        if (list.length > 0) {
                            const first = list[0];
                            setActiveChannelId(first.channelId);
                            setChatInfo({ provider: tokenData.provider, channelId: first.channelId });
                            const streamChannel = streamClient.channel('messaging', first.channelId);
                            await streamChannel.watch();
                            setChannel(streamChannel);
                            setMessages(
                                (streamChannel.state.messages || []).map(m => ({
                                    id: m.id,
                                    from: m.user?.id === user?.id ? 'user' : 'other',
                                    text: m.text,
                                }))
                            );

                            // Ensure only a single message.new listener is attached per channel
                            streamChannel.off('message.new');
                            streamChannel.on('message.new', (event) => {
                                const m = event.message;
                                if (!m || !m.id) return;
                                setMessages(prev => {
                                    if (prev.some(msg => msg.id === m.id)) return prev;
                                    return [
                                        ...prev,
                                        {
                                            id: m.id,
                                            from: m.user?.id === user?.id ? 'user' : 'other',
                                            text: m.text,
                                        },
                                    ];
                                });
                            });

                            // Mark the first conversation as read
                            try {
                                await fetch('/api/chat/read', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ channelId: first.channelId }),
                                });

                                // Clear unread count for this conversation and sync badges
                                setConversations(prev => {
                                    const updated = prev.map(c =>
                                        c.channelId === first.channelId ? { ...c, unreadCount: 0 } : c
                                    );
                                    const total = updated.reduce(
                                        (sum, ch) => sum + (ch.unreadCount || 0),
                                        0
                                    );
                                    setUnreadTotal(total);
                                    return updated;
                                });

                                if (typeof window !== 'undefined') {
                                    window.dispatchEvent(
                                        new CustomEvent('chat:channel-read', {
                                            detail: { channelId: first.channelId },
                                        })
                                    );
                                }
                            } catch {
                                // ignore
                            }
                        }
                    }
                } catch (e) {
                    console.error('Failed to load existing conversations', e);
                }

                setInitialised(true);
            } catch (e) {
                console.error('Failed to initialise chat', e);
                setError('Chat is temporarily unavailable');
            } finally {
                setConnecting(false);
            }
        };

        bootstrapChat();
    }, [open, initialised, error, isSignedIn]);

    const handleSend = async (e) => {
        e.preventDefault();
        if (!input.trim()) return;
        const text = input.trim();
        setInput('');

        const activeConversation = conversations.find((c) => c.channelId === activeChannelId) || null;
        const isFirstMessageInChannel = messages.length === 0;
        const shouldTriggerAutoReply =
            activeConversation &&
            activeConversation.kind === 'creator' &&
            isFirstMessageInChannel;

        if (channel) {
            try {
                await channel.sendMessage({ text });

                if (shouldTriggerAutoReply && activeConversation) {
                    try {
                        await fetch('/api/chat/auto-reply', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ channelId: activeConversation.channelId }),
                        });
                    } catch (err) {
                        console.error('Failed to trigger auto-reply', err);
                    }
                }
            } catch (err) {
                console.error('Failed to send chat message', err);
            }
        } else {
            // Fallback: local echo if channel is unavailable
            setMessages(prev => ([
                ...prev,
                { id: Date.now(), from: 'user', text },
            ]));
        }
    };

    // Disconnect Stream client when the launcher unmounts
    useEffect(() => {
        return () => {
            if (client) {
                client.disconnectUser().catch(() => { });
            }
        };
    }, [client]);

    const openConversation = async (channelId) => {
        if (!client || !isSignedIn) return;
        try {
            setConnecting(true);

            const streamChannel = client.channel('messaging', channelId);
            await streamChannel.watch();

            setMessages(
                (streamChannel.state.messages || []).map(m => ({
                    id: m.id,
                    from: m.user?.id === user?.id ? 'user' : 'other',
                    text: m.text,
                })),
            );

            // Ensure only a single message.new listener is attached per channel
            streamChannel.off('message.new');
            streamChannel.on('message.new', (event) => {
                const m = event.message;
                if (!m || !m.id) return;
                setMessages(prev => {
                    // Prevent duplicate messages
                    if (prev.some(msg => msg.id === m.id)) return prev;
                    return [
                        ...prev,
                        {
                            id: m.id,
                            from: m.user?.id === user?.id ? 'user' : 'other',
                            text: m.text,
                        },
                    ];
                });
            });

            setChannel(streamChannel);
            setActiveChannelId(channelId);
            setChatInfo(prev => ({ ...(prev || {}), channelId }));

            try {
                await fetch('/api/chat/read', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ channelId }),
                });

                // Clear unread for this channel locally and sync badges
                setConversations(prev => {
                    const updated = prev.map(c =>
                        c.channelId === channelId ? { ...c, unreadCount: 0 } : c
                    );
                    const total = updated.reduce((sum, ch) => sum + (ch.unreadCount || 0), 0);
                    setUnreadTotal(total);
                    return updated;
                });

                if (typeof window !== 'undefined') {
                    window.dispatchEvent(
                        new CustomEvent('chat:channel-read', { detail: { channelId } })
                    );
                }
            } catch {
                // ignore
            }
        } catch (err) {
            console.error('Failed to open conversation', err);
        } finally {
            setConnecting(false);
        }
    };

    return (
        <>
            <button
                type="button"
                onClick={handleToggle}
                className="fixed bottom-6 left-6 z-50 rounded-full bg-black text-white shadow-2xl px-5 py-3 flex items-center gap-2.5 text-sm hover:bg-[#111111] transition-all duration-200 hover:scale-105 active:scale-95"
            >
                {!open && unreadTotal > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-600 text-white rounded-full text-[9px] px-1.5 py-0.5 min-w-[18px] text-center">
                        {unreadTotal > 9 ? '9+' : unreadTotal}
                    </span>
                )}
                {open ? (
                    <IoClose size={20} />
                ) : (
                    <IoChatbubblesOutline size={20} />
                )}
                <span className="font-medium">{open ? 'Close' : 'Chat with us'}</span>
            </button>

            {open && (
                <div className="fixed bottom-24 left-6 z-40 w-[420px] h-[600px] bg-white dark:bg-background border border-gray-200 dark:border-borderColor rounded-2xl shadow-2xl flex flex-col overflow-hidden transition-all duration-300 animate-in slide-in-from-bottom-4">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-borderColor bg-gradient-to-r from-gray-50 to-white dark:from-borderColor/20 dark:to-transparent">
                        <div className="flex flex-col gap-0.5">
                            <span className="text-base font-semibold text-gray-900 dark:text-textColor">Messages</span>
                            <span className="text-xs text-gray-600 dark:text-lightColor flex items-center gap-1.5">
                                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                                Online now
                            </span>
                        </div>
                        <button
                            type="button"
                            className="text-gray-500 dark:text-lightColor hover:text-gray-900 dark:hover:text-textColor p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-borderColor/30 transition-colors"
                            onClick={() => setOpen(false)}
                            aria-label="Close chat"
                        >
                            <IoClose size={20} />
                        </button>
                    </div>
                    
                    <div className="flex-1 flex flex-col overflow-hidden">
                        {error ? (
                            <div className="flex-1 flex items-center justify-center p-6">
                                <div className="text-center">
                                    <p className="text-sm text-red-600 dark:text-red-400 font-medium">{error}</p>
                                    <button 
                                        onClick={() => setError(null)}
                                        className="mt-3 text-xs text-gray-600 dark:text-lightColor hover:text-gray-900 dark:hover:text-textColor underline"
                                    >
                                        Try again
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <>
                                {!isSignedIn && (
                                    <div className="flex-1 flex items-center justify-center p-8">
                                        <div className="text-center max-w-sm">
                                            <IoChatbubblesOutline size={48} className="mx-auto mb-4 text-gray-300 dark:text-borderColor" />
                                            <p className="text-sm text-gray-700 dark:text-textColor font-medium mb-2">
                                                Sign in to start chatting
                                            </p>
                                            <p className="text-xs text-gray-500 dark:text-lightColor">
                                                Connect with our support team or message creators directly.
                                            </p>
                                        </div>
                                    </div>
                                )}
                                
                                {isSignedIn && connecting && !initialised && (
                                    <div className="flex-1 flex items-center justify-center">
                                        <div className="text-center">
                                            <div className="w-8 h-8 border-2 border-gray-200 dark:border-borderColor border-t-black dark:border-t-white rounded-full animate-spin mx-auto mb-3"></div>
                                            <p className="text-xs text-gray-600 dark:text-lightColor">Connecting to chat…</p>
                                        </div>
                                    </div>
                                )}

                                {isSignedIn && initialised && (
                                    <div className="flex gap-0 text-sm h-full overflow-hidden">
                                        <div className="flex flex-col w-40 border-r border-gray-200 dark:border-borderColor bg-gray-50 dark:bg-borderColor/5">
                                            <div className="p-3 border-b border-gray-200 dark:border-borderColor">
                                                <input
                                                    type="text"
                                                    value={searchQuery}
                                                    onChange={async (e) => {
                                                        const value = e.target.value;
                                                        setSearchQuery(value);
                                                        try {
                                                            setSearchLoading(true);
                                                            const params = value ? `?q=${encodeURIComponent(value)}` : '';
                                                            const res = await fetch(`/api/creators/search${params}`);
                                                            if (res.ok) {
                                                                const data = await res.json();
                                                                const list = (data.creators || []).filter(c => !user || c.id !== user.id);
                                                                setCreators(list);
                                                            }
                                                        } catch (err) {
                                                            console.error('Failed to search creators', err);
                                                        } finally {
                                                            setSearchLoading(false);
                                                        }
                                                    }}
                                                    placeholder="Search creators…"
                                                    className="w-full text-xs px-3 py-2 border border-gray-300 dark:border-borderColor rounded-lg bg-white dark:bg-background text-gray-900 dark:text-textColor placeholder-gray-500 dark:placeholder-lightColor/60 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white/20 transition-shadow"
                                                />
                                            </div>
                                            
                                            {searchQuery && (
                                                <div className="border-b border-gray-200 dark:border-borderColor">
                                                    {searchLoading && (
                                                        <div className="p-3 text-center">
                                                            <p className="text-xs text-gray-500 dark:text-lightColor/70">Searching…</p>
                                                        </div>
                                                    )}
                                                    {!searchLoading && creators.length > 0 && (
                                                        <div className="max-h-32 overflow-y-auto">
                                                            {creators.map((c) => (
                                                                <button
                                                                    key={c.id}
                                                                    type="button"
                                                                    className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-borderColor/20 transition-colors border-b border-gray-100 dark:border-borderColor/50 last:border-b-0"
                                                                    onClick={async () => {
                                                                        try {
                                                                            setConnecting(true);
                                                                                const channelRes = await fetch('/api/chat/channel', {
                                                                                method: 'POST',
                                                                                headers: { 'Content-Type': 'application/json' },
                                                                                body: JSON.stringify({ kind: 'creator', targetUserId: c.id }),
                                                                            });
                                                                            if (!channelRes.ok) throw new Error('Failed to create chat channel');
                                                                            const channelData = await channelRes.json();

                                                                                let streamClient = client;
                                                                                if (!streamClient) {
                                                                                    const tokenRes = await fetch('/api/chat/token');
                                                                                    if (!tokenRes.ok) throw new Error('Failed to get chat token');
                                                                                    const tokenData = await tokenRes.json();
                                                                                    if (!tokenData.token || !tokenData.apiKey) {
                                                                                        throw new Error('Stream Chat not fully configured');
                                                                                    }
                                                                                    streamClient = StreamChat.getInstance(tokenData.apiKey);
                                                                                    await streamClient.connectUser({ id: tokenData.userId }, tokenData.token);
                                                                                    setClient(streamClient);
                                                                                }

                                                                                const streamChannel = streamClient.channel('messaging', channelData.channelId);
                                                                            await streamChannel.watch();

                                                                            setMessages(
                                                                                (streamChannel.state.messages || []).map(m => ({
                                                                                    id: m.id,
                                                                                        from: m.user?.id === user?.id ? 'user' : 'other',
                                                                                    text: m.text,
                                                                                })),
                                                                            );

                                                                                // Ensure only a single message.new listener is attached per channel
                                                                                streamChannel.off('message.new');
                                                                                streamChannel.on('message.new', (event) => {
                                                                                const m = event.message;
                                                                                if (!m || !m.id) return;
                                                                                setMessages(prev => {
                                                                                    if (prev.some(msg => msg.id === m.id)) return prev;
                                                                                    return [
                                                                                        ...prev,
                                                                                        {
                                                                                            id: m.id,
                                                                                                from: m.user?.id === user?.id ? 'user' : 'other',
                                                                                            text: m.text,
                                                                                        },
                                                                                    ];
                                                                                });
                                                                            });

                                                                            setChannel(streamChannel);
                                                                            setChatInfo(prev => ({ ...(prev || {}), channelId: channelData.channelId }));
                                                                            setInitialised(true);
                                                                            setCreatorSearchOpen(false);
                                                                            setSearchQuery('');
                                                                            setActiveChannelId(channelData.channelId);
                                                                            
                                                                            // Only add to conversations if it doesn't already exist
                                                                            setConversations(prev => {
                                                                                const exists = prev.some(conv => conv.channelId === channelData.channelId);
                                                                                if (exists) {
                                                                                    return prev;
                                                                                }
                                                                                return [
                                                                                    {
                                                                                        channelId: channelData.channelId,
                                                                                        kind: 'creator',
                                                                                        participants: [
                                                                                            {
                                                                                                id: c.id,
                                                                                                name: c.displayName || c.id,
                                                                                                imageUrl: c.imageUrl || null,
                                                                                            },
                                                                                        ],
                                                                                        lastMessage: null,
                                                                                        unreadCount: 0,
                                                                                    },
                                                                                    ...prev,
                                                                                ];
                                                                            });
                                                                        } catch (err) {
                                                                            console.error('Failed to start creator chat', err);
                                                                            setError('Unable to start creator chat right now');
                                                                        } finally {
                                                                            setConnecting(false);
                                                                        }
                                                                    }}
                                                                >
                                                                    <div className="flex items-center gap-2">
                                                                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-gray-200 to-gray-300 dark:from-borderColor dark:to-borderColor/50 overflow-hidden flex items-center justify-center text-xs font-semibold text-gray-700 dark:text-textColor flex-shrink-0">
                                                                            {c.imageUrl ? (
                                                                                // eslint-disable-next-line @next/next/no-img-element
                                                                                <img src={c.imageUrl} alt={c.displayName || c.id} className="w-full h-full object-cover" />
                                                                            ) : (
                                                                                (c.displayName || c.id || '?')[0].toUpperCase()
                                                                            )}
                                                                        </div>
                                                                        <div className="flex flex-col gap-0.5 min-w-0">
                                                                            <span className="text-xs font-medium text-gray-900 dark:text-textColor truncate">
                                                                                {c.displayName || c.id}
                                                                            </span>
                                                                            {c.hasProducts && (
                                                                                <span className="text-[10px] text-gray-500 dark:text-lightColor/80">Creator</span>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )}
                                                    {!searchLoading && creators.length === 0 && (
                                                        <div className="p-3 text-center">
                                                            <p className="text-xs text-gray-500 dark:text-lightColor/70">No creators found</p>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                            
                                            <div className="flex-1 overflow-y-auto">
                                                {conversations.length === 0 && !searchQuery && (
                                                    <div className="p-4 text-center">
                                                        <p className="text-xs text-gray-500 dark:text-lightColor/70">No conversations yet</p>
                                                    </div>
                                                )}
                                                {conversations.map((c) => {
                                                    const p = (c.participants && c.participants[0]) || null;
                                                    const isActive = activeChannelId === c.channelId;
                                                    return (
                                                        <button
                                                            key={c.channelId}
                                                            type="button"
                                                            onClick={() => openConversation(c.channelId)}
                                                            className={`relative w-full px-3 py-2.5 flex items-center gap-2.5 hover:bg-gray-100 dark:hover:bg-borderColor/20 text-left transition-colors border-b border-gray-100 dark:border-borderColor/30 last:border-b-0 ${
                                                                isActive ? 'bg-gray-100 dark:bg-borderColor/30' : ''
                                                            }`}
                                                        >
                                                            <div className="relative flex-shrink-0">
                                                                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-gray-200 to-gray-300 dark:from-borderColor dark:to-borderColor/50 overflow-hidden flex items-center justify-center text-xs font-semibold text-gray-700 dark:text-textColor">
                                                                    {p?.imageUrl ? (
                                                                        // eslint-disable-next-line @next/next/no-img-element
                                                                        <img src={p.imageUrl} alt={p.name || p.id} className="w-full h-full object-cover" />
                                                                    ) : (
                                                                        (p?.name || p?.id || '?')[0].toUpperCase()
                                                                    )}
                                                                </div>
                                                                {c.unreadCount > 0 && (
                                                                    <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white rounded-full text-[9px] font-bold px-1.5 py-0.5 min-w-[18px] text-center shadow-sm">
                                                                        {c.unreadCount > 9 ? '9+' : c.unreadCount}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                                                                <span className="text-xs font-medium text-gray-900 dark:text-textColor truncate">
                                                                    {p?.name || p?.id || 'Chat'}
                                                                </span>
                                                                {c.lastMessage?.text && (
                                                                    <span className="text-[10px] text-gray-500 dark:text-lightColor/80 truncate">
                                                                        {c.lastMessage.text}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                        
                                        <div className="flex-1 flex flex-col bg-white dark:bg-background">
                                            <div className="flex-1 overflow-y-auto p-4 space-y-2">
                                                {messages.length > 0 ? (
                                                    messages.map((msg, idx) => (
                                                        <div
                                                            key={msg.id}
                                                            className={`flex ${msg.from === 'user' ? 'justify-end' : 'justify-start'}`}
                                                        >
                                                            <div
                                                                className={`px-3 py-2 rounded-2xl text-xs max-w-[75%] shadow-sm ${
                                                                    msg.from === 'user'
                                                                        ? 'bg-black text-white rounded-br-sm'
                                                                        : 'bg-gray-100 dark:bg-borderColor/30 text-gray-900 dark:text-textColor rounded-bl-sm'
                                                                }`}
                                                            >
                                                                {msg.text}
                                                            </div>
                                                        </div>
                                                    ))
                                                ) : (
                                                    <div className="flex-1 flex items-center justify-center h-full min-h-[200px]">
                                                        <div className="text-center max-w-xs">
                                                            <IoChatbubblesOutline size={40} className="mx-auto mb-3 text-gray-300 dark:text-borderColor" />
                                                            <p className="text-sm text-gray-600 dark:text-lightColor/70 mb-1">
                                                                No messages yet
                                                            </p>
                                                            <p className="text-xs text-gray-500 dark:text-lightColor/50">
                                                                {conversations.length > 0 
                                                                    ? 'Select a conversation to view messages'
                                                                    : 'Search for a creator to start chatting'}
                                                            </p>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                    {isSignedIn && !error && initialised && (
                        <div className="border-t border-gray-200 dark:border-borderColor bg-white dark:bg-borderColor/5">
                            <div className="px-4 py-3 border-b border-gray-100 dark:border-borderColor/50">
                                <div className="flex flex-wrap gap-2">
                                    {['What are your shipping times?', 'Can I ask about sizing?', 'I have a question'].map((suggestion) => (
                                        <button
                                            key={suggestion}
                                            type="button"
                                            onClick={() => setInput(suggestion)}
                                            className="text-xs px-3 py-1.5 rounded-full border border-gray-300 dark:border-borderColor bg-white dark:bg-background text-gray-700 dark:text-textColor hover:bg-gray-50 dark:hover:bg-borderColor/20 hover:border-gray-400 dark:hover:border-borderColor/80 transition-all"
                                        >
                                            {suggestion}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <form onSubmit={handleSend} className="p-4">
                                <div className="flex items-end gap-2">
                                    <input
                                        type="text"
                                        value={input}
                                        onChange={e => setInput(e.target.value)}
                                        placeholder="Type your message…"
                                        className="flex-1 text-sm px-4 py-2.5 border border-gray-300 dark:border-borderColor rounded-xl bg-white dark:bg-background text-gray-900 dark:text-textColor placeholder-gray-500 dark:placeholder-lightColor/60 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white/20 focus:border-transparent transition-shadow resize-none"
                                        disabled={connecting}
                                    />
                                    <button
                                        type="submit"
                                        disabled={connecting || !input.trim()}
                                        className="px-5 py-2.5 rounded-xl bg-black text-white font-medium text-sm hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2 active:scale-95"
                                    >
                                        Send
                                    </button>
                                </div>
                            </form>
                        </div>
                    )}
                </div>
            )}
        </>
    );
}
