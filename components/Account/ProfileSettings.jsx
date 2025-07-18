import { useUser } from '@clerk/nextjs';
import Image from 'next/image';
import { useEffect, useState } from 'react'
import { AiOutlineEdit } from 'react-icons/ai';
import { FiEdit2 } from "react-icons/fi";
import { RiSaveLine } from "react-icons/ri";
import { useToast } from '../General/ToastProvider';
import { IoLogoGoogle } from 'react-icons/io5';
import { MdMailOutline } from 'react-icons/md';

function ProfileSettings({
    connectedAccounts = []
}) {
    const { user, isLoaded } = useUser();
    const [loading, setLoading] = useState(false);
    const [hovered, setHovered] = useState(false);
    const [editMode, setEditMode] = useState(false);
    const [profileImage, setProfileImage] = useState("");
    const [email, setEmail] = useState("");
    const [firstName, setFirstName] = useState(user?.firstName || "");
    const [lastName, setLastName] = useState(user?.lastName || "");
    const { showToast } = useToast();

    useEffect(() => {
        if (!isLoaded || !user) return;
        setProfileImage(user.imageUrl || "");
        setEmail(user.primaryEmailAddress?.emailAddress || "");
        setFirstName(user.firstName || "");
        setLastName(user.lastName || "");
    }, [user, isLoaded]);

    const handleProfileImageChange = async (e) => {
        if (!user) return;
        const file = e.target.files[0];
        if (!file) return;
        setLoading(true);
        try {
            await user.setProfileImage({ file });
            await user.reload();
            setProfileImage(user.imageUrl);
        } catch (err) {
            alert("Failed to update profile image.");
        }
        setLoading(false);
    };

    const handleEmailChange = (e) => setEmail(e.target.value);
    const handleFirstNameChange = (e) => setFirstName(e.target.value);
    const handleLastNameChange = (e) => setLastName(e.target.value);

    const handleSave = async () => {
        if (!user) return;
        setLoading(true);
        try {
            if (firstName !== user.firstName || lastName !== user.lastName) {
                await user.update({
                    firstName: firstName,
                    lastName: lastName
                });
                await user.reload();
            }
            if (email !== user.primaryEmailAddress?.emailAddress) {
                await user.createEmailAddress({ emailAddress: email });
                await user.reload();
            }
            setEditMode(false);
        } catch (err) {
            showToast("Failed to update email & full name: " + err.message, "error");
        }
        setLoading(false);
    };

    const ProfileSkeleton = () => (
        <div className="flex flex-row items-center gap-4 md:gap-8 rounded border border-borderColor/60 p-4 md:p-6 w-full animate-pulse">
            <div
                className="relative flex items-center justify-center mb-2 bg-gray-200 rounded-full"
                style={{ width: 96, height: 96, minWidth: 96, minHeight: 96 }}
            >
                <div className="w-full h-full rounded-full bg-borderColor" />
            </div>
            <div className="flex flex-col w-full">
                <div className="h-6 w-1/2 bg-borderColor rounded mb-1" />
                <div className="h-4 w-3/4 bg-borderColor rounded" />
                <div className="h-10 w-24 bg-borderColor rounded mt-2" />
            </div>
        </div>
    );

    return (
        <div className='flex flex-col overflow-auto'>
            <h2 className="flex font-semibold text-lg mb-2">My Profile</h2>
            {!isLoaded ? (
                <ProfileSkeleton />
            ) : (
                <div className='flex flex-row items-center gap-4 md:gap-8 rounded border border-borderColor/60 p-4 md:p-6 overflow-x-scroll'>
                    <div
                        className="relative flex items-center justify-center mb-2 group"
                        style={{ width: 96, height: 96, minWidth: 96, minHeight: 96 }}
                        onMouseEnter={() => setHovered(true)}
                        onMouseLeave={() => setHovered(false)}
                    >
                        <label htmlFor="profile-image-upload" className="cursor-pointer block">
                            {profileImage ? (
                                <Image
                                    src={profileImage}
                                    alt="Profile"
                                    width={96}
                                    height={96}
                                    className="rounded-full object-cover"
                                    style={{ minWidth: 96, minHeight: 96, aspectRatio: "1 / 1" }}
                                />
                            ) : (
                                <Image
                                    src="/user.jpg"
                                    alt="Profile"
                                    width={96}
                                    height={96}
                                    className="rounded-full object-cover bg-gray-200"
                                    style={{ minWidth: 96, minHeight: 96, aspectRatio: "1 / 1" }}
                                />
                            )}
                            <div
                                className={`absolute inset-0 flex items-center justify-center rounded-full bg-black/60 transition-opacity duration-200 ${hovered ? "opacity-100" : "opacity-0"
                                    }`}
                            >
                                <FiEdit2 className="text-white text-2xl" />
                            </div>
                        </label>
                        <input
                            id="profile-image-upload"
                            type="file"
                            accept="image/*"
                            onChange={handleProfileImageChange}
                            disabled={loading}
                            className="hidden"
                        />
                    </div>
                    <div className='flex flex-col md:flex-row items-start md:items-center w-full justify-between'>
                        <div className='flex flex-col w-2/3'>
                            {editMode ? (
                                <>
                                    <div className='flex gap-1 w-full'>
                                        <input
                                            type="text"
                                            className="flex-1 border rounded-sm border-borderColor px-3 py-1 mb-1 font-medium outline-none min-w-0 overflow-x-auto"
                                            value={firstName}
                                            onChange={handleFirstNameChange}
                                            disabled={loading}
                                            style={{ wordBreak: 'break-all' }}
                                        />
                                        <input
                                            type="text"
                                            className="flex-1 border rounded-sm border-borderColor px-3 py-1 mb-1 font-medium outline-none min-w-0 overflow-x-auto"
                                            value={lastName}
                                            onChange={handleLastNameChange}
                                            disabled={loading}
                                            style={{ wordBreak: 'break-all' }}
                                        />
                                    </div>
                                    <input
                                        type="email"
                                        className="border rounded-sm border-borderColor px-3 py-1 text-sm outline-none w-full min-w-0 overflow-x-auto"
                                        value={email}
                                        onChange={handleEmailChange}
                                        disabled={loading}
                                        style={{ wordBreak: 'break-all' }}
                                    />
                                </>
                            ) : (
                                <>
                                    <p className='flex text-lg font-semibold w-full break-words'>{user.fullName || "User"}</p>
                                    <p className='flex text-sm w-full break-words'>{email || "youremail@example.com"}</p>
                                </>
                            )}
                        </div>
                        <div className='accountSaveButton mt-2 md:mt-0'
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
            )}

            <div className="flex flex-col justify-between mt-8">
                <h2 className="flex font-semibold text-base mb-4">Connected Accounts</h2>
                {connectedAccounts.length === 0 && <div className='text-xs'>No connected accounts.</div>}
                {connectedAccounts.map((acc, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-xs">
                        {acc.provider.toLowerCase() === "google" ? (
                            <IoLogoGoogle className="text-lg" />
                        ) : (
                            <MdMailOutline className="text-lg" />
                        )}
                        <span className="font-medium">
                            {acc.provider.charAt(0).toUpperCase() + acc.provider.slice(1)}
                        </span>
                        <span className="mx-1">·</span>
                        <span className="text-lightColor">{acc.emailAddress}</span>
                    </div>
                ))}
            </div>
        </div>
    )
}

export default ProfileSettings