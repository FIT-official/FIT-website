import mongoose from "mongoose";
import { attachMongoTiming } from './mongoTiming';
import { fixtureMode } from './creatorDashboard/flags';

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI && !fixtureMode()) {
    throw new Error("Please define the MONGODB_URI environment variable");
}

// Publish before connecting so concurrent module loads share the pending work.
const cached = globalThis.mongoose ||= { conn: null, promise: null };

export async function connectToDatabase() {
    // The local preview may import public page modules, but never opens Mongo.
    // This check precedes the cache, so even an existing connection is unusable.
    if (fixtureMode()) throw new Error('Database access is disabled in the local fixture preview');
    if (cached.conn) return cached.conn;
    if (!cached.promise) {
        const pending = mongoose.connect(MONGODB_URI, {
            bufferCommands: false,
            serverSelectionTimeoutMS: 8000,
            connectTimeoutMS: 8000,
            socketTimeoutMS: 15000,
            maxPoolSize: 5,
            // Cold workshop bursts wait on connection setup, not query execution.
            // Fill the existing five slots concurrently; do not enlarge the pool.
            maxConnecting: 5,
            minPoolSize: 0,
            maxIdleTimeMS: 60000,
            monitorCommands: true,
        }).then((connection) => {
            attachMongoTiming(connection.connection?.getClient?.());
            cached.conn = connection;
            return connection;
        }).catch((error) => {
            // A transient initial failure must not poison every later request.
            // Never discard a newer connection attempt from another caller.
            if (cached.promise === pending) cached.promise = null;
            throw error;
        });
        cached.promise = pending;
    }
    return cached.promise;
}
