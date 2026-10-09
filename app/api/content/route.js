import { NextResponse } from "next/server";
import { getContentByPath } from "@/lib/mdx";
import { connectToDatabase } from "@/lib/db";
import ContentBlock from "@/models/ContentBlock";
import BlogPost from '@/models/BlogPost';
import { statusQuery } from '@/lib/blog/status';
import { filterShopBanner } from '@/lib/shopBanner';

async function publicBlogPicks(contentPath, data) {
    if (contentPath !== 'navigation/mega-menu' || !Array.isArray(data.frontmatter?.featuredPosts)) return data;
    const slugs = data.frontmatter.featuredPosts.map(post => post?.slug).filter(Boolean);
    const posts = await BlogPost.find({ slug: { $in: slugs }, ...statusQuery('published') }).select('slug title').lean();
    const bySlug = new Map(posts.map(post => [post.slug, { slug: post.slug, title: post.title }]));
    return { ...data, frontmatter: { ...data.frontmatter, featuredPosts: slugs.filter(slug => bySlug.has(slug)).map(slug => bySlug.get(slug)) } };
}

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
            return NextResponse.json(await filterShopBanner(contentPath, await publicBlogPicks(contentPath, {
                frontmatter: dbBlock.frontmatter || {},
                content: dbBlock.content || "",
            })));
        }

        // 2) Fallback to MDX file content (seed defaults)
        const fileContent = getContentByPath(contentPath);

        if (!fileContent) {
            // These optional sections have client defaults and need no CMS entry.
            if (['navigation/mega-menu', 'home/print-cta', 'prints/banner'].includes(contentPath)) {
                return NextResponse.json({ frontmatter: {}, content: '' });
            }
            return NextResponse.json({ error: "Content not found" }, { status: 404 });
        }

        return NextResponse.json(await filterShopBanner(contentPath, await publicBlogPicks(contentPath, fileContent)));
    } catch (error) {
        console.error("Error fetching content:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
