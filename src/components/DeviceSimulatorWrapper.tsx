import React from 'react';
import { ViewMode } from '../types/audit';

interface Props {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  children: React.ReactNode;
}

export const DeviceSimulatorWrapper: React.FC<Props> = ({ children }) => {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 selection:bg-blue-600 selection:text-white flex flex-col">
      {/* Responsive layout: Full-width responsive on Windows Desktop, fluid on mobile */}
      <div className="w-full flex-1 flex flex-col">
        {children}
      </div>
    </div>
  );
};
