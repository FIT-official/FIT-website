import mongoose from "mongoose";
import { attachMongoTiming } from './mongoTiming';
import { attachMongoPoolTelemetry, mongoDeploymentAttribution } from './mongoPoolTelemetry';

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    throw new Error("Please define the MONGODB_URI environment variable");
}

// Publish before connecting so concurrent module loads share the pending work.
const cached = globalThis.mongoose ||= { conn: null, promise: null };

export async function connectToDatabase() {
    if (cached.conn) return cached.conn;
    if (!cached.promise) {
        const pending = mongoose.connect(MONGODB_URI, {
            bufferCommands: false,
            appName: mongoDeploymentAttribution().appName,
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
            attachMongoPoolTelemetry(connection.connection?.getClient?.());
            cached.conn = connection;
            return connection;
        }).catch((error) => {
            // A transient initial failure must not poison every later request.
            // Never discard a newer connection attempt from another caller.
            if (cached.promise === pending) cached.promise = null;
            throw error;
        });
        cached.promise = pending;
        // Mongoose exposes its client before awaiting the initial connection.
        // Attach now to observe cold-start pools; the success path is a fallback.
        attachMongoPoolTelemetry(mongoose.connection?.getClient?.());
    }
    return cached.promise;
}
