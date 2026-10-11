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
            // The M0 cluster has a shared 500-connection ceiling. Keep each
            // warm serverless worker small; concurrent requests reuse this
            // client and queue rather than opening a five-socket burst.
            maxPoolSize: 2,
            maxConnecting: 1,
            minPoolSize: 0,
            maxIdleTimeMS: 10000,
            waitQueueTimeoutMS: 8000,
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
