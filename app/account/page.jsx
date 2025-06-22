'use client'
import React, { useEffect, useState } from 'react'
import { useUser } from "@clerk/nextjs"

function Account() {
    const { user, isLoaded } = useUser();
    const [address, setAddress] = useState({
        street: "",
        unitNumber: "",
        city: "",
        state: "",
        postalCode: "",
        country: ""
    });
    const [phone, setPhone] = useState({
        number: "",
        countryCode: ""
    });
    const [loading, setLoading] = useState(false);
    const [saved, setSaved] = useState(false);

    // Fetch existing address and phone
    useEffect(() => {
        if (!isLoaded || !user) return;
        const fetchContact = async () => {
            const res1 = await fetch("/api/user/contact/address");
            const res2 = await fetch("/api/user/contact/phone");
            if (res1.ok) {
                const data1 = await res1.json();
                if (data1.address) setAddress(data1.address);
            }
            if (res2.ok) {
                const data2 = await res2.json();
                if (data2.phone) setPhone(data2.phone);
            }
        };
        fetchContact();
    }, [isLoaded, user]);

    const handleAddressChange = e => {
        setAddress(a => ({ ...a, [e.target.name]: e.target.value }));
    };

    const handlePhoneChange = e => {
        setPhone(p => ({ ...p, [e.target.name]: e.target.value }));
    };

    const saveContact = async e => {
        e.preventDefault();
        setLoading(true);
        setSaved(false);
        const res1 = await fetch("/api/user/contact/address", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ address }),
        });
        const res2 = await fetch("/api/user/contact/phone", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ phone }),
        });
        setLoading(false);
        if (res1.ok && res2.ok) setSaved(true);
    };

    return (
        <div className="flex flex-row h-screen w-screen gap-10 items-center justify-center">
            <form className="flex flex-col gap-2 w-80" onSubmit={saveContact}>
                <label>Street</label>
                <input name="street" value={address.street} onChange={handleAddressChange} required className="border px-2 py-1" />
                <label>Unit Number</label>
                <input name="unitNumber" value={address.unitNumber} onChange={handleAddressChange} required className="border px-2 py-1" />
                <label>City</label>
                <input name="city" value={address.city} onChange={handleAddressChange} required className="border px-2 py-1" />
                <label>State</label>
                <input name="state" value={address.state} onChange={handleAddressChange} required className="border px-2 py-1" />
                <label>Postal Code</label>
                <input name="postalCode" value={address.postalCode} onChange={handleAddressChange} required className="border px-2 py-1" />
                <label>Country</label>
                <input name="country" value={address.country} onChange={handleAddressChange} required className="border px-2 py-1" />
                <label>Phone Country Code</label>
                <input name="countryCode" value={phone.countryCode} onChange={handlePhoneChange} required className="border px-2 py-1" placeholder="+65" />
                <label>Phone Number</label>
                <input name="number" value={phone.number} onChange={handlePhoneChange} required className="border px-2 py-1" placeholder="81234567" />
                <button type="submit" className="mt-2 px-4 py-2 border rounded" disabled={loading}>
                    {loading ? "Saving..." : "Save"}
                </button>
                {saved && <span className="text-green-600">Saved!</span>}
            </form>
        </div>
    )
}

export default Account