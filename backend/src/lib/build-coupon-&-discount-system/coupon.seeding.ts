/**
 * Coupon Seeding Operations
 * Initialize default coupons for testing/demo
 */

import { prisma } from '../prisma';

/**
 * Initialize or seed default coupons (for testing/demo)
 */
export async function initializeDefaultCoupons(orgId: string): Promise<void> {
  const existingCount = await prisma.coupon.count({ where: { orgId } });
  if (existingCount > 0) {
    return; // Skip if coupons already exist
  }

  const now = new Date();
  const oneMonthFromNow = new Date();
  oneMonthFromNow.setMonth(now.getMonth() + 1);

  await prisma.coupon.createMany({
    data: [
      {
        code: 'WELCOME10',
        name: 'Welcome Discount',
        description: '10% off for new customers',
        discountType: 'percentage',
        discountValue: 10,
        validFrom: now,
        validTo: oneMonthFromNow,
        orgId,
        createdBy: 'system',
        isActive: true,
      },
      {
        code: 'SAVE20',
        name: '$20 Off',
        description: '$20 discount on orders over $100',
        discountType: 'fixed',
        discountValue: 20,
        minPurchaseAmount: 100,
        validFrom: now,
        validTo: oneMonthFromNow,
        orgId,
        createdBy: 'system',
        isActive: true,
      },
    ],
    skipDuplicates: true,
  });
}
