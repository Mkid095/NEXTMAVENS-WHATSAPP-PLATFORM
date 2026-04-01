/**
 * Reseller Header - Title and description
 */

import React from 'react';
import { Key } from 'lucide-react';

export function ResellerHeader() {
  return (
    <div>
      <h1 className="text-3xl font-bold text-white">Reseller API</h1>
      <p className="text-zinc-400 mt-1">Manage your reseller authentication token for creating sub-instances programmatically.</p>
    </div>
  );
}
