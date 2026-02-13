import type { Metadata } from 'next';
import ProductClientPage from './ProductClientPage';

export async function generateMetadata({ params }: { params: Promise<{ productId: string }> }): Promise<Metadata> {
  const { productId } = await params;
  return {
    title: `Product ${productId}`,
    description: 'Product details and marketing angles',
  };
}

export default async function ProductPage({ params }: { params: Promise<{ productId: string }> }) {
  const { productId } = await params;
  return <ProductClientPage productId={productId} />;
}
