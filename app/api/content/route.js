import { NextResponse } from "next/server";
import { getContentByPath } from "@/lib/mdx";
import { connectToDatabase } from "@/lib/db";
import ContentBlock from "@/models/ContentBlock";

export async function GET(req) {
    try {
        await connectToDatabase();
        const { searchParams } = new URL(req.url);
        const contentPath = searchParams.get("path");

        if (!contentPath) {
            return NextResponse.json({ error: "Missing content path" }, { status: 400 });
        }

        // 1) Check for DB override first (runtime-editable content)
        const dbBlock = await ContentBlock.findOne({ path: contentPath }).lean();

        if (dbBlock) {
            return NextResponse.json({
                frontmatter: dbBlock.frontmatter || {},
                content: dbBlock.content || "",
            });
        }

        // 2) Fallback to MDX file content (seed defaults)
        const fileContent = getContentByPath(contentPath);

        if (!fileContent) {
            return NextResponse.json({ error: "Content not found" }, { status: 404 });
        }

        return NextResponse.json(fileContent);
    } catch (error) {
        console.error("Error fetching content:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
