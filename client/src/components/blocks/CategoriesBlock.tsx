import { Link } from 'react-router-dom';
import { mockCategories } from '@/services/mockData';

interface CategoriesBlockProps {
  title?: string;
  subtitle?: string;
  settings?: { cols?: number; categories?: { id: number; name: string; image?: string }[] };
}

export default function CategoriesBlock({ title, subtitle, settings }: CategoriesBlockProps) {
  const cats: { id: number; name: string; image?: string }[] = settings?.categories?.length
    ? settings.categories
    : mockCategories.map((c) => ({ id: c.id, name: c.name }));
  const cols = settings?.cols || 4;

  return (
    <section className="py-24 px-6" style={{ background: '#FAF9F6' }}>
      <div className="max-w-7xl mx-auto">
        {title && (
          <h2 className="text-3xl md:text-4xl text-center mb-4"
            style={{ fontFamily: '"Cormorant Garamond", serif', color: '#2C2C2C' }}>
            {title}
          </h2>
        )}
        {subtitle && <p className="text-center text-gray-400 mb-12 text-sm tracking-widest uppercase">{subtitle}</p>}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {cats.slice(0, 4).map((cat) => (
            <Link key={cat.id} to={`/products?categoryId=${cat.id}`} className="group block">
              <div className="aspect-square bg-white flex items-center justify-center overflow-hidden border border-brand-line transition-all duration-500 group-hover:border-[#B8944E] group-hover:shadow-lg">
                {cat.image ? (
                  <img src={cat.image} alt={cat.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="text-center">
                    <span className="text-4xl opacity-20" style={{ color: '#B8944E' }}>◆</span>
                  </div>
                )}
              </div>
              <p className="text-center mt-5 text-sm tracking-[0.2em] uppercase"
                style={{ fontFamily: '"Cormorant Garamond", serif', color: '#555' }}>
                {cat.name}
              </p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
