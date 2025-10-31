import { useState, useEffect } from 'react';
import { getPhotoById } from '../services/photoStorageService';

interface DownloadPageProps {
  photoId: string;
}

export const DownloadPage: React.FC<DownloadPageProps> = ({ photoId }) => {
  const [photo, setPhoto] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadPhoto();
  }, [photoId]);

  async function loadPhoto() {
    try {
      const record = await getPhotoById(photoId);
      if (record) {
        setPhoto(record);
      } else {
        setError('Photo not found or expired');
      }
    } catch (err) {
      setError('Failed to load photo');
    } finally {
      setLoading(false);
    }
  }

  function handleDownload() {
    if (!photo) return;
    
    const link = document.createElement('a');
    link.href = photo.supabaseUrl || photo.imageDataURL;
    link.download = `${photo.id}.png`;
    link.click();
  }

  if (loading) {
    return <div className="download-page"><p>Loading...</p></div>;
  }

  if (error) {
    return (
      <div className="download-page">
        <div className="error-container">
          <h1>Download Failed</h1>
          <p>{error}</p>
          <p>Note: Photos are only available for 24 hours after printing.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="download-page">
      <div className="download-container">
        <h1>Download Your Photo</h1>
        <img src={photo.imageDataURL} alt="Photo" className="preview-image" />
        <p className="photo-id">Photo ID: {photo.id}</p>
        <button onClick={handleDownload} className="download-btn">
          Download Photo
        </button>
        <p className="expiry-notice">
          This link is valid for 24 hours from printing time.
        </p>
      </div>
    </div>
  );
};
