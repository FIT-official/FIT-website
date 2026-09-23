import mongoose from "mongoose";

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
            maxPoolSize: 10,
            minPoolSize: 0,
            maxIdleTimeMS: 60000,
        }).then((connection) => {
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
