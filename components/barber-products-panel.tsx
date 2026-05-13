'use client';

import { useEffect, useRef, useState } from 'react';
import { type Product } from './barber-shop-storefront';

const CATEGORIES = ['Pomadas', 'Shampoos', 'Óleos', 'Barba', 'Cabelo', 'Kits', 'Outros'];

const EMPTY_FORM = {
  name: '',
  description: '',
  price: '',
  category: 'Outros',
  image_url: '',
  external_link: '',
  is_active: true,
};

type Props = {
  barbershopId: string;
  /** opcional — se passado, produtos são vinculados ao profissional */
  professionalId?: string;
  /** título exibido no painel */
  title?: string;
};

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    // Limit file size to 2MB
    if (file.size > 2 * 1024 * 1024) {
      reject(new Error('Imagem muito grande. Máximo: 2MB.'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Falha ao ler imagem.'));
    reader.readAsDataURL(file);
  });
}

export function BarberProductsPanel({ barbershopId, professionalId, title }: Props) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [filterCat, setFilterCat] = useState('Todos');
  const [showForm, setShowForm] = useState(false);
  const [preview, setPreview] = useState<Product | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function loadProducts() {
    setLoading(true);
    const res = await fetch(
      `/api/products?barbershop_id=${barbershopId}&active_only=false`
    );
    const data = await res.json();
    setProducts(data.products || []);
    setLoading(false);
  }

  useEffect(() => {
    loadProducts();
  }, [barbershopId]);

  function startNew() {
    setForm({ ...EMPTY_FORM });
    setEditingId(null);
    setShowForm(true);
    setMessage('');
  }

  function startEdit(p: Product) {
    setForm({
      name: p.name,
      description: p.description || '',
      price: String(p.price),
      category: p.category,
      image_url: p.image_url || '',
      external_link: p.external_link || '',
      is_active: p.is_active,
    });
    setEditingId(p.id);
    setShowForm(true);
    setMessage('');
  }

  async function handleImageUpload(file: File) {
    setUploadingImage(true);
    setMessage('');
    try {
      const dataUrl = await fileToDataUrl(file);
      setForm((prev) => ({ ...prev, image_url: dataUrl }));
    } catch (err: any) {
      setMessage(err.message || 'Erro ao carregar imagem.');
    } finally {
      setUploadingImage(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage('');

    const payload = {
      barbershop_id: barbershopId,
      professional_id: professionalId || null,
      name: form.name,
      description: form.description,
      price: parseFloat(form.price) || 0,
      category: form.category,
      image_url: form.image_url,
      external_link: form.external_link,
      is_active: form.is_active,
    };

    try {
      let res;
      if (editingId) {
        res = await fetch(`/api/products/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch('/api/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || 'Erro ao salvar.');
      } else {
        setMessage(data.message || 'Salvo com sucesso.');
        setShowForm(false);
        setForm({ ...EMPTY_FORM });
        setEditingId(null);
        await loadProducts();
      }
    } catch {
      setMessage('Erro interno. Tente novamente.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Excluir este produto?')) return;
    const res = await fetch(`/api/products/${id}`, { method: 'DELETE' });
    const data = await res.json();
    setMessage(data.message || (res.ok ? 'Excluído.' : data.error || 'Erro.'));
    if (res.ok) await loadProducts();
  }

  async function handleToggleActive(p: Product) {
    const res = await fetch(`/api/products/${p.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !p.is_active }),
    });
    const data = await res.json();
    setMessage(data.message || (res.ok ? 'Status atualizado.' : 'Erro.'));
    if (res.ok) await loadProducts();
  }

  const filteredProducts =
    filterCat === 'Todos' ? products : products.filter((p) => p.category === filterCat);

  const availableCategories = [
    'Todos',
    ...Array.from(new Set(products.map((p) => p.category))).sort(),
  ];

  return (
    <div className="bp-panel">
      {/* Header */}
      <div className="bp-header">
        <div>
          <h2 className="bp-title">🛒 {title || 'Shopping do Barbeiro'}</h2>
          <p className="bp-subtitle">{products.length} produto(s) cadastrado(s)</p>
        </div>
        <button className="bp-add-btn" onClick={startNew}>
          + Novo produto
        </button>
      </div>

      {/* Mensagem */}
      {message && (
        <div className={`bp-msg ${message.toLowerCase().includes('erro') ? 'error' : 'ok'}`}>
          {message}
        </div>
      )}

      {/* Form de criação/edição */}
      {showForm && (
        <div className="bp-form-wrap">
          <div className="bp-form-header">
            <h3>{editingId ? 'Editar produto' : 'Novo produto'}</h3>
            <button
              className="bp-cancel-btn"
              onClick={() => { setShowForm(false); setMessage(''); }}
            >
              Cancelar
            </button>
          </div>

          <form className="bp-form" onSubmit={handleSave}>
            <div className="bp-form-grid">
              <div className="bp-field-group full">
                <label>Nome do produto *</label>
                <input
                  className="field"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Ex: Pomada Modeladora Matte"
                  required
                />
              </div>

              <div className="bp-field-group">
                <label>Categoria *</label>
                <select
                  className="field"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  required
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div className="bp-field-group">
                <label>Valor (R$) *</label>
                <input
                  className="field"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                  placeholder="0,00"
                  required
                />
              </div>

              <div className="bp-field-group full">
                <label>Descrição</label>
                <textarea
                  className="field"
                  rows={3}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Descrição curta do produto..."
                />
              </div>

              <div className="bp-field-group full">
                <label>Foto do produto</label>

                {/* Hidden file input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleImageUpload(file);
                    e.target.value = '';
                  }}
                />

                {form.image_url ? (
                  /* Preview with remove button */
                  <div className="bp-upload-preview">
                    <img
                      src={form.image_url}
                      alt="preview"
                      className="bp-upload-preview-img"
                      onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
                    />
                    <div className="bp-upload-preview-overlay">
                      <button
                        type="button"
                        className="bp-upload-change-btn"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadingImage}
                      >
                        📷 Trocar foto
                      </button>
                      <button
                        type="button"
                        className="bp-upload-remove-btn"
                        onClick={() => setForm((prev) => ({ ...prev, image_url: '' }))}
                      >
                        🗑 Remover
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Drop zone */
                  <div
                    className={`bp-dropzone${dragOver ? ' drag-over' : ''}${uploadingImage ? ' loading' : ''}`}
                    onClick={() => !uploadingImage && fileInputRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragOver(false);
                      const file = e.dataTransfer.files?.[0];
                      if (file && file.type.startsWith('image/')) handleImageUpload(file);
                    }}
                  >
                    {uploadingImage ? (
                      <div className="bp-dropzone-content">
                        <div className="bp-upload-spinner" />
                        <span>Carregando imagem...</span>
                      </div>
                    ) : (
                      <div className="bp-dropzone-content">
                        <span className="bp-dropzone-icon">📷</span>
                        <span className="bp-dropzone-label">Clique ou arraste uma foto aqui</span>
                        <span className="bp-dropzone-hint">JPG, PNG, WEBP — máx. 2MB</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="bp-field-group full">
                <label>Link externo (opcional)</label>
                <input
                  className="field"
                  value={form.external_link}
                  onChange={(e) => setForm({ ...form, external_link: e.target.value })}
                  placeholder="https://..."
                />
              </div>

              <div className="bp-field-group">
                <label className="bp-toggle-label">
                  <span>Produto ativo (visível para clientes)</span>
                  <button
                    type="button"
                    className={`bp-toggle${form.is_active ? ' on' : ''}`}
                    onClick={() => setForm({ ...form, is_active: !form.is_active })}
                  >
                    <span className="bp-toggle-thumb" />
                  </button>
                </label>
              </div>
            </div>

            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? 'Salvando...' : editingId ? 'Atualizar produto' : 'Criar produto'}
            </button>
          </form>
        </div>
      )}

      {/* Filter */}
      {!showForm && (
        <div className="bp-filter">
          {availableCategories.map((cat) => (
            <button
              key={cat}
              className={`bp-filter-pill${filterCat === cat ? ' active' : ''}`}
              onClick={() => setFilterCat(cat)}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* Products List */}
      {!showForm && (
        <div className="bp-list">
          {loading ? (
            <div className="bp-empty">Carregando...</div>
          ) : filteredProducts.length === 0 ? (
            <div className="bp-empty">
              {products.length === 0
                ? 'Nenhum produto cadastrado ainda. Clique em "+ Novo produto" para começar.'
                : `Nenhum produto em "${filterCat}".`}
            </div>
          ) : (
            filteredProducts.map((p) => (
              <div key={p.id} className={`bp-product-row${p.is_active ? '' : ' inactive'}`}>
                <div className="bp-product-img-wrap">
                  {p.image_url ? (
                    <img
                      src={p.image_url}
                      alt={p.name}
                      className="bp-product-img"
                      onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
                    />
                  ) : (
                    <div className="bp-product-img-ph">✂️</div>
                  )}
                </div>

                <div className="bp-product-info">
                  <div className="bp-product-name">{p.name}</div>
                  <div className="bp-product-meta">
                    <span className="bp-cat-tag">{p.category}</span>
                    <span className="bp-price-tag">
                      R$ {Number(p.price).toFixed(2)}
                    </span>
                    {!p.is_active && <span className="bp-inactive-tag">Inativo</span>}
                  </div>
                  {p.description && (
                    <div className="bp-product-desc">{p.description}</div>
                  )}
                </div>

                <div className="bp-product-actions">
                  <button
                    className={`bp-action-btn toggle${p.is_active ? '' : ' off'}`}
                    title={p.is_active ? 'Desativar' : 'Ativar'}
                    onClick={() => handleToggleActive(p)}
                  >
                    {p.is_active ? '👁' : '🙈'}
                  </button>
                  <button
                    className="bp-action-btn edit"
                    title="Editar"
                    onClick={() => startEdit(p)}
                  >
                    ✏️
                  </button>
                  <button
                    className="bp-action-btn delete"
                    title="Excluir"
                    onClick={() => handleDelete(p.id)}
                  >
                    🗑
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      <style>{`
        .bp-panel {
          background: linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.025));
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 24px;
          overflow: hidden;
        }

        .bp-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 20px 24px;
          border-bottom: 1px solid rgba(255,255,255,0.08);
          flex-wrap: wrap;
        }

        .bp-title {
          font-size: 18px;
          font-weight: 800;
          margin: 0 0 4px 0;
          background: linear-gradient(90deg, #c49b63, #f0c97a);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .bp-subtitle {
          font-size: 12px;
          color: rgba(255,255,255,0.45);
          margin: 0;
        }

        .bp-add-btn {
          background: linear-gradient(135deg, #c49b63, #a07840);
          color: #0a0a0a;
          border: none;
          border-radius: 14px;
          padding: 10px 18px;
          font-weight: 700;
          font-size: 13px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .bp-add-btn:hover {
          transform: scale(1.03);
          background: linear-gradient(135deg, #d4ab73, #c49b63);
        }

        .bp-msg {
          margin: 12px 24px 0;
          padding: 10px 16px;
          border-radius: 12px;
          font-size: 13px;
          font-weight: 600;
        }
        .bp-msg.ok {
          background: rgba(52,199,89,0.12);
          color: #4ade80;
          border: 1px solid rgba(52,199,89,0.25);
        }
        .bp-msg.error {
          background: rgba(255,59,48,0.12);
          color: #f87171;
          border: 1px solid rgba(255,59,48,0.25);
        }

        .bp-form-wrap {
          padding: 20px 24px;
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }

        .bp-form-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 16px;
        }
        .bp-form-header h3 {
          font-size: 15px;
          font-weight: 700;
          margin: 0;
          color: #c49b63;
        }
        .bp-cancel-btn {
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.1);
          color: rgba(255,255,255,0.6);
          border-radius: 10px;
          padding: 6px 14px;
          font-size: 12px;
          cursor: pointer;
        }

        .bp-form-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-bottom: 16px;
        }
        .bp-field-group { display: flex; flex-direction: column; gap: 6px; }
        .bp-field-group.full { grid-column: 1 / -1; }
        .bp-field-group label { font-size: 12px; color: rgba(255,255,255,0.6); font-weight: 600; }

        .bp-img-preview {
          margin-top: 8px;
          border-radius: 10px;
          overflow: hidden;
          max-height: 120px;
        }
        .bp-img-preview img {
          width: 100%;
          height: 120px;
          object-fit: cover;
        }

        .bp-toggle-label {
          display: flex;
          align-items: center;
          justify-content: space-between;
          cursor: pointer;
          font-size: 12px;
          color: rgba(255,255,255,0.6);
          margin-top: 12px;
        }
        .bp-toggle {
          width: 44px;
          height: 24px;
          border-radius: 999px;
          background: rgba(255,255,255,0.12);
          border: 1px solid rgba(255,255,255,0.15);
          cursor: pointer;
          position: relative;
          transition: background 0.2s;
          flex-shrink: 0;
        }
        .bp-toggle.on {
          background: linear-gradient(135deg, #c49b63, #a07840);
          border-color: transparent;
        }
        .bp-toggle-thumb {
          position: absolute;
          top: 2px;
          left: 2px;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: white;
          transition: transform 0.2s;
        }
        .bp-toggle.on .bp-toggle-thumb {
          transform: translateX(20px);
        }

        .bp-filter {
          display: flex;
          gap: 8px;
          overflow-x: auto;
          padding: 16px 24px 12px;
          scrollbar-width: none;
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .bp-filter::-webkit-scrollbar { display: none; }
        .bp-filter-pill {
          flex-shrink: 0;
          padding: 5px 14px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.1);
          background: rgba(255,255,255,0.03);
          color: rgba(255,255,255,0.55);
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }
        .bp-filter-pill.active {
          background: rgba(196,155,99,0.2);
          border-color: rgba(196,155,99,0.5);
          color: #c49b63;
        }

        .bp-list {
          padding: 8px 24px 24px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .bp-empty {
          padding: 32px 0;
          text-align: center;
          color: rgba(255,255,255,0.35);
          font-size: 13px;
          line-height: 1.6;
        }

        .bp-product-row {
          display: flex;
          align-items: center;
          gap: 14px;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 16px;
          padding: 12px 14px;
          transition: border-color 0.2s;
        }
        .bp-product-row:hover {
          border-color: rgba(196,155,99,0.25);
        }
        .bp-product-row.inactive {
          opacity: 0.5;
        }

        .bp-product-img-wrap {
          width: 56px;
          height: 56px;
          border-radius: 12px;
          overflow: hidden;
          flex-shrink: 0;
          background: rgba(255,255,255,0.04);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .bp-product-img { width: 100%; height: 100%; object-fit: cover; }
        .bp-product-img-ph { font-size: 24px; }

        .bp-product-info { flex: 1; min-width: 0; }

        .bp-product-name {
          font-size: 14px;
          font-weight: 700;
          margin-bottom: 4px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .bp-product-meta {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
          margin-bottom: 4px;
        }

        .bp-cat-tag {
          font-size: 10px;
          padding: 2px 8px;
          border-radius: 999px;
          background: rgba(196,155,99,0.15);
          color: #c49b63;
          font-weight: 700;
          border: 1px solid rgba(196,155,99,0.25);
        }

        .bp-price-tag {
          font-size: 13px;
          font-weight: 700;
          color: #c49b63;
        }

        .bp-inactive-tag {
          font-size: 10px;
          padding: 2px 8px;
          border-radius: 999px;
          background: rgba(255,59,48,0.15);
          color: #f87171;
          font-weight: 700;
        }

        .bp-product-desc {
          font-size: 11px;
          color: rgba(255,255,255,0.4);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .bp-product-actions {
          display: flex;
          gap: 6px;
          flex-shrink: 0;
        }

        .bp-action-btn {
          width: 34px;
          height: 34px;
          border-radius: 10px;
          border: 1px solid rgba(255,255,255,0.1);
          background: rgba(255,255,255,0.04);
          cursor: pointer;
          font-size: 15px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.18s;
        }
        .bp-action-btn:hover {
          transform: scale(1.1);
        }
        .bp-action-btn.toggle { border-color: rgba(196,155,99,0.3); }
        .bp-action-btn.toggle.off { opacity: 0.6; }
        .bp-action-btn.delete:hover { background: rgba(255,59,48,0.15); border-color: rgba(255,59,48,0.3); }
        .bp-action-btn.edit:hover { background: rgba(196,155,99,0.12); border-color: rgba(196,155,99,0.3); }

        /* Upload / dropzone */
        .bp-dropzone {
          border: 2px dashed rgba(196,155,99,0.3);
          border-radius: 16px;
          padding: 32px 20px;
          text-align: center;
          cursor: pointer;
          transition: all 0.2s;
          background: rgba(196,155,99,0.04);
        }
        .bp-dropzone:hover, .bp-dropzone.drag-over {
          border-color: rgba(196,155,99,0.7);
          background: rgba(196,155,99,0.1);
        }
        .bp-dropzone.loading {
          cursor: default;
          opacity: 0.7;
        }
        .bp-dropzone-content {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
        }
        .bp-dropzone-icon { font-size: 32px; }
        .bp-dropzone-label {
          font-size: 14px;
          font-weight: 600;
          color: rgba(255,255,255,0.75);
        }
        .bp-dropzone-hint {
          font-size: 11px;
          color: rgba(255,255,255,0.35);
        }

        .bp-upload-spinner {
          width: 28px;
          height: 28px;
          border: 3px solid rgba(196,155,99,0.2);
          border-top-color: #c49b63;
          border-radius: 50%;
          animation: bpSpin 0.7s linear infinite;
          margin-bottom: 4px;
        }
        @keyframes bpSpin { to { transform: rotate(360deg); } }

        .bp-upload-preview {
          position: relative;
          border-radius: 16px;
          overflow: hidden;
          border: 1px solid rgba(196,155,99,0.3);
        }
        .bp-upload-preview-img {
          width: 100%;
          max-height: 200px;
          object-fit: cover;
          display: block;
        }
        .bp-upload-preview-overlay {
          position: absolute;
          inset: 0;
          background: rgba(0,0,0,0);
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          opacity: 0;
          transition: all 0.2s;
        }
        .bp-upload-preview:hover .bp-upload-preview-overlay {
          background: rgba(0,0,0,0.55);
          opacity: 1;
        }
        .bp-upload-change-btn, .bp-upload-remove-btn {
          padding: 8px 14px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          border: none;
          transition: all 0.15s;
        }
        .bp-upload-change-btn {
          background: linear-gradient(135deg, #c49b63, #a07840);
          color: #0a0a0a;
        }
        .bp-upload-remove-btn {
          background: rgba(255,59,48,0.85);
          color: white;
        }
        .bp-upload-change-btn:hover { background: linear-gradient(135deg, #d4ab73, #c49b63); }
        .bp-upload-remove-btn:hover { background: rgba(255,59,48,1); }
      `}</style>
    </div>
  );
}
