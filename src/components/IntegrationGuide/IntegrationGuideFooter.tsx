/**
 * Integration Guide Footer - Link to full documentation
 */

import { BookOpen } from 'lucide-react';

export function IntegrationGuideFooter() {
  return (
    <div className="card bg-zinc-900/50 border-zinc-800 text-center py-8">
      <BookOpen className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
      <h4 className="font-bold text-white mb-2">Need More Details?</h4>
      <p className="text-zinc-500 text-sm mb-4">
        Visit the full API documentation for advanced features.
      </p>
      <a
        href="https://whatsapp.nextmavens.cloud/docs"
        target="_blank"
        rel="noopener noreferrer"
        className="btn-primary inline-flex items-center gap-2"
      >
        View Full Documentation
      </a>
    </div>
  );
}
