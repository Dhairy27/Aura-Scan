import React, { useEffect, useState, useRef } from 'react';
import { Users, Trash2, Calendar, UserX, Download, Upload } from 'lucide-react';
import { getAllUsers, deleteUser, getRawUsersData, importUsersData } from '../db/database';

export default function UserList() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const fileInputRef = useRef(null);

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers() {
    setLoading(true);
    try {
      const dbUsers = await getAllUsers();
      setUsers(dbUsers);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleExport() {
    try {
      const rawData = await getRawUsersData();
      if (rawData.length === 0) {
        alert('No user profiles to export.');
        return;
      }
      
      const dataStr = JSON.stringify(rawData, null, 2);
      const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
      
      const exportFileDefaultName = `smart-attendance-profiles-${new Date().toISOString().split('T')[0]}.json`;
      
      const linkElement = document.createElement('a');
      linkElement.setAttribute('href', dataUri);
      linkElement.setAttribute('download', exportFileDefaultName);
      linkElement.click();
    } catch (err) {
      console.error('Export failed:', err);
      alert('Failed to export profiles: ' + err.message);
    }
  }

  function handleImportClick() {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  }

  async function handleImportFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const importedData = JSON.parse(e.target.result);
        if (!Array.isArray(importedData)) {
          throw new Error('Import data must be a JSON array of users.');
        }

        const count = await importUsersData(importedData);
        alert(`Successfully imported ${count} user profiles!`);
        loadUsers(); // Refresh users list
      } catch (err) {
        console.error('Import failed:', err);
        alert('Failed to import file: ' + err.message);
      } finally {
        // Reset file input
        event.target.value = '';
      }
    };
    reader.readAsText(file);
  }

  async function handleDelete(rollNumber, name) {
    const confirmDelete = window.confirm(
      `Are you sure you want to delete the user "${name}" (${rollNumber})? This will also remove their facial descriptors, preventing them from marking attendance.`
    );

    if (confirmDelete) {
      try {
        await deleteUser(rollNumber);
        // Refresh list
        setUsers(prev => prev.filter(u => u.rollNumber !== rollNumber));
      } catch (err) {
        console.error(err);
        alert('Failed to delete user from database.');
      }
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
        <div className="loading-spinner-wrapper">
          <div className="loading-spinner"></div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'flex-start', 
        flexWrap: 'wrap', 
        gap: '1rem', 
        marginBottom: '2rem',
        borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
        paddingBottom: '1.5rem'
      }}>
        <div>
          <h1 className="section-title" style={{ margin: 0 }}>Enrolled Users</h1>
          <p className="section-subtitle" style={{ margin: '0.25rem 0 0 0' }}>
            Manage registered profiles and facial templates saved in IndexedDB.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
          <button className="btn btn-secondary" onClick={handleExport} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Download size={15} />
            <span>Export Profiles</span>
          </button>
          <button className="btn btn-primary" onClick={handleImportClick} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Upload size={15} />
            <span>Import Profiles</span>
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImportFile}
            accept=".json"
            style={{ display: 'none' }}
          />
        </div>
      </div>

      {users.length > 0 ? (
        <div className="users-grid">
          {users.map((user) => (
            <div key={user.rollNumber} className="glass-card user-card">
              {user.photo ? (
                <img src={user.photo} alt={user.name} className="user-card-avatar" />
              ) : (
                <div className="user-card-avatar" style={{ background: '#4f46e5', color: '#fff' }}>
                  {user.name.charAt(0).toUpperCase()}
                </div>
              )}
              
              <h4 className="user-card-name">{user.name}</h4>
              <span className="user-card-roll">ID: {user.rollNumber}</span>
              <span className="user-card-dept">{user.department}</span>

              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '0.375rem', 
                fontSize: '0.75rem', 
                color: 'var(--text-secondary)',
                marginBottom: '1rem',
                justifyContent: 'center'
              }}>
                <Calendar size={12} />
                <span>Enrolled {new Date(user.registeredAt).toLocaleDateString()}</span>
              </div>

              <div className="user-card-actions">
                <button
                  className="btn btn-danger user-card-delete-btn"
                  onClick={() => handleDelete(user.rollNumber, user.name)}
                >
                  <Trash2 size={14} />
                  <span>Delete Profile</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="glass-card">
          <div className="empty-state">
            <UserX size={44} />
            <h3>No Users Enrolled</h3>
            <p>You need to create at least one user profile and capture their face descriptors to start using the scanner.</p>
          </div>
        </div>
      )}
    </div>
  );
}
