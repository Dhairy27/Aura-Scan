import React, { useRef, useState, useEffect } from 'react';
import { Camera, Check, AlertTriangle, AlertCircle, Volume2, ShieldCheck, Clock } from 'lucide-react';
import * as faceapi from '@vladmandic/face-api';
import { getAllUsers, addAttendanceRecord, getAllAttendance } from '../db/database';

// Time parsing and conversion helpers for 12-hour AM/PM selectors
function parse24to12(time24) {
  if (!time24) return { hour12: 9, minute: '00', ampm: 'AM' };
  const [hourStr, minuteStr] = time24.split(':');
  let hour24 = parseInt(hourStr, 10);
  const ampm = hour24 >= 12 ? 'PM' : 'AM';
  let hour12 = hour24 % 12;
  hour12 = hour12 === 0 ? 12 : hour12;
  return {
    hour12,
    minute: minuteStr,
    ampm
  };
}

function convert12to24(hour12, minute, ampm) {
  let hour24 = parseInt(hour12, 10);
  if (ampm === 'PM' && hour24 < 12) {
    hour24 += 12;
  } else if (ampm === 'AM' && hour24 === 12) {
    hour24 = 0;
  }
  const hourStr = String(hour24).padStart(2, '0');
  return `${hourStr}:${minute}`;
}

function formatTime12Hour(timeStr) {
  if (!timeStr) return '';
  const [hourStr, minuteStr] = timeStr.split(':');
  let hour = parseInt(hourStr, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  hour = hour % 12;
  hour = hour ? hour : 12;
  return `${hour}:${minuteStr} ${ampm}`;
}

export default function Scanner() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [stream, setStream] = useState(null);
  const [registeredUsers, setRegisteredUsers] = useState([]);
  const [faceMatcher, setFaceMatcher] = useState(null);

  // Configuration settings
  const [lateTimeLimit, setLateTimeLimit] = useState('09:00');
  
  // UI Status State
  const [scannerActive, setScannerActive] = useState(false);
  const [loadingScanner, setLoadingScanner] = useState(false);
  const [lastScannedUser, setLastScannedUser] = useState(null);
  const [statusMsg, setStatusMsg] = useState({ type: '', text: '' });
  const [todayCheckedIn, setTodayCheckedIn] = useState(new Set());
  const todayCheckedInRef = useRef(new Set());

  // Cooldown tracking ref to prevent duplicate loop recreations
  const cooldownRef = useRef({});

  // Camera Devices list state
  const [devices, setDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');

  // Debug statistics for troubleshooting
  const [debugInfo, setDebugInfo] = useState({
    usersCount: 0,
    matcherLoaded: false,
    loopCount: 0,
    facesDetected: 0,
    lastError: ''
  });

  // Load registered users, prepare matcher and load today's attendance logs
  useEffect(() => {
    async function loadData() {
      try {
        const users = await getAllUsers();
        setRegisteredUsers(users);
        
        if (users.length > 0) {
          const labeledDescriptors = users.map(user => {
            return new faceapi.LabeledFaceDescriptors(user.rollNumber, user.descriptors);
          });
          // Increased threshold to 0.68 for more reliable matches with TinyFaceDetector
          const matcher = new faceapi.FaceMatcher(labeledDescriptors, 0.68);
          setFaceMatcher(matcher);
          setDebugInfo(prev => ({ ...prev, usersCount: users.length, matcherLoaded: true }));
        } else {
          setDebugInfo(prev => ({ ...prev, usersCount: 0, matcherLoaded: false }));
          setStatusMsg({
            type: 'warning',
            text: 'No users registered yet. Please register users in the "Register Face" tab first.'
          });
        }

        // Fetch attendance logs to find who has already checked in today
        const attendanceLogs = await getAllAttendance();
        const todayStr = new Date().toDateString();
        const checkedInRolls = new Set();
        attendanceLogs.forEach(log => {
          const logDate = new Date(log.timestamp).toDateString();
          if (logDate === todayStr) {
            checkedInRolls.add(log.rollNumber);
          }
        });
        setTodayCheckedIn(checkedInRolls);
        todayCheckedInRef.current = checkedInRolls;
      } catch (err) {
        console.error(err);
        setDebugInfo(prev => ({ ...prev, lastError: err.message || err.toString() }));
        setStatusMsg({ type: 'error', text: 'Error loading initial database data.' });
      }
    }
    loadData();

    // Enumerate camera devices
    async function getDevices() {
      try {
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
      stopScanner();
    };
  }, []);

  // Update devices labels if scanner started (permissions granted)
  useEffect(() => {
    if (scannerActive) {
      navigator.mediaDevices.enumerateDevices().then(allDevices => {
        const videoDevices = allDevices.filter(device => device.kind === 'videoinput');
        setDevices(videoDevices);
      });
    }
  }, [scannerActive]);

  // Handle setting stream when scanner element becomes active
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream, scannerActive]);

  async function startScanner() {
    if (registeredUsers.length === 0) {
      setStatusMsg({
        type: 'warning',
        text: 'Please enroll at least one user before starting the scanner.'
      });
      return;
    }

    setLoadingScanner(true);
    setStatusMsg({ type: '', text: '' });
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
      setScannerActive(true);
    } catch (err) {
      console.error(err);
      setStatusMsg({
        type: 'error',
        text: `Failed to access camera: ${err.name} (${err.message}). Please check permissions.`
      });
    } finally {
      setLoadingScanner(false);
    }
  }

  function stopScanner() {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setScannerActive(false);
    
    // Clear canvas overlay
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
  }

  // Synthesis Audio chime
  function playSuccessSound() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
      gain1.gain.setValueAtTime(0.08, ctx.currentTime);
      gain1.gain.exponentialRampToValueAtTime(0.005, ctx.currentTime + 0.15);
      osc1.start(ctx.currentTime);
      osc1.stop(ctx.currentTime + 0.15);

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(659.25, ctx.currentTime + 0.12); // E5
      gain2.gain.setValueAtTime(0.08, ctx.currentTime + 0.12);
      gain2.gain.exponentialRampToValueAtTime(0.005, ctx.currentTime + 0.35);
      osc2.start(ctx.currentTime + 0.12);
      osc2.stop(ctx.currentTime + 0.35);
    } catch (err) {
      console.error('Audio chime error:', err);
    }
  }

  // Audio warning chime for duplicates/errors
  function playWarningSound() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(220, ctx.currentTime); // Low warning A3
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.005, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    } catch (err) {
      console.error('Audio warning error:', err);
    }
  }

  // Scanner detection loop
  useEffect(() => {
    let timeoutId;
    let isDetecting = false;

    async function detectionLoop() {
      if (!scannerActive || !videoRef.current || !canvasRef.current || !faceMatcher) return;

      const video = videoRef.current;
      const canvas = canvasRef.current;

      // Handle video load latency
      if (video.paused || video.ended || video.videoWidth === 0) {
        timeoutId = setTimeout(detectionLoop, 200);
        return;
      }

      // Sync canvas dimensions manually without overriding CSS styles
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }

      if (!isDetecting) {
        isDetecting = true;
        setDebugInfo(prev => ({ ...prev, loopCount: prev.loopCount + 1 }));
        try {
          // Detect faces with landmarks and descriptors
          // TinyFaceDetector is selected for high performance frame-rates
          const detection = await faceapi
            .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.35 }))
            .withFaceLandmarks()
            .withFaceDescriptor();

          const detections = detection ? [detection] : [];
          const resizedDetections = faceapi.resizeResults(detections, canvas);
          
          setDebugInfo(prev => ({ 
            ...prev, 
            facesDetected: resizedDetections.length,
            lastError: resizedDetections[0] 
              ? `Box: x=${Math.round(resizedDetections[0].detection.box.x)}, y=${Math.round(resizedDetections[0].detection.box.y)}, w=${Math.round(resizedDetections[0].detection.box.width)}` 
              : 'No resized detections'
          }));
          
          const ctx = canvas.getContext('2d');
          ctx.clearRect(0, 0, canvas.width, canvas.height);



          // Iterate and draw results
          for (let i = 0; i < resizedDetections.length; i++) {
            const detection = resizedDetections[i];
            const { x, y, width, height } = detection.detection.box;
            const descriptor = detection.descriptor;
            
            // Match against registered templates
            const bestMatch = faceMatcher.findBestMatch(descriptor);
            const rollNumber = bestMatch.label;
            const distance = bestMatch.distance;
            const isMatch = rollNumber !== 'unknown';
            const alreadyMarked = isMatch && todayCheckedInRef.current.has(rollNumber);

            // Glow color depending on matching confidence and attendance status
            const color = alreadyMarked ? '#f59e0b' : (isMatch ? '#10b981' : '#ef4444'); // amber, green, or red
            const shadow = alreadyMarked ? 'rgba(245, 158, 11, 0.4)' : (isMatch ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)');

            // Draw custom corner bracket HUD
            ctx.strokeStyle = color;
            ctx.lineWidth = 3;
            ctx.shadowColor = shadow;
            ctx.shadowBlur = 8;
            
            const len = Math.min(width, height) * 0.15;
            
            // Top-left
            ctx.beginPath();
            ctx.moveTo(x, y + len);
            ctx.lineTo(x, y);
            ctx.lineTo(x + len, y);
            ctx.stroke();

            // Top-right
            ctx.beginPath();
            ctx.moveTo(x + width - len, y);
            ctx.lineTo(x + width, y);
            ctx.lineTo(x + width, y + len);
            ctx.stroke();

            // Bottom-left
            ctx.beginPath();
            ctx.moveTo(x, y + height - len);
            ctx.lineTo(x, y + height);
            ctx.lineTo(x + len, y + height);
            ctx.stroke();

            // Bottom-right
            ctx.beginPath();
            ctx.moveTo(x + width - len, y + height);
            ctx.lineTo(x + width, y + height);
            ctx.lineTo(x + width, y + height - len);
            ctx.stroke();

            // Match Label text
            ctx.fillStyle = '#ffffff';
            ctx.shadowBlur = 0; // reset shadow for text
            ctx.font = 'bold 12px Inter, sans-serif';
            
            let labelText = 'Scanning...';
            if (isMatch) {
              const matchedUser = registeredUsers.find(u => u.rollNumber === rollNumber);
              if (matchedUser) {
                labelText = alreadyMarked
                  ? `${matchedUser.name} (Already Marked)`
                  : `${matchedUser.name} (${Math.round((1 - distance) * 100)}%)`;
              } else {
                labelText = rollNumber;
              }
            } else {
              // Show how close the match was even if it didn't pass the threshold
              labelText = distance < 0.85 ? `Unknown (${Math.round((1 - distance) * 100)}%)` : 'Unknown Face';
            }
            
            // Draw text and pill un-mirrored (since canvas is mirrored horizontally)
            ctx.save();
            const textX = x + width / 2;
            const textY = y - 15;
            ctx.translate(textX, textY);
            ctx.scale(-1, 1);

            const textWidth = ctx.measureText(labelText).width;
            ctx.fillStyle = alreadyMarked ? 'rgba(245, 158, 11, 0.85)' : (isMatch ? 'rgba(16, 185, 129, 0.85)' : 'rgba(239, 68, 68, 0.85)');
            ctx.beginPath();
            ctx.roundRect(-(textWidth + 20) / 2, -15, textWidth + 20, 22, 6);
            ctx.fill();
            
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.fillText(labelText, 0, 0);
            ctx.restore();

            // Handle attendance check-in for matches
            if (isMatch) {
              const matchedUser = registeredUsers.find(u => u.rollNumber === rollNumber);
              if (matchedUser) {
                handleAttendanceCheckIn(matchedUser, video);
              }
            }
          }
        } catch (err) {
          console.error('Error in face detection loop:', err);
          setStatusMsg({ type: 'error', text: `Scanner loop error: ${err.message}` });
        }
        isDetecting = false;
      }

      timeoutId = setTimeout(detectionLoop, 150);
    }

    if (scannerActive) {
      timeoutId = setTimeout(detectionLoop, 150);
    }

    return () => {
      clearTimeout(timeoutId);
    };
  }, [scannerActive, faceMatcher, registeredUsers, lateTimeLimit]);

  // Execute check in
  async function handleAttendanceCheckIn(user, video) {
    const now = Date.now();
    const lastScan = cooldownRef.current[user.rollNumber] || 0;
    const cooldownMs = 8000; // 8 seconds cooldown is more user friendly

    if (now - lastScan < cooldownMs) return;

    // Put on cooldown immediately
    cooldownRef.current[user.rollNumber] = now;

    // Check if already checked in today
    if (todayCheckedInRef.current.has(user.rollNumber)) {
      // Play warning sound
      playWarningSound();
      
      const currentTime = new Date();
      setLastScannedUser({
        ...user,
        status: 'Already Marked',
        time: currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      });

      // Clear warning card after 6 seconds
      setTimeout(() => {
        setLastScannedUser(current => {
          if (current && current.rollNumber === user.rollNumber && current.status === 'Already Marked') {
            return null;
          }
          return current;
        });
      }, 6000);
      return;
    }

    // Play chime sound
    playSuccessSound();

    // Determine status (Present or Late) based on config
    const currentTime = new Date();
    const [limitHour, limitMinute] = lateTimeLimit.split(':').map(Number);
    const limitDate = new Date();
    limitDate.setHours(limitHour, limitMinute, 0, 0);
    
    const status = currentTime > limitDate ? 'Late' : 'Present';

    // Capture photo log snapshot
    let snapshotBase64 = null;
    try {
      const snapCanvas = document.createElement('canvas');
      snapCanvas.width = 320;
      snapCanvas.height = 240;
      const snapCtx = snapCanvas.getContext('2d');
      // Mirror the photo snapshot
      snapCtx.translate(snapCanvas.width, 0);
      snapCtx.scale(-1, 1);
      snapCtx.drawImage(video, 0, 0, snapCanvas.width, snapCanvas.height);
      snapshotBase64 = snapCanvas.toDataURL('image/jpeg', 0.8);
    } catch (err) {
      console.error('Failed to capture snapshot:', err);
    }

    const attendanceRecord = {
      userId: user.rollNumber,
      userName: user.name,
      rollNumber: user.rollNumber,
      department: user.department,
      status: status,
      timestamp: new Date().toISOString(),
      userPhoto: user.photo,
      logPhoto: snapshotBase64
    };

    try {
      await addAttendanceRecord(attendanceRecord);
      
      // Update state and ref for today's check-ins
      setTodayCheckedIn(prev => {
        const next = new Set(prev);
        next.add(user.rollNumber);
        return next;
      });
      todayCheckedInRef.current.add(user.rollNumber);

      setLastScannedUser({
        ...user,
        status: status,
        time: currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      });

      // Clear successful detection display card after 6 seconds
      setTimeout(() => {
        setLastScannedUser(current => {
          if (current && current.rollNumber === user.rollNumber && current.status !== 'Already Marked') {
            return null;
          }
          return current;
        });
      }, 6000);
    } catch (err) {
      console.error('Database write error:', err);
    }
  }

  return (
    <div>
      <div className="section-header">
        <h1 className="section-title">Facial Scanner</h1>
        <p className="section-subtitle">Real-time attendance detection using webcam streams.</p>
      </div>

      <div className="scanner-layout">
        {/* Left Side: Video Stream */}
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0 }}>Live Video Stream</h3>
            <div className="scanner-status-overlay" style={{ position: 'static', transform: 'none', padding: '0.25rem 0.75rem' }}>
              <div className={`status-dot ${scannerActive ? 'active' : ''}`}></div>
              <span>{scannerActive ? 'SCANNING' : 'SYSTEM IDLE'}</span>
            </div>
          </div>

          <div className="webcam-container">
            {scannerActive ? (
              <>
                <video ref={videoRef} className="webcam-feed" autoPlay playsInline muted></video>
                <canvas ref={canvasRef} className="scanner-overlay-canvas"></canvas>
              </>
            ) : (
              <div className="empty-state" style={{ height: '100%', minHeight: '300px' }}>
                <Camera size={48} />
                <h3>Webcam Offline</h3>
                <p>Start the scanner to run real-time facial recognition.</p>
              </div>
            )}
          </div>

          {/* Camera Selector Dropdown */}
          {devices.length > 1 && !scannerActive && (
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

          <div style={{ display: 'flex', gap: '1rem' }}>
            {!scannerActive ? (
              <button 
                className="btn btn-primary" 
                onClick={startScanner} 
                disabled={loadingScanner}
                style={{ flex: 1 }}
              >
                <span>{loadingScanner ? 'Starting...' : 'Start Camera Scanner'}</span>
              </button>
            ) : (
              <button 
                className="btn btn-danger" 
                onClick={stopScanner}
                style={{ flex: 1 }}
              >
                <span>Stop Scanner</span>
              </button>
            )}
          </div>
        </div>

        {/* Right Side: Info Panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Settings Card */}
          <div className="glass-card">
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <Clock size={18} className="text-secondary" />
              <span>Shift Settings</span>
            </h3>
            <div className="form-group">
              <label htmlFor="late-threshold-hour">Late Cut-off Time</label>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                {/* Hour Select */}
                <select
                  id="late-threshold-hour"
                  className="form-input"
                  value={parse24to12(lateTimeLimit).hour12}
                  onChange={e => {
                    const current = parse24to12(lateTimeLimit);
                    const new24 = convert12to24(e.target.value, current.minute, current.ampm);
                    setLateTimeLimit(new24);
                  }}
                  style={{ flex: 1, minWidth: '65px', padding: '0.5rem 0.25rem', textAlign: 'center', cursor: 'pointer' }}
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(h => (
                    <option key={h} value={h}>{String(h).padStart(2, '0')}</option>
                  ))}
                </select>

                <span style={{ color: 'var(--text-secondary)', fontWeight: 'bold' }}>:</span>

                {/* Minute Select */}
                <select
                  id="late-threshold-minute"
                  className="form-input"
                  value={parse24to12(lateTimeLimit).minute}
                  onChange={e => {
                    const current = parse24to12(lateTimeLimit);
                    const new24 = convert12to24(current.hour12, e.target.value, current.ampm);
                    setLateTimeLimit(new24);
                  }}
                  style={{ flex: 1, minWidth: '65px', padding: '0.5rem 0.25rem', textAlign: 'center', cursor: 'pointer' }}
                >
                  {Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0')).map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>

                {/* AM/PM Select */}
                <select
                  id="late-threshold-ampm"
                  className="form-input"
                  value={parse24to12(lateTimeLimit).ampm}
                  onChange={e => {
                    const current = parse24to12(lateTimeLimit);
                    const new24 = convert12to24(current.hour12, current.minute, e.target.value);
                    setLateTimeLimit(new24);
                  }}
                  style={{ flex: 1.2, minWidth: '75px', padding: '0.5rem 0.25rem', textAlign: 'center', fontWeight: 'bold', cursor: 'pointer' }}
                >
                  <option value="AM">AM</option>
                  <option value="PM">PM</option>
                </select>
              </div>
              
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                Cut-off: <strong>{formatTime12Hour(lateTimeLimit)}</strong>. Check-ins after this time will be flagged as <strong>Late</strong>.
              </span>
            </div>
          </div>

          {/* Verification Results display */}
          <div className="glass-card" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <ShieldCheck size={18} className="text-secondary" />
              <span>Verification Result</span>
            </h3>

            {lastScannedUser ? (
              <div className="detection-result-card">
                <div className="detected-user-info">
                  {lastScannedUser.photo ? (
                    <img src={lastScannedUser.photo} alt={lastScannedUser.name} className="detected-avatar" />
                  ) : (
                    <div className="detected-avatar" style={{ display: 'flex', alignItems: 'center', justify: 'center', background: '#3b82f6', color: '#fff', fontSize: '1.5rem', fontWeight: 'bold' }}>
                      {lastScannedUser.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="detected-details">
                    <h3>{lastScannedUser.name}</h3>
                    <p style={{ margin: 0 }}>ID: {lastScannedUser.rollNumber}</p>
                    <p style={{ margin: 0 }}>Dept: {lastScannedUser.department}</p>
                    <div className="detected-badge" style={{ 
                      background: lastScannedUser.status === 'Present' 
                        ? 'rgba(16, 185, 129, 0.15)' 
                        : lastScannedUser.status === 'Already Marked'
                          ? 'rgba(239, 68, 68, 0.15)'
                          : 'rgba(245, 158, 11, 0.15)',
                      color: lastScannedUser.status === 'Present' 
                        ? '#34d399' 
                        : lastScannedUser.status === 'Already Marked'
                          ? '#f87171'
                          : '#fbbf24'
                    }}>
                      {lastScannedUser.status === 'Already Marked' ? <AlertCircle size={12} /> : <Volume2 size={12} />}
                      <span>
                        {lastScannedUser.status === 'Already Marked'
                          ? 'Already Marked Today'
                          : `${lastScannedUser.status} marked at ${lastScannedUser.time}`}
                      </span>
                    </div>
                  </div>
                </div>
                <div style={{ padding: '0.75rem', background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '10px', fontSize: '0.75rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
                  {lastScannedUser.status === 'Already Marked'
                    ? 'This user has already checked in today. Duplicate entries are blocked.'
                    : 'Anti-spoofing and cooldown active. Scanner will accept another scan from this user in 8 seconds.'}
                </div>
              </div>
            ) : (
              <div className="empty-state" style={{ margin: 'auto' }}>
                <ShieldCheck size={32} />
                <h3>Awaiting Match</h3>
                <p>Stand in front of the camera. When a registered face is detected, it will display here.</p>
              </div>
            )}

            {/* Diagnostics Stats Overlay */}
            <div style={{ marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.05)', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              <div style={{ fontWeight: '600', marginBottom: '0.25rem', color: 'var(--text-muted)' }}>DIAGNOSTICS</div>
              <div>Registered Users: {debugInfo.usersCount}</div>
              <div>AI Matcher Ready: {debugInfo.matcherLoaded ? 'Yes' : 'No'}</div>
              <div>Scanner Frames Analyzed: {debugInfo.loopCount}</div>
              <div>Faces in Frame: {debugInfo.facesDetected}</div>
              {debugInfo.lastError && <div style={{ color: 'var(--accent-danger)' }}>Error: {debugInfo.lastError}</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
