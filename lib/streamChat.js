import { StreamChat } from 'stream-chat';

let serverClient;

export function getStreamServerClient() {
    const apiKey = process.env.STREAM_API_KEY;
    const apiSecret = process.env.STREAM_API_SECRET;

    if (!apiKey || !apiSecret) {
        throw new Error('Stream Chat is not configured. Set STREAM_API_KEY and STREAM_API_SECRET in your environment.');
    }

    if (!serverClient) {
        serverClient = StreamChat.getInstance(apiKey, apiSecret);
    }

    return serverClient;
}
