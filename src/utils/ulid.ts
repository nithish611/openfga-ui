/**
 * Extract timestamp from ULID (Universally Unique Lexicographically Sortable Identifier)
 * 
 * ULID format: 01ARZ3NDEKTSV4RRFFQ69G5FAV
 * - First 10 characters encode the timestamp (48-bit milliseconds since Unix epoch)
 * - Last 16 characters are random
 * 
 * OpenFGA uses ULIDs for store IDs and model IDs
 */

const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford's Base32

/**
 * Decode a ULID and extract the timestamp
 * @param ulid The ULID string
 * @returns Date object or null if invalid
 */
export function extractTimestampFromULID(ulid: string): Date | null {
  if (!ulid || ulid.length !== 26) {
    return null;
  }

  try {
    // Extract the first 10 characters (timestamp portion)
    const timestampPart = ulid.slice(0, 10).toUpperCase();
    
    // Decode from Crockford's Base32
    let timestamp = 0;
    for (let i = 0; i < 10; i++) {
      const charIndex = ENCODING.indexOf(timestampPart[i]);
      if (charIndex === -1) {
        return null;
      }
      timestamp = timestamp * 32 + charIndex;
    }

    // Validate the timestamp is reasonable (between 2020 and 2100)
    const minTime = new Date('2020-01-01').getTime();
    const maxTime = new Date('2100-01-01').getTime();
    
    if (timestamp < minTime || timestamp > maxTime) {
      return null;
    }

    return new Date(timestamp);
  } catch {
    return null;
  }
}

/**
 * Format a date for display
 * @param date Date object or ISO string
 * @returns Formatted date string
 */
export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return 'Unknown';
  
  const d = typeof date === 'string' ? new Date(date) : date;
  
  if (isNaN(d.getTime())) {
    return 'Unknown';
  }

  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Format a date as relative time (e.g., "2 hours ago")
 * @param date Date object or ISO string
 * @returns Relative time string
 */
export function formatRelativeTime(date: Date | string | null | undefined): string {
  if (!date) return 'Unknown';
  
  const d = typeof date === 'string' ? new Date(date) : date;
  
  if (isNaN(d.getTime())) {
    return 'Unknown';
  }

  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) {
    return 'Just now';
  } else if (diffMins < 60) {
    return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
  } else if (diffHours < 24) {
    return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
  } else if (diffDays < 7) {
    return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
  } else {
    return formatDateTime(d);
  }
}
