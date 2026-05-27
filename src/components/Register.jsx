import React, { useRef, useState, useEffect } from 'react';
import { Camera, RefreshCw, Check, UserPlus, AlertTriangle } from 'lucide-react';
import * as faceapi from '@vladmandic/face-api';
import { addUser, getAllUsers } from '../db/database';

export default function Register() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [stream, setStream] = useState(null);
  
  // Form fields
  const [name, setName] = useState('');
  const [rollNumber, setRollNumber] = useState('');
  const [department, setDepartment] = useState('');

  // UI state
  const [cameraActive, setCameraActive] = useState(false);
  const [loadingCamera, setLoadingCamera] = useState(false);
  const [captured, setCaptured] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState(null);
  const [faceDescriptor, setFaceDescriptor] = useState(null);
  const [statusMsg, setStatusMsg] = useState({ type: '', text: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [registeredRollNumbers, setRegisteredRollNumbers] = useState(new Set());

  // Camera Devices list state
  const [devices, setDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');

  // Flash effect state
  const [triggerFlash, setTriggerFlash] = useState(false);

  useEffect(() => {
    // Load registered roll numbers to prevent duplicates
    async function loadRollNumbers() {
      try {
        const users = await getAllUsers();
        setRegisteredRollNumbers(new Set(users.map(u => u.rollNumber)));
      } catch (err) {
        console.error(err);
      }
    }
    loadRollNumbers();

    // Enumerate camera devices
    async function getDevices() {
      try {
        // Trigger temporary call to get permissions so labels load
        const allDevices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = allDevices.filter(device => device.kind === 'videoinput');
        setDevices(videoDevices);
        if (videoDevices.length > 0) {
          setSelectedDeviceId(videoDevices[0].deviceId);
        }
      } catch (err) {
        console.error('Error fetching cameras:', err);
      }
    }
    getDevices();

    return () => {
      stopCamera();
    };
  }, []);

  // Update devices labels if camera was started (permissions granted)
  useEffect(() => {
    if (cameraActive) {
      navigator.mediaDevices.enumerateDevices().then(allDevices => {
        const videoDevices = allDevices.filter(device => device.kind === 'videoinput');
        setDevices(videoDevices);
      });
    }
  }, [cameraActive]);

  // Handle setting stream when camera element becomes active
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream, cameraActive]);

  async function startCamera() {
    setLoadingCamera(true);
    setStatusMsg({ type: '', text: '' });
    setCaptured(false);
    setCapturedPhoto(null);
    setFaceDescriptor(null);
    try {
      const constraints = {
        video: {
          deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined,
          width: { ideal: 640 },
          height: { ideal: 480 }
        }
      };
      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      setStream(mediaStream);
      setCameraActive(true);
    } catch (err) {
      console.error('Camera access denied:', err);
      setStatusMsg({
        type: 'error',
        text: `Failed to access camera: ${err.name} (${err.message}). Please check permissions or close other apps using the camera.`
      });
    } finally {
      setLoadingCamera(false);
    }
  }

  function stopCamera() {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setCameraActive(false);
  }

  async function captureFace() {
    if (!videoRef.current || !canvasRef.current) return;
    
    // Trigger camera flash visual
    setTriggerFlash(true);
    setTimeout(() => setTriggerFlash(false), 400);

    setStatusMsg({ type: 'info', text: 'Processing face details... Do not move.' });
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    // Set matching dimensions
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    // Draw current frame to hidden canvas
    const ctx = canvas.getContext('2d');
    // Mirror the capture to match video preview
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    ctx.setTransform(1, 0, 0, 1, 0, 0); // reset transform

    try {
      // Detect single face with landmarks and descriptor using lightweight TinyFaceDetector
      const detection = await faceapi
        .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.35 }))
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!detection) {
        setStatusMsg({
          type: 'error',
          text: 'No face detected. Please ensure your face is fully visible and well-lit.'
        });
        return;
      }

      // Check quality (confidence score)
      if (detection.detection.score < 0.7) {
        setStatusMsg({
          type: 'error',
          text: 'Face detection confidence too low. Ensure you face the camera directly.'
        });
        return;
      }

      // Save the full captured canvas frame as the photo
      const base64Avatar = canvas.toDataURL('image/jpeg', 0.85);

      setFaceDescriptor(detection.descriptor);
      setCapturedPhoto(base64Avatar);
      setCaptured(true);
      stopCamera();
      setStatusMsg({ type: 'success', text: 'Face captured successfully!' });
    } catch (err) {
      console.error(err);
      setStatusMsg({
        type: 'error',
        text: 'An error occurred during facial extraction. Please try again.'
      });
    }
  }

  async function handleSaveUser(e) {
    e.preventDefault();
    if (!name || !rollNumber || !department || !faceDescriptor || !capturedPhoto) {
      setStatusMsg({ type: 'error', text: 'Please fill out all fields and capture your face.' });
      return;
    }

    if (registeredRollNumbers.has(rollNumber)) {
      setStatusMsg({
        type: 'error',
        text: `A user with ID / Roll Number "${rollNumber}" is already registered.`
      });
      return;
    }

    setIsSubmitting(true);
    setStatusMsg({ type: 'info', text: 'Saving profile to database...' });

    try {
      const newUser = {
        name: name.trim(),
        rollNumber: rollNumber.trim().toUpperCase(),
        department: department.trim(),
        descriptors: [faceDescriptor], // array of descriptors
        photo: capturedPhoto,
        registeredAt: new Date().toISOString()
      };

      await addUser(newUser);
      
      // Update local roll numbers cache
      setRegisteredRollNumbers(prev => new Set([...prev, newUser.rollNumber]));

      setStatusMsg({ type: 'success', text: `Successfully registered ${newUser.name}!` });
      
      // Reset form
      setName('');
      setRollNumber('');
      setDepartment('');
      setCaptured(false);
      setCapturedPhoto(null);
      setFaceDescriptor(null);
    } catch (err) {
      console.error(err);
      setStatusMsg({ type: 'error', text: 'Failed to write data to database.' });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div>
      <div className="section-header">
        <h1 className="section-title">Face Registration</h1>
        <p className="section-subtitle">Enroll a new user profile by capturing facial feature embeddings.</p>
      </div>

      <div className="registration-layout">
        {/* Left Side: Form Details */}
        <div className="glass-card">
          <h3 style={{ marginBottom: '1.25rem' }}>Enrollment Form</h3>
          <form onSubmit={handleSaveUser} className="registration-form-panel">
            <div className="form-group">
              <label htmlFor="user-name">Full Name</label>
              <input
                id="user-name"
                type="text"
                className="form-input"
                placeholder="Enter full name"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                disabled={isSubmitting}
              />
            </div>

            <div className="form-group">
              <label htmlFor="user-roll">ID / Roll Number</label>
              <input
                id="user-roll"
                type="text"
                className="form-input"
                placeholder="Enter unique ID (e.g. SEC-001)"
                value={rollNumber}
                onChange={e => setRollNumber(e.target.value)}
                required
                disabled={isSubmitting}
              />
            </div>

            <div className="form-group">
              <label htmlFor="user-dept">Department / Role</label>
              <input
                id="user-dept"
                type="text"
                className="form-input"
                placeholder="Enter department or role"
                value={department}
                onChange={e => setDepartment(e.target.value)}
                required
                disabled={isSubmitting}
              />
            </div>

            {/* Registration status feedback */}
            {statusMsg.text && (
              <div 
                style={{
                  padding: '0.75rem 1rem',
                  borderRadius: '10px',
                  fontSize: '0.85rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  background: statusMsg.type === 'error' ? 'rgba(239, 68, 68, 0.1)' :
                              statusMsg.type === 'success' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(99, 102, 241, 0.1)',
                  color: statusMsg.type === 'error' ? '#f87171' :
                         statusMsg.type === 'success' ? '#34d399' : '#818cf8',
                  border: `1px solid ${statusMsg.type === 'error' ? 'rgba(239, 68, 68, 0.2)' :
                            statusMsg.type === 'success' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(99, 102, 241, 0.2)'}`
                }}
              >
                {statusMsg.type === 'error' && <AlertTriangle size={16} style={{ flexShrink: 0 }} />}
                {statusMsg.type === 'success' && <Check size={16} style={{ flexShrink: 0 }} />}
                <span>{statusMsg.text}</span>
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSubmitting || !faceDescriptor || !capturedPhoto}
              style={{ marginTop: '0.5rem' }}
            >
              <UserPlus size={18} />
              <span>{isSubmitting ? 'Registering...' : 'Save User Profile'}</span>
            </button>
          </form>
        </div>

        {/* Right Side: Webcam / Preview Area */}
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <h3 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Facial Capture</span>
            {captured && (
              <span className="activity-badge present" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <Check size={12} />
                <span>Ready</span>
              </span>
            )}
          </h3>

          <div className="capture-box">
            <div className="capture-flash ${triggerFlash ? 'active' : ''}" style={{ opacity: triggerFlash ? 1 : 0, transition: triggerFlash ? 'none' : 'opacity 0.4s ease-out' }}></div>
            
            {cameraActive ? (
              <>
                <div className="capture-overlay-instruction">Align your face inside the screen and look straight</div>
                <video ref={videoRef} className="webcam-feed" autoPlay playsInline muted></video>
              </>
            ) : capturedPhoto ? (
              <img src={capturedPhoto} alt="Captured preview" className="captured-image-preview" />
            ) : (
              <div className="empty-state">
                <Camera size={40} />
                <h3>Webcam Closed</h3>
                <p>Start the camera to enroll face data.</p>
              </div>
            )}

            {/* Hidden canvas for capturing frame */}
            <canvas ref={canvasRef} style={{ display: 'none' }}></canvas>
          </div>
          {/* Camera Selector Dropdown */}
          {devices.length > 1 && !cameraActive && (
            <div className="form-group" style={{ width: '100%' }}>
              <label htmlFor="camera-select" style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                Camera Source
              </label>
              <select
                id="camera-select"
                className="form-input"
                value={selectedDeviceId}
                onChange={e => setSelectedDeviceId(e.target.value)}
                style={{ width: '100%', cursor: 'pointer' }}
              >
                {devices.map(device => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `Camera ${device.deviceId.slice(0, 5)}`}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="capture-btn-group">
            {!cameraActive ? (
              <button 
                className="btn btn-primary" 
                onClick={startCamera} 
                disabled={loadingCamera || isSubmitting}
                style={{ flex: 1 }}
              >
                <Camera size={18} />
                <span>{loadingCamera ? 'Opening...' : capturedPhoto ? 'Recapture' : 'Open Camera'}</span>
              </button>
            ) : (
              <>
                <button 
                  className="btn btn-success" 
                  onClick={captureFace}
                  style={{ flex: 2 }}
                >
                  <Check size={18} />
                  <span>Capture & Analyze</span>
                </button>
                <button 
                  className="btn btn-secondary" 
                  onClick={stopCamera}
                  style={{ flex: 1 }}
                >
                  <span>Cancel</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
