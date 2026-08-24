import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export class UnauthorizedError extends Error {
    constructor(message = "Unauthorized") {
        super(message);
        this.name = "UnauthorizedError";
    }
}

// Throws UnauthorizedError when there's no Clerk session — never returns an
// ambiguous shape a caller could destructure into `userId: undefined` and
// keep going. Callers that want a clean 401 catch UnauthorizedError; anyone
// who doesn't still fails safe via their existing catch-all (never reaches
// a database call keyed on an absent userId).
export async function authenticate(req) {
    const { userId } = await auth();
    if (!userId) throw new UnauthorizedError();
    return { userId };
}

export function unauthorizedResponse() {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}