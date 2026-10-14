// Synthetic-only component fixture. Never imported by production routes.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const repo=path.resolve(__dirname,'../..'),out=process.env.SHOP_BROWSER_OUTPUT;
if(!out)throw Error('SHOP_BROWSER_OUTPUT must identify a fresh owned receipt directory');
fs.mkdirSync(out,{recursive:true});
const {chromium}=require('playwright'),esbuild=require('esbuild');
const product={_id:'0123456789abcdef01234567',name:'Synthetic filament',slug:'synthetic-filament',productType:'shop',listing:'fit',stock:2,images:[],paidAssets:[],
    basePrice:{presentmentAmount:10,presentmentCurrency:'SGD'},variantTypes:[{name:'Colour',options:[{name:'Blue',stock:2},{name:'Red',stock:0,restockStatus:'not_restocked'}]}],delivery:{deliveryTypes:[{type:'pick-up',price:0}]}};
const intent='00000000-0000-4000-8000-000000000001',lineId='1123456789abcdef01234567';
const shims={
    'next/link': `import React from 'react'; export default function Link({children,prefetch,...props}) { return <a {...props}>{children}</a> }`,
    'next/image': `import React from 'react'; export default function Image({alt}) { return <span role="img" aria-label={alt || 'Product'} /> }`,
    'next/navigation': `const router={push:url=>location.assign(url)},params=new URLSearchParams(location.search); export const useRouter=()=>router; export const useSearchParams=()=>params;`,
    '@clerk/nextjs': `const session={isLoaded:true,isSignedIn:true,user:{id:'synthetic-buyer'}}; export const useUser=()=>session;`,
    'posthog-js': `export default {capture(){}};`,
    '@stripe/stripe-js': `export const loadStripe=()=>{throw Error('Synthetic fixture must never load payment controls')};`,
    '@stripe/react-stripe-js': `export const CheckoutProvider=()=>null; export const PaymentElement=()=>null; export const useCheckout=()=>({});`,
    '@/components/General/ToastProvider': `export const useToast=()=>({showToast(){}});`,
    '@/components/General/CurrencyContext': `export const useCurrency=()=> 'SGD';`,
};
const receipt={startedAt:new Date().toISOString(),syntheticOnly:true,checks:[],errors:[],outbound:[],success:false};
let browser,server;
async function main(){
    await esbuild.build({entryPoints:[path.join(__dirname,'browser-entry.jsx')],outfile:path.join(out,'app.js'),bundle:true,platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"','process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY':'"pk_test_synthetic"'},plugins:[{name:'fixture-host',setup(build){build.onResolve({filter:/.*/},args=>shims[args.path]?{path:args.path,namespace:'fixture'}:null);build.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:shims[args.path],loader:'jsx',resolveDir:repo}));}}]});
    const policy=await esbuild.build({entryPoints:[path.join(repo,'lib/shopBackorders/policy.js')],bundle:true,write:false,platform:'node',format:'cjs'});
    fs.writeFileSync(path.join(out,'policy.cjs'),policy.outputFiles[0].contents);const {allocateLines,RESTOCKING_VERSION}=require(path.join(out,'policy.cjs'));
    const postcss=require('postcss'),tailwind=require('@tailwindcss/postcss');
    const css=await postcss([tailwind()]).process(fs.readFileSync(path.join(repo,'app/globals.css'),'utf8'),{from:path.join(repo,'app/globals.css')});fs.writeFileSync(path.join(out,'app.css'),css.css);
    let cart=[],order=null,available=2,accepted=[];
    const quote=()=>{const lines=allocateLines(cart,[{...product,stock:available}]);return {lines,token:require('node:crypto').createHash('sha256').update(JSON.stringify(lines)).digest('hex'),requiresAcknowledgement:lines.some(x=>x.backorderQuantity>0),blocked:lines.some(x=>x.blocked),disclosureVersion:RESTOCKING_VERSION};};
    const breakdown=()=>cart.map((i,index)=>({...i,name:product.name,price:10,basePrice:10,priceBeforeDiscount:10,variantInfo:[{option:i.selectedVariants.Colour,additionalFee:0}],deliveryFee:0,currency:'SGD',stockAllocation:quote().lines[index]}));
    server=http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://127.0.0.1');let raw='';for await(const chunk of req)raw+=chunk;const body=raw?JSON.parse(raw):{};
        const send=(data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
        if(url.pathname==='/__fixture/reset'){cart=[];order=null;available=2;accepted=[];return send({ok:true});}
        if(url.pathname==='/__fixture/receive'){available+=body.quantity;return send({available});}
        if(url.pathname==='/api/shop/availability'){const selected=JSON.parse(url.searchParams.get('variants'));return send({enabled:true,allocation:allocateLines([{_id:'preview',productId:product._id,quantity:Number(url.searchParams.get('quantity')),selectedVariants:selected,chosenDeliveryType:'pick-up'}],[{...product,stock:available}])[0]});}
        if(url.pathname==='/api/user/cart'){
            if(req.method==='POST')cart=[{...body.cartItem,_id:lineId}];
            if(req.method==='PUT'){if(cart[0]?.quantity!==body.expectedQuantity)return send({error:'Cart changed'},409);cart[0].quantity=body.quantity;}
            return send({success:true,cart,guest:false,contactReady:true,checkoutAttemptId:intent});
        }
        if(url.pathname==='/api/product')return send({products:[product]});
        if(url.pathname==='/api/delivery-types')return send({deliveryTypes:[]});
        if(url.pathname==='/api/checkout/breakdown')return send({cartBreakdown:breakdown(),stockQuote:quote(),needsDeliveryAddress:false,address:null});
        if(url.pathname==='/api/checkout/session'){
            const q=quote();if(req.headers['x-stock-quote']!==q.token||req.headers['x-restocking-acknowledged']!==RESTOCKING_VERSION)return send({code:'stock_quote_changed',error:'Review current availability.'},409);
            accepted.push({token:req.headers['x-stock-quote'],ack:req.headers['x-restocking-acknowledged']});
            const items=cart.map((i,index)=>({...i,sourceCartItemId:lineId,productName:product.name,stockAllocation:q.lines[index],backorderFulfillment:{allocated:0,revision:0}}));
            order={orderId:'SYNTHETIC-ORDER',customerName:'Synthetic buyer',status:'pending',items};available-=items[0].stockAllocation.onHandQuantity;
            return send({attemptId:intent,sessionId:'synthetic-session',pending:true,cartBreakdown:breakdown()});
        }
        if(url.pathname==='/api/admin/shop-backorders'){
            if(req.method==='POST'){const i=order.items[0],remaining=i.stockAllocation.backorderQuantity-i.backorderFulfillment.allocated;
                if(body.expectedRevision!==i.backorderFulfillment.revision||body.quantity>remaining||body.quantity>available)return send({error:'Record received inventory first, then refresh.'},409);
                available-=body.quantity;i.backorderFulfillment={allocated:i.backorderFulfillment.allocated+body.quantity,revision:i.backorderFulfillment.revision+1};return send(i.backorderFulfillment);}
            return send({orders:order?[order]:[],nextCursor:null});
        }
        if(url.pathname==='/app.js'||url.pathname==='/app.css'){res.setHeader('Content-Type',url.pathname.endsWith('css')?'text/css':'text/javascript');res.end(fs.readFileSync(path.join(out,url.pathname.slice(1))));return;}
        res.setHeader('Content-Type','text/html');res.end('<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Synthetic shop acceptance</title><link rel="stylesheet" href="/app.css"><body><div id="root"></div><script>window.__SYNTHETIC_PRODUCT__='+JSON.stringify(product)+'</script><script src="/app.js"></script></body></html>');
    }catch(e){receipt.errors.push(e.stack);res.statusCode=500;res.end('Fixture error');}});
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;receipt.origin=origin;
    browser=await chromium.launch({headless:true});
    for(const width of [390,1440]){
        const context=await browser.newContext({viewport:{width,height:900}});await context.route('**/*',route=>{if(new URL(route.request().url()).origin!==origin){receipt.outbound.push(route.request().url());return route.abort();}return route.continue();});
        const page=await context.newPage();page.on('pageerror',e=>receipt.errors.push(e.message));await page.request.post(origin+'/__fixture/reset');
        await page.goto(origin);await page.getByRole('spinbutton').fill('5');await page.getByText('From available stock: 2. Awaiting restock: 3.').waitFor();
        await page.getByRole('combobox').selectOption('Red');await page.getByRole('alert').filter({hasText:'will not be restocked'}).waitFor();assert.equal(await page.getByRole('button',{name:'Out of stock'}).isEnabled(),false);
        await page.getByRole('combobox').selectOption('Blue');await page.getByRole('button',{name:'Add to Cart'}).click();await page.getByText('Added to cart.').waitFor();assert.equal(cart[0].quantity,5);
        receipt.checks.push(width+': product quantity, variant limits and conditional disclosure');await page.screenshot({path:path.join(out,'product-'+width+'.png'),fullPage:true});
        await page.goto(origin+'/?mode=cart');await page.getByRole('spinbutton',{name:'Cart quantity'}).fill('6');await page.getByRole('spinbutton',{name:'Cart quantity'}).press('Tab');await page.getByText('From available stock: 2. Awaiting restock: 4.').waitFor();assert.equal(cart[0].quantity,6);
        receipt.checks.push(width+': actual cart exact quantity and refreshed stock split');await page.screenshot({path:path.join(out,'cart-'+width+'.png'),fullPage:true});
        await page.goto(origin+'/?mode=checkout');const checkbox=page.getByRole('checkbox');await checkbox.waitFor();assert.equal(await page.getByRole('button',{name:'Continue to payment'}).isEnabled(),false);assert.equal(accepted.length,0);
        await page.screenshot({path:path.join(out,'checkout-'+width+'.png'),fullPage:true});await checkbox.check();await page.getByRole('button',{name:'Continue to payment'}).click();await page.getByRole('heading',{name:'Payment is processing'}).waitFor();assert.equal(accepted.length,1);assert.equal(accepted[0].ack,RESTOCKING_VERSION);
        receipt.checks.push(width+': checkout requires explicit restocking acknowledgement before synthetic payment transition');
        await page.goto(origin+'/?mode=owner');await page.getByRole('button',{name:'Allocate received stock'}).click();await page.getByRole('alert').filter({hasText:'Record received inventory'}).waitFor();
        await page.request.post(origin+'/__fixture/receive',{data:{quantity:4}});await page.getByRole('spinbutton').fill('4');await page.getByRole('button',{name:'Allocate received stock'}).click();await page.getByText('Allocated after restocking: 4.').waitFor();
        await page.reload();await page.getByText('From available stock: 2. Awaiting restock: 0.').waitFor();assert.equal(order.items[0].stockAllocation.backorderQuantity,4);assert.equal(available,0);
        receipt.checks.push(width+': owner rejects unavailable receipt, allocates recorded units and retains original order split after reload');await page.screenshot({path:path.join(out,'owner-'+width+'.png'),fullPage:true});
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);receipt.checks.push(width+': owner view has no horizontal overflow');await context.close();
    }
    assert.equal(receipt.errors.length,0);assert.equal(receipt.outbound.length,0);receipt.success=true;
}
main().catch(e=>{receipt.failure=e.stack;process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));receipt.ownedServicesClosed=true;receipt.finishedAt=new Date().toISOString();fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));});
