import { PRINT_CATEGORIES } from '@/lib/categories';
import { DashboardError } from './flags';

// The catalogue's actual 3D-print discriminator is productType=print, not a string category.
export function creatorProductInput(input, scope) {
    if (scope.role === 'owner') return input;
    const category = input.category;
    if ((input.productType && input.productType !== 'print') ||
        (category !== undefined && (!Number.isInteger(Number(category)) || Number(category) < 0 || Number(category) >= PRINT_CATEGORIES.length)) ||
        (input.categoryId && !PRINT_CATEGORIES.includes(input.categoryId))) {
        throw new DashboardError('Creators can list 3D prints only', 403);
    }
    return { ...input, productType: 'print', category: Number(category ?? 0),
        categoryId: input.categoryId || PRINT_CATEGORIES[Number(category ?? 0)] };
}
