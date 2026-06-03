import React, { useEffect, useState } from 'react';

const LoadingScreen = ({ onComplete }) => {
    const [progress, setProgress] = useState(0);
    const [text, setText] = useState('INITIALIZING...');

    useEffect(() => {
        const interval = setInterval(() => {
            setProgress((prev) => {
                if (prev >= 100) {
                    clearInterval(interval);
                    setTimeout(onComplete, 500); // Small delay before unmounting
                    return 100;
                }
                // Randomize progress increments for "hacking" feel
                return prev + Math.random() * 15;
            });
        }, 200);

        // Glitch text effect
        const textInterval = setInterval(() => {
            const texts = [
                'INITIALIZING...',
                'CONNECTING TO SATELLITE...',
                'DECRYPTING MOOD DATA...',
                'SYNCING NEURAL LINK...',
                'ESTABLISHING UPLINK...'
            ];
            setText(texts[Math.floor(Math.random() * texts.length)]);
        }, 800);

        return () => {
            clearInterval(interval);
            clearInterval(textInterval);
        };
    }, [onComplete]);

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            backgroundColor: '#000',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: "'Orbitron', sans-serif",
            color: '#00f3ff'
        }}>
            <div style={{
                fontSize: '2rem',
                fontWeight: 'bold',
                marginBottom: '20px',
                textShadow: '0 0 10px #00f3ff',
                letterSpacing: '4px'
            }}>
                {text}
            </div>

            <div style={{
                width: '300px',
                height: '4px',
                background: '#333',
                position: 'relative',
                overflow: 'hidden'
            }}>
                <div style={{
                    width: `${progress}%`,
                    height: '100%',
                    background: '#00f3ff',
                    boxShadow: '0 0 20px #00f3ff',
                    transition: 'width 0.2s ease-out'
                }} />
            </div>

            <div style={{
                marginTop: '10px',
                fontSize: '0.8rem',
                opacity: 0.7
            }}>
                SYSTEM INTEGRITY: {Math.min(100, Math.floor(progress))}%
            </div>
        </div>
    );
};

export default LoadingScreen;
