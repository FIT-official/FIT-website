"use client"
import { UserRoleProvider } from "@/utils/UserRoleContext";
import { UserSubscriptionProvider } from "@/utils/UserSubscriptionContext";
import { StripePriceIdsProvider } from "@/utils/StripePriceIdsContext";
import { AdminSettingsProvider } from "@/utils/AdminSettingsContext";

export default function ClientProviders({ children }) {
  return (
    <UserRoleProvider>
      <UserSubscriptionProvider>
        <StripePriceIdsProvider>
          <AdminSettingsProvider>
            {children}
          </AdminSettingsProvider>
        </StripePriceIdsProvider>
      </UserSubscriptionProvider>
    </UserRoleProvider>
  );
}