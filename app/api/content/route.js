import { NextResponse } from "next/server";
import { getContentByPath } from "@/lib/mdx";

export async function GET(req) {
    try {
        const { searchParams } = new URL(req.url);
        const contentPath = searchParams.get("path");

        if (!contentPath) {
            return NextResponse.json({ error: "Missing content path" }, { status: 400 });
        }

        const content = getContentByPath(contentPath);

        if (!content) {
            return NextResponse.json({ error: "Content not found" }, { status: 404 });
        }

        return NextResponse.json(content);
    } catch (error) {
        console.error("Error fetching content:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
