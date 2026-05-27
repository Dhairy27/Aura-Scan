import React, { useState, useEffect } from 'react';
import { ShieldAlert, Cpu } from 'lucide-react';
import * as faceapi from '@vladmandic/face-api';
import Navbar from './components/Navbar';
import Dashboard from './components/Dashboard';
import Scanner from './components/Scanner';
import Register from './components/Register';
import Logs from './components/Logs';
import UserList from './components/UserList';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [loadingError, setLoadingError] = useState(null);

  useEffect(() => {
    async function loadModels() {
      try {
        console.log('Initializing TensorFlow...');
        await faceapi.tf.ready();

        console.log('Loading face-api.js models...');
        // Load weights from the public/models directory
        await Promise.all([
          faceapi.nets.ssdMobilenetv1.loadFromUri('/models'),
          faceapi.nets.faceLandmark68Net.loadFromUri('/models'),
          faceapi.nets.faceRecognitionNet.loadFromUri('/models'),
          faceapi.nets.tinyFaceDetector.loadFromUri('/models')
        ]);
        console.log('Neural network models successfully loaded!');
        setModelsLoaded(true);
      } catch (err) {
        console.error('Failed to load neural models:', err);
        setLoadingError(`Failed to load facial recognition models: ${err.message || err}. Please refresh the page.`);
      }
    }

    loadModels();
  }, []);

  if (loadingError) {
    return (
      <div className="loading-screen" style={{ padding: '2rem', textAlign: 'center' }}>
        <ShieldAlert size={48} className="text-danger" style={{ marginBottom: '1rem' }} />
        <h2 style={{ marginBottom: '0.5rem', color: 'var(--text-primary)' }}>System Error</h2>
        <p style={{ color: 'var(--text-secondary)', maxWidth: '400px', marginBottom: '1.5rem' }}>
          {loadingError}
        </p>
        <button 
          className="btn btn-primary" 
          onClick={() => window.location.reload()}
        >
          Retry Initialization
        </button>
      </div>
    );
  }

  if (!modelsLoaded) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner-wrapper">
          <div className="loading-spinner"></div>
          <Cpu className="loading-icon" size={32} />
        </div>
        <div className="loading-text">Initializing AuraScan AI</div>
        <div className="loading-subtext">Loading neural network models...</div>
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* App Navigation */}
      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* Main Panel views */}
      <main className="main-content">
        {activeTab === 'dashboard' && <Dashboard setActiveTab={setActiveTab} />}
        {activeTab === 'scanner' && <Scanner />}
        {activeTab === 'register' && <Register />}
        {activeTab === 'logs' && <Logs />}
        {activeTab === 'users' && <UserList />}
      </main>
    </div>
  );
}
