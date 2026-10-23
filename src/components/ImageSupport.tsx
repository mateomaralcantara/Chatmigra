import React, { useEffect, useState } from 'react';
import { supabase } from '../services/supabaseClient';

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
    let active = true;

    void (async () => {
      try {
        setLoading(true);
        setError('');

        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.access_token) {
          throw new Error('Sesión no disponible');
        }

        const response = await fetch(
          `/api/image-search?q=${encodeURIComponent(query)}&n=${count}`,
          {
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
          },
        );

        const data = (await response.json().catch(() => ({}))) as {
          results?: ImageResult[];
          error?: string;
        };

        if (!response.ok) {
          throw new Error(data.error || 'No se pudo buscar la imagen');
        }

        if (active) setImages(data.results || []);
      } catch (caught) {
        console.warn('[ImageSupport]', caught);
        if (active) {
          setError('No se pudieron cargar imágenes de apoyo.');
        }
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [query, count]);

  if (loading) {
    return <p className="mt-2 text-xs text-gray-400">Buscando imagen relacionada…</p>;
  }

  if (error || images.length === 0) {
    return null;
  }

  const mainImage = images[0];

  return (
    <div className="mt-4">
      <div className="rounded-2xl overflow-hidden border border-slate-200 bg-slate-100 w-full">
        <img
          src={mainImage.url}
          alt={mainImage.title || query}
          className="w-full h-auto object-contain"
          loading="lazy"
        />
      </div>
    </div>
  );
};

export default ImageSupport;
