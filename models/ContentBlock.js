import mongoose from "mongoose";

const ContentBlockSchema = new mongoose.Schema(
  {
    path: { type: String, required: true, unique: true },
    frontmatter: { type: mongoose.Schema.Types.Mixed, default: {} },
    content: { type: String, default: "" },
  },
  {
    timestamps: true,
  }
);

export default mongoose.models.ContentBlock ||
  mongoose.model("ContentBlock", ContentBlockSchema);
