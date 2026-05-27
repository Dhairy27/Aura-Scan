const DB_NAME = 'SmartAttendanceDB';
const DB_VERSION = 1;

export function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event) => {
      console.error('Database error:', event.target.error);
      reject(event.target.error);
    };

    request.onsuccess = (event) => {
      resolve(event.target.result);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Users store: key is id (rollNumber)
      if (!db.objectStoreNames.contains('users')) {
        const userStore = db.createObjectStore('users', { keyPath: 'rollNumber' });
        userStore.createIndex('name', 'name', { unique: false });
        userStore.createIndex('department', 'department', { unique: false });
      }

      // Attendance logs store
      if (!db.objectStoreNames.contains('attendance')) {
        const attendanceStore = db.createObjectStore('attendance', { keyPath: 'id', autoIncrement: true });
        attendanceStore.createIndex('rollNumber', 'rollNumber', { unique: false });
        attendanceStore.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
  });
}

// User Operations
export async function getAllUsers() {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('users', 'readonly');
    const store = transaction.objectStore('users');
    const request = store.getAll();

    request.onsuccess = () => {
      // Rehydrate descriptors back to Float32Array
      const users = request.result.map(user => {
        if (user.descriptors) {
          user.descriptors = user.descriptors.map(d => new Float32Array(d));
        }
        return user;
      });
      resolve(users);
    };

    request.onerror = () => reject(request.error);
  });
}

export async function addUser(user) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('users', 'readwrite');
    const store = transaction.objectStore('users');

    // Serialize Float32Array descriptors to plain arrays for IndexedDB compatibility
    const serializedUser = {
      ...user,
      descriptors: user.descriptors.map(d => Array.from(d)),
      registeredAt: user.registeredAt || new Date().toISOString()
    };

    const request = store.put(serializedUser);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function deleteUser(rollNumber) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('users', 'readwrite');
    const store = transaction.objectStore('users');
    const request = store.delete(rollNumber);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// Export raw user data (with array descriptors instead of Float32Array)
export async function getRawUsersData() {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('users', 'readonly');
    const store = transaction.objectStore('users');
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Import user data list into the database
export async function importUsersData(usersList) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    if (!Array.isArray(usersList)) {
      reject(new Error('Import data must be an array of users.'));
      return;
    }

    if (usersList.length === 0) {
      resolve(0);
      return;
    }

    const transaction = db.transaction('users', 'readwrite');
    const store = transaction.objectStore('users');
    
    let completed = 0;
    let hasError = false;

    usersList.forEach(user => {
      // Validation: must have rollNumber, name, and descriptors
      if (!user.rollNumber || !user.name || !user.descriptors) {
        if (!hasError) {
          hasError = true;
          transaction.abort();
          reject(new Error(`Invalid user data format. Each profile requires at least 'name', 'rollNumber', and 'descriptors'.`));
        }
        return;
      }

      // Convert descriptors from Float32Array arrays back to normal arrays if needed
      const serializedUser = {
        rollNumber: String(user.rollNumber),
        name: String(user.name),
        department: String(user.department || 'N/A'),
        photo: user.photo || null,
        descriptors: user.descriptors.map(d => Array.from(d)),
        registeredAt: user.registeredAt || new Date().toISOString()
      };

      const request = store.put(serializedUser);

      request.onsuccess = () => {
        completed++;
        if (completed === usersList.length && !hasError) {
          resolve(completed);
        }
      };

      request.onerror = (event) => {
        if (!hasError) {
          hasError = true;
          reject(request.error || event.target.error);
        }
      };
    });
  });
}


// Attendance Operations
export async function getAllAttendance() {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('attendance', 'readonly');
    const store = transaction.objectStore('attendance');
    const request = store.getAll();

    request.onsuccess = () => {
      // Sort logs by timestamp descending (newest first)
      const logs = request.result.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      resolve(logs);
    };

    request.onerror = () => reject(request.error);
  });
}

export async function addAttendanceRecord(record) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('attendance', 'readwrite');
    const store = transaction.objectStore('attendance');
    
    const request = store.add({
      ...record,
      timestamp: record.timestamp || new Date().toISOString()
    });

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function clearAttendanceLogs() {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('attendance', 'readwrite');
    const store = transaction.objectStore('attendance');
    const request = store.clear();

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
