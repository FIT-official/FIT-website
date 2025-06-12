export function slugify(text) {
    return (
        text
            .toString()
            .toLowerCase()
            .replace(/\s+/g, "-")
            .replace(/[^\w\-]+/g, "")
            .replace(/\-\-+/g, "-")
            .replace(/^-+/, "")
            .replace(/-+$/, "") +
        "-" +
        Math.random().toString(36).substring(2, 8)
    );
}