// components/ImageSupport.tsx
import React, { useEffect, useState } from 'react';

interface ImageSupportProps {
  query: string;
  count?: number;
}

interface ImageResult {
  url: string;
  title?: string;
}

const ImageSupport: React.FC<ImageSupportProps> = ({ query, count = 3 }) => {
  const [images, setImages] = useState<ImageResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchImages = async () => {
      try {
        setLoading(true);
        setError('');

        const res = await fetch(
          `/api/image-search?q=${encodeURIComponent(query)}&n=${count}`
        );
        if (!res.ok) throw new Error('Error buscando imágenes');
        const data = await res.json();
        setImages(data.results || []);
      } catch (e) {
        console.error(e);
        setError('No se pudieron cargar las imágenes de apoyo.');
      } finally {
        setLoading(false);
      }
    };

    fetchImages();
  }, [query, count]);

  if (loading) {
    return (
      <p className="mt-2 text-xs text-gray-400">
        Buscando imágenes relacionadas…
      </p>
    );
  }

  if (error) {
    return (
      <p className="mt-2 text-xs text-red-400">
        {error}
      </p>
    );
  }

  if (!images.length) {
    return (
      <p className="mt-2 text-xs text-gray-400">
        No encontré imágenes para esta consulta.
      </p>
    );
  }

  return (
    <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
      {images.map((img, idx) => (
        <div
          key={idx}
          className="rounded-lg overflow-hidden border border-gray-800 bg-black"
        >
          <img
            src={img.url}
            alt={img.title || query}
            className="w-full h-28 object-cover"
            loading="lazy"
          />
        </div>
      ))}
    </div>
  );
};

export default ImageSupport;
