import mongoose from "mongoose";

// A creator's own print-on-demand service, advertised on their public
// /creators/[id] page (printService block) and used by /prints/request?creator=.
// One document per creator (creatorUserId is unique); `enabled: false` hides
// the service everywhere and makes new requests for it fail with 400.
// Validation bounds mirror lib/creatorPrintService/validate.js — the API is
// the authority, the schema is a backstop.
export const ACCEPTED_FORMATS = ["stl", "3mf", "obj"];

const MaterialSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, maxlength: 40 },
        colours: {
            type: [{ type: String, maxlength: 30 }],
            default: [],
            validate: [(arr) => arr.length <= 20, "At most 20 colours per material"],
        },
        pricePerGram: { type: Number, required: true, min: 0 }, // SGD
        note: { type: String, default: "", maxlength: 120 },
    },
    { _id: false }
);

const CreatorPrintServiceSchema = new mongoose.Schema(
    {
        creatorUserId: { type: String, required: true, unique: true },
        enabled: { type: Boolean, default: false },
        headline: { type: String, default: "", maxlength: 80 },
        description: { type: String, default: "", maxlength: 1500 }, // markdown
        materials: {
            type: [MaterialSchema],
            default: [],
            validate: [(arr) => arr.length <= 12, "At most 12 materials"],
        },
        minimumCharge: { type: Number, default: 0, min: 0 }, // SGD
        leadTimeDays: { type: Number, default: 7, min: 1, max: 60 },
        maxBuildMm: {
            x: { type: Number, default: 250, min: 10, max: 1000 },
            y: { type: Number, default: 250, min: 10, max: 1000 },
            z: { type: Number, default: 250, min: 10, max: 1000 },
        },
        acceptedFormats: {
            type: [{ type: String, enum: ACCEPTED_FORMATS }],
            default: ["stl", "3mf"],
        },
        turnaroundNote: { type: String, default: "", maxlength: 200 },
    },
    { timestamps: { createdAt: true, updatedAt: true } }
);

export default mongoose.models.CreatorPrintService ||
    mongoose.model("CreatorPrintService", CreatorPrintServiceSchema);
