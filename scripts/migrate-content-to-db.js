#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import matter from "gray-matter";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment from .env.local so MONGODB_URI is available like in Next.js
dotenv.config({ path: path.join(__dirname, "..", ".env.local") });

const contentRoot = path.join(__dirname, "..", "content");

function walkDir(dir, filelist = []) {
  const files = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of files) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(fullPath, filelist);
    } else if (entry.isFile() && entry.name.endsWith(".mdx")) {
      filelist.push(fullPath);
    }
  }
  return filelist;
}

async function run() {
  console.log("Connecting to database...");

  // Import DB and model only after env vars are loaded
  const { connectToDatabase } = await import("../lib/db.js");
  const { default: ContentBlock } = await import("../models/ContentBlock.js");

  await connectToDatabase();

  if (!fs.existsSync(contentRoot)) {
    console.error("No content directory found at", contentRoot);
    process.exit(1);
  }

  const files = walkDir(contentRoot);
  console.log(`Found ${files.length} MDX files to migrate.`);

  let migrated = 0;

  for (const filePath of files) {
    const relPath = path.relative(contentRoot, filePath).replace(/\\/g, "/");
    const contentPath = relPath.replace(/\.mdx$/i, "");

    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = matter(raw);

  await ContentBlock.findOneAndUpdate(
      { path: contentPath },
      {
        path: contentPath,
        frontmatter: parsed.data || {},
        content: parsed.content || "",
      },
      { upsert: true, new: true }
    );

    migrated++;
    console.log(`Migrated: ${contentPath}`);
  }

  console.log(`Migration complete. Migrated ${migrated} content blocks.`);
  process.exit(0);
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
