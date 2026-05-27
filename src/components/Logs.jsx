import React, { useEffect, useState } from 'react';
import { Search, Calendar, Download, Trash2, CalendarRange, Eye } from 'lucide-react';
import { getAllAttendance, clearAttendanceLogs } from '../db/database';

export default function Logs() {
  const [logs, setLogs] = useState([]);
  const [filteredLogs, setFilteredLogs] = useState([]);
  
  // Search & Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [dateFilter, setDateFilter] = useState('');
  
  // Lightbox Modal State
  const [activePhotoLog, setActivePhotoLog] = useState(null);

  useEffect(() => {
    loadLogs();
  }, []);

  async function loadLogs() {
    try {
      const records = await getAllAttendance();
      setLogs(records);
      setFilteredLogs(records);
    } catch (err) {
      console.error(err);
    }
  }

  // Handle Search and Filters
  useEffect(() => {
    let result = [...logs];

    // Search filter (name or roll number)
    if (searchQuery.trim() !== '') {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        log =>
          log.userName.toLowerCase().includes(query) ||
          log.rollNumber.toLowerCase().includes(query)
      );
    }

    // Status filter
    if (statusFilter !== 'All') {
      result = result.filter(log => log.status === statusFilter);
    }

    // Date filter
    if (dateFilter !== '') {
      result = result.filter(
        log => new Date(log.timestamp).toDateString() === new Date(dateFilter).toDateString()
      );
    }

    setFilteredLogs(result);
  }, [searchQuery, statusFilter, dateFilter, logs]);

  // Export to CSV
  function handleExportCSV() {
    if (filteredLogs.length === 0) return;

    // Headers
    const headers = ['Timestamp', 'ID/Roll Number', 'Name', 'Department', 'Status'];
    
    // Rows
    const rows = filteredLogs.map(log => [
      new Date(log.timestamp).toLocaleString(),
      log.rollNumber,
      log.userName,
      log.department,
      log.status
    ]);

    const csvContent = 
      'data:text/csv;charset=utf-8,' + 
      [headers.join(','), ...rows.map(e => e.map(val => `"${val}"`).join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Attendance_Logs_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // Clear all logs
  async function handleClearLogs() {
    const confirmClear = window.confirm(
      'Are you absolutely sure you want to delete ALL attendance records? This action cannot be undone.'
    );
    
    if (confirmClear) {
      try {
        await clearAttendanceLogs();
        setLogs([]);
        setFilteredLogs([]);
      } catch (err) {
        console.error(err);
        alert('Failed to clear logs.');
      }
    }
  }

  return (
    <div>
      <div className="section-header">
        <h1 className="section-title">Attendance Logs</h1>
        <p className="section-subtitle">Track historical check-ins, filter records, and export reports.</p>
      </div>

      <div className="glass-card">
        {/* Filters Panel */}
        <div className="logs-header-actions">
          <div className="filter-group">
            {/* Search Input */}
            <div style={{ position: 'relative' }}>
              <Search 
                size={16} 
                className="text-secondary" 
                style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)' }} 
              />
              <input
                type="text"
                className="form-input"
                style={{ paddingLeft: '2.25rem', width: '220px' }}
                placeholder="Search by name or ID..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>

            {/* Date Picker Filter */}
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <Calendar 
                size={16} 
                className="text-secondary" 
                style={{ position: 'absolute', left: '0.75rem', pointerEvents: 'none' }} 
              />
              <input
                type="date"
                className="form-input"
                style={{ paddingLeft: '2.25rem', width: '170px' }}
                value={dateFilter}
                onChange={e => setDateFilter(e.target.value)}
              />
              {dateFilter && (
                <button 
                  onClick={() => setDateFilter('')}
                  style={{ 
                    position: 'absolute', 
                    right: '0.5rem', 
                    background: 'none', 
                    border: 'none', 
                    color: 'var(--text-secondary)', 
                    cursor: 'pointer',
                    fontSize: '0.8rem'
                  }}
                >
                  Clear
                </button>
              )}
            </div>

            {/* Status Select dropdown */}
            <select
              className="form-input"
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              style={{ width: '130px', cursor: 'pointer' }}
            >
              <option value="All">All Statuses</option>
              <option value="Present">Present</option>
              <option value="Late">Late</option>
            </select>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button 
              className="btn btn-secondary" 
              onClick={handleExportCSV}
              disabled={filteredLogs.length === 0}
            >
              <Download size={16} />
              <span>Export CSV</span>
            </button>
            
            <button 
              className="btn btn-danger" 
              onClick={handleClearLogs}
              disabled={logs.length === 0}
            >
              <Trash2 size={16} />
              <span>Clear Logs</span>
            </button>
          </div>
        </div>

        {/* Attendance Logs Table */}
        {filteredLogs.length > 0 ? (
          <div className="table-container">
            <table className="logs-table">
              <thead>
                <tr>
                  <th>User Profile</th>
                  <th>ID / Roll Number</th>
                  <th>Department</th>
                  <th>Log Photo</th>
                  <th>Timestamp</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((log) => (
                  <tr key={log.id}>
                    <td>
                      <div className="user-cell">
                        {log.userPhoto ? (
                          <img src={log.userPhoto} alt={log.userName} className="user-avatar-table" />
                        ) : (
                          <div className="user-avatar-table">
                            {log.userName.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <span style={{ fontWeight: 500 }}>{log.userName}</span>
                      </div>
                    </td>
                    <td>{log.rollNumber}</td>
                    <td>{log.department}</td>
                    <td>
                      {log.logPhoto ? (
                        <div style={{ position: 'relative', display: 'inline-block' }}>
                          <img 
                            src={log.logPhoto} 
                            alt="Scan proof" 
                            className="log-photo-thumbnail"
                            onClick={() => setActivePhotoLog(log)}
                          />
                          <Eye 
                            size={10} 
                            style={{ 
                              position: 'absolute', 
                              bottom: '2px', 
                              right: '2px', 
                              background: 'rgba(0,0,0,0.6)', 
                              padding: '2px', 
                              borderRadius: '2px',
                              color: '#fff',
                              pointerEvents: 'none'
                            }} 
                          />
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>No snapshot</span>
                      )}
                    </td>
                    <td>
                      {new Date(log.timestamp).toLocaleDateString()} at{' '}
                      {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </td>
                    <td>
                      <span className={`activity-badge ${log.status === 'Present' ? 'present' : 'late'}`}>
                        {log.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <CalendarRange size={36} />
            <h3>No Records Found</h3>
            <p>Try modifying your search query or filter options.</p>
          </div>
        )}
      </div>

      {/* Glassmorphic Lightbox Modal */}
      {activePhotoLog && (
        <div className="modal-overlay" onClick={() => setActivePhotoLog(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <button className="modal-close-btn" onClick={() => setActivePhotoLog(null)}>
              ×
            </button>
            <h3 style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
              Check-in Snapshot Proof
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
              User: {activePhotoLog.userName} ({activePhotoLog.rollNumber}) <br />
              Time: {new Date(activePhotoLog.timestamp).toLocaleString()}
            </p>
            <img 
              src={activePhotoLog.logPhoto} 
              alt={`${activePhotoLog.userName} check-in snapshot`}
              className="modal-photo" 
            />
          </div>
        </div>
      )}
    </div>
  );
}
