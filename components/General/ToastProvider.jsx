'use client'
import React, { createContext, useContext, useState, useCallback } from 'react';
import { CiCircleCheck, CiCircleRemove } from "react-icons/ci";
import { AnimatePresence, motion } from 'framer-motion';

const ToastContext = createContext();

export function useToast() {
    return useContext(ToastContext);
}

export function ToastProvider({ children }) {
    const [toast, setToast] = useState(null);

    const showToast = useCallback((message, type = 'success', duration = 10000) => {
        setToast({ message, type });
        setTimeout(() => setToast(null), duration);
    }, []);

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}
            <AnimatePresence>
                {toast && (
                    <motion.div
                        key="toast"
                        initial={{ opacity: 0, y: 40 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 40 }}
                        transition={{ type: "spring", stiffness: 400, damping: 30 }}
                        className={`fixed bottom-6 right-6 flex px-6 py-4 rounded-md border z-50 bg-background drop-shadow-sm text-sm font-normal items-center border-borderColor
                            ${toast.type === 'error' ? 'text-red-700' : 'text-green-700'}`}
                    >
                        {toast.type === 'error' ? (
                            <CiCircleRemove size={20} className="flex mr-3" />
                        ) : (
                            <CiCircleCheck size={20} className="flex mr-3" />
                        )}
                        <div className='flex max-w-[40vw]'>
                            {toast.message}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </ToastContext.Provider>
    );
}