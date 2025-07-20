import { useEffect, useState } from "react";
import { AiOutlineEdit } from "react-icons/ai";
import { RiSaveLine } from "react-icons/ri";

function ContactSection() {
    const [phone, setPhone] = useState({ countryCode: "", number: "" });
    const [address, setAddress] = useState({
        street: "",
        unitNumber: "",
        city: "",
        state: "",
        postalCode: "",
        country: ""
    });
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState("");
    const [editMode, setEditMode] = useState(false);

    useEffect(() => {
        (async () => {
            setLoading(true);
            try {
                const phoneRes = await fetch("/api/user/contact/phone");
                if (phoneRes.ok) {
                    const data = await phoneRes.json();
                    if (data.phone) setPhone(data.phone);
                }
                const addrRes = await fetch("/api/user/contact/address");
                if (addrRes.ok) {
                    const data = await addrRes.json();
                    if (data.address) setAddress(data.address);
                }
            } catch (err) {
                setMsg("Failed to load contact info.");
            }
            setLoading(false);
        })();
    }, []);

    const handlePhoneChange = (e) => {
        const { name, value } = e.target;
        setPhone((prev) => ({ ...prev, [name]: value }));
    };
    const handleAddressChange = (e) => {
        const { name, value } = e.target;
        setAddress((prev) => ({ ...prev, [name]: value }));
    };

    const handleSave = async () => {
        setLoading(true);
        setMsg("");
        try {
            const phoneRes = await fetch("/api/user/contact/phone", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ phone }),
            });
            const addrRes = await fetch("/api/user/contact/address", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ address }),
            });
            if (phoneRes.ok && addrRes.ok) setMsg("Contact info updated!");
            else setMsg("Failed to update contact info.");
            setEditMode(false);
        } catch {
            setMsg("Failed to update contact info.");
        }
        setLoading(false);
    };

    return (
        <div className='flex flex-col justify-center h-full pl-2 overflow-auto'>
            <h2 className="flex font-semibold text-lg mb-2">Billing & Contact</h2>
            <p className="flex text-xs max-w-sm mb-8">
                Update your billing address and contact information. This information is used for delivery and to contact you regarding your account.
            </p>
            <div className="flex flex-col items-start gap-4 rounded border border-borderColor p-4 md:p-6 w-full max-w-xl">
                <div className="flex flex-col w-full">
                    <h3 className="mb-2 text-sm">Phone</h3>
                    {editMode ? (
                        <div className="flex gap-2 mb-4 w-full">
                            <input
                                type="text"
                                name="countryCode"
                                placeholder="Country Code"
                                value={phone.countryCode ?? ""}
                                onChange={handlePhoneChange}
                                className="border rounded-sm border-borderColor px-3 py-1 w-20 text-sm outline-none min-w-0 overflow-x-auto"
                                disabled={loading}
                            />
                            <input
                                type="text"
                                name="number"
                                placeholder="Phone Number"
                                value={phone.number ?? ""}
                                onChange={handlePhoneChange}
                                className="border rounded-sm border-borderColor px-3 py-1 flex-1 text-sm outline-none min-w-0 overflow-x-auto"
                                disabled={loading}
                            />
                        </div>
                    ) : (
                        <div className="flex gap-1 mb-4 text-sm text-textColor font-medium">
                            {(phone.countryCode || phone.number) ? (
                                <>
                                    <span>{phone.countryCode}</span>
                                    <span>{phone.number}</span>
                                </>
                            ) : (
                                <span className="text-lightColor">No phone number provided</span>
                            )}
                        </div>
                    )}

                    <h3 className="mb-2 text-sm">Billing Address</h3>
                    {editMode ? (
                        <div className="flex flex-col gap-2">
                            <input
                                type="text"
                                name="street"
                                placeholder="Street"
                                value={address.street}
                                onChange={handleAddressChange}
                                className="border rounded-sm border-borderColor px-3 py-1 text-sm outline-none min-w-0 overflow-x-auto"
                                disabled={loading}
                            />
                            <input
                                type="text"
                                name="unitNumber"
                                placeholder="Unit Number"
                                value={address.unitNumber}
                                onChange={handleAddressChange}
                                className="border rounded-sm border-borderColor px-3 py-1 text-sm outline-none min-w-0 overflow-x-auto"
                                disabled={loading}
                            />
                            <input
                                type="text"
                                name="city"
                                placeholder="City"
                                value={address.city}
                                onChange={handleAddressChange}
                                className="border rounded-sm border-borderColor px-3 py-1 text-sm outline-none min-w-0 overflow-x-auto"
                                disabled={loading}
                            />
                            <input
                                type="text"
                                name="state"
                                placeholder="State"
                                value={address.state}
                                onChange={handleAddressChange}
                                className="border rounded-sm border-borderColor px-3 py-1 text-sm outline-none min-w-0 overflow-x-auto"
                                disabled={loading}
                            />
                            <input
                                type="text"
                                name="postalCode"
                                placeholder="Postal Code"
                                value={address.postalCode}
                                onChange={handleAddressChange}
                                className="border rounded-sm border-borderColor px-3 py-1 text-sm outline-none min-w-0 overflow-x-auto"
                                disabled={loading}
                            />
                            <input
                                type="text"
                                name="country"
                                placeholder="Country"
                                value={address.country}
                                onChange={handleAddressChange}
                                className="border rounded-sm border-borderColor px-3 py-1 text-sm outline-none min-w-0 overflow-x-auto"
                                disabled={loading}
                            />
                        </div>
                    ) : (
                        <div className="flex flex-col gap-1 text-sm font-medium text-textColor">
                            {address.street || address.unitNumber || address.city || address.state || address.postalCode || address.country ? (
                                <>
                                    <span>
                                        {address.street}
                                        {address.unitNumber && ` #${address.unitNumber}`}
                                    </span>
                                    <span>
                                        {address.city} {address.state} {address.postalCode}
                                    </span>
                                    <span>{address.country}</span>
                                </>
                            ) : (
                                <span className="text-lightColor">No address provided</span>
                            )}
                        </div>
                    )}
                    {msg && <div className="text-xs mt-4 text-lightColor">{msg}</div>}
                </div>
                <div
                    className='formBlackButton w-full gap-3'
                    onClick={() => {
                        if (editMode) {
                            handleSave();
                        } else {
                            setEditMode(true);
                        }
                    }}
                >
                    {editMode ? "Save" : "Edit"}
                    {editMode ? <RiSaveLine className='flex' /> : <AiOutlineEdit className='flex' />}
                </div>
            </div>
        </div>
    );
}

export default ContactSection;