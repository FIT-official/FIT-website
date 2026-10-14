export default function StockAllocation({ allocation, fulfillment }) {
    if (!allocation) return null;
    const remaining = Math.max(0, allocation.backorderQuantity - (fulfillment?.allocated || 0));
    return <div className="text-sm space-y-1" aria-live="polite">
        <p>{fulfillment ? 'Available when ordered' : 'Available for this selection'}: {allocation.availableQuantity == null ? 'unconfirmed' : allocation.availableQuantity}.</p>
        <p>From available stock: {allocation.onHandQuantity}. Awaiting restock: {remaining}.</p>
        {!!fulfillment?.allocated && <p>Allocated after restocking: {fulfillment.allocated}.</p>}
        {allocation.issue && <p role="alert">{allocation.issue}</p>}
        {allocation.disclosure && <p>{allocation.disclosure}</p>}
    </div>;
}
