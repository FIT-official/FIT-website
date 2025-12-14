import 'dotenv/config';
import { getStreamServerClient } from '../lib/streamChat.js';

async function main() {
    try {
        const serverClient = getStreamServerClient();
        const devUserId = 'user_36kairCBhA5WxgpxfMU5aK7Au5Q';

        const channels = await serverClient.queryChannels({
            type: 'messaging',
            created_by_id: devUserId,
            kind: 'support',
        });

        console.log(`Found ${channels.length} support channels created by ${devUserId}`);

        for (const ch of channels) {
            console.log('Deleting channel', ch.id);
            await ch.delete();
        }

        console.log('Done');
    } catch (e) {
        console.error('Failed to delete dev support channel(s):', e);
        process.exit(1);
    }
}

main();
