'use client';

import { useEffect, useState } from 'react';

export type Product = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  category: string;
  image_url: string | null;
  external_link: string | null;
  is_active: boolean;
};

const CATEGORIES = [
  'Todos',
  'Pomadas',
  'Shampoos',
  'Óleos',
  'Barba',
  'Cabelo',
  'Kits',
  'Outros',
];

type Props = {
  barbershopId: string;
  barbershopName: string;
  whatsappNumber?: string | null;
  /** Se true, exibe como modal/overlay. Se false, exibe inline. */
  asModal?: boolean;
  onClose?: () => void;
};

function formatPrice(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function openWhatsApp(product: Product, whatsapp: string) {
  const phone = whatsapp.replace(/\D/g, '');
  // Só inclui a foto se for uma URL real (não base64)
  const isRealUrl = product.image_url && !product.image_url.startsWith('data:');
  const imageRef = isRealUrl ? `\nFoto: ${product.image_url}` : '';
  const message =
    `Olá! Quero comprar este produto do Shopping do Barbeiro:\n\n` +
    `Produto: ${product.name}\n` +
    `Categoria: ${product.category}\n` +
    `Valor: ${formatPrice(product.price)}\n` +
    `Descrição: ${product.description || '-'}` +
    `${imageRef}\n\n` +
    `Vim pelo Ventura Barber.`;
  const url = `https://wa.me/55${phone}?text=${encodeURIComponent(message)}`;
  window.open(url, '_blank');
}

export function BarberShopStorefront({
  barbershopId,
  barbershopName,
  whatsappNumber,
  asModal = false,
  onClose,
}: Props) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState('Todos');
  const [expandedProduct, setExpandedProduct] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/products?barbershop_id=${barbershopId}&active_only=true`
        );
        const data = await res.json();
        setProducts(data.products || []);
      } catch {
        setProducts([]);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [barbershopId]);

  const availableCategories = [
    'Todos',
    ...Array.from(new Set(products.map((p) => p.category))).sort(),
  ];

  const filtered = products.filter((p) => {
    const matchCat = activeCategory === 'Todos' || p.category === activeCategory;
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) || (p.description || '').toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const inner = (
    <div className="barber-shop-storefront">
      {/* Header */}
      <div className="shop-header">
        <div className="shop-header-inner">
          <div>
            <div className="shop-crown">👑</div>
            <h2 className="shop-title">Shopping do Barbeiro</h2>
            <p className="shop-subtitle">{barbershopName}</p>
          </div>
          {asModal && onClose && (
            <button className="shop-close-btn" onClick={onClose} aria-label="Fechar">
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Category Filter */}
      <div className="shop-categories">
        <div className="shop-categories-scroll">
          {availableCategories.map((cat) => (
            <button
              key={cat}
              className={`shop-cat-pill${activeCategory === cat ? ' active' : ''}`}
              onClick={() => setActiveCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Search */}
      <div style={{ padding: '0 20px 12px', background: '#0a0a0a' }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 Buscar produto..."
          style={{
            width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12,
            color: '#f7f7f7', padding: '10px 14px', fontSize: 13, outline: 'none',
          }}
        />
      </div>

      {/* Products Grid */}
      <div className="shop-body">
        {loading ? (
          <div className="shop-empty">
            <div className="shop-loader" />
            <p>Carregando produtos...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="shop-empty">
            <span style={{ fontSize: 40 }}>🛒</span>
            <p>Nenhum produto disponível{activeCategory !== 'Todos' ? ` em "${activeCategory}"` : ''}.</p>
          </div>
        ) : (
          <div className="shop-grid">
            {filtered.map((product) => (
              <div
                key={product.id}
                className={`shop-card${expandedProduct === product.id ? ' expanded' : ''}`}
              >
                {/* Product Image */}
                <div className="shop-card-img-wrap">
                  {product.image_url ? (
                    <img
                      src={product.image_url}
                      alt={product.name}
                      className="shop-card-img"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className="shop-card-img-placeholder">✂️</div>
                  )}
                  <span className="shop-card-cat-badge">{product.category}</span>
                </div>

                {/* Product Info */}
                <div className="shop-card-body">
                  <h3 className="shop-card-name">{product.name}</h3>

                  {product.description && (
                    <p
                      className={`shop-card-desc${expandedProduct === product.id ? ' full' : ''}`}
                      onClick={() =>
                        setExpandedProduct(
                          expandedProduct === product.id ? null : product.id
                        )
                      }
                    >
                      {product.description}
                    </p>
                  )}

                  <div className="shop-card-footer">
                    <span className="shop-card-price">{formatPrice(product.price)}</span>

                    <button
                      className="shop-buy-btn"
                      onClick={() => {
                        if (!whatsappNumber) {
                          alert('WhatsApp do barbeiro não configurado.');
                          return;
                        }
                        openWhatsApp(product, whatsappNumber);
                      }}
                    >
                      <span>🛒</span> Comprar
                    </button>
                  </div>

                  {product.external_link && (
                    <a
                      href={product.external_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shop-external-link"
                    >
                      Ver mais detalhes ↗
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <style>{`
        .barber-shop-storefront {
          background: #0a0a0a;
          color: #f7f7f7;
          font-family: Arial, Helvetica, sans-serif;
          border-radius: 20px;
          overflow: hidden;
          border: 1px solid rgba(196,155,99,0.25);
        }

        .shop-header {
          background: linear-gradient(135deg, #0f0f0f 0%, #1a1408 50%, #0f0f0f 100%);
          border-bottom: 1px solid rgba(196,155,99,0.3);
          padding: 24px 20px 20px;
        }

        .shop-header-inner {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
        }

        .shop-crown {
          font-size: 20px;
          margin-bottom: 4px;
        }

        .shop-title {
          font-size: 22px;
          font-weight: 800;
          background: linear-gradient(90deg, #c49b63, #f0c97a, #c49b63);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          margin: 0 0 4px 0;
          letter-spacing: -0.3px;
        }

        .shop-subtitle {
          font-size: 13px;
          color: rgba(255,255,255,0.55);
          margin: 0;
        }

        .shop-close-btn {
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.1);
          color: rgba(255,255,255,0.7);
          border-radius: 50%;
          width: 36px;
          height: 36px;
          cursor: pointer;
          font-size: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          transition: all 0.2s;
        }
        .shop-close-btn:hover {
          background: rgba(196,155,99,0.2);
          color: #c49b63;
        }

        .shop-categories {
          padding: 16px 20px 0;
          background: #0a0a0a;
        }

        .shop-categories-scroll {
          display: flex;
          gap: 8px;
          overflow-x: auto;
          padding-bottom: 16px;
          scrollbar-width: none;
        }
        .shop-categories-scroll::-webkit-scrollbar { display: none; }

        .shop-cat-pill {
          flex-shrink: 0;
          padding: 7px 16px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.04);
          color: rgba(255,255,255,0.65);
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          white-space: nowrap;
        }
        .shop-cat-pill:hover {
          border-color: rgba(196,155,99,0.5);
          color: #c49b63;
        }
        .shop-cat-pill.active {
          background: linear-gradient(135deg, #c49b63, #a07840);
          border-color: transparent;
          color: #0a0a0a;
          font-weight: 700;
        }

        .shop-body {
          padding: 0 16px 24px;
          background: #0a0a0a;
        }

        .shop-empty {
          text-align: center;
          padding: 40px 20px;
          color: rgba(255,255,255,0.45);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          font-size: 14px;
        }

        .shop-loader {
          width: 36px;
          height: 36px;
          border: 3px solid rgba(196,155,99,0.2);
          border-top-color: #c49b63;
          border-radius: 50%;
          animation: shopSpin 0.8s linear infinite;
        }
        @keyframes shopSpin { to { transform: rotate(360deg); } }

        .shop-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 14px;
          padding-top: 4px;
        }

        .shop-card {
          background: linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.025));
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 18px;
          overflow: hidden;
          transition: transform 0.2s, border-color 0.2s, box-shadow 0.2s;
          display: flex;
          flex-direction: column;
        }
        .shop-card:hover {
          transform: translateY(-3px);
          border-color: rgba(196,155,99,0.35);
          box-shadow: 0 8px 24px rgba(196,155,99,0.12);
        }

        .shop-card-img-wrap {
          position: relative;
          width: 100%;
          padding-top: 75%;
          background: rgba(255,255,255,0.03);
          overflow: hidden;
          flex-shrink: 0;
        }

        .shop-card-img {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          transition: transform 0.3s;
        }
        .shop-card:hover .shop-card-img {
          transform: scale(1.04);
        }

        .shop-card-img-placeholder {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 40px;
          color: rgba(255,255,255,0.1);
        }

        .shop-card-cat-badge {
          position: absolute;
          top: 10px;
          left: 10px;
          background: rgba(0,0,0,0.75);
          border: 1px solid rgba(196,155,99,0.4);
          color: #c49b63;
          font-size: 10px;
          font-weight: 700;
          padding: 3px 9px;
          border-radius: 999px;
          letter-spacing: 0.3px;
          text-transform: uppercase;
        }

        .shop-card-body {
          padding: 14px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          flex: 1;
        }

        .shop-card-name {
          font-size: 14px;
          font-weight: 700;
          margin: 0;
          line-height: 1.3;
          color: #f7f7f7;
        }

        .shop-card-desc {
          font-size: 12px;
          color: rgba(255,255,255,0.55);
          margin: 0;
          line-height: 1.5;
          cursor: pointer;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          transition: all 0.2s;
        }
        .shop-card-desc.full {
          -webkit-line-clamp: unset;
          overflow: visible;
        }

        .shop-card-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          margin-top: auto;
        }

        .shop-card-price {
          font-size: 17px;
          font-weight: 800;
          color: #c49b63;
          letter-spacing: -0.3px;
        }

        .shop-buy-btn {
          display: flex;
          align-items: center;
          gap: 5px;
          background: linear-gradient(135deg, #c49b63, #a07840);
          color: #0a0a0a;
          border: none;
          border-radius: 12px;
          padding: 8px 14px;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
          white-space: nowrap;
        }
        .shop-buy-btn:hover {
          background: linear-gradient(135deg, #d4ab73, #c49b63);
          transform: scale(1.04);
        }
        .shop-buy-btn:active {
          transform: scale(0.97);
        }

        .shop-external-link {
          font-size: 11px;
          color: rgba(196,155,99,0.7);
          text-decoration: underline;
          display: block;
          text-align: right;
        }
        .shop-external-link:hover {
          color: #c49b63;
        }
      `}</style>
    </div>
  );

  if (!asModal) return inner;

  return (
    <div className="shop-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="shop-modal-container">
        {inner}
      </div>
      <style>{`
        .shop-modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.82);
          z-index: 9999;
          display: flex;
          align-items: flex-end;
          justify-content: center;
          backdrop-filter: blur(4px);
          animation: shopFadeIn 0.2s ease;
        }
        @keyframes shopFadeIn { from { opacity: 0 } to { opacity: 1 } }

        .shop-modal-container {
          width: 100%;
          max-width: 600px;
          max-height: 88vh;
          overflow-y: auto;
          border-radius: 24px 24px 0 0;
          animation: shopSlideUp 0.3s cubic-bezier(.16,1,.3,1);
          scrollbar-width: thin;
          scrollbar-color: rgba(196,155,99,0.3) transparent;
        }
        @media (min-width: 600px) {
          .shop-modal-overlay { align-items: center; }
          .shop-modal-container { border-radius: 24px; max-height: 85vh; }
        }
        @keyframes shopSlideUp {
          from { transform: translateY(40px); opacity: 0 }
          to { transform: translateY(0); opacity: 1 }
        }
      `}</style>
    </div>
  );
}
