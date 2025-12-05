import React, { useEffect, useState } from 'react';

interface ImageSupportProps {
  query: string;
  count?: number;
}

interface ImageResult {
  url: string;
  title?: string;
}

const ImageSupport: React.FC<ImageSupportProps> = ({ query, count = 1 }) => {
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
        Buscando imagen relacionada…
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

  const mainImage = images[0];

  return (
    <div className="mt-4">
      <div className="rounded-2xl overflow-hidden border border-slate-200/70 bg-slate-100 w-full">
        <img
          src={mainImage.url}
          alt={mainImage.title || query}
          className="w-full h-auto object-contain"
          loading="lazy"
        />
      </div>
      {mainImage.title && (
        <p className="mt-2 text-xs text-gray-500">
          Imagen relacionada con:{' '}
          <span className="font-semibold text-gray-700">
            {mainImage.title}
          </span>
        </p>
      )}
    </div>
  );
};

export default ImageSupport;
