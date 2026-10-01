import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildCheckoutItem } from '@/lib/checkoutSnapshot';
import { buildGooglePurchase, buildGoogleReviewOptIn } from '@/lib/googleMeasurementReceipt';
import { createGooglePurchaseDispatcher } from '@/lib/googlePurchaseDraft';

let data;
const approvedReviews = () => ({ enabled:true, agreementApproved:true, privacyNoticeApproved:true,
    transactionSharingApproved:true, merchantId:5861883835 });
beforeEach(() => {
    const item = buildCheckoutItem({
        item: { _id:'cart-fixture', selectedVariants:{Spool:'With Spool'}, orderNote:'PRIVATE NOTE' },
        product: { _id:'product-fixture', slug:'public-product', name:'Fixture product', paidAssets:['PRIVATE ASSET'] },
        breakdown: { quantity:2, price:25.9, deliveryFee:5, currency:'SGD', chosenDeliveryType:'standard-shipping',
            basePrice:21.9, priceBeforeDiscount:25.9, variantInfo:[] },
    });
    data = {
        ownerId:'fixture-owner',
        payment: { id:'cs_fixture', mode:'payment', payment_status:'paid', currency:'sgd', amount_total:5680,
            metadata:{userId:'fixture-owner'}, customer_details:{email:'secret@example.test'}, client_secret:'PRIVATE SECRET' },
        checkout: { sessionId:'cs_fixture', userId:'fixture-owner', status:'completed', snapshotVersion:1,
            currency:'sgd', totalAmount:5680, items:[item], customerEmail:'secret@example.test' },
        order: { orderId:'ORD_cs_fixture', stripeSessionId:'cs_fixture', userId:'fixture-owner', status:'pending',
            customerEmail:'buyer@example.test', customerName:'PRIVATE NAME', shippingAddress:{country:'SG',line1:'PRIVATE STREET'},
            paymentMethod:{last4:'1234'}, adminNote:'PRIVATE ADMIN NOTE' },
    };
    localStorage.clear();
});

describe('paid receipt whitelist', () => {
    it('uses immutable item prices and separates shipping without multiplying it by quantity', () => {
        expect(buildGooglePurchase(data)).toEqual({transaction_id:'ORD_cs_fixture',value:51.8,shipping:5,currency:'SGD',
            items:[{item_id:'product-fixture',price:25.9,quantity:2}]});
    });
    it('excludes all customer, payment, notes, assets and custom descriptive fields', () => {
        data.checkout.items[0].productName = 'Custom 3D Print - PRIVATE REQUEST ID';
        const result = JSON.stringify(buildGooglePurchase(data));
        expect(result).not.toMatch(/PRIVATE|example\.test|client_secret|shippingAddress|last4/);
    });
    it.each(['unpaid','no_payment_required'])('does not infer a purchase from a return-page visit: %s', state => {
        data.payment.payment_status = state;
        expect(buildGooglePurchase(data)).toBeNull();
    });
    it('waits for a committed order and completed snapshot', () => {
        expect(buildGooglePurchase({...data,order:null})).toBeNull();
        data.checkout.status='pending';
        expect(buildGooglePurchase(data)).toBeNull();
    });
    it('rejects another buyer or mismatched order/session', () => {
        expect(buildGooglePurchase({...data,ownerId:'another-buyer'})).toBeNull();
        data.order.stripeSessionId='cs_other';
        expect(buildGooglePurchase(data)).toBeNull();
    });
    it('rejects legacy or reconciliation-required snapshots and tampered captured totals', () => {
        expect(buildGooglePurchase({...data,checkout:{...data.checkout,snapshotVersion:undefined}})).toBeNull();
        expect(buildGooglePurchase({...data,checkout:{...data.checkout,status:'reconciliation_required'}})).toBeNull();
        data.payment.amount_total=1;
        expect(buildGooglePurchase(data)).toBeNull();
    });
    it('uses the same owner contract for guest checkout', () => {
        for (const record of [data.checkout,data.order]) record.userId='guest_fixture';
        data.payment.metadata.userId='guest_fixture';
        expect(buildGooglePurchase({...data,ownerId:'guest_fixture'})).not.toBeNull();
    });
    it.each(['cancelled','refunded','partially_refunded'])('does not generate a new purchase for %s', status => {
        data.order.status=status;
        expect(buildGooglePurchase(data)).toBeNull();
    });
});

describe('Customer Reviews preparation', () => {
    const estimate = () => ({orderId:'ORD_cs_fixture',date:'2026-10-09',source:'fixture-approved-fulfilment-record'});
    it('is disabled by default and when the programme agreement remains unsigned', () => {
        expect(buildGoogleReviewOptIn({...data,deliveryEstimate:estimate()})).toBeNull();
        expect(buildGoogleReviewOptIn({...data,deliveryEstimate:estimate(),policy:{...approvedReviews(),agreementApproved:false}})).toBeNull();
    });
    it.each(['privacyNoticeApproved','transactionSharingApproved'])('requires %s before any rendering payload exists', flag => {
        expect(buildGoogleReviewOptIn({...data,deliveryEstimate:estimate(),policy:{...approvedReviews(),[flag]:false}})).toBeNull();
    });
    it('returns only the official five fields, independently of analytics-cookie consent', () => {
        localStorage.setItem('fit_cookie_consent','declined');
        expect(buildGoogleReviewOptIn({...data,deliveryEstimate:estimate(),policy:approvedReviews()})).toEqual({
            merchant_id:5861883835,order_id:'ORD_cs_fixture',email:'buyer@example.test',delivery_country:'SG',estimated_delivery_date:'2026-10-09'});
    });
    it('never substitutes a fabricated date for missing, invalid or unlinked delivery data', () => {
        for (const deliveryEstimate of [undefined,{...estimate(),date:'2026-02-30'}, {...estimate(),source:''}, {...estimate(),orderId:'another-order'}]) {
            expect(buildGoogleReviewOptIn({...data,deliveryEstimate,policy:approvedReviews()})).toBeNull();
        }
    });
    it('rejects an absent country or Google-disallowed ZZ and invalid email', () => {
        for (const country of ['', 'ZZ', 'Singapore']) {
            data.order.shippingAddress.country=country;
            expect(buildGoogleReviewOptIn({...data,deliveryEstimate:estimate(),policy:approvedReviews()})).toBeNull();
        }
        data.order.shippingAddress.country='SG'; data.order.customerEmail='not-an-email';
        expect(buildGoogleReviewOptIn({...data,deliveryEstimate:estimate(),policy:approvedReviews()})).toBeNull();
    });
    it('keeps a held paid purchase measurable but withholds a review delivery prompt', () => {
        data.order.status = 'on_hold';
        expect(buildGooglePurchase(data)).not.toBeNull();
        expect(buildGoogleReviewOptIn({...data,deliveryEstimate:estimate(),policy:approvedReviews()})).toBeNull();
    });
});

describe('consented purchase dispatch seam: mock callbacks only', () => {
    const setup = overrides => {
        const send = vi.fn().mockResolvedValue(true);
        const dispatch = createGooglePurchaseDispatcher({enabled:true,configurationApproved:true,
            storage:localStorage,getConsent:()=>localStorage.getItem('fit_cookie_consent'),tagReady:()=>true,send,...overrides});
        return {send,dispatch};
    };
    it('does nothing when disabled, not approved, undecided or declined', async () => {
        const payload=buildGooglePurchase(data);
        for (const overrides of [{enabled:false},{configurationApproved:false},{}]) {
            const {send,dispatch}=setup(overrides);
            expect(await dispatch(payload)).toBe(false); expect(send).not.toHaveBeenCalled();
        }
        localStorage.setItem('fit_cookie_consent','declined');
        const {send,dispatch}=setup({}); await dispatch(payload); expect(send).not.toHaveBeenCalled();
    });
    it('queues once on reload/retry and concurrent calls with the stable transaction ID', async () => {
        localStorage.setItem('fit_cookie_consent','accepted');
        const {send,dispatch}=setup({}); const payload=buildGooglePurchase(data);
        await Promise.all([dispatch(payload),dispatch(payload)]); await dispatch(payload);
        const next=setup({}); await next.dispatch(payload);
        expect(send).toHaveBeenCalledTimes(1); expect(next.send).not.toHaveBeenCalled();
    });
    it('can retry after loader-not-ready or a failed queue, without marking a sent event', async () => {
        localStorage.setItem('fit_cookie_consent','accepted');
        const unready=setup({tagReady:()=>false}); await unready.dispatch(buildGooglePurchase(data));
        expect(unready.send).not.toHaveBeenCalled();
        const {send,dispatch}=setup({}); send.mockResolvedValueOnce(false);
        expect(await dispatch(buildGooglePurchase(data))).toBe(false);
        expect(await dispatch(buildGooglePurchase(data))).toBe(true); expect(send).toHaveBeenCalledTimes(2);
    });
    it('rechecks withdrawn consent inside a cross-tab lock', async () => {
        localStorage.setItem('fit_cookie_consent','accepted');
        const {send,dispatch}=setup({withLock:async (_key,run)=>{localStorage.setItem('fit_cookie_consent','declined');return run();}});
        expect(await dispatch(buildGooglePurchase(data))).toBe(false); expect(send).not.toHaveBeenCalled();
    });
    it('fails closed on blocked storage and never throws into checkout', async () => {
        localStorage.setItem('fit_cookie_consent','accepted');
        const {send,dispatch}=setup({storage:{getItem(){throw new Error('blocked');}}});
        expect(await dispatch(buildGooglePurchase(data))).toBe(false); expect(send).not.toHaveBeenCalled();
    });
});
