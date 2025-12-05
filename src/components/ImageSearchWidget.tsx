// src/components/ImageSearchWidget.tsx
import React, { useEffect, useState } from 'react';

interface ImageSearchWidgetProps {
  query: string;
  count?: number;
}

interface ImageResult {
  url: string;
  title?: string;
}

const ImageSearchWidget: React.FC<ImageSearchWidgetProps> = ({ query, count = 3 }) => {
  const [images, setImages] = useState<ImageResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchImages = async () => {
      try {
        setLoading(true);
        setError('');

        // 🔥 Aquí llamas a TU backend, NO directamente a Google (CORS + API key)
        const res = await fetch(`/api/image-search?q=${encodeURIComponent(query)}&n=${count}`);
        if (!res.ok) throw new Error('Error buscando imágenes');
        const data = await res.json();
        setImages(data.results || []);
      } catch (e) {
        console.error(e);
        setError('No se pudieron cargar las imágenes.');
      } finally {
        setLoading(false);
      }
    };

    fetchImages();
  }, [query, count]);

  if (loading) return <p className="text-xs text-gray-400">Buscando imágenes…</p>;
  if (error) return <p className="text-xs text-red-400">{error}</p>;
  if (!images.length) return <p className="text-xs text-gray-400">Sin resultados.</p>;

  return (
    <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2">
      {images.map((img, i) => (
        <div key={i} className="rounded-lg overflow-hidden border border-gray-800 bg-black">
          <img
            src={img.url}
            alt={img.title || query}
            className="w-full h-28 object-cover"
          />
        </div>
      ))}
    </div>
  );
};

export default ImageSearchWidget;
