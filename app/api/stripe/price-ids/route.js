import { getStripePriceIds } from '@/lib/stripeConfig';

export async function GET() {
  try {
    const priceIds = await getStripePriceIds();
    return Response.json({ priceIds });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}