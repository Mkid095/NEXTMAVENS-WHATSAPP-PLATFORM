/**
 * Device Info Card - Shows device information
 */

import { Smartphone } from 'lucide-react';
import { format } from 'date-fns';
import { WhatsAppInstance } from '../../../types';

interface Props {
  instance: WhatsAppInstance;
}

export function DeviceInfo({ instance }: Props) {
  return (
    <div className="card space-y-6">
      <h3 className="text-lg font-bold flex items-center gap-2">
        <Smartphone className="w-5 h-5 text-emerald-500" />
        Device Information
      </h3>
      <div className="grid grid-cols-2 gap-8">
        <div>
          <p className="text-xs text-zinc-500 uppercase font-bold tracking-widest mb-1">Phone Number</p>
          <p className="text-lg font-medium text-zinc-200">{instance.phoneNumber || 'Not Connected'}</p>
        </div>
        <div>
          <p className="text-xs text-zinc-500 uppercase font-bold tracking-widest mb-1">Profile Name</p>
          <p className="text-lg font-medium text-zinc-200">{instance.profileName || 'N/A'}</p>
        </div>
        <div>
          <p className="text-xs text-zinc-500 uppercase font-bold tracking-widest mb-1">Battery Level</p>
          <p className="text-lg font-medium text-zinc-200">{instance.battery ? `${instance.battery}%` : 'N/A'}</p>
        </div>
        <div>
          <p className="text-xs text-zinc-500 uppercase font-bold tracking-widest mb-1">Created At</p>
          <p className="text-lg font-medium text-zinc-200">{format(new Date(instance.createdAt), 'MMM dd, yyyy')}</p>
        </div>
      </div>
    </div>
  );
}
