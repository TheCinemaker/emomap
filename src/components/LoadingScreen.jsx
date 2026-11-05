import { useEffect, useState } from 'react';
import { IconGlobe } from './Icons';

const LoadingScreen = ({ onComplete }) => {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setTimeout(onComplete, 400);
          return 100;
        }
        return prev + Math.random() * 18;
      });
    }, 180);

    return () => clearInterval(interval);
  }, [onComplete]);

  return (
    <div className="loading-screen">
      <IconGlobe className="loading-screen-icon" aria-hidden width={48} height={48} />
      <h1 className="loading-screen-name">EmoMap</h1>
      <div className="loading-screen-bar-track">
        <div className="loading-screen-bar-fill" style={{ width: `${Math.min(100, progress)}%` }} />
      </div>
    </div>
  );
};

export default LoadingScreen;
