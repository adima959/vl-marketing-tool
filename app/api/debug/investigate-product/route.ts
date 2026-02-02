import { NextResponse } from 'next/server';
import { executeMariaDBQuery } from '@/lib/server/mariadb';

/**
 * Debug endpoint to investigate product discrepancy
 * GET /api/debug/investigate-product?customerId=240312&productName=Flex_Repair...
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get('customerId') || '240312';
    const productName = searchParams.get('productName') || 'Flex_Repair-DNK-x3-[168/756] 25% off on subs (for xsell)';

    // Query 1: Check all subscriptions for this customer
    const subscriptionsQuery = `
      SELECT
        s.id as subscription_id,
        s.date_create,
        s.customer_id,
        c.country,
        c.first_name,
        c.last_name,
        i.id as invoice_id,
        i.type as invoice_type,
        i.tag as invoice_tag,
        p.product_name,
        CASE
          WHEN i.type = 1 THEN 'Trial'
          WHEN i.type = 2 THEN 'Rebill'
          WHEN i.type = 3 THEN 'Upsell'
          ELSE CONCAT('Type-', i.type)
        END as invoice_type_label
      FROM subscription s
      LEFT JOIN customer c ON s.customer_id = c.id
      LEFT JOIN invoice i ON i.subscription_id = s.id
      LEFT JOIN invoice_product ip ON ip.invoice_id = i.id
      LEFT JOIN product p ON p.id = ip.product_id
      WHERE c.id = ?
        AND s.date_create >= '2026-02-01 00:00:00'
      ORDER BY s.date_create DESC, i.id
    `;

    const subscriptions = await executeMariaDBQuery(subscriptionsQuery, [customerId]);

    // Query 2: Check all invoices with this specific product
    const productInvoicesQuery = `
      SELECT
        i.id as invoice_id,
        i.type as invoice_type,
        i.subscription_id,
        i.customer_id,
        i.order_date,
        i.tag,
        p.product_name,
        c.country,
        CASE
          WHEN i.type = 1 THEN 'Trial'
          WHEN i.type = 2 THEN 'Rebill'
          WHEN i.type = 3 THEN 'Upsell'
          ELSE CONCAT('Type-', i.type)
        END as invoice_type_label
      FROM invoice i
      LEFT JOIN invoice_product ip ON ip.invoice_id = i.id
      LEFT JOIN product p ON p.id = ip.product_id
      LEFT JOIN customer c ON i.customer_id = c.id
      WHERE p.product_name = ?
        AND i.order_date >= '2026-02-01 00:00:00'
        AND c.country = 'DENMARK'
      ORDER BY i.order_date DESC
      LIMIT 20
    `;

    const productInvoices = await executeMariaDBQuery(productInvoicesQuery, [productName]);

    // Query 3: Check if there are type=1 (trial) invoices with this product
    const trialInvoicesQuery = `
      SELECT
        COUNT(*) as count,
        i.type
      FROM invoice i
      LEFT JOIN invoice_product ip ON ip.invoice_id = i.id
      LEFT JOIN product p ON p.id = ip.product_id
      LEFT JOIN customer c ON i.customer_id = c.id
      WHERE p.product_name = ?
        AND i.order_date >= '2026-02-01 00:00:00'
        AND c.country = 'DENMARK'
      GROUP BY i.type
    `;

    const invoiceTypeCounts = await executeMariaDBQuery(trialInvoicesQuery, [productName]);

    return NextResponse.json({
      success: true,
      data: {
        customerId,
        productName,
        subscriptions,
        productInvoices,
        invoiceTypeCounts,
        analysis: {
          totalSubscriptions: subscriptions.length,
          totalProductInvoices: productInvoices.length,
          explanation: 'If invoice_type = 1 (Trial) appears for this product, that means subscriptions have this product as their trial product, not as an upsell.'
        }
      }
    });

  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}
