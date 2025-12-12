import { useClerk } from "@clerk/nextjs";
import { useState } from "react";
import { AiOutlineEdit } from "react-icons/ai";
import { RiSaveLine } from "react-icons/ri";

function SecuritySettings({
    devices = [],
    currentSession,
    user,
}) {
    const [password, setPassword] = useState("");
    const [passwordConfirm, setPasswordConfirm] = useState("");
    const [passwordMsg, setPasswordMsg] = useState("");
    const [deleteMsg, setDeleteMsg] = useState("");
    const [loading, setLoading] = useState(false);
    const [editMode, setEditMode] = useState(false);
    const { signOut } = useClerk();

    const handlePasswordSave = async () => {
        setPasswordMsg("");
        if (password !== passwordConfirm) {
            setPasswordMsg("Passwords do not match.");
            return;
        }
        setLoading(true);
        try {
            // Clerk v5: password update is done on the user object
            if (user && typeof user.updatePassword === "function") {
                await user.updatePassword({ newPassword: password });
            }
            setPasswordMsg("Password updated!");
            setEditMode(false);
            setPassword("");
            setPasswordConfirm("");
        } catch (err) {
            setPasswordMsg("Failed to update password.");
        }
        setLoading(false);
    };

    const handleSignOutSession = async (sessionId) => {
        setLoading(true);
        try {
            // If this is the current session, sign out via Clerk helper
            if (currentSession && sessionId === currentSession.id) {
                await signOut();
                return;
            }

            const res = await fetch("/api/user/sessions", {
                method: "DELETE",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ sessionId }),
            });

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || "Failed to sign out device.");
            }

            // Optionally: you could trigger a refresh of devices here
        } catch (err) {
            alert(err.message || "Failed to sign out device.");
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteAccount = async () => {
        if (!window.confirm("Are you sure you want to delete your account? This cannot be undone.")) return;
        setLoading(true);
        try {
            if (user && typeof user.delete === "function") {
                await user.delete();
                setDeleteMsg("Account deleted.");
                await signOut();
            } else {
                setDeleteMsg("Unable to delete account: user not loaded.");
            }
        } catch (err) {
            setDeleteMsg("Failed to delete account.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className='flex w-full flex-col overflow-auto'>
            <h2 className="flex font-semibold text-lg mb-2">Password</h2>
            <div className="flex flex-col md:flex-row items-start md:items-center gap-4 rounded border border-borderColor/60 p-4 md:p-6 w-full max-w-xl">
                <div className="flex flex-col w-full">
                    {editMode ? (
                        <>
                            {passwordMsg && (
                                <div className={`text-xs font-medium mb-2 ${passwordMsg.includes("updated") ? "text-green-400" : "text-red-400"}`}>
                                    {passwordMsg}
                                </div>
                            )}
                            <input
                                type="password"
                                placeholder="New password"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                className="border rounded-sm border-borderColor px-3 py-1 text-sm mb-1 outline-none min-w-0 overflow-x-auto"
                                disabled={loading}
                                style={{ wordBreak: 'break-all' }}
                            />
                            <input
                                type="password"
                                placeholder="Confirm password"
                                value={passwordConfirm}
                                onChange={e => setPasswordConfirm(e.target.value)}
                                className="border rounded-sm border-borderColor px-3 py-1 text-sm outline-none w-full min-w-0 overflow-x-auto"
                                disabled={loading}
                                style={{ wordBreak: 'break-all' }}
                            />
                        </>
                    ) : (
                        <p className="flex w-full break-words tracking-wider select-none">
                            •••••••••••
                        </p>
                    )}

                </div>
                <div
                    className='accountSaveButton'
                    onClick={() => {
                        if (editMode) {
                            handlePasswordSave();
                        } else {
                            setEditMode(true);
                            setPassword("");
                            setPasswordConfirm("");
                            setPasswordMsg("");
                        }
                    }}
                >
                    {editMode ? "Save" : "Edit"}
                    {editMode ? <RiSaveLine className='flex' /> : <AiOutlineEdit className='flex' />}
                </div>
            </div>

            <h2 className="flex font-semibold text-lg mb-2 mt-8">Active Devices</h2>
            {devices.length === 0 && <div>No active devices.</div>}
            <div className="flex flex-col gap-4">
                {devices.map((device) => {
                    const isCurrent = currentSession && device.id === currentSession.id;
                    const activity = device.latestActivity || {};
                    return (
                        <div
                            key={device.id}
                            className={`border border-borderColor/60 rounded flex flex-col md:flex-row items-start md:items-center gap-8 p-4 md:p-6 w-full bg-white`}
                        >
                            <div
                                className="flex items-center justify-center rounded-full bg-gray-200 text-gray-500 text-2xl select-none aspect-square min-w-12 min-h-12"

                            >
                                <span role="img" aria-label="device">💻</span>
                            </div>
                            <div className="flex flex-col w-full min-w-0">
                                <div className="flex flex-row items-center gap-2 mb-2">
                                    <span className="font-semibold text-base text-textColor break-words">{activity.deviceType || "Device"}</span>
                                    {isCurrent && (
                                        <span className="ml-2 px-2 py-0.5 bg-gray-100 text-gray-500 rounded text-xs border border-borderColor/60">
                                            This device
                                        </span>
                                    )}
                                </div>
                                <div className="text-xs text-gray-500 break-words">
                                    {activity.browserName} {activity.browserVersion}
                                    {activity.browserName && (activity.city || activity.country) && " — "}
                                    {activity.city}{activity.city && activity.country && ", "}{activity.country}
                                </div>
                                <div className="text-xs text-gray-400 break-words">
                                    IP: {activity.ipAddress}
                                </div>
                                {device.lastActiveAt && (
                                    <div className="text-xs text-gray-400 break-words">
                                        Last active: {new Date(device.lastActiveAt).toLocaleString()}
                                    </div>
                                )}
                                <button
                                    onClick={() => handleSignOutSession(device.id)}
                                    className="mt-2 text-xs underline text-gray-500 hover:text-gray-700 transition-colors duration-200 w-fit"
                                    disabled={loading}
                                >
                                    Sign out of device
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>

            <button onClick={handleDeleteAccount} className="mt-12 formBlackButton" disabled={loading}>Delete Account</button>
            {deleteMsg && <div className="text-xs mt-1">{deleteMsg}</div>}
        </div>
    )
}

export default SecuritySettings