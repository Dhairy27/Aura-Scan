import React, { useEffect, useState } from 'react';
import { Users, CheckCircle, Clock, TrendingUp, UserPlus, Camera, History } from 'lucide-react';
import { getAllUsers, getAllAttendance } from '../db/database';

export default function Dashboard({ setActiveTab }) {
  const [usersCount, setUsersCount] = useState(0);
  const [presentTodayCount, setPresentTodayCount] = useState(0);
  const [lateTodayCount, setLateTodayCount] = useState(0);
  const [attendanceRate, setAttendanceRate] = useState(100);
  const [recentLogs, setRecentLogs] = useState([]);

  useEffect(() => {
    async function loadDashboardData() {
      try {
        const users = await getAllUsers();
        const logs = await getAllAttendance();

        setUsersCount(users.length);

        // Filter logs for today
        const todayStr = new Date().toDateString();
        const todayLogs = logs.filter(log => new Date(log.timestamp).toDateString() === todayStr);

        // Calculate unique users present today
        const uniquePresentToday = new Set(todayLogs.map(log => log.rollNumber));
        setPresentTodayCount(uniquePresentToday.size);

        // Calculate late users today
        const lateLogsToday = todayLogs.filter(log => log.status === 'Late');
        const uniqueLateToday = new Set(lateLogsToday.map(log => log.rollNumber));
        setLateTodayCount(uniqueLateToday.size);

        // Calculate attendance rate
        if (users.length > 0) {
          const rate = (uniquePresentToday.size / users.length) * 100;
          setAttendanceRate(Math.round(rate));
        } else {
          setAttendanceRate(0);
        }

        // Get 5 most recent logs
        setRecentLogs(logs.slice(0, 5));
      } catch (err) {
        console.error('Failed to load dashboard data:', err);
      }
    }

    loadDashboardData();
  }, []);

  return (
    <div>
      <div className="section-header">
        <h1 className="section-title">Dashboard Overview</h1>
        <p className="section-subtitle">Real-time attendance metrics and quick system operations.</p>
      </div>

      {/* KPI Cards Grid */}
      <div className="dashboard-grid">
        <div className="glass-card stat-card">
          <div className="stat-icon-wrapper">
            <Users size={24} />
          </div>
          <div className="stat-info">
            <span className="stat-label">Registered Users</span>
            <span className="stat-value">{usersCount}</span>
          </div>
        </div>

        <div className="glass-card stat-card success">
          <div className="stat-icon-wrapper">
            <CheckCircle size={24} />
          </div>
          <div className="stat-info">
            <span className="stat-label">Present Today</span>
            <span className="stat-value">{presentTodayCount}</span>
          </div>
        </div>

        <div className="glass-card stat-card warning">
          <div className="stat-icon-wrapper">
            <Clock size={24} />
          </div>
          <div className="stat-info">
            <span className="stat-label">Late Arrivals</span>
            <span className="stat-value">{lateTodayCount}</span>
          </div>
        </div>

        <div className="glass-card stat-card">
          <div className="stat-icon-wrapper" style={{ color: '#a855f7', background: 'rgba(168, 85, 247, 0.1)', borderColor: 'rgba(168, 85, 247, 0.15)' }}>
            <TrendingUp size={24} />
          </div>
          <div className="stat-info">
            <span className="stat-label">Attendance Rate</span>
            <span className="stat-value">{attendanceRate}%</span>
          </div>
        </div>
      </div>

      {/* Quick Actions Panel */}
      <div className="quick-actions">
        <div className="glass-card action-card">
          <h3>Mark Attendance</h3>
          <p>Launch the scanner webcam interface to automatically detect and recognize registered faces in real-time.</p>
          <button className="btn btn-primary" onClick={() => setActiveTab('scanner')}>
            <Camera size={18} />
            <span>Open Scanner</span>
          </button>
        </div>

        <div className="glass-card action-card">
          <h3>Register New Face</h3>
          <p>Create a user profile and enroll their face descriptors by capturing images using the webcam.</p>
          <button className="btn btn-secondary" onClick={() => setActiveTab('register')}>
            <UserPlus size={18} />
            <span>Register User</span>
          </button>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="glass-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
          <History size={20} className="text-secondary" />
          <h3 className="recent-activity-title" style={{ margin: 0 }}>Recent Check-ins</h3>
        </div>

        {recentLogs.length > 0 ? (
          <div className="activity-list">
            {recentLogs.map((log) => (
              <div key={log.id} className="activity-item">
                <div className="activity-user">
                  {log.userPhoto ? (
                    <img src={log.userPhoto} alt={log.userName} className="user-avatar-mini" />
                  ) : (
                    <div className="user-avatar-mini">
                      {log.userName.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="activity-details">
                    <span className="activity-name">{log.userName}</span>
                    <span className="activity-roll">{log.rollNumber} • {log.department}</span>
                  </div>
                </div>

                <div className="activity-meta">
                  <span className={`activity-badge ${log.status === 'Present' ? 'present' : 'late'}`}>
                    {log.status}
                  </span>
                  <span className="activity-time">
                    {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <Users size={32} />
            <h3>No Activity Recorded Today</h3>
            <p>Once users scan their faces in the Scanner tab, check-in records will appear here.</p>
          </div>
        )}
      </div>
    </div>
  );
}
