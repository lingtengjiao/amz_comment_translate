import { useState } from 'react';
import { X, Play, ZoomIn, Image as ImageIcon, Video as VideoIcon } from 'lucide-react';

interface ReviewMediaGalleryProps {
  images?: string[];
  videos?: string[];
}

export function ReviewMediaGallery({ images = [], videos = [] }: ReviewMediaGalleryProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentType, setCurrentType] = useState<'image' | 'video'>('image');

  const allMedia = [
    ...images.map((url, i) => ({ type: 'image' as const, url, index: i })),
    ...videos.map((url, i) => ({ type: 'video' as const, url, index: i }))
  ];

  if (allMedia.length === 0) return null;

  const openLightbox = (index: number, type: 'image' | 'video') => {
    setCurrentIndex(index);
    setCurrentType(type);
    setLightboxOpen(true);
  };

  const closeLightbox = () => {
    setLightboxOpen(false);
  };

  return (
    <>
      {/* Media Thumbnails */}
      <div className="flex flex-wrap gap-2 mt-3">
        {images.map((url, index) => (
          <button
            key={`img-${index}`}
            onClick={() => openLightbox(index, 'image')}
            className="relative group overflow-hidden rounded-lg border border-gray-200 hover:border-blue-400 transition-all"
          >
            <img
              src={url}
              alt={`Review image ${index + 1}`}
              className="w-20 h-20 sm:w-24 sm:h-24 object-cover group-hover:scale-110 transition-transform duration-300"
            />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
              <ZoomIn className="size-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <div className="absolute top-1 left-1 bg-white/90 rounded px-1.5 py-0.5">
              <ImageIcon className="size-3 text-gray-600" />
            </div>
          </button>
        ))}
        
        {videos.map((url, index) => (
          <button
            key={`vid-${index}`}
            onClick={() => openLightbox(index, 'video')}
            className="relative group overflow-hidden rounded-lg border border-gray-200 hover:border-blue-400 transition-all"
          >
            <video
              src={url}
              className="w-20 h-20 sm:w-24 sm:h-24 object-cover"
            />
            <div className="absolute inset-0 bg-black/30 group-hover:bg-black/40 transition-colors flex items-center justify-center">
              <Play className="size-8 text-white drop-shadow-lg" />
            </div>
            <div className="absolute top-1 left-1 bg-white/90 rounded px-1.5 py-0.5">
              <VideoIcon className="size-3 text-gray-600" />
            </div>
          </button>
        ))}
      </div>

      {/* Lightbox Modal */}
      {lightboxOpen && (
        <div 
          className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center p-4"
          onClick={closeLightbox}
        >
          {/* Close Button */}
          <button
            onClick={closeLightbox}
            className="absolute top-4 right-4 text-white hover:bg-white/10 rounded-full p-2 transition-colors z-10"
          >
            <X className="size-6" />
          </button>

          {/* Navigation Info */}
          <div className="absolute top-4 left-4 text-white bg-black/50 rounded px-3 py-1.5 text-sm">
            {currentType === 'image' 
              ? `图片 ${currentIndex + 1} / ${images.length}`
              : `视频 ${currentIndex + 1} / ${videos.length}`
            }
          </div>

          {/* Media Content */}
          <div 
            className="max-w-5xl max-h-[90vh] w-full flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            {currentType === 'image' ? (
              <img
                src={images[currentIndex]}
                alt={`Review image ${currentIndex + 1}`}
                className="max-w-full max-h-[90vh] object-contain rounded-lg"
              />
            ) : (
              <video
                src={videos[currentIndex]}
                controls
                autoPlay
                className="max-w-full max-h-[90vh] rounded-lg"
              >
                您的浏览器不支持视频播放。
              </video>
            )}
          </div>

          {/* Navigation Arrows */}
          {currentType === 'image' && images.length > 1 && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setCurrentIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
                }}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-white hover:bg-white/10 rounded-full p-3 transition-colors"
              >
                <svg className="size-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setCurrentIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
                }}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-white hover:bg-white/10 rounded-full p-3 transition-colors"
              >
                <svg className="size-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
}
