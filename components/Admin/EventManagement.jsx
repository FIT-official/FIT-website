"use client";

import { useEffect, useState } from "react";
import { useToast } from "../General/ToastProvider";

export default function EventManagement() {
    const { showToast } = useToast();
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [editingEvent, setEditingEvent] = useState(null);

    const emptyForm = {
        name: "",
        description: "",
        locations: "",
        isActive: true,
        isGlobal: false,
        percentage: "",
        minimumPrice: "0",
        startDate: "",
        endDate: "",
    };

    const [form, setForm] = useState(emptyForm);

    const loadEvents = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/admin/events");
            if (!res.ok) throw new Error("Failed to load events");
            const data = await res.json();
            setEvents(data.events || []);
        } catch (err) {
            console.error("Error loading events", err);
            showToast("Failed to load events", "error");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadEvents();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const resetForm = () => {
        setEditingEvent(null);
        setForm(emptyForm);
    };

    const handleEdit = (ev) => {
        setEditingEvent(ev);
        setForm({
            name: ev.name || "",
            description: ev.description || "",
            locations: Array.isArray(ev.locations) ? ev.locations.join(", ") : "",
            isActive: !!ev.isActive,
            isGlobal: !!ev.isGlobal,
            percentage: ev.percentage?.toString() ?? "",
            minimumPrice: ev.minimumPrice?.toString() ?? "0",
            startDate: ev.startDate ? new Date(ev.startDate).toISOString().slice(0, 10) : "",
            endDate: ev.endDate ? new Date(ev.endDate).toISOString().slice(0, 10) : "",
        });
    };

    const handleDelete = async (id) => {
        if (!window.confirm("Delete this event?")) return;
        try {
            const res = await fetch(`/api/admin/events?id=${id}`, { method: "DELETE" });
            if (!res.ok) throw new Error("Failed to delete event");
            showToast("Event deleted", "success");
            await loadEvents();
            if (editingEvent && editingEvent._id === id) resetForm();
        } catch (err) {
            console.error("Error deleting event", err);
            showToast("Failed to delete event", "error");
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);

        try {
            const payload = {
                name: form.name,
                description: form.description,
                locations: form.locations
                    ? form.locations
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean)
                    : [],
                isActive: !!form.isActive,
                isGlobal: !!form.isGlobal,
                percentage: form.percentage ? Number(form.percentage) : undefined,
                minimumPrice: form.minimumPrice ? Number(form.minimumPrice) : 0,
                startDate: form.startDate,
                endDate: form.endDate,
            };

            const method = editingEvent ? "PUT" : "POST";
            const body = editingEvent ? { id: editingEvent._id, ...payload } : payload;

            const res = await fetch("/api/admin/events", {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || "Failed to save event");
            }

            showToast(editingEvent ? "Event updated" : "Event created", "success");
            resetForm();
            await loadEvents();
        } catch (err) {
            console.error("Error saving event", err);
            showToast(err.message || "Failed to save event", "error");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="px-6 md:px-12 py-8">
            <h2 className="text-lg font-semibold mb-4">Events & Campaigns</h2>
            <p className="text-xs text-lightColor/80 mb-6 max-w-xl">
                Create time-bound events like Christmas or 11.11 sales. Each event
                defines a discount percentage, minimum spend, and active dates that
                products can link to from their discount settings.
            </p>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <form onSubmit={handleSubmit} className="bg-baseColor border border-borderColor p-4 rounded-sm flex flex-col gap-3">
                    <h3 className="text-sm font-semibold mb-1">
                        {editingEvent ? "Edit Event" : "Create New Event"}
                    </h3>
                    <div className="flex flex-col gap-1">
                        <label className="formLabel">Name</label>
                        <input
                            className="formInput"
                            value={form.name}
                            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                            placeholder="e.g. Christmas Sale"
                            required
                        />
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="formLabel">Description</label>
                        <textarea
                            className="formInput min-h-[70px]"
                            value={form.description}
                            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                            placeholder="Short description for internal reference"
                            required
                        />
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="formLabel">Locations / Channels (optional)</label>
                        <input
                            className="formInput"
                            value={form.locations}
                            onChange={(e) => setForm((f) => ({ ...f, locations: e.target.value }))}
                            placeholder="e.g. Online, In-store, SG, MY"
                        />
                        <p className="text-[11px] text-lightColor/70">
                            Comma-separated list, for your own targeting/reference.
                        </p>
                    </div>
                    <div className="flex flex-col gap-1 mt-1">
                        <div className="flex items-center gap-2">
                            <input
                                id="eventActive"
                                type="checkbox"
                                checked={form.isActive}
                                onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                            />
                            <label htmlFor="eventActive" className="text-xs">
                                Event is active
                            </label>
                        </div>
                        <div className="flex items-center gap-2">
                            <input
                                id="eventGlobal"
                                type="checkbox"
                                checked={form.isGlobal}
                                onChange={(e) => setForm((f) => ({ ...f, isGlobal: e.target.checked }))}
                            />
                            <label htmlFor="eventGlobal" className="text-xs">
                                Apply store-wide as a global event
                            </label>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 mt-2">
                        <div className="flex flex-col gap-1">
                            <label className="formLabel">Discount %</label>
                            <input
                                type="number"
                                min={1}
                                max={100}
                                className="formInput"
                                value={form.percentage}
                                onChange={(e) => setForm((f) => ({ ...f, percentage: e.target.value }))}
                                placeholder="e.g. 10"
                                required
                            />
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="formLabel">Minimum Amount</label>
                            <input
                                type="number"
                                min={0}
                                step="0.01"
                                className="formInput"
                                value={form.minimumPrice}
                                onChange={(e) => setForm((f) => ({ ...f, minimumPrice: e.target.value }))}
                                placeholder="e.g. 50"
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 mt-2">
                        <div className="flex flex-col gap-1">
                            <label className="formLabel">Start Date</label>
                            <input
                                type="date"
                                className="formInput"
                                value={form.startDate}
                                onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                                required
                            />
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="formLabel">End Date</label>
                            <input
                                type="date"
                                className="formInput"
                                value={form.endDate}
                                onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                                required
                            />
                        </div>
                    </div>

                    <div className="flex gap-2 mt-4">
                        <button
                            type="submit"
                            disabled={saving}
                            className="formBlackButton text-xs px-4 py-2 disabled:opacity-60"
                        >
                            {saving ? "Saving..." : editingEvent ? "Update Event" : "Create Event"}
                        </button>
                        {editingEvent && (
                            <button
                                type="button"
                                onClick={resetForm}
                                className="formButton text-xs px-3 py-2"
                            >
                                Cancel
                            </button>
                        )}
                    </div>
                </form>

                <div className="lg:col-span-2">
                    <h3 className="text-sm font-semibold mb-2">Existing Events</h3>
                    {loading ? (
                        <p className="text-xs text-lightColor/70">Loading events...</p>
                    ) : events.length === 0 ? (
                        <p className="text-xs text-lightColor/70">No events created yet.</p>
                    ) : (
                        <div className="flex flex-col gap-2">
                            {events.map((ev) => (
                                <div
                                    key={ev._id}
                                    className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 border border-borderColor rounded-sm p-3 bg-white/40"
                                >
                                    <div className="flex flex-col gap-1 text-xs">
                                        <div className="flex items-center gap-2">
                                            <span className="font-semibold">{ev.name}</span>
                                            {!ev.isActive && (
                                                <span className="px-2 py-0.5 rounded-full bg-gray-200 text-[10px] uppercase tracking-wide">
                                                    Inactive
                                                </span>
                                            )}
                                            {ev.isGlobal && (
                                                <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-[10px] uppercase tracking-wide text-indigo-700">
                                                    Global
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-lightColor/80 max-w-md">{ev.description}</p>
                                        <div className="flex flex-wrap gap-3 mt-1 text-[11px] text-lightColor/80">
                                            <span>
                                                {ev.percentage}% off, min S${" "}
                                                {typeof ev.minimumPrice === "number" ? ev.minimumPrice.toFixed(2) : ev.minimumPrice}
                                            </span>
                                            <span>
                                                {ev.startDate && new Date(ev.startDate).toLocaleDateString()} 
                                                – {ev.endDate && new Date(ev.endDate).toLocaleDateString()}
                                            </span>
                                            {Array.isArray(ev.locations) && ev.locations.length > 0 && (
                                                <span>
                                                    Locations: {ev.locations.join(", ")}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex gap-2 text-xs">
                                        <button
                                            type="button"
                                            className="formButton px-3 py-1"
                                            onClick={() => handleEdit(ev)}
                                        >
                                            Edit
                                        </button>
                                        <button
                                            type="button"
                                            className="toggleXbutton px-3 py-1"
                                            onClick={() => handleDelete(ev._id)}
                                        >
                                            Delete
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
