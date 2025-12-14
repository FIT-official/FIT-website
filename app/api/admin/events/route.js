import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import Event from "@/models/Event";
import { authenticate } from "@/lib/authenticate";
import { checkAdminPrivileges } from "@/lib/checkPrivileges";

export async function GET() {
    try {
        await connectToDatabase();

        const events = await Event.find({}).sort({ startDate: 1, createdAt: -1 }).lean();
        return NextResponse.json({ events }, { status: 200 });
    } catch (error) {
        console.error("Error fetching events:", error);
        return NextResponse.json({ error: "Failed to fetch events" }, { status: 500 });
    }
}

// Create a new event (admin only)
export async function POST(request) {
    try {
        const { userId } = await authenticate(request);

        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const isAdmin = await checkAdminPrivileges(userId);
        if (!isAdmin) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        await connectToDatabase();

        const body = await request.json();
        const {
            name,
            description,
            locations = [],
            isActive = true,
            isGlobal = false,
            percentage,
            minimumPrice = 0,
            startDate,
            endDate,
        } = body;

        if (!name || !description || percentage == null || !startDate || !endDate) {
            return NextResponse.json(
                { error: "Name, description, percentage, startDate and endDate are required" },
                { status: 400 }
            );
        }

        const event = await Event.create({
            creatorUserId: userId,
            name: name.trim(),
            description: description.trim(),
            locations: Array.isArray(locations) ? locations : [],
            isActive: !!isActive,
            isGlobal: !!isGlobal,
            percentage,
            minimumPrice,
            startDate: new Date(startDate),
            endDate: new Date(endDate),
        });

        return NextResponse.json({ event }, { status: 201 });
    } catch (error) {
        console.error("Error creating event:", error);
        return NextResponse.json({ error: "Failed to create event" }, { status: 500 });
    }
}

// Update an existing event (admin only)
export async function PUT(request) {
    try {
        const { userId } = await authenticate(request);

        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const isAdmin = await checkAdminPrivileges(userId);
        if (!isAdmin) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        await connectToDatabase();

        const body = await request.json();
        const { id, ...updates } = body;

        if (!id) {
            return NextResponse.json({ error: "Event ID is required" }, { status: 400 });
        }

        if (updates.startDate) updates.startDate = new Date(updates.startDate);
        if (updates.endDate) updates.endDate = new Date(updates.endDate);

        const event = await Event.findByIdAndUpdate(id, updates, {
            new: true,
            runValidators: true,
        });

        if (!event) {
            return NextResponse.json({ error: "Event not found" }, { status: 404 });
        }

        return NextResponse.json({ event }, { status: 200 });
    } catch (error) {
        console.error("Error updating event:", error);
        return NextResponse.json({ error: "Failed to update event" }, { status: 500 });
    }
}

// Delete an event (admin only)
export async function DELETE(request) {
    try {
        const { userId } = await authenticate(request);

        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const isAdmin = await checkAdminPrivileges(userId);
        if (!isAdmin) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        await connectToDatabase();

        const { searchParams } = new URL(request.url);
        const id = searchParams.get("id");

        if (!id) {
            return NextResponse.json({ error: "Event ID is required" }, { status: 400 });
        }

        const deleted = await Event.findByIdAndDelete(id);

        if (!deleted) {
            return NextResponse.json({ error: "Event not found" }, { status: 404 });
        }

        return NextResponse.json({ message: "Event deleted successfully" }, { status: 200 });
    } catch (error) {
        console.error("Error deleting event:", error);
        return NextResponse.json({ error: "Failed to delete event" }, { status: 500 });
    }
}
