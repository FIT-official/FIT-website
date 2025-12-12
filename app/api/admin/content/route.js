import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { getContentByPath } from "@/lib/mdx";
import { authenticate } from "@/lib/authenticate";
import { checkAdminPrivileges } from "@/lib/checkPrivileges";
import { connectToDatabase } from "@/lib/db";
import ContentBlock from "@/models/ContentBlock";

export async function GET(req) {
    try {
        await connectToDatabase();
        const { userId } = await authenticate(req);
        const isAdmin = await checkAdminPrivileges(userId);
        if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

        const { searchParams } = new URL(req.url);
        const contentPath = searchParams.get("path");

        if (!contentPath) {
            return NextResponse.json({ error: "Missing content path" }, { status: 400 });
        }

        // Prefer DB override, fallback to MDX file or sensible defaults
        const dbBlock = await ContentBlock.findOne({ path: contentPath }).lean();

        if (!dbBlock) {
            const fileContent = getContentByPath(contentPath);

            if (fileContent) {
                return NextResponse.json(fileContent);
            }

            const defaultContent = {
                frontmatter: {},
                content: ''
            };

            // Initialize default fields based on content path
            if (contentPath.includes('home/hero-banner')) {
                defaultContent.frontmatter.text = '';
            } else if (contentPath.includes('about/introduction')) {
                defaultContent.frontmatter.heading = '';
                defaultContent.frontmatter.subheading = '';
                defaultContent.frontmatter.description = '';
            } else if (contentPath.includes('about/services')) {
                defaultContent.frontmatter.heading = '';
                defaultContent.frontmatter.subheading = '';
                defaultContent.frontmatter.description = '';
            } else if (contentPath.includes('terms/content') || contentPath.includes('privacy/content')) {
                defaultContent.frontmatter.title = '';
                defaultContent.frontmatter.subtitle = '';
            } else {
                // Default case (like featured-section)
                defaultContent.frontmatter.title = '';
                defaultContent.frontmatter.description = '';
            }

            return NextResponse.json(defaultContent);
        }

        return NextResponse.json({
            frontmatter: dbBlock.frontmatter || {},
            content: dbBlock.content || "",
        });
    } catch (error) {
        console.error("Error fetching content:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

export async function PUT(req) {
    try {
        await connectToDatabase();
        const { userId } = await authenticate(req);
        const isAdmin = await checkAdminPrivileges(userId);
        if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        const { contentPath, frontmatter, content } = await req.json();

        if (!contentPath || !frontmatter || content === undefined) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        const update = {
            path: contentPath,
            frontmatter: frontmatter || {},
            content: content || "",
        };

        await ContentBlock.findOneAndUpdate(
            { path: contentPath },
            update,
            { upsert: true, new: true }
        );

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error updating content:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
